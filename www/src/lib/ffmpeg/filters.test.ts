import { describe, expect, it } from 'vitest';
import {
	ASPECT_RATIOS,
	DEFAULT_COMPRESSION,
	buildExportArgs,
	computeOutputDimensions,
	outputDimensions,
	type CropRegion,
	type ExportOptions
} from './filters';

const RATIO_9_16 = ASPECT_RATIOS.find((r) => r.label === '9:16')!;
const RATIO_16_9 = ASPECT_RATIOS.find((r) => r.label === '16:9')!;
const RATIO_1_1 = ASPECT_RATIOS.find((r) => r.label === '1:1')!;

describe('outputDimensions', () => {
	it('never upscales beyond the source', () => {
		// Regression: output used to always force a fixed 1920px long edge
		// regardless of source size, upscaling small sources unnecessarily.
		const { width, height } = outputDimensions(RATIO_9_16, 640);
		expect(Math.max(width, height)).toBeLessThanOrEqual(640);
	});

	it('caps the long edge at 1920 for very high-res sources', () => {
		const { width, height } = outputDimensions(RATIO_9_16, 4000);
		expect(Math.max(width, height)).toBe(1920);
	});

	it('always returns even dimensions', () => {
		// Regression: odd pixel dimensions silently crash libx264 (needs even
		// width/height for yuv420p) — ffmpeg.wasm wrote an empty file instead
		// of throwing, and the app treated that as a successful 0-byte export.
		for (const longEdge of [641, 999, 1281, 1920]) {
			for (const ratio of ASPECT_RATIOS) {
				const { width, height } = outputDimensions(ratio, longEdge);
				expect(width % 2).toBe(0);
				expect(height % 2).toBe(0);
			}
		}
	});

	it('orients portrait ratios (w <= h) as width=short, height=long', () => {
		const { width, height } = outputDimensions(RATIO_9_16, 1920);
		expect(height).toBeGreaterThan(width);
	});

	it('orients landscape ratios (w > h) as width=long, height=short', () => {
		const { width, height } = outputDimensions(RATIO_16_9, 1920);
		expect(width).toBeGreaterThan(height);
	});

	it('produces equal width/height for a 1:1 ratio', () => {
		const { width, height } = outputDimensions(RATIO_1_1, 1920);
		expect(width).toBe(height);
	});
});

const CROP: CropRegion = { x: 10, y: 20, width: 400, height: 711 };

function baseOptions(overrides: Partial<ExportOptions> = {}): ExportOptions {
	return {
		mode: 'crop',
		speed: 1,
		ratio: RATIO_9_16,
		crop: CROP,
		compression: DEFAULT_COMPRESSION,
		sourceDurationSeconds: 10,
		trimStart: 0,
		trimEnd: 10,
		sourceWidth: 1920,
		sourceHeight: 1080,
		...overrides
	};
}

