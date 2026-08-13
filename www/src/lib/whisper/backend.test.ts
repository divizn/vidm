import { describe, expect, it } from 'vitest';
import { backendLabel, explainBackend, isFixableByUser, selectBackend } from './backend';

const adapter = (features: string[], info?: Record<string, string>) => ({
	features: new Set(features),
	...(info ? { info } : {})
});

describe('selectBackend', () => {
	it('reports no-webgpu-api when the WebGPU API is absent', async () => {
		expect(await selectBackend(undefined)).toEqual({
			backend: 'wasm',
			reason: 'no-webgpu-api'
		});
	});

	it('selects webgpu when an adapter supports shader-f16', async () => {
		const gpu = { requestAdapter: async () => adapter(['shader-f16']) };
		expect(await selectBackend(gpu)).toEqual({ backend: 'webgpu', reason: 'webgpu-ok' });
	});

	it('includes adapter info when the driver exposes it', async () => {
		const gpu = {
			requestAdapter: async () =>
				adapter(['shader-f16'], { vendor: 'nvidia', architecture: 'ampere' })
		};
		const result = await selectBackend(gpu);
		expect(result.backend).toBe('webgpu');
		expect(result.adapterInfo).toBe('nvidia ampere');
	});

	// The signature of hardware acceleration being switched off in the browser.
	it('reports no-adapter when the API exists but hands out no adapter', async () => {
		const gpu = { requestAdapter: async () => null };
		expect(await selectBackend(gpu)).toEqual({ backend: 'wasm', reason: 'no-adapter' });
	});

	it('reports no-shader-f16 when the adapter cannot do fp16', async () => {
		const gpu = { requestAdapter: async () => adapter([]) };
		expect(await selectBackend(gpu)).toEqual({ backend: 'wasm', reason: 'no-shader-f16' });
	});

	it('reports adapter-error when requesting an adapter throws', async () => {
		const gpu = {
			requestAdapter: async () => {
				throw new Error('no gpu process');
			}
		};
		expect(await selectBackend(gpu)).toEqual({ backend: 'wasm', reason: 'adapter-error' });
	});
});

describe('backendLabel', () => {
	it('names the GPU when adapter info is known', () => {
		expect(
			backendLabel({ backend: 'webgpu', reason: 'webgpu-ok', adapterInfo: 'nvidia ampere' })
		).toBe('GPU · nvidia ampere');
	});

	it('falls back to a bare GPU label without adapter info', () => {
		expect(backendLabel({ backend: 'webgpu', reason: 'webgpu-ok' })).toBe('GPU');
	});

	it('labels every wasm reason as CPU', () => {
		expect(backendLabel({ backend: 'wasm', reason: 'no-adapter' })).toBe('CPU');
	});
});

describe('explainBackend', () => {
	it('explains each reason distinctly', () => {
		const reasons = [
			'webgpu-ok',
			'no-webgpu-api',
			'no-adapter',
			'no-shader-f16',
			'adapter-error'
		] as const;
		const messages = reasons.map((reason) =>
			explainBackend({ backend: reason === 'webgpu-ok' ? 'webgpu' : 'wasm', reason })
		);
		// Every reason must produce its own message — a shared string would put us
		// back where we started, unable to tell causes apart from a bug report.
		expect(new Set(messages).size).toBe(reasons.length);
		expect(messages.every((message) => message.length > 0)).toBe(true);
	});

	it('names hardware acceleration for the no-adapter case', () => {
		expect(explainBackend({ backend: 'wasm', reason: 'no-adapter' })).toMatch(
			/hardware acceleration/i
		);
	});
});

describe('isFixableByUser', () => {
	it('is true only for no-adapter, the one cause a user can act on', () => {
		expect(isFixableByUser({ backend: 'wasm', reason: 'no-adapter' })).toBe(true);
		for (const reason of ['webgpu-ok', 'no-webgpu-api', 'no-shader-f16', 'adapter-error'] as const) {
			expect(isFixableByUser({ backend: 'wasm', reason })).toBe(false);
		}
	});
});
