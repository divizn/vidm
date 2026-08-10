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
				speedEnabled: false,
				speed: 1,
				compression: offCompression,
				captionsEnabled: false,
				hasCaptionSegments: false
			})
		).toEqual([]);
	});

	it('includes the ratio label when crop mode is active', () => {
		const result = buildExportSummary({
			mode: 'crop',
			ratio: ASPECT_RATIOS[0],
			speedEnabled: false,
			speed: 1,
			compression: offCompression,
			captionsEnabled: false,
			hasCaptionSegments: false
		});
		expect(result).toEqual(['Crop 9:16']);
	});

	it('labels blur-pad mode distinctly from crop', () => {
		const result = buildExportSummary({
			mode: 'blur-pad',
			ratio: ASPECT_RATIOS[0],
			speedEnabled: false,
			speed: 1,
			compression: offCompression,
			captionsEnabled: false,
			hasCaptionSegments: false
		});
		expect(result).toEqual(['Blur pad 9:16']);
	});

	it('includes the speed multiplier when speed is enabled and not 1x', () => {
		const result = buildExportSummary({
			mode: 'none',
			ratio: ASPECT_RATIOS[0],
			speedEnabled: true,
			speed: 1.5,
			compression: offCompression,
			captionsEnabled: false,
			hasCaptionSegments: false
		});
		expect(result).toEqual(['1.50x speed']);
	});

	it('formats a fractional speed to two decimal places', () => {
		const result = buildExportSummary({
			mode: 'none',
			ratio: ASPECT_RATIOS[0],
			speedEnabled: true,
			speed: 1.35,
			compression: offCompression,
			captionsEnabled: false,
			hasCaptionSegments: false
		});
		expect(result).toEqual(['1.35x speed']);
	});

	it('excludes speed when enabled but left at the no-op 1x value', () => {
		const result = buildExportSummary({
			mode: 'none',
			ratio: ASPECT_RATIOS[0],
			speedEnabled: true,
			speed: 1,
			compression: offCompression,
			captionsEnabled: false,
			hasCaptionSegments: false
		});
		expect(result).toEqual([]);
	});

	it('includes compression when its mode is not none', () => {
		const result = buildExportSummary({
			mode: 'none',
			ratio: ASPECT_RATIOS[0],
			speedEnabled: false,
			speed: 1,
			compression: DEFAULT_COMPRESSION,
			captionsEnabled: false,
			hasCaptionSegments: false
		});
		expect(result).toEqual(['Compression']);
	});

	it('includes captions only when enabled AND a transcript exists', () => {
		expect(
			buildExportSummary({
				mode: 'none',
				ratio: ASPECT_RATIOS[0],
				speedEnabled: false,
				speed: 1,
				compression: offCompression,
				captionsEnabled: true,
				hasCaptionSegments: false
			})
		).toEqual([]);

		expect(
			buildExportSummary({
				mode: 'none',
				ratio: ASPECT_RATIOS[0],
				speedEnabled: false,
				speed: 1,
				compression: offCompression,
				captionsEnabled: true,
				hasCaptionSegments: true
			})
		).toEqual(['Captions']);
	});

	it('lists multiple active tools together, in reformat/speed/compression/captions order', () => {
		const result = buildExportSummary({
			mode: 'crop',
			ratio: ASPECT_RATIOS[0],
			speedEnabled: true,
			speed: 1.5,
			compression: DEFAULT_COMPRESSION,
			captionsEnabled: true,
			hasCaptionSegments: true
		});
		expect(result).toEqual(['Crop 9:16', '1.50x speed', 'Compression', 'Captions']);
	});
});