describe('buildExportArgs', () => {
	it('crop mode: single input, crop+scale filter, copies audio at 1x/no compression change', () => {
		const args = buildExportArgs('in.mp4', 'out.mp4', baseOptions());

		expect(args.filter((a) => a === '-i')).toHaveLength(1);
		expect(args).toContain('-vf');
		const vf = args[args.indexOf('-vf') + 1];
		expect(vf).toContain(`crop=${CROP.width}:${CROP.height}:${CROP.x}:${CROP.y}`);
		expect(args).toContain('copy'); // -c:a copy, no speed/size-mode re-encode needed
		expect(args.at(-1)).toBe('out.mp4');
	});

	it('blur-pad mode: two inputs, filter_complex with capped filter thread count', () => {
		const args = buildExportArgs('in.mp4', 'out.mp4', baseOptions({ mode: 'blur-pad' }));

		expect(args.filter((a) => a === '-i')).toHaveLength(2);
		expect(args).toContain('-filter_complex');
		expect(args).toContain('-filter_complex_threads');
		expect(args[args.indexOf('-filter_complex_threads') + 1]).toBe('1');
		const fc = args[args.indexOf('-filter_complex') + 1];
		expect(fc).toContain('boxblur');
		expect(fc).toContain('overlay');
	});

	it('non-1x speed adds setpts/atempo and forces an audio re-encode', () => {
		const args = buildExportArgs('in.mp4', 'out.mp4', baseOptions({ speed: 1.5 }));

		const vf = args[args.indexOf('-vf') + 1];
		expect(vf).toContain('setpts=PTS/1.5');
		expect(args).toContain('-filter:a');
		expect(args[args.indexOf('-filter:a') + 1]).toBe('atempo=1.5');
		expect(args).toContain('aac');
		expect(args).not.toContain('copy');
	});

	it('1x speed does not touch audio (stream copy)', () => {
		const args = buildExportArgs('in.mp4', 'out.mp4', baseOptions({ speed: 1 }));

		expect(args).not.toContain('-filter:a');
		expect(args).toContain('copy');
	});

	it('chains two atempo filters for speeds above 2x, since atempo only accepts 0.5-2.0 per instance', () => {
		const args = buildExportArgs('in.mp4', 'out.mp4', baseOptions({ speed: 3 }));

		expect(args[args.indexOf('-filter:a') + 1]).toBe('atempo=2,atempo=1.5');
	});

	it('chains two atempo=2 filters for the max 4x speed', () => {
		const args = buildExportArgs('in.mp4', 'out.mp4', baseOptions({ speed: 4 }));

		expect(args[args.indexOf('-filter:a') + 1]).toBe('atempo=2,atempo=2');
	});

	it('still uses a single atempo filter at exactly 2x', () => {
		const args = buildExportArgs('in.mp4', 'out.mp4', baseOptions({ speed: 2 }));

		expect(args[args.indexOf('-filter:a') + 1]).toBe('atempo=2');
	});

	it('compression "none" adds no -crf or -b:v', () => {
		const args = buildExportArgs(
			'in.mp4',
			'out.mp4',
			baseOptions({ compression: { mode: 'none', crf: 23, targetMB: 10 } })
		);

		expect(args).not.toContain('-crf');
		expect(args).not.toContain('-b:v');
	});

	it('compression "preset"/"custom" passes through the given CRF', () => {
		const args = buildExportArgs(
			'in.mp4',
			'out.mp4',
			baseOptions({ compression: { mode: 'custom', crf: 30, targetMB: 10 } })
		);

		expect(args).toContain('-crf');
		expect(args[args.indexOf('-crf') + 1]).toBe('30');
	});

	it('compression "size" computes a video bitrate and forces audio re-encode', () => {
		const args = buildExportArgs(
			'in.mp4',
			'out.mp4',
			baseOptions({
				sourceDurationSeconds: 10,
				compression: { mode: 'size', crf: 23, targetMB: 3 }
			})
		);

		expect(args).toContain('-b:v');
		expect(args).toContain('aac'); // size mode needs a known audio bitrate to budget against
		expect(args).not.toContain('-crf');

		// Sanity-check the estimate lands in the right ballpark: 3MB target,
		// 10s output, 128kbps audio reserved -> video bitrate should be a few
		// hundred kbps, not near-zero or absurdly large.
		const kbps = Number(args[args.indexOf('-b:v') + 1].replace('k', ''));
		expect(kbps).toBeGreaterThan(100);
		expect(kbps).toBeLessThan(5000);
	});

	it('never lets the video bitrate go below the 100kbps floor even for tiny targets', () => {
		const args = buildExportArgs(
			'in.mp4',
			'out.mp4',
			baseOptions({
				sourceDurationSeconds: 60,
				compression: { mode: 'size', crf: 23, targetMB: 1 }
			})
		);

		const kbps = Number(args[args.indexOf('-b:v') + 1].replace('k', ''));
		expect(kbps).toBeGreaterThanOrEqual(100);
	});

	it('caps encoder threads for a single extra pipeline (blur-pad alone)', () => {
		const args = buildExportArgs('in.mp4', 'out.mp4', baseOptions({ mode: 'blur-pad', speed: 1 }));

		expect(args).toContain('-threads');
		expect(args[args.indexOf('-threads') + 1]).toBe('4');
	});

	it('caps encoder threads harder for two extra pipelines (blur-pad + speed change)', () => {
		const args = buildExportArgs(
			'in.mp4',
			'out.mp4',
			baseOptions({ mode: 'blur-pad', speed: 1.5 })
		);

		expect(args).toContain('-threads');
		expect(args[args.indexOf('-threads') + 1]).toBe('2');
	});

	it('adds no -threads cap for a plain crop at 1x with no size-mode compression', () => {
		const args = buildExportArgs('in.mp4', 'out.mp4', baseOptions());
		expect(args).not.toContain('-threads');
	});

	describe('mode "none" (no reformat)', () => {
		it('copies the video stream untouched when no other option is active either', () => {
			const args = buildExportArgs(
				'in.mp4',
				'out.mp4',
				baseOptions({ mode: 'none', compression: { mode: 'none', crf: 23, targetMB: 10 } })
			);

			expect(args).not.toContain('-vf');
			expect(args).toContain('-c:v');
			expect(args[args.indexOf('-c:v') + 1]).toBe('copy');
		});

		it('still applies speed/captions/compression when active, keeping the source frame size', () => {
			const args = buildExportArgs(
				'in.mp4',
				'out.mp4',
				baseOptions({ mode: 'none', speed: 1.5 })
			);

			expect(args).not.toContain('-c:v');
			const vf = args[args.indexOf('-vf') + 1];
			expect(vf).toContain('setpts=PTS/1.5');
			expect(vf).toContain(`scale=1920:1080`); // source dims, not a target ratio's
			expect(vf).not.toContain('crop=');
		});

		it('wires the ass filter in without a crop/scale-to-ratio step', () => {
			const args = buildExportArgs(
				'in.mp4',
				'out.mp4',
				baseOptions({
					mode: 'none',
					captionsAssPath: 'captions.ass',
					captionsFontsDir: 'fonts'
				})
			);

			const vf = args[args.indexOf('-vf') + 1];
			expect(vf).toContain('ass=captions.ass:fontsdir=fonts');
			expect(vf).not.toContain('crop=');
		});
	});

	describe('trim', () => {
		it('adds no trim args when the range covers the full source duration', () => {
			const args = buildExportArgs('in.mp4', 'out.mp4', baseOptions());
			expect(args).not.toContain('-ss');
			expect(args).not.toContain('-t');
		});

		it('adds -ss/-t as input options before -i when the trim range is active', () => {
			const args = buildExportArgs('in.mp4', 'out.mp4', baseOptions({ trimStart: 2, trimEnd: 8 }));

			expect(args).toContain('-ss');
			expect(args[args.indexOf('-ss') + 1]).toBe('2');
			expect(args).toContain('-t');
			expect(args[args.indexOf('-t') + 1]).toBe('6');

			const firstInputIndex = args.indexOf('-i');
			expect(args.indexOf('-ss')).toBeLessThan(firstInputIndex);
			expect(args.indexOf('-t')).toBeLessThan(firstInputIndex);
		});

		it('treats trimStart alone (trimEnd left at the full duration) as an active trim', () => {
			const args = buildExportArgs('in.mp4', 'out.mp4', baseOptions({ trimStart: 3, trimEnd: 10 }));
			expect(args[args.indexOf('-ss') + 1]).toBe('3');
			expect(args[args.indexOf('-t') + 1]).toBe('7');
		});

		it('treats trimEnd alone (trimStart left at 0) as an active trim', () => {
			const args = buildExportArgs('in.mp4', 'out.mp4', baseOptions({ trimStart: 0, trimEnd: 6 }));
			expect(args[args.indexOf('-ss') + 1]).toBe('0');
			expect(args[args.indexOf('-t') + 1]).toBe('6');
		});

		it('adds trim args before both inputs in blur-pad mode', () => {
			const args = buildExportArgs(
				'in.mp4',
				'out.mp4',
				baseOptions({ mode: 'blur-pad', trimStart: 1, trimEnd: 9 })
			);

			const ssIndices = args.reduce<number[]>((acc, a, i) => (a === '-ss' ? [...acc, i] : acc), []);
			const inputIndices = args.reduce<number[]>((acc, a, i) => (a === '-i' ? [...acc, i] : acc), []);
			expect(ssIndices).toHaveLength(2);
			expect(inputIndices).toHaveLength(2);
			expect(ssIndices[0]).toBeLessThan(inputIndices[0]);
			expect(ssIndices[1]).toBeLessThan(inputIndices[1]);
			expect(args[ssIndices[0] + 1]).toBe('1');
			expect(args[ssIndices[1] + 1]).toBe('1');
		});

		it('budgets size-mode compression against the trimmed duration, not the full source', () => {
			const full = buildExportArgs(
				'in.mp4',
				'out.mp4',
				baseOptions({ compression: { mode: 'size', crf: 23, targetMB: 3 } })
			);
			const trimmed = buildExportArgs(
				'in.mp4',
				'out.mp4',
				baseOptions({
					trimStart: 5,
					trimEnd: 10, // half the 10s source
					compression: { mode: 'size', crf: 23, targetMB: 3 }
				})
			);

			const fullKbps = Number(full[full.indexOf('-b:v') + 1].replace('k', ''));
			const trimmedKbps = Number(trimmed[trimmed.indexOf('-b:v') + 1].replace('k', ''));

			// Same 3MB budget over half the duration -> roughly double the bitrate.
			expect(trimmedKbps).toBeGreaterThan(fullKbps * 1.8);
			expect(trimmedKbps).toBeLessThan(fullKbps * 2.2);
		});
	});
});

describe('computeOutputDimensions with mode "none"', () => {
	it('returns the source dimensions, rounded to even, ignoring ratio/crop entirely', () => {
		const { width, height } = computeOutputDimensions({
			mode: 'none',
			ratio: RATIO_9_16,
			crop: CROP,
			sourceWidth: 1281,
			sourceHeight: 721
		});
		expect(width).toBe(1280);
		expect(height).toBe(720);
	});
});
