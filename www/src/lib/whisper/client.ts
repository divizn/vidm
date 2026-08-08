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
		onProgress
	});

	await transcriber.init();
	const result = await transcriber.transcribe(file, { lang: 'en', threads: 2 });
	transcriber.destroy();

	return result.transcription.map((seg) => ({
		from: seg.timestamps.from,
		to: seg.timestamps.to,
		text: seg.text
	}));
}
