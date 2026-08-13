import {
	pipeline,
	env,
	WhisperTextStreamer,
	type AutomaticSpeechRecognitionPipeline
} from '@huggingface/transformers';
import { groupWordsIntoSegments, segmentsFromChunks, type WordChunk } from './segments';
import { countWindows, WindowProgressTracker } from './chunk-progress';
import { createEngineLog } from '$lib/log';

// Decoded text is retained quietly rather than printed. See the streamer's
// callback_function below for why this is not optional.
const gpuLog = createEngineLog('whisper-gpu');

// Everything is served from this origin — no CDN at runtime, which is what
// makes offline use possible and keeps load timing controllable.
env.allowRemoteModels = false;
env.allowLocalModels = true;
env.localModelPath = '/models/';
// `backends.onnx` types `wasm` as optional (it's a `Partial<Env>`), but
// transformers.js always populates it before this module can reach it — so
// asserting just this property is a narrow, load-bearing assertion, not a
// blanket `any` cast that would hide a real runtime-path misconfiguration.
env.backends.onnx.wasm!.wasmPaths = '/ort/';

// Local model ids, which are also the directory names under static/models/ —
// they must match the `dir` values in scripts/setup-whisper-webgpu.mjs.
export const QUALITY_MODEL_ID = 'whisper-webgpu';
export const FAST_MODEL_ID = 'whisper-webgpu-fast';

// Decoder precision per tier, and it must match the file the setup script
// downloaded for that tier (scripts/setup-whisper-webgpu.mjs `decoderDtype`).
//
// The quality tier is fp16, NOT 4-bit: a q4f16 decoder produced transcripts
// with words repeating ten or more times, identically in Chrome and Firefox —
// the classic signature of an over-quantized Whisper decoder stuck in a
// repetition loop. Browser-independence is what ruled out WebGPU itself.
// int8 was chosen over fp16 on a mistaken belief that a 100 MB upload limit
// blocked fp16. It does not: the upload had in fact succeeded. int8 then turned
// out far slower on WebGPU, so fp16 is the first thing to try if this resumes.
const DECODER_DTYPE: Record<string, 'fp16' | 'q4f16' | 'int8'> = {
	[QUALITY_MODEL_ID]: 'int8',
	[FAST_MODEL_ID]: 'q4f16'
};

// Windowing knobs handed to the ASR pipeline below for its own long-audio
// chunking — kept as named constants because chunk-progress.ts's window-count
// math has to replicate the exact same values to stay in sync with it.
const CHUNK_LENGTH_S = 30;
const STRIDE_LENGTH_S = 5;
// Matches the mono 16kHz WAV CaptionsPanel's extractAudioForTranscription
// always produces for this path.
const SAMPLE_RATE = 16000;

export type WorkerRequest = {
	type: 'transcribe';
	audio: Float32Array;
	modelId: string;
	// Word-level timings drive the karaoke highlight. Requesting them costs the
	// DTW pass over cross-attentions, so it's skipped when the caption style
	// isn't highlighting words. Note the attention tensors themselves are
	// computed either way: ONNX Runtime returns every declared graph output, and
	// the `_timestamped` export declares them — only a different export would
	// avoid that, at the cost of a second model per tier.
	wordTimestamps: boolean;
};
export type WorkerResponse =
	| { type: 'progress'; phase: 'downloading' | 'transcribing'; percent: number }
	| { type: 'done'; segments: unknown }
	| { type: 'error'; message: string };

let asr: AutomaticSpeechRecognitionPipeline | null = null;

