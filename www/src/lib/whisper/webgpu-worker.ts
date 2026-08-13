import { pipeline, env, type AutomaticSpeechRecognitionPipeline } from '@huggingface/transformers';
import { groupWordsIntoSegments, type WordChunk } from './segments';

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

		const output = (await transcriber(event.data.audio, {
			return_timestamps: 'word',
			chunk_length_s: 30,
			// Overlapping stride is why this path handles chunk boundaries better
			// than the CPU path's hard 30s cuts — words spanning a boundary get
			// merged instead of mangled.
			stride_length_s: 5
		})) as { chunks?: WordChunk[] };

		post({ type: 'done', segments: groupWordsIntoSegments(output.chunks ?? []) });
	} catch (err) {
		post({ type: 'error', message: err instanceof Error ? err.message : String(err) });
	}
};
