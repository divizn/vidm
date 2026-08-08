export type ReformatMode = 'crop' | 'blur-pad';

export interface AspectRatio {
	label: string;
	w: number;
	h: number;
}

export const ASPECT_RATIOS: AspectRatio[] = [
	{ label: '9:16', w: 9, h: 16 },
	{ label: '1:1', w: 1, h: 1 },
	{ label: '4:5', w: 4, h: 5 },
	{ label: '16:9', w: 16, h: 9 }
];

// Output resolution: long edge fixed at 1920, short edge derived from ratio.
export function outputDimensions(ratio: AspectRatio): { width: number; height: number } {
	const short = Math.round((1920 * Math.min(ratio.w, ratio.h)) / Math.max(ratio.w, ratio.h));
	return ratio.w <= ratio.h
		? { width: short, height: 1920 }
		: { width: 1920, height: short };
}

// A region of the source frame, in source pixels — what crop mode keeps.
export interface CropRegion {
	x: number;
	y: number;
	width: number;
	height: number;
}

// atempo only accepts 0.5-2.0 in a single filter instance; values outside
// that need chaining multiple atempo filters, which isn't supported here.
export const MIN_SPEED = 0.5;
export const MAX_SPEED = 2;

export type CompressionMode = 'preset' | 'size' | 'custom';

export interface CompressionPreset {
	label: string;
	crf: number;
}

// Lower CRF = higher quality/larger file. 18 is near-lossless, 28 is fairly
// aggressive; x264's own default (unset) is 23, used as "Balanced" here.
export const COMPRESSION_PRESETS: CompressionPreset[] = [
	{ label: 'Best quality', crf: 18 },
	{ label: 'Balanced', crf: 23 },
	{ label: 'Smallest file', crf: 28 }
];

export const MIN_CRF = 18;
export const MAX_CRF = 32;

export interface CompressionSettings {
	mode: CompressionMode;
	crf: number; // used for 'preset' and 'custom'
	targetMB: number; // used for 'size'
}

export const DEFAULT_COMPRESSION: CompressionSettings = {
	mode: 'preset',
	crf: COMPRESSION_PRESETS[1].crf,
	targetMB: 10
};

// Fixed audio bitrate whenever audio gets re-encoded (needed so 'size' mode
// can budget for it) — see needsAudioReencode below.
const AUDIO_BITRATE_KBPS = 128;

// The multi-threaded WASM core has a fixed-size pthread pool. A plain crop
// at 1x fits within it using libx264's default threading. But anything that
// adds a second concurrent pipeline — blur-pad's dual video streams
// (background blur + foreground overlay), or an audio encoder running
// alongside the video encoder — can exhaust the pool and deadlock silently
// (pthread_create() blocks forever waiting for a worker that never frees
// up). Capping libx264's own thread count leaves the pool enough headroom
// for the other pipeline(s) to actually get a worker.
const THREADS_FOR_SINGLE_EXTRA_PIPELINE = 4;
const THREADS_FOR_TWO_EXTRA_PIPELINES = 2;

export interface ExportOptions {
	mode: ReformatMode;
	speed: number;
	ratio: AspectRatio;
	crop: CropRegion;
	compression: CompressionSettings;
	sourceDurationSeconds: number;
}

export function buildExportArgs(
	inputName: string,
	outputName: string,
	options: ExportOptions
): string[] {
	const { mode, speed, ratio, crop, compression, sourceDurationSeconds } = options;

	const needsSpeedFilters = speed !== 1;
	// 'size' mode needs audio re-encoded too (fixed bitrate) so the file-size
	// budget it computes for video is actually accurate — a copied audio
	// track's real bitrate isn't known ahead of time.
	const needsAudioReencode = needsSpeedFilters || compression.mode === 'size';
	const extraPipelines = (mode === 'blur-pad' ? 1 : 0) + (needsAudioReencode ? 1 : 0);
	const { width: outW, height: outH } = outputDimensions(ratio);

	const args = ['-i', inputName];
	if (mode === 'blur-pad') args.push('-i', inputName);

	const speedSuffix = needsSpeedFilters ? `,setpts=PTS/${speed}` : '';

	if (mode === 'crop') {
		// User-positioned crop region (already sized to the target ratio),
		// then scaled to the fixed output resolution.
		args.push(
			'-vf',
			`crop=${crop.width}:${crop.height}:${crop.x}:${crop.y},scale=${outW}:${outH},setsar=1${speedSuffix}`
		);
	} else {
		// -threads only caps the encoder; -filter_complex's own thread pool
		// (scale/boxblur/overlay each may spawn workers) is separate and can
		// exhaust the shared WASM pthread pool on its own — cap both.
		args.push(
			'-filter_complex_threads',
			'1',
			'-filter_complex',
			`[0:v]scale=${outW}:${outH},boxblur=20:5[bg];[1:v]scale=${outW}:${outH}:force_original_aspect_ratio=decrease[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2,setsar=1${speedSuffix}[outv]`,
			'-map',
			'[outv]',
			'-map',
			'0:a'
		);
	}

	if (needsAudioReencode) {
		if (needsSpeedFilters) args.push('-filter:a', `atempo=${speed}`);
		args.push('-c:a', 'aac', '-b:a', `${AUDIO_BITRATE_KBPS}k`);
	} else {
		args.push('-c:a', 'copy');
	}

	if (compression.mode === 'size') {
		// Single-pass average-bitrate approximation, not two-pass: two-pass
		// means a second encode pass over the same video — another
		// concurrent pipeline, and another way to hit the deadlock above.
		// Output will land close to the target, not exact.
		const outputDurationSec = sourceDurationSeconds / speed;
		const totalBits = compression.targetMB * 8 * 1024 * 1024;
		const audioBits = AUDIO_BITRATE_KBPS * 1000 * outputDurationSec;
		const videoBitrateKbps = Math.max(
			100,
			Math.round((totalBits - audioBits) / outputDurationSec / 1000)
		);
		args.push('-b:v', `${videoBitrateKbps}k`);
	} else {
		args.push('-crf', String(compression.crf));
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
