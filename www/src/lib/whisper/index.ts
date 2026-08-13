import { detectBackend, type BackendSelection, type TranscriptionBackend } from './backend';
import { transcribeChunks, type AudioChunk } from './client';
import {
	transcribeOnWebGpu,
	type TranscribeProgress,
	type TranscriptionQuality,
	type WebGpuOptions
} from './webgpu';
import type { CaptionSegment } from './srt';

export type { TranscribeProgress, BackendSelection, TranscriptionQuality };
export { backendLabel, explainBackend, isFixableByUser } from './backend';
export { TRANSCRIBE_CHUNK_SECONDS } from './client';

// The caller extracts audio in whichever shape the chosen backend needs, so it
// has to know the backend before extracting — hence pickBackend being separate
// from transcribe.
export const pickBackend = detectBackend;

export interface WebGpuInput {
	backend: 'webgpu';
	// A thunk, not a resolved Float32Array: extraction has to run *inside*
	// this function's try/catch below, or a failure there (e.g. no audio
	// track, or a wavToFloat32 rejection) would be an argument-evaluation
	// crash that never reaches the fallback — evaluated eagerly as a plain
	// argument, it would run before transcribe() is even entered.
	getAudio: () => Promise<Float32Array>;
	options: WebGpuOptions;
}
export interface WasmInput {
	backend: 'wasm';
	chunks: AudioChunk[];
}
export type TranscribeInput = WebGpuInput | WasmInput;

// Falls back to whisper.cpp if the GPU run fails for any reason (lost adapter,
// out of memory, model fetch failure, or a failure extracting audio for it).
// Captions matter more than which engine produced them, so a GPU failure
// costs speed, never the feature.
export async function transcribe(
	input: TranscribeInput,
	onProgress?: (progress: TranscribeProgress) => void,
	onFallback?: () => Promise<AudioChunk[]>
): Promise<CaptionSegment[]> {
	if (input.backend === 'webgpu') {
		try {
			const audio = await input.getAudio();
			return await transcribeOnWebGpu(audio, input.options, onProgress);
		} catch (err) {
			// Deliberately warn, not error: this is a degradation, not a failure —
			// the user still gets captions. Logged loudly enough to explain why a
			// run that announced "GPU" ended up taking CPU-path time.
			console.warn('[vidm:whisper] GPU transcription failed, falling back to CPU:', err);
			if (!onFallback) throw err;
			const chunks = await onFallback();
			return transcribeChunks(chunks, (percent) =>
				onProgress?.({ phase: 'transcribing', percent })
			);
		}
	}

	return transcribeChunks(input.chunks, (percent) =>
		onProgress?.({ phase: 'transcribing', percent })
	);
}

export type { TranscriptionBackend };
