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
//
// Takes ownership of `audio`: its underlying buffer is transferred to the
// worker (not copied) as soon as this call begins, which synchronously
// detaches the caller's `Float32Array` — `audio.length` becomes 0 and any
// read of it returns nothing. Do not reuse `audio` after calling this,
// including for a retry or a CPU fallback after a WebGPU failure — obtain a
// fresh Float32Array of samples instead.
export function transcribeOnWebGpu(
	audio: Float32Array,
	onProgress?: (progress: TranscribeProgress) => void
): Promise<CaptionSegment[]> {
	if (audio.byteLength === 0) {
		throw new Error(
			'transcribeOnWebGpu received an empty or already-detached audio buffer. ' +
				'Float32Arrays passed to transcribeOnWebGpu are transferred (not copied) and ' +
				'become unusable once the call begins, so they cannot be reused for a retry or ' +
				'fallback — obtain fresh samples instead.'
		);
	}

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
