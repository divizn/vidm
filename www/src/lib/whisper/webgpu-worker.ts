import {
	pipeline,
	env,
	WhisperTextStreamer,
	type AutomaticSpeechRecognitionPipeline
} from '@huggingface/transformers';
import { groupWordsIntoSegments, type WordChunk } from './segments';
import { countWindows, WindowProgressTracker } from './chunk-progress';

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

const MODEL_ID = 'whisper-webgpu';

// Windowing knobs handed to the ASR pipeline below for its own long-audio
// chunking — kept as named constants because chunk-progress.ts's window-count
// math has to replicate the exact same values to stay in sync with it.
const CHUNK_LENGTH_S = 30;
const STRIDE_LENGTH_S = 5;
// Matches the mono 16kHz WAV CaptionsPanel's extractAudioForTranscription
// always produces for this path.
const SAMPLE_RATE = 16000;

export type WorkerRequest = { type: 'transcribe'; audio: Float32Array };
export type WorkerResponse =
	| { type: 'progress'; phase: 'downloading' | 'transcribing'; percent: number }
	| { type: 'done'; segments: unknown }
	| { type: 'error'; message: string };

let asr: AutomaticSpeechRecognitionPipeline | null = null;

async function getPipeline(post: (m: WorkerResponse) => void) {
	if (asr) return asr;
	asr = await pipeline('automatic-speech-recognition', MODEL_ID, {
		device: 'webgpu',
		dtype: { encoder_model: 'fp16', decoder_model_merged: 'q4f16' },
		progress_callback: (info: { status: string; progress?: number }) => {
			if (info.status === 'progress_total' && typeof info.progress === 'number') {
				post({ type: 'progress', phase: 'downloading', percent: info.progress });
			}
		}
	});
	return asr;
}

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
	const post = (message: WorkerResponse) => self.postMessage(message);
	if (event.data.type !== 'transcribe') return;

	try {
		const transcriber = await getPipeline(post);
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
				on_chunk_start: (time) => {
					post({ type: 'progress', phase: 'transcribing', percent: tracker.observe(time) * 100 });
				}
			}
		);

		const output = (await transcriber(event.data.audio, {
			return_timestamps: 'word',
			chunk_length_s: CHUNK_LENGTH_S,
			// Overlapping stride is why this path handles chunk boundaries better
			// than the CPU path's hard 30s cuts — words spanning a boundary get
			// merged instead of mangled.
			stride_length_s: STRIDE_LENGTH_S,
			streamer
		})) as { chunks?: WordChunk[] };

		post({ type: 'done', segments: groupWordsIntoSegments(output.chunks ?? []) });
	} catch (err) {
		post({ type: 'error', message: err instanceof Error ? err.message : String(err) });
	}
};
