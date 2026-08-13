export type TranscriptionBackend = 'webgpu' | 'wasm';

// Shelved: every GPU config tried produced corrupt transcripts (words repeating
// 10x+), identically in Chrome and Firefox with both q4f16 and int8 decoders,
// and was slower than the CPU path. Untested suspects: fp16 encoder, and the
// lightly-used `_timestamped` export. To resume, flip this, restore the
// postinstall call to setup-whisper-webgpu.mjs, and the GPU steps in ci.yml.
const GPU_TRANSCRIPTION_ENABLED = false;

// Distinct reasons, so "it ran on CPU" is answerable from a bug report.
export type BackendReason =
	| 'webgpu-ok'
	| 'gpu-disabled'
	// Also what you get over plain http:// on a LAN address — not a secure context.
	| 'no-webgpu-api'
	// Almost always browser hardware acceleration being off: the one fixable case.
	| 'no-adapter'
	| 'no-shader-f16'
	| 'adapter-error';

export interface BackendSelection {
	backend: TranscriptionBackend;
	reason: BackendReason;
	// Distinguishes an integrated GPU from a discrete one in a bug report.
	adapterInfo?: string;
}

// Structural subset of the WebGPU types we actually rely on, so the selection
// logic stays unit-testable without a browser or a global stub.
export interface AdapterLike {
	features: { has(name: string): boolean };
	info?: { vendor?: string; architecture?: string; device?: string };
}
export interface GpuLike {
	requestAdapter(): Promise<AdapterLike | null>;
}

// `navigator.gpu` existing is not proof of a usable device, so every failure
// here degrades to the CPU path rather than throwing. Kept separate from the
// on/off flag so these checks stay under test while the feature is shelved.
export async function probeGpu(gpu: GpuLike | undefined): Promise<BackendSelection> {
	if (!gpu) return { backend: 'wasm', reason: 'no-webgpu-api' };
	try {
		const adapter = await gpu.requestAdapter();
		if (!adapter) return { backend: 'wasm', reason: 'no-adapter' };
		if (!adapter.features.has('shader-f16')) {
			return { backend: 'wasm', reason: 'no-shader-f16' };
		}
		const info = adapter.info;
		const described = info
			? [info.vendor, info.architecture, info.device].filter(Boolean).join(' ').trim()
			: '';
		return {
			backend: 'webgpu',
			reason: 'webgpu-ok',
			...(described ? { adapterInfo: described } : {})
		};
	} catch {
		return { backend: 'wasm', reason: 'adapter-error' };
	}
}

export async function selectBackend(gpu: GpuLike | undefined): Promise<BackendSelection> {
	if (!GPU_TRANSCRIPTION_ENABLED) return { backend: 'wasm', reason: 'gpu-disabled' };
	return probeGpu(gpu);
}

export function backendLabel(selection: BackendSelection): string {
	if (selection.backend === 'webgpu') {
		return selection.adapterInfo ? `GPU · ${selection.adapterInfo}` : 'GPU';
	}
	return 'CPU';
}

export function explainBackend(selection: BackendSelection): string {
	switch (selection.reason) {
		case 'webgpu-ok':
			return selection.adapterInfo
				? `GPU via WebGPU (${selection.adapterInfo})`
				: 'GPU via WebGPU';
		case 'gpu-disabled':
			return 'CPU. GPU transcription is disabled pending a fix for corrupt output.';
		case 'no-webgpu-api':
			return 'CPU. No WebGPU API in this browser: needs a recent Chrome or Edge, served over HTTPS or localhost.';
		case 'no-adapter':
			return 'CPU. WebGPU exists but no GPU adapter was available, which almost always means hardware acceleration is turned off in the browser.';
		case 'no-shader-f16':
			return 'CPU. This GPU lacks shader-f16 support, which the GPU model requires.';
		case 'adapter-error':
			return 'CPU. Requesting a GPU adapter threw an error.';
	}
}

// Only the cause a user can act on, so CPU-only machines aren't nagged.
export function isFixableByUser(selection: BackendSelection): boolean {
	return selection.reason === 'no-adapter';
}

export async function detectBackend(): Promise<BackendSelection> {
	const gpu = (navigator as Navigator & { gpu?: GpuLike }).gpu;
	const selection = await selectBackend(gpu);
	console.info(`[vidm:backend] transcribing on ${explainBackend(selection)}`);
	return selection;
}
