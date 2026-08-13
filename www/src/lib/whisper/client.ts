import { FileTranscriber, type TranscribeToken } from '@transcribe/transcriber';
import { parseSrtTimestamp, formatSrtTimestamp, type CaptionSegment, type CaptionWord } from './srt';
import { createEngineLog } from '$lib/log';

const cpuLog = createEngineLog('whisper-cpu');

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

// Fixed window each chunk is transcribed in, instead of one pass over the
// whole file — bounds whisper.cpp's per-call wasm heap growth on long
// videos and turns progress into per-chunk granularity instead of one
// opaque whole-file percentage.
export const TRANSCRIBE_CHUNK_SECONDS = 30;

export interface AudioChunk {
	file: File;
	offsetSeconds: number;
}

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

// Transcribes each chunk in sequence against a single loaded model instance
// (loading the model per chunk would dwarf the cost of transcribing it), then
// merges the results into one segment list with each chunk's timestamps
// shifted back onto the original, unchunked timeline.
export async function transcribeChunks(
	chunks: AudioChunk[],
	onProgress?: (percent: number) => void
): Promise<CaptionSegment[]> {
	cpuLog.clear();
	console.info(
		`[vidm:whisper-cpu] transcribing ${chunks.length} chunk(s) with whisper.cpp (WASM, CPU)`
	);
	const { default: createModule } = await import(/* @vite-ignore */ SHOUT_URL);

	const transcriber = new FileTranscriber({
		createModule,
		model: MODEL_URL,
		// stderr carries whisper.cpp's ordinary banner, so it is not an error stream.
		print: (msg) => cpuLog.line(msg),
		printErr: (msg) => cpuLog.line(msg),
		onAbort: () => {
			console.error('[vidm:whisper-cpu] whisper.cpp aborted');
			cpuLog.dumpRecent('abort');
		},
		onExit: (status) => {
			console.error('[vidm:whisper-cpu] whisper.cpp exited', status);
			cpuLog.dumpRecent('exit');
		}
	});

	await transcriber.init();

	const segments: CaptionSegment[] = [];
	try {
		for (let i = 0; i < chunks.length; i++) {
			const { file, offsetSeconds } = chunks[i];
			transcriber.onProgress = (chunkPercent: number) => {
				onProgress?.(Math.round(((i + chunkPercent / 100) / chunks.length) * 100));
			};

			const result = await transcriber.transcribe(file, { lang: 'en' });
			for (const seg of result.transcription) {
				segments.push({
					from: formatSrtTimestamp(parseSrtTimestamp(seg.timestamps.from) + offsetSeconds),
					to: formatSrtTimestamp(parseSrtTimestamp(seg.timestamps.to) + offsetSeconds),
					text: seg.text,
					words: wordsFromTokens(seg.tokens).map((w) => ({
						text: w.text,
						from: w.from + offsetSeconds,
						to: w.to + offsetSeconds
					}))
				});
			}
		}
	} catch (err) {
		cpuLog.dumpRecent('transcription failure');
		throw err;
	} finally {
		transcriber.destroy();
	}

	return segments;
}
