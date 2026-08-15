export type ReformatMode = 'crop' | 'blur-pad' | 'none';

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

// atempo only accepts 0.5-2.0 in a single filter instance — speeds above
// 2x chain two atempo filters (see buildAtempoChain) to reach MAX_SPEED
// without exceeding that per-filter limit.
export const MIN_SPEED = 0.5;
export const MAX_SPEED = 4;

// Gain multiplier for ffmpeg's `volume` audio filter. 1 = unchanged
// (default, inactive — same "no separate enabled flag" convention as
// every other tool). 0 = silent. HTMLMediaElement.volume caps at 1.0 in
// the browser, so the in-editor preview (SourcePreview) can only mirror
// 0-1 accurately; boosting above 1 is export-only, see its own comment.
export const MIN_VOLUME = 0;
export const MAX_VOLUME = 2;
export const DEFAULT_VOLUME = 1;

// A trim range narrower than this would produce a degenerate (near-zero
// length) clip — enforced at the UI layer (TrimControl), referenced here
// so the export/UI code share one source of truth.
export const MIN_TRIM_DURATION_SECONDS = 0.5;

// Splits a speed factor into one or two comma-chained atempo filters, each
// within atempo's own 0.5-2.0 per-instance range. Only ever needs two
// filters for the current MIN_SPEED/MAX_SPEED bounds: 2.0 absorbs
// everything above 2x, leaving a remainder that's always <= MAX_SPEED / 2.
function buildAtempoChain(speed: number): string {
	if (speed <= 2) return `atempo=${speed}`;
	return `atempo=2,atempo=${speed / 2}`;
}

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

// WebM (libvpx-vp9) was tried and dropped: ffmpeg.wasm's realtime-deadline
// VP9 encode crashes with a WASM "memory access out of bounds" trap (a
// widely-reported upstream bug, e.g. ffmpegwasm/ffmpeg.wasm#786/#679/#591),
// and the crash-safe deadline is far too slow to be usable in-browser
// (~25 of ~298 frames in 30s wall time on a short test clip).
export type OutputFormat = 'mp4' | 'gif';
export const DEFAULT_OUTPUT_FORMAT: OutputFormat = 'mp4';

export const OUTPUT_FORMAT_EXTENSIONS: Record<OutputFormat, string> = {
	mp4: 'mp4',
	gif: 'gif'
};

export const OUTPUT_FORMAT_MIME: Record<OutputFormat, string> = {
	mp4: 'video/mp4',
	gif: 'image/gif'
};

// GIF has no CRF/bitrate concept of its own: size and quality are driven by
// frame rate and pixel width instead (fed into the palettegen/paletteuse
// filter chain in buildExportArgs), so it gets its own preset shape rather
// than reusing CompressionPreset.
export interface GifQualityPreset {
	label: string;
	fps: number;
	maxWidth: number;
}

export const GIF_QUALITY_PRESETS: GifQualityPreset[] = [
	{ label: 'Small', fps: 10, maxWidth: 360 },
	{ label: 'Balanced', fps: 15, maxWidth: 480 },
	{ label: 'Smooth', fps: 20, maxWidth: 640 }
];

export const DEFAULT_GIF_QUALITY: GifQualityPreset = GIF_QUALITY_PRESETS[1];

// Fixed audio bitrate whenever audio gets re-encoded (needed so 'size' mode
// can budget for it) — see needsAudioReencode below.
const AUDIO_BITRATE_KBPS = 128;

// libx264 defaults to "medium" when -preset is unset — tuned for
// compression efficiency, not speed, and it's genuinely slow for a
// CPU-only WASM encoder (there's no GPU acceleration available to ffmpeg
// in-browser at all, WASM has no path to hardware encoding). "veryfast"
// cuts encode time substantially at the cost of a marginally larger file
// for the same CRF — same visual quality, just slightly less efficient
// compression. Applied whenever the video is actually being re-encoded;
// meaningless (and not applied) on the -c:v copy fast path, since no
// encoder runs there at all.
const X264_PRESET = 'veryfast';

