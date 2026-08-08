declare module '@transcribe/shout/src/shout/shout.wasm_no-simd.js' {
	const createModule: (moduleArg?: object) => Promise<unknown>;
	export default createModule;
}
