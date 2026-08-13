import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL } from '@ffmpeg/util';
import { createEngineLog } from '$lib/log';

// ffmpeg emits a line for essentially every decision it makes. Retained quietly
// and dumped only on failure — see $lib/log.
export const ffmpegLog = createEngineLog('ffmpeg');

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

// Call after any ffmpeg call (writeFile/exec/readFile/...) throws. A WASM
// abort (e.g. an internal "unwind" exception escaping ffmpeg's native
// code) leaves the module instance permanently broken — every later call
// on it keeps failing too, generically, which is what turns a single real
// failure into "works the first time, then every retry fails" (retrying
// via loadFFmpeg() would otherwise keep handing back this same dead
// instance since it's cached above). Dropping the cache makes the next
// loadFFmpeg() call spin up a genuinely fresh module instead.
export function resetFFmpeg(): void {
	const dead = ffmpegPromise;
	ffmpegPromise = null;
	dead?.then((ffmpeg) => ffmpeg.terminate()).catch(() => {});
}

async function loadFFmpegInstance(): Promise<FFmpeg> {
	const ffmpeg = new FFmpeg();
	ffmpeg.on('log', ({ message }) => ffmpegLog.line(message));

	await ffmpeg.load({
		coreURL: await toBlobURL(`${CORE_BASE_URL}/ffmpeg-core.js`, 'text/javascript'),
		wasmURL: await toBlobURL(`${CORE_BASE_URL}/ffmpeg-core.wasm`, 'application/wasm'),
		workerURL: await toBlobURL(`${CORE_BASE_URL}/ffmpeg-core.worker.js`, 'text/javascript')
	});

	return ffmpeg;
}
