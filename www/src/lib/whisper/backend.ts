export type TranscriptionBackend = 'webgpu' | 'wasm';

// Why a backend was chosen. Every wasm reason is a distinct, actionable cause —
// collapsing them all into a bare 'wasm' made "it ran on CPU" impossible to
// diagnose from a bug report, which is exactly what happened in GPU testing.
export type BackendReason =
	| 'webgpu-ok'
	// navigator.gpu missing: browser too old, or not a secure context. WebGPU is
	// unavailable over plain http:// on a non-localhost origin, so a LAN-hosted
	// test silently becomes a CPU run.
	| 'no-webgpu-api'
	// The API exists but no adapter was handed out. In practice this is almost
	// always browser hardware acceleration being switched off — the one cause a
	// user can actually fix, so it earns its own reason and a UI hint.
	| 'no-adapter'
	// Adapter exists but can't do fp16, which the q4f16 decoder requires.
	| 'no-shader-f16'
	| 'adapter-error';

export interface BackendSelection {
	backend: TranscriptionBackend;
	reason: BackendReason;
	// Populated on success. Tells an integrated GPU from a discrete one when the
	// timings look wrong, which a bare "ran on GPU" cannot.
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

// The presence of `navigator.gpu` is not proof of a usable device — a machine
// can expose the API and still fail to hand out an adapter (hardware
// acceleration off, blocklisted driver, headless). Every failure degrades to
// the whisper.cpp path rather than surfacing an error: captions still work,
// just slower.
export async function selectBackend(gpu: GpuLike | undefined): Promise<BackendSelection> {
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

// Short label for the UI badge — what actually ran.
export function backendLabel(selection: BackendSelection): string {
	if (selection.backend === 'webgpu') {
		return selection.adapterInfo ? `GPU · ${selection.adapterInfo}` : 'GPU';
	}
	return 'CPU';
}

// Full explanation, written for someone who has not read this file. Used both
// in the console and, for the fixable case, in the UI.
export function explainBackend(selection: BackendSelection): string {
	switch (selection.reason) {
		case 'webgpu-ok':
			return selection.adapterInfo
				? `GPU via WebGPU (${selection.adapterInfo})`
				: 'GPU via WebGPU';
		case 'no-webgpu-api':
			return 'CPU — no WebGPU API in this browser. Needs a recent Chrome or Edge, served over HTTPS or localhost (plain http:// on a LAN address disables WebGPU).';
		case 'no-adapter':
			return 'CPU — WebGPU exists but no GPU adapter was available. This almost always means hardware acceleration is turned off in the browser.';
		case 'no-shader-f16':
			return 'CPU — this GPU lacks shader-f16 (16-bit shader) support, which the GPU model requires.';
		case 'adapter-error':
			return 'CPU — requesting a GPU adapter threw an error.';
	}
}

// True only for the cause the user can actually do something about, so the UI
// can show an actionable hint instead of nagging on every CPU-only machine.
export function isFixableByUser(selection: BackendSelection): boolean {
	return selection.reason === 'no-adapter';
}

export async function detectBackend(): Promise<BackendSelection> {
	const gpu = (navigator as Navigator & { gpu?: GpuLike }).gpu;
	const selection = await selectBackend(gpu);
	console.info(`[vidm:backend] transcribing on ${explainBackend(selection)}`);
	return selection;
}
