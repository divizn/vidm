export type ReformatMode = 'crop' | 'blur-pad';

const WIDTH = 1080;
const HEIGHT = 1920;

// atempo only accepts 0.5-2.0 in a single filter instance; values outside
// that need chaining multiple atempo filters, which isn't supported here.
export const MIN_SPEED = 0.5;
export const MAX_SPEED = 2;

// The multi-threaded WASM core has a fixed-size pthread pool. A plain crop
// at 1x fits within it using libx264's default threading. But anything that
// adds a second concurrent pipeline — blur-pad's dual video streams
// (background blur + foreground overlay), or a sped-up export's audio
// encoder running alongside the video encoder — can exhaust the pool and
// deadlock silently (pthread_create() blocks forever waiting for a worker
// that never frees up). Capping libx264's own thread count leaves the pool
// enough headroom for the other pipeline(s) to actually get a worker.
const THREADS_FOR_SINGLE_EXTRA_PIPELINE = 4;
const THREADS_FOR_TWO_EXTRA_PIPELINES = 2;

export function buildExportArgs(
	inputName: string,
	outputName: string,
	mode: ReformatMode,
	speed: number
): string[] {
	const needsSpeedFilters = speed !== 1;
	const extraPipelines = (mode === 'blur-pad' ? 1 : 0) + (needsSpeedFilters ? 1 : 0);

	const args = ['-i', inputName];
	if (mode === 'blur-pad') args.push('-i', inputName);

	const speedSuffix = needsSpeedFilters ? `,setpts=PTS/${speed}` : '';

	if (mode === 'crop') {
		args.push(
			'-vf',
			`scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=increase,crop=${WIDTH}:${HEIGHT},setsar=1${speedSuffix}`
		);
	} else {
		// -threads only caps the encoder; -filter_complex's own thread pool
		// (scale/boxblur/overlay each may spawn workers) is separate and can
		// exhaust the shared WASM pthread pool on its own — cap both.
		args.push(
			'-filter_complex_threads',
			'1',
			'-filter_complex',
			`[0:v]scale=${WIDTH}:${HEIGHT},boxblur=20:5[bg];[1:v]scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=decrease[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2,setsar=1${speedSuffix}[outv]`,
			'-map',
			'[outv]',
			'-map',
			'0:a'
		);
	}

	if (needsSpeedFilters) {
		args.push('-filter:a', `atempo=${speed}`, '-c:a', 'aac');
	} else {
		args.push('-c:a', 'copy');
	}

	if (extraPipelines > 0) {
		args.push(
			'-threads',
			extraPipelines >= 2
				? String(THREADS_FOR_TWO_EXTRA_PIPELINES)
				: String(THREADS_FOR_SINGLE_EXTRA_PIPELINE)
		);
	}

	args.push(outputName);
	return args;
}
