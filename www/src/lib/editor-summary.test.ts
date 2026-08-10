import { describe, expect, it } from 'vitest';
import { buildExportSummary } from './editor-summary';
import { ASPECT_RATIOS, DEFAULT_COMPRESSION, type CompressionSettings } from '$lib/ffmpeg/filters';

const offCompression: CompressionSettings = { mode: 'none', crf: 23, targetMB: 10 };

describe('buildExportSummary', () => {
	it('returns an empty list when nothing is enabled', () => {
		expect(
			buildExportSummary({
				mode: 'none',
				ratio: ASPECT_RATIOS[0],
				speed: 1,
				compression: offCompression,
				hasCaptionSegments: false
			})
		).toEqual([]);
	});

	it('includes the ratio label when crop mode is active', () => {
		const result = buildExportSummary({
			mode: 'crop',
			ratio: ASPECT_RATIOS[0],
			speed: 1,
			compression: offCompression,
			hasCaptionSegments: false
		});
		expect(result).toEqual(['Crop 9:16']);
	});

	it('labels blur-pad mode distinctly from crop', () => {
		const result = buildExportSummary({
			mode: 'blur-pad',
			ratio: ASPECT_RATIOS[0],
			speed: 1,
			compression: offCompression,
			hasCaptionSegments: false
		});
		expect(result).toEqual(['Blur pad 9:16']);
	});

	it('includes the speed multiplier when speed is not 1x', () => {
		const result = buildExportSummary({
			mode: 'none',
			ratio: ASPECT_RATIOS[0],
			speed: 1.5,
			compression: offCompression,
			hasCaptionSegments: false
		});
		expect(result).toEqual(['1.50x speed']);
	});

	it('formats a fractional speed to two decimal places', () => {
		const result = buildExportSummary({
			mode: 'none',
			ratio: ASPECT_RATIOS[0],
			speed: 1.35,
			compression: offCompression,
			hasCaptionSegments: false
		});
		expect(result).toEqual(['1.35x speed']);
	});

	it('excludes speed when left at the no-op 1x value', () => {
		const result = buildExportSummary({
			mode: 'none',
			ratio: ASPECT_RATIOS[0],
			speed: 1,
			compression: offCompression,
			hasCaptionSegments: false
		});
		expect(result).toEqual([]);
	});

	it('names the matching preset when compression mode is preset', () => {
		const result = buildExportSummary({
			mode: 'none',
			ratio: ASPECT_RATIOS[0],
			speed: 1,
			compression: DEFAULT_COMPRESSION,
			hasCaptionSegments: false
		});
		expect(result).toEqual(['Compression (Balanced)']);
	});

	it('falls back to a CRF number when a preset-mode value matches no preset', () => {
		const result = buildExportSummary({
			mode: 'none',
			ratio: ASPECT_RATIOS[0],
			speed: 1,
			compression: { mode: 'preset', crf: 20, targetMB: 10 },
			hasCaptionSegments: false
		});
		expect(result).toEqual(['Compression (CRF 20)']);
	});

	it('includes the target size when compression mode is size', () => {
		const result = buildExportSummary({
			mode: 'none',
			ratio: ASPECT_RATIOS[0],
			speed: 1,
			compression: { mode: 'size', crf: 23, targetMB: 15 },
			hasCaptionSegments: false
		});
		expect(result).toEqual(['Compression (~15MB)']);
	});

	it('includes the CRF value when compression mode is custom', () => {
		const result = buildExportSummary({
			mode: 'none',
			ratio: ASPECT_RATIOS[0],
			speed: 1,
			compression: { mode: 'custom', crf: 30, targetMB: 10 },
			hasCaptionSegments: false
		});
		expect(result).toEqual(['Compression (CRF 30)']);
	});

	it('includes captions only when a transcript exists', () => {
		expect(
			buildExportSummary({
				mode: 'none',
				ratio: ASPECT_RATIOS[0],
				speed: 1,
				compression: offCompression,
				hasCaptionSegments: false
			})
		).toEqual([]);

		expect(
			buildExportSummary({
				mode: 'none',
				ratio: ASPECT_RATIOS[0],
				speed: 1,
				compression: offCompression,
				hasCaptionSegments: true
			})
		).toEqual(['Captions']);
	});

	it('lists multiple active tools together, in reformat/speed/compression/captions order', () => {
		const result = buildExportSummary({
			mode: 'crop',
			ratio: ASPECT_RATIOS[0],
			speed: 1.5,
			compression: DEFAULT_COMPRESSION,
			hasCaptionSegments: true
		});
		expect(result).toEqual(['Crop 9:16', '1.50x speed', 'Compression (Balanced)', 'Captions']);
	});
});
