import { FileTranscriber, type TranscribeToken } from '@transcribe/transcriber';
import type { CaptionSegment, CaptionWord } from './srt';

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

// whisper.cpp's BPE tokenizer prefixes a token with a space to mark the
// start of a new word; a token with no leading space is a continuation
// (subword or trailing punctuation) that belongs to the previous word. Also
// drop bracketed special tokens (e.g. "[_BEGIN_]") which carry no timing
// worth exposing. Word timestamps require `token_timestamps: true`
// (the library default), so `offsets` should always be present here.
function wordsFromTokens(tokens: TranscribeToken[]): CaptionWord[] {
	const words: CaptionWord[] = [];
	for (const token of tokens) {
		if (!token.offsets) continue;
		if (/^\[.*\]$/.test(token.text.trim())) continue;
		const text = token.text.trim();
		if (!text) continue;

		const from = token.offsets.from / 1000;
		const to = token.offsets.to / 1000;
		const isContinuation = !token.text.startsWith(' ') && words.length > 0;
		if (isContinuation) {
			const prev = words[words.length - 1];
			prev.text += text;
			prev.to = to;
		} else {
			words.push({ text, from, to });
		}
	}
	return words;
}

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
		text: seg.text,
		words: wordsFromTokens(seg.tokens)
	}));
}
