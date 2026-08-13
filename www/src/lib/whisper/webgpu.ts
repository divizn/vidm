import type { CaptionSegment } from './srt';
import type { WorkerRequest, WorkerResponse } from './webgpu-worker';

export type TranscribeProgress = {
	phase: 'downloading' | 'transcribing';
	percent: number;
};

// One worker per call, terminated in a finally. The pipeline holds GPU buffers
// and roughly 105 MiB of weights, so leaving it resident between runs would
// keep that alive for a feature the user may not touch again — and a fresh
// worker also means a lost adapter can't poison the next attempt.
export function transcribeOnWebGpu(
	audio: Float32Array,
	onProgress?: (progress: TranscribeProgress) => void
): Promise<CaptionSegment[]> {
	return new Promise((resolve, reject) => {
		const worker = new Worker(new URL('./webgpu-worker.ts', import.meta.url), {
			type: 'module'
		});

		const finish = (fn: () => void) => {
			worker.terminate();
			fn();
		};

		worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
			const message = event.data;
			if (message.type === 'progress') {
				onProgress?.({ phase: message.phase, percent: message.percent });
			} else if (message.type === 'done') {
				finish(() => resolve(message.segments as CaptionSegment[]));
			} else if (message.type === 'error') {
				finish(() => reject(new Error(message.message)));
			}
		};

		worker.onerror = (event) => {
			finish(() => reject(new Error(event.message || 'WebGPU transcription worker failed')));
		};

		const request: WorkerRequest = { type: 'transcribe', audio };
		// Transfer rather than copy — a 20 minute clip is ~77MB of samples.
		worker.postMessage(request, [audio.buffer]);
	});
}
