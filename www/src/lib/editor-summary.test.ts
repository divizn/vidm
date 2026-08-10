import { describe, expect, it } from 'vitest';
import { buildExportSummary, type EditorSummaryInput } from './editor-summary';
import { ASPECT_RATIOS, DEFAULT_COMPRESSION, type CompressionSettings } from '$lib/ffmpeg/filters';

const offCompression: CompressionSettings = { mode: 'none', crf: 23, targetMB: 10 };

function baseInput(overrides: Partial<EditorSummaryInput> = {}): EditorSummaryInput {
	return {
		mode: 'none',
		ratio: ASPECT_RATIOS[0],
		speed: 1,
		compression: offCompression,
		hasCaptionSegments: false,
		trimStart: 0,
		trimEnd: 10,
		sourceDuration: 10,
		...overrides
	};
}

describe('buildExportSummary', () => {
	it('returns an empty list when nothing is enabled', () => {
		expect(buildExportSummary(baseInput())).toEqual([]);
	});

	it('includes the ratio label when crop mode is active', () => {
		expect(buildExportSummary(baseInput({ mode: 'crop' }))).toEqual(['Crop 9:16']);
	});

	it('labels blur-pad mode distinctly from crop', () => {
		expect(buildExportSummary(baseInput({ mode: 'blur-pad' }))).toEqual(['Blur pad 9:16']);
	});

	it('includes the speed multiplier when speed is not 1x', () => {
		expect(buildExportSummary(baseInput({ speed: 1.5 }))).toEqual(['1.50x speed']);
	});

	it('formats a fractional speed to two decimal places', () => {
		expect(buildExportSummary(baseInput({ speed: 1.35 }))).toEqual(['1.35x speed']);
	});

	it('excludes speed when left at the no-op 1x value', () => {
		expect(buildExportSummary(baseInput({ speed: 1 }))).toEqual([]);
	});

	it('names the matching preset when compression mode is preset', () => {
		expect(buildExportSummary(baseInput({ compression: DEFAULT_COMPRESSION }))).toEqual([
			'Compression (Balanced)'
		]);
	});

	it('falls back to a CRF number when a preset-mode value matches no preset', () => {
		expect(
			buildExportSummary(baseInput({ compression: { mode: 'preset', crf: 20, targetMB: 10 } }))
		).toEqual(['Compression (CRF 20)']);
	});

	it('includes the target size when compression mode is size', () => {
		expect(
			buildExportSummary(baseInput({ compression: { mode: 'size', crf: 23, targetMB: 15 } }))
		).toEqual(['Compression (~15MB)']);
	});

	it('includes the CRF value when compression mode is custom', () => {
		expect(
			buildExportSummary(baseInput({ compression: { mode: 'custom', crf: 30, targetMB: 10 } }))
		).toEqual(['Compression (CRF 30)']);
	});

	it('includes captions only when a transcript exists', () => {
		expect(buildExportSummary(baseInput({ hasCaptionSegments: false }))).toEqual([]);
		expect(buildExportSummary(baseInput({ hasCaptionSegments: true }))).toEqual(['Captions']);
	});

	it('includes a trim entry when the range is not the full source', () => {
		expect(buildExportSummary(baseInput({ trimStart: 2.5, trimEnd: 8 }))).toEqual([
			'Trim 0:02.5–0:08.0'
		]);
	});

	it('excludes trim when the range covers the full source duration', () => {
		expect(buildExportSummary(baseInput({ trimStart: 0, trimEnd: 10 }))).toEqual([]);
	});

	it('includes trim when only the start has moved', () => {
		expect(buildExportSummary(baseInput({ trimStart: 3, trimEnd: 10 }))).toEqual([
			'Trim 0:03.0–0:10.0'
		]);
	});

	it('includes trim when only the end has moved', () => {
		expect(buildExportSummary(baseInput({ trimStart: 0, trimEnd: 7 }))).toEqual([
			'Trim 0:00.0–0:07.0'
		]);
	});

	it('lists multiple active tools together, in trim/reformat/speed/compression/captions order', () => {
		const result = buildExportSummary(
			baseInput({
				mode: 'crop',
				speed: 1.5,
				compression: DEFAULT_COMPRESSION,
				hasCaptionSegments: true,
				trimStart: 1,
				trimEnd: 9
			})
		);
		expect(result).toEqual([
			'Trim 0:01.0–0:09.0',
			'Crop 9:16',
			'1.50x speed',
			'Compression (Balanced)',
			'Captions'
		]);
	});
});
