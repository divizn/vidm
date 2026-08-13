export type TranscriptionBackend = 'webgpu' | 'wasm';

// Structural subset of the WebGPU types we actually rely on, so the selection
// logic stays unit-testable without a browser or a global stub.
export interface AdapterLike {
	features: { has(name: string): boolean };
}
export interface GpuLike {
	requestAdapter(): Promise<AdapterLike | null>;
}

// The presence of `navigator.gpu` is not proof of a usable device — a machine
// can expose the API and still fail to hand out an adapter (blocklisted driver,
// no GPU process, headless). And because the model is loaded at fp16/q4f16, an
// adapter without `shader-f16` would fail at pipeline construction rather than
// here, so it's screened out now. Every failure degrades to the whisper.cpp
// path rather than surfacing an error: captions still work, just slower.
export async function selectBackend(gpu: GpuLike | undefined): Promise<TranscriptionBackend> {
	if (!gpu) return 'wasm';
	try {
		const adapter = await gpu.requestAdapter();
		if (!adapter) return 'wasm';
		if (!adapter.features.has('shader-f16')) return 'wasm';
		return 'webgpu';
	} catch {
		return 'wasm';
	}
}

export function detectBackend(): Promise<TranscriptionBackend> {
	const gpu = (navigator as Navigator & { gpu?: GpuLike }).gpu;
	return selectBackend(gpu);
}