async function getPipeline(modelId: string, post: (m: WorkerResponse) => void) {
	if (asr) return asr;

	// transformers.js resolves 'webgpu' through deviceToExecutionProviders,
	// which THROWS on an unsupported device rather than quietly downgrading to
	// wasm. So reaching the line after this await is positive proof the WebGPU
	// execution provider was actually accepted — not merely requested. Any
	// failure propagates to the dispatcher, which logs the downgrade and runs
	// the CPU path.
	const decoderDtype = DECODER_DTYPE[modelId] ?? 'fp16';
	console.info(
		`[vidm:whisper-gpu] loading ${modelId} on WebGPU (fp16 encoder, ${decoderDtype} decoder)`
	);
	const startedAt = performance.now();
	asr = await pipeline('automatic-speech-recognition', modelId, {
		device: 'webgpu',
		dtype: { encoder_model: 'fp16', decoder_model_merged: decoderDtype },
		progress_callback: (info: { status: string; progress?: number }) => {
			if (info.status === 'progress_total' && typeof info.progress === 'number') {
				post({ type: 'progress', phase: 'downloading', percent: info.progress });
			}
		}
	});
	console.info(
		`[vidm:whisper-gpu] WebGPU pipeline ready in ${((performance.now() - startedAt) / 1000).toFixed(1)}s`
	);
	return asr;
}

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
	const post = (message: WorkerResponse) => self.postMessage(message);
	if (event.data.type !== 'transcribe') return;

	try {
		gpuLog.clear();
		const transcriber = await getPipeline(event.data.modelId, post);
		post({ type: 'progress', phase: 'transcribing', percent: 0 });

		// Real per-chunk progress instead of the single fire-once-at-0 event
		// this worker used to send: WhisperTextStreamer decodes the model's
		// own interleaved `<|time|>` tokens as they're generated (still
		// present even in 'word' timestamp mode — see
		// WhisperGenerationConfig.return_timestamps, forced true above), and
		// chunk-progress.ts turns that per-window-local timestamp stream into
		// one running fraction across the whole clip.
		const durationSeconds = event.data.audio.length / SAMPLE_RATE;
		const totalWindows = countWindows(durationSeconds, CHUNK_LENGTH_S, STRIDE_LENGTH_S);
		const jumpSeconds = CHUNK_LENGTH_S - 2 * STRIDE_LENGTH_S;
		const tracker = new WindowProgressTracker(totalWindows, jumpSeconds, durationSeconds);

		// Same time_precision formula the pipeline computes for itself in
		// AutomaticSpeechRecognitionPipeline._call_whisper — matching it keeps
		// the streamer's timestamps in the same units the pipeline uses. The
		// public Processor/PreTrainedModel types don't capture these
		// Whisper-specific config fields (the pipeline's own source works
		// around the same gap with a `@ts-expect-error` at this exact
		// computation), so narrow with one explicit cast instead.
		const whisperInternals = transcriber as unknown as {
			processor: { feature_extractor: { config: { chunk_length: number } } };
			model: { config: { max_source_positions: number } };
		};
		const timePrecision =
			whisperInternals.processor.feature_extractor.config.chunk_length /
			whisperInternals.model.config.max_source_positions;

		const streamer = new WhisperTextStreamer(
			transcriber.tokenizer as ConstructorParameters<typeof WhisperTextStreamer>[0],
			{
				time_precision: timePrecision,
				// MUST be supplied. TextStreamer defaults callback_function to
				// `stdout_write`, which in a browser is `console.log` — so leaving
				// it unset prints every decoded token to the console. That is not
				// merely noisy: with devtools open, thousands of synchronous
				// console writes dominate the run and made GPU transcription look
				// slower than CPU. Route the text to the ring buffer instead.
				callback_function: (text: string) => gpuLog.line(text),
				on_chunk_start: (time) => {
					post({ type: 'progress', phase: 'transcribing', percent: tracker.observe(time) * 100 });
				},
				// Fires once per window's generate(). The coarse but dependable
				// signal: on_chunk_start only fires on segment boundaries, so a
				// window holding one long unbroken utterance emits nothing and the
				// bar looks frozen — which is exactly what a long clip did.
				on_finalize: () => {
					const percent = tracker.completeWindow() * 100;
					console.info(
						`[vidm:whisper-gpu] window complete — ${percent.toFixed(0)}% of ${totalWindows}-window clip`
					);
					post({ type: 'progress', phase: 'transcribing', percent });
				}
			}
		);

		const transcribeStartedAt = performance.now();
		const output = (await transcriber(event.data.audio, {
			// 'word' drives karaoke highlighting; plain `true` yields segment-level
			// timings only and skips the DTW pass.
			return_timestamps: event.data.wordTimestamps ? 'word' : true,
			chunk_length_s: CHUNK_LENGTH_S,
			// Overlapping stride is why this path handles chunk boundaries better
			// than the CPU path's hard 30s cuts — words spanning a boundary get
			// merged instead of mangled.
			stride_length_s: STRIDE_LENGTH_S,
			streamer
		})) as { chunks?: WordChunk[] };

		// Reported as a realtime factor so a GPU run can be compared against the
		// CPU baseline directly, without anyone having to time it by hand.
		const elapsedSeconds = (performance.now() - transcribeStartedAt) / 1000;
		console.info(
			`[vidm:whisper-gpu] transcribed ${durationSeconds.toFixed(1)}s of audio in ` +
				`${elapsedSeconds.toFixed(1)}s (${(durationSeconds / elapsedSeconds).toFixed(1)}x realtime, ` +
				`${totalWindows} window(s))`
		);

		const chunks = output.chunks ?? [];
		post({
			type: 'done',
			segments: event.data.wordTimestamps
				? groupWordsIntoSegments(chunks)
				: segmentsFromChunks(chunks)
		});
	} catch (err) {
		console.error('[vidm:whisper-gpu] GPU transcription failed:', err);
		gpuLog.dumpRecent('GPU transcription failure');
		post({ type: 'error', message: err instanceof Error ? err.message : String(err) });
	}
};
