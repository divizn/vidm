import { describe, expect, it } from 'vitest';
import { selectBackend } from './backend';

const adapter = (features: string[]) => ({ features: new Set(features) });

describe('selectBackend', () => {
	it('returns wasm when the WebGPU API is absent', async () => {
		expect(await selectBackend(undefined)).toBe('wasm');
	});

	it('returns webgpu when an adapter supports shader-f16', async () => {
		const gpu = { requestAdapter: async () => adapter(['shader-f16']) };
		expect(await selectBackend(gpu)).toBe('webgpu');
	});

	it('returns wasm when no adapter is available despite the API existing', async () => {
		const gpu = { requestAdapter: async () => null };
		expect(await selectBackend(gpu)).toBe('wasm');
	});

	it('returns wasm when the adapter lacks shader-f16, since dtypes need fp16', async () => {
		const gpu = { requestAdapter: async () => adapter([]) };
		expect(await selectBackend(gpu)).toBe('wasm');
	});

	it('returns wasm when requesting an adapter throws', async () => {
		const gpu = {
			requestAdapter: async () => {
				throw new Error('no gpu process');
			}
		};
		expect(await selectBackend(gpu)).toBe('wasm');
	});
});