// The multi-threaded WASM core has a fixed-size pthread pool, and left to
// itself libx264 sizes its thread count from the machine's core count
// (e.g. `threads=6 lookahead_threads=2` on an 8-core host). That can
// outrun what the pool can actually hand out, which fails in one of two
// ways: a silent deadlock (pthread_create() blocks forever waiting for a
// worker that never frees up), or the main thread throwing Emscripten's
// `unwind` when it can't satisfy a spawn synchronously.
//
// So every re-encode gets a cap, not just the ones with a second
// concurrent pipeline. This was originally conditional on `extraPipelines`
// (blur-pad's dual video streams, an audio encoder, libass) on the theory
// that a lone encoder always fits — confirmed wrong in practice: crop +
// CRF compression with no other pipeline still died at libx264 init with
// `unwind`. Extra pipelines still tighten the cap further, since they need
// their own workers out of the same pool.
const THREADS_FOR_NO_EXTRA_PIPELINE = 4;
const THREADS_FOR_SINGLE_EXTRA_PIPELINE = 4;
const THREADS_FOR_TWO_EXTRA_PIPELINES = 2;

export interface ExportOptions {
	mode: ReformatMode;
	speed: number;
	volume: number;
	ratio: AspectRatio;
	crop: CropRegion;
	compression: CompressionSettings;
	sourceDurationSeconds: number;
	// Trim range in seconds, into the source file's own timeline. Equal to
	// [0, sourceDurationSeconds] when trim is inactive — callers must
	// default it that way so this module can tell "no trim" apart from "a
	// deliberately narrow range" without a separate enabled flag.
	trimStart: number;
	trimEnd: number;
	// Source frame dimensions — used so blur-pad (which keeps the whole
	// frame) doesn't upscale beyond what the source actually has.
	sourceWidth: number;
	sourceHeight: number;
	// Path (in ffmpeg's FS) to a pre-built .ass subtitle file to burn in via
	// the `ass` filter, alongside a `fontsdir` directory holding the font(s)
	// it references — building that file is the caller's job (see
	// $lib/captions/ass.ts), buildExportArgs only wires the filter in.
	captionsAssPath?: string;
	captionsFontsDir?: string;
	outputFormat: OutputFormat;
	// Only consulted when outputFormat === 'gif'.
	gifQuality: GifQualityPreset;
}

// The final output frame size for a given mode/ratio/crop/source — exposed
// separately from buildExportArgs so callers that need it ahead of export
// (e.g. sizing a caption burn-in's ASS PlayResX/PlayResY to match exactly)
// don't have to duplicate this logic.
export function computeOutputDimensions(
	options: Pick<ExportOptions, 'mode' | 'ratio' | 'crop' | 'sourceWidth' | 'sourceHeight'>
): { width: number; height: number } {
	const { mode, ratio, crop, sourceWidth, sourceHeight } = options;
	// 'none': no reformat at all — keep the source's own frame size
	// (rounded to even, needed only if some other option still forces a
	// re-encode; see buildExportArgs). No ratio/crop-driven resizing.
	if (mode === 'none') {
		return { width: toEven(sourceWidth), height: toEven(sourceHeight) };
	}
	// Crop mode: the crop region is already sized to the target ratio, so
	// its own dimensions are the natural (non-upscaled) output size. Blur-pad
	// keeps the whole frame, so the source's own long edge is the reference.
	const sourceLongEdge =
		mode === 'crop' ? Math.max(crop.width, crop.height) : Math.max(sourceWidth, sourceHeight);
	return outputDimensions(ratio, sourceLongEdge);
}

