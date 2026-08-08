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

const MAX_OUTPUT_LONG_EDGE = 1920;

// libx264 requires even width/height (yuv420p chroma subsampling) — round
// down, never up, so dimensions never exceed their source/cap.
function toEven(n: number): number {
	return Math.floor(n / 2) * 2;
}

// Output resolution: long edge is whatever the source actually has (capped
// at MAX_OUTPUT_LONG_EDGE for very high-res sources), never upscaled beyond
// it — sourceLongEdge should be the crop region's own size for crop mode,
// or the source frame's long edge for blur-pad (which keeps the whole
// frame). Short edge is derived from the target ratio.
export function outputDimensions(
	ratio: AspectRatio,
	sourceLongEdge: number
): { width: number; height: number } {
	const longEdge = toEven(Math.min(MAX_OUTPUT_LONG_EDGE, sourceLongEdge));
	const short = toEven((longEdge * Math.min(ratio.w, ratio.h)) / Math.max(ratio.w, ratio.h));
	return ratio.w <= ratio.h ? { width: short, height: longEdge } : { width: longEdge, height: short };
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

export type CompressionMode = 'none' | 'preset' | 'size' | 'custom';

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
	// Source frame dimensions — used so blur-pad (which keeps the whole
	// frame) doesn't upscale beyond what the source actually has.
	sourceWidth: number;
	sourceHeight: number;
}

export function buildExportArgs(
	inputName: string,
	outputName: string,
	options: ExportOptions
): string[] {
	const { mode, speed, ratio, crop, compression, sourceDurationSeconds, sourceWidth, sourceHeight } =
		options;

	const needsSpeedFilters = speed !== 1;
	// 'size' mode needs audio re-encoded too (fixed bitrate) so the file-size
	// budget it computes for video is actually accurate — a copied audio
	// track's real bitrate isn't known ahead of time.
	const needsAudioReencode = needsSpeedFilters || compression.mode === 'size';
	const extraPipelines = (mode === 'blur-pad' ? 1 : 0) + (needsAudioReencode ? 1 : 0);

	// Crop mode: the crop region is already sized to the target ratio, so
	// its own dimensions are the natural (non-upscaled) output size. Blur-pad
	// keeps the whole frame, so the source's own long edge is the reference.
	const sourceLongEdge =
		mode === 'crop' ? Math.max(crop.width, crop.height) : Math.max(sourceWidth, sourceHeight);
	const { width: outW, height: outH } = outputDimensions(ratio, sourceLongEdge);

	const args = ['-i', inputName];
	if (mode === 'blur-pad') args.push('-i', inputName);

	const speedSuffix = needsSpeedFilters ? `,setpts=PTS/${speed}` : '';

	if (mode === 'crop') {
		// User-positioned crop region (already sized to the target ratio),
		// scaled only if it exceeds the output cap — never upscaled.
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
	} else if (compression.mode !== 'none') {
		args.push('-crf', String(compression.crf));
	}
	// mode === 'none': no explicit -crf/-b:v — the reformat filters still force
	// a re-encode (there's no -c:v copy path here), but libx264 picks its own
	// default (unset CRF, effectively 23) instead of an app-chosen target.

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
