import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL } from '@ffmpeg/util';

// Self-hosted, multi-threaded core — needs COOP/COEP (see vite.config.ts).
const CORE_BASE_URL = '/ffmpeg';

let instance: FFmpeg | null = null;
let loading: Promise<FFmpeg> | null = null;

export function getFFmpeg(): Promise<FFmpeg> {
	if (instance) return Promise.resolve(instance);
	if (loading) return loading;

	loading = (async () => {
		const ffmpeg = new FFmpeg();
		ffmpeg.on('log', ({ message }) => console.debug('[ffmpeg]', message));

		await ffmpeg.load({
			coreURL: await toBlobURL(`${CORE_BASE_URL}/ffmpeg-core.js`, 'text/javascript'),
			wasmURL: await toBlobURL(`${CORE_BASE_URL}/ffmpeg-core.wasm`, 'application/wasm'),
			workerURL: await toBlobURL(`${CORE_BASE_URL}/ffmpeg-core.worker.js`, 'text/javascript')
		});

		instance = ffmpeg;
		return ffmpeg;
	})();

	return loading;
}
