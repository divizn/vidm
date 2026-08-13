import type { CaptionSegment } from './srt';
import { FAST_MODEL_ID, QUALITY_MODEL_ID, type WorkerRequest, type WorkerResponse } from './webgpu-worker';

export type TranscribeProgress = {
	phase: 'downloading' | 'transcribing';
	percent: number;
	// Present on the chunked CPU path, which is what the EMA estimator needs.
	chunkIndex?: number;
	chunkCount?: number;
};

// User-facing speed/accuracy choice. 'quality' is whisper-base (default);
// 'fast' is whisper-tiny, roughly 2-3x less compute and a smaller download.
// Both are `_timestamped` exports, so word-level highlighting works in either.
export type TranscriptionQuality = 'quality' | 'fast';

export interface WebGpuOptions {
	quality: TranscriptionQuality;
	// Only needed when the caption style highlights words. Skipping it avoids
	// the DTW pass over cross-attentions.
	wordTimestamps: boolean;
}

export function modelIdFor(quality: TranscriptionQuality): string {
	return quality === 'fast' ? FAST_MODEL_ID : QUALITY_MODEL_ID;
}

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
	options: WebGpuOptions,
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

		const request: WorkerRequest = {
			type: 'transcribe',
			audio,
			modelId: modelIdFor(options.quality),
			wordTimestamps: options.wordTimestamps
		};
		// Transfer rather than copy — a 20 minute clip is ~77MB of samples.
		worker.postMessage(request, [audio.buffer]);
	});
}
