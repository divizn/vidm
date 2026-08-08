// TEST: no-simd build, to isolate whether a SIMD incompatibility is
// causing the opaque WASM worker crash (undefined filename/line/message).
import createModule from '@transcribe/shout/src/shout/shout.wasm_no-simd.js';
import { FileTranscriber } from '@transcribe/transcriber';
import type { CaptionSegment } from './srt';

// Self-hosted, same COOP/COEP setup as ffmpeg-core-mt (see vite.config.ts).
const MODEL_URL = '/whisper/ggml-tiny.en-q5_1.bin';

export async function transcribeFile(
	file: File,
	onProgress?: (percent: number) => void
): Promise<CaptionSegment[]> {
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
	// TEST: threads=1, in case multi-threaded computation spawns a pthread
	// sub-worker that our print/printErr/onAbort hooks (registered on the
	// main Module instance) don't propagate to, hiding the real crash site.
	const result = await transcriber.transcribe(file, { lang: 'en', threads: 1 });
	transcriber.destroy();

	return result.transcription.map((seg) => ({
		from: seg.timestamps.from,
		to: seg.timestamps.to,
		text: seg.text
	}));
}
