import { FileTranscriber } from '@transcribe/transcriber';
import type { CaptionSegment } from './srt';

// Self-hosted, same COOP/COEP setup as ffmpeg-core-mt (see vite.config.ts).
// Loaded via dynamic import of the absolute static URL (not a bare package
// import) so Vite's dev prebundling and the production Rollup build never
// touch this file: its pthread-worker bootstrap resolves a sibling file via
// `new URL("shout.wasm.js", import.meta.url)`, which only stays correct if
// this module keeps living at a stable, unhashed URL. The no-SIMD build
// (`shout.wasm_no-simd.js`) shares that exact same hardcoded worker
// bootstrap line pointing at "shout.wasm.js" regardless of which variant is
// running, so pairing it as the main-thread module mismatches it against a
// SIMD-compiled pthread worker — that mismatch, not the environment, was
// the source of the crash this file used to work around with diagnostics.
const SHOUT_URL = '/whisper/shout.wasm.js';
const MODEL_URL = '/whisper/ggml-tiny.en-q5_1.bin';

export async function transcribeFile(
	file: File,
	onProgress?: (percent: number) => void
): Promise<CaptionSegment[]> {
	const { default: createModule } = await import(/* @vite-ignore */ SHOUT_URL);

	const transcriber = new FileTranscriber({
		createModule,
		model: MODEL_URL,
		onProgress,
		print: (msg) => console.log('[whisper stdout]', msg),
		printErr: (msg) => console.error('[whisper stderr]', msg),
		onAbort: () => console.error('[whisper] Module.onAbort fired'),
		onExit: (status) => console.error('[whisper] Module.onExit fired', status)
	});

	await transcriber.init();
	const result = await transcriber.transcribe(file, { lang: 'en' });
	transcriber.destroy();

	return result.transcription.map((seg) => ({
		from: seg.timestamps.from,
		to: seg.timestamps.to,
		text: seg.text
	}));
}
