import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AudioChunk } from './client';
import type { CaptionSegment } from './srt';

// vi.mock factories run before this file's own top-level statements (module
// resolution for a static `import` happens before the importing module's
// body), so the mock functions they reference have to come from vi.hoisted
// rather than a plain `const` declared further down this file.
const mocks = vi.hoisted(() => ({
	transcribeChunks: vi.fn(),
	transcribeOnWebGpu: vi.fn()
}));

vi.mock('./client', () => ({
	transcribeChunks: mocks.transcribeChunks,
	TRANSCRIBE_CHUNK_SECONDS: 30
}));

vi.mock('./webgpu', () => ({
	transcribeOnWebGpu: mocks.transcribeOnWebGpu
}));

import { transcribe, type WasmInput, type WebGpuInput } from './index';

const segments: CaptionSegment[] = [{ from: '00:00:00,000', to: '00:00:01,000', text: 'hi' }];
const chunk = (name: string): AudioChunk => ({ file: new File([], name), offsetSeconds: 0 });

beforeEach(() => {
	mocks.transcribeChunks.mockReset();
	mocks.transcribeOnWebGpu.mockReset();
});

describe('transcribe', () => {
	it('routes a wasm input straight to transcribeChunks', async () => {
		mocks.transcribeChunks.mockResolvedValue(segments);
		const chunks = [chunk('a.wav')];
		const input: WasmInput = { backend: 'wasm', chunks };

		const result = await transcribe(input);

		expect(result).toBe(segments);
		expect(mocks.transcribeChunks).toHaveBeenCalledTimes(1);
		expect(mocks.transcribeChunks.mock.calls[0][0]).toBe(chunks);
		expect(mocks.transcribeOnWebGpu).not.toHaveBeenCalled();
	});

	it('returns webgpu segments directly on success, without touching the fallback', async () => {
		const audio = new Float32Array([1, 2, 3]);
		mocks.transcribeOnWebGpu.mockResolvedValue(segments);
		const getAudio = vi.fn().mockResolvedValue(audio);
		const onFallback = vi.fn();
		const input: WebGpuInput = {
			backend: 'webgpu',
			getAudio,
			options: { quality: 'quality', wordTimestamps: true }
		};

		const result = await transcribe(input, undefined, onFallback);

		expect(result).toBe(segments);
		expect(getAudio).toHaveBeenCalledTimes(1);
		expect(mocks.transcribeOnWebGpu).toHaveBeenCalledWith(
			audio,
			{ quality: 'quality', wordTimestamps: true },
			undefined
		);
		expect(onFallback).not.toHaveBeenCalled();
		expect(mocks.transcribeChunks).not.toHaveBeenCalled();
	});

	it('falls back to the cpu path, with fresh audio, when the webgpu transcription itself fails', async () => {
		mocks.transcribeOnWebGpu.mockRejectedValue(new Error('lost gpu device'));
		mocks.transcribeChunks.mockResolvedValue(segments);
		const fallbackChunks = [chunk('fresh.wav')];
		const onFallback = vi.fn().mockResolvedValue(fallbackChunks);
		const getAudio = vi.fn().mockResolvedValue(new Float32Array([1]));
		const input: WebGpuInput = {
			backend: 'webgpu',
			getAudio,
			options: { quality: 'quality', wordTimestamps: true }
		};

		const result = await transcribe(input, undefined, onFallback);

		expect(result).toBe(segments);
		expect(onFallback).toHaveBeenCalledTimes(1);
		expect(mocks.transcribeChunks).toHaveBeenCalledTimes(1);
		expect(mocks.transcribeChunks.mock.calls[0][0]).toBe(fallbackChunks);
	});

	it('falls back to the cpu path when GPU audio extraction itself fails, not just transcription', async () => {
		mocks.transcribeChunks.mockResolvedValue(segments);
		const getAudio = vi.fn().mockRejectedValue(new Error('no audio track'));
		const fallbackChunks = [chunk('fresh.wav')];
		const onFallback = vi.fn().mockResolvedValue(fallbackChunks);
		const input: WebGpuInput = {
			backend: 'webgpu',
			getAudio,
			options: { quality: 'quality', wordTimestamps: true }
		};

		const result = await transcribe(input, undefined, onFallback);

		expect(result).toBe(segments);
		expect(mocks.transcribeOnWebGpu).not.toHaveBeenCalled();
		expect(onFallback).toHaveBeenCalledTimes(1);
		expect(mocks.transcribeChunks.mock.calls[0][0]).toBe(fallbackChunks);
	});

	it('rethrows a webgpu failure when no fallback is provided', async () => {
		const error = new Error('lost gpu device');
		mocks.transcribeOnWebGpu.mockRejectedValue(error);
		const getAudio = vi.fn().mockResolvedValue(new Float32Array([1]));
		const input: WebGpuInput = {
			backend: 'webgpu',
			getAudio,
			options: { quality: 'quality', wordTimestamps: true }
		};

		await expect(transcribe(input)).rejects.toThrow('lost gpu device');
		expect(mocks.transcribeChunks).not.toHaveBeenCalled();
	});

	it('rethrows a GPU extraction failure when no fallback is provided', async () => {
		const getAudio = vi.fn().mockRejectedValue(new Error('no audio track'));
		const input: WebGpuInput = {
			backend: 'webgpu',
			getAudio,
			options: { quality: 'quality', wordTimestamps: true }
		};

		await expect(transcribe(input)).rejects.toThrow('no audio track');
		expect(mocks.transcribeOnWebGpu).not.toHaveBeenCalled();
		expect(mocks.transcribeChunks).not.toHaveBeenCalled();
	});

	it('forwards transcribeChunks progress as phase "transcribing"', async () => {
		mocks.transcribeChunks.mockImplementation(async (_chunks: AudioChunk[], onPercent: (p: number) => void) => {
			onPercent(42);
			return segments;
		});
		const onProgress = vi.fn();

		await transcribe({ backend: 'wasm', chunks: [chunk('a.wav')] }, onProgress);

		expect(onProgress).toHaveBeenCalledWith({ phase: 'transcribing', percent: 42 });
	});
});
