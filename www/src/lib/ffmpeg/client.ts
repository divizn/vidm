import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL } from '@ffmpeg/util';

// Self-hosted, multi-threaded core — needs COOP/COEP (see vite.config.ts).
const CORE_BASE_URL = '/ffmpeg';

// A second multi-threaded instance can't initialize while an earlier one is
// still alive in the same page (its pthread worker pool never spins up) —
// confirmed not fixable by terminating the old instance first, with or
// without a grace period. Originally the app only ever called this once
// (from the main export flow); trim's caption pre-extraction now needs a
// loaded engine too, so this caches the first load and hands every caller
// the same instance instead of racing a second one into existence.
let ffmpegPromise: Promise<FFmpeg> | null = null;

export function loadFFmpeg(): Promise<FFmpeg> {
	if (!ffmpegPromise) {
		ffmpegPromise = loadFFmpegInstance();
	}
	return ffmpegPromise;
}

async function loadFFmpegInstance(): Promise<FFmpeg> {
	const ffmpeg = new FFmpeg();
	ffmpeg.on('log', ({ message }) => console.debug('[ffmpeg]', message));

	await ffmpeg.load({
		coreURL: await toBlobURL(`${CORE_BASE_URL}/ffmpeg-core.js`, 'text/javascript'),
		wasmURL: await toBlobURL(`${CORE_BASE_URL}/ffmpeg-core.wasm`, 'application/wasm'),
		workerURL: await toBlobURL(`${CORE_BASE_URL}/ffmpeg-core.worker.js`, 'text/javascript')
	});

	return ffmpeg;
}