export function buildExportArgs(
	inputName: string,
	outputName: string,
	options: ExportOptions
): string[] {
	const {
		mode,
		speed,
		volume,
		ratio,
		crop,
		compression,
		sourceDurationSeconds,
		trimStart,
		trimEnd,
		sourceWidth,
		sourceHeight,
		captionsAssPath,
		captionsFontsDir,
		outputFormat,
		gifQuality
	} = options;

	// Applied as *input* options (before -i), using -t (duration) rather
	// than -to (absolute end) — -to as an input option is relative to the
	// file's own start, not to -ss, which would double-trim the tail.
	const trimIsActive = trimStart > 0 || trimEnd < sourceDurationSeconds;
	const trimArgs = trimIsActive ? ['-ss', String(trimStart), '-t', String(trimEnd - trimStart)] : [];

	const needsSpeedFilters = speed !== 1;
	const needsVolumeFilter = volume !== 1;
	// 'size' mode needs audio re-encoded too (fixed bitrate) so the file-size
	// budget it computes for video is actually accurate — a copied audio
	// track's real bitrate isn't known ahead of time. An active trim also
	// forces re-encode (video below, audio here) — a copy-mode trim can
	// only cut at keyframes, so a trimStart that doesn't land on one can
	// produce an invalid/undecodable output stream, not just an imprecise
	// cut (same reasoning CaptionsPanel's own trim extraction already
	// applies for the same reason).
	const needsAudioReencode =
		needsSpeedFilters || needsVolumeFilter || compression.mode === 'size' || trimIsActive;
	// libass runs its own shaping/rendering work alongside the encoder, so
	// burned-in captions count as a concurrent pipeline for thread-budget
	// purposes just like blur-pad or an audio encoder do. Confirmed needed:
	// crop + CRF + captions (no blur-pad, no audio re-encode) left the
	// encoder uncapped at libx264's auto-detected 8 threads
	// (`threads=6 lookahead_threads=2`) and died immediately after encoder
	// init with Emscripten's `unwind` throw — the main thread trying to
	// spawn a pthread the worker pool couldn't satisfy.
	// palettegen/paletteuse (GIF quality) run their own filter-graph work
	// too, same reasoning as libass above.
	const extraPipelines =
		(mode === 'blur-pad' ? 1 : 0) +
		(needsAudioReencode ? 1 : 0) +
		(captionsAssPath ? 1 : 0) +
		(outputFormat === 'gif' ? 1 : 0);

	const captionsSuffix = captionsAssPath ? `,ass=${captionsAssPath}:fontsdir=${captionsFontsDir}` : '';
	// Standard high-quality GIF recipe: downsample fps/width, then build a
	// custom 256-colour palette from the actual clip (palettegen) instead of
	// ffmpeg's default per-frame quantization, and dither against it
	// (paletteuse), same idea as -crf for GIF's own quality/size trade-off.
	// Always the last stage of whichever chain it's appended to (split's
	// pads are local to this fragment); the caller supplies the closing
	// [outv] label where one is needed.
	const gifSuffix =
		outputFormat === 'gif'
			? `,fps=${gifQuality.fps},scale=${gifQuality.maxWidth}:-1:flags=lanczos,split[s0][s1];[s0]palettegen=stats_mode=diff[p];[s1][p]paletteuse=dither=bayer`
			: '';

	const { width: outW, height: outH } = computeOutputDimensions({
		mode,
		ratio,
		crop,
		sourceWidth,
		sourceHeight
	});

	const args: string[] = [];
	args.push(...trimArgs, '-i', inputName);
	if (mode === 'blur-pad') args.push(...trimArgs, '-i', inputName);

	const speedSuffix = needsSpeedFilters ? `,setpts=PTS/${speed}` : '';

	// Only the 'none' mode's -c:v copy fast path skips video re-encoding —
	// crop and blur-pad always build a -vf/-filter_complex.
	let videoIsReencoded = true;

	if (mode === 'crop') {
		// User-positioned crop region (already sized to the target ratio),
		// scaled only if it exceeds the output cap — never upscaled.
		args.push(
			'-vf',
			`crop=${crop.width}:${crop.height}:${crop.x}:${crop.y},scale=${outW}:${outH},setsar=1${speedSuffix}${captionsSuffix}${gifSuffix}`
		);
	} else if (mode === 'blur-pad') {
		// -threads only caps the encoder; -filter_complex's own thread pool
		// (scale/boxblur/overlay each may spawn workers) is separate and can
		// exhaust the shared WASM pthread pool on its own — cap both.
		args.push(
			'-filter_complex_threads',
			'1',
			'-filter_complex',
			`[0:v]scale=${outW}:${outH},boxblur=20:5[bg];[1:v]scale=${outW}:${outH}:force_original_aspect_ratio=decrease[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2,setsar=1${speedSuffix}${captionsSuffix}${gifSuffix}[outv]`,
			'-map',
			'[outv]'
		);
		// GIF has no audio stream at all: nothing to map.
		if (outputFormat !== 'gif') args.push('-map', '0:a');
	} else {
		// 'none': keep the source frame as-is — no crop/pad/target-ratio
		// scale. Other options (speed/captions/compression/trim) still apply
		// and still force a re-encode when active; when none of them are
		// active either, skip -vf entirely and copy the video stream
		// untouched rather than pointlessly re-encoding a pixel-identical
		// frame.
		const filters: string[] = [];
		// GIF always needs a real re-encode too: the source's own codec can
		// never just be stream-copied into a GIF.
		if (
			needsSpeedFilters ||
			captionsAssPath ||
			compression.mode !== 'none' ||
			trimIsActive ||
			outputFormat !== 'mp4'
		) {
			// Even-dimension safety net for the (rare) odd-dimensioned source —
			// libx264/yuv420p requires even width/height. No-op scale otherwise.
			filters.push(`scale=${outW}:${outH}`, 'setsar=1');
		}
		if (needsSpeedFilters) filters.push(`setpts=PTS/${speed}`);
		if (captionsAssPath) filters.push(`ass=${captionsAssPath}:fontsdir=${captionsFontsDir}`);

		if (filters.length > 0) {
			args.push('-vf', filters.join(',') + gifSuffix);
		} else {
			args.push('-c:v', 'copy');
			videoIsReencoded = false;
		}
	}

	if (videoIsReencoded && outputFormat === 'mp4') {
		args.push('-preset', X264_PRESET);
	}
	// gif: the native gif encoder needs no extra codec flags, quality is
	// already controlled by gifSuffix's fps/width/palette chain above.

	if (outputFormat === 'gif') {
		// No audio track in a GIF at all.
		args.push('-an');
	} else if (needsAudioReencode) {
		const audioFilters: string[] = [];
		if (needsSpeedFilters) audioFilters.push(buildAtempoChain(speed));
		if (needsVolumeFilter) audioFilters.push(`volume=${volume}`);
		if (audioFilters.length > 0) args.push('-filter:a', audioFilters.join(','));
		args.push('-c:a', 'aac', '-b:a', `${AUDIO_BITRATE_KBPS}k`);
	} else {
		args.push('-c:a', 'copy');
	}

	// GIF's size/quality trade-off is entirely gifQuality's fps/width, not
	// CRF/bitrate, so skip this whole block for it.
	if (outputFormat !== 'gif') {
		if (compression.mode === 'size') {
			// Single-pass average-bitrate approximation, not two-pass: two-pass
			// means a second encode pass over the same video — another
			// concurrent pipeline, and another way to hit the deadlock above.
			// Output will land close to the target, not exact.
			const outputDurationSec = (trimEnd - trimStart) / speed;
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
		// compression.mode === 'none': no explicit -crf/-b:v. If some other
		// filter still forces a re-encode, the encoder picks its own default
		// instead of an app-chosen target. The 'none' reformat mode's -c:v
		// copy path above is only reachable when compression.mode is 'none'
		// *and* trim is inactive *and* outputFormat is 'mp4', so it never
		// conflicts with -crf/-b:v.
	}

	// Only meaningful when an encoder actually runs — the -c:v copy fast
	// path spawns no encoder threads to cap.
	if (videoIsReencoded) {
		const threadCap =
			extraPipelines >= 2
				? THREADS_FOR_TWO_EXTRA_PIPELINES
				: extraPipelines === 1
					? THREADS_FOR_SINGLE_EXTRA_PIPELINE
					: THREADS_FOR_NO_EXTRA_PIPELINE;
		args.push('-threads', String(threadCap));
	}

	args.push(outputName);
	return args;
}
