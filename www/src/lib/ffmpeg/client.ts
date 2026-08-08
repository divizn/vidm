import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL } from '@ffmpeg/util';

// Self-hosted, multi-threaded core — needs COOP/COEP (see vite.config.ts).
const CORE_BASE_URL = '/ffmpeg';

// A second multi-threaded instance can't initialize while an earlier one is
// still alive in the same page (its pthread worker pool never spins up) —
// confirmed not fixable by terminating the old instance first, with or
// without a grace period. So the app only ever calls this once per page
// load; see +page.svelte's "refresh to convert another video" note.
export async function loadFFmpeg(): Promise<FFmpeg> {
	const ffmpeg = new FFmpeg();
	ffmpeg.on('log', ({ message }) => console.debug('[ffmpeg]', message));

	await ffmpeg.load({
		coreURL: await toBlobURL(`${CORE_BASE_URL}/ffmpeg-core.js`, 'text/javascript'),
		wasmURL: await toBlobURL(`${CORE_BASE_URL}/ffmpeg-core.wasm`, 'application/wasm'),
		workerURL: await toBlobURL(`${CORE_BASE_URL}/ffmpeg-core.worker.js`, 'text/javascript')
	});

	return ffmpeg;
}
