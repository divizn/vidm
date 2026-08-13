import { detectBackend, type TranscriptionBackend } from './backend';
import { transcribeChunks, type AudioChunk } from './client';
import { transcribeOnWebGpu, type TranscribeProgress } from './webgpu';
import type { CaptionSegment } from './srt';

export type { TranscribeProgress };
export { TRANSCRIBE_CHUNK_SECONDS } from './client';

// The caller extracts audio in whichever shape the chosen backend needs, so it
// has to know the backend before extracting — hence pickBackend being separate
// from transcribe.
export const pickBackend = detectBackend;

export interface WebGpuInput {
	backend: 'webgpu';
	audio: Float32Array;
}
export interface WasmInput {
	backend: 'wasm';
	chunks: AudioChunk[];
}
export type TranscribeInput = WebGpuInput | WasmInput;

// Falls back to whisper.cpp if the GPU run fails for any reason (lost adapter,
// out of memory, model fetch failure). Captions matter more than which engine
// produced them, so a GPU failure costs speed, never the feature.
export async function transcribe(
	input: TranscribeInput,
	onProgress?: (progress: TranscribeProgress) => void,
	onFallback?: () => Promise<AudioChunk[]>
): Promise<CaptionSegment[]> {
	if (input.backend === 'webgpu') {
		try {
			return await transcribeOnWebGpu(input.audio, onProgress);
		} catch (err) {
			console.error('[whisper] webgpu path failed, falling back to cpu:', err);
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
