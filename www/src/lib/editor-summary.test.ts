import { describe, expect, it } from 'vitest';
import {
	buildExportSummary,
	buildMissingOptionsMessage,
	buildToolStates,
	type EditorSummaryInput
} from './editor-summary';
import { ASPECT_RATIOS, DEFAULT_COMPRESSION, type CompressionSettings } from '$lib/ffmpeg/filters';

const offCompression: CompressionSettings = { mode: 'none', crf: 23, targetMB: 10 };

function baseInput(overrides: Partial<EditorSummaryInput> = {}): EditorSummaryInput {
	return {
		mode: 'none',
		ratio: ASPECT_RATIOS[0],
		speed: 1,
		volume: 1,
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

	it('includes the volume percentage when volume is not 100%', () => {
		expect(buildExportSummary(baseInput({ volume: 1.5 }))).toEqual(['150% volume']);
	});

	it('excludes volume when left at the no-op 100% value', () => {
		expect(buildExportSummary(baseInput({ volume: 1 }))).toEqual([]);
	});

	it('rounds a fractional volume percentage', () => {
		expect(buildExportSummary(baseInput({ volume: 0.325 }))).toEqual(['33% volume']);
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

	it('lists multiple active tools together, in trim/reformat/speed/volume/compression/captions order', () => {
		const result = buildExportSummary(
			baseInput({
				mode: 'crop',
				speed: 1.5,
				volume: 0.5,
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
			'50% volume',
			'Compression (Balanced)',
			'Captions'
		]);
	});
});

describe('buildToolStates', () => {
	it('always returns all six tools, in trim/reformat/speed/volume/compression/captions order', () => {
		const states = buildToolStates(baseInput());
		expect(states.map((tool) => tool.id)).toEqual([
			'trim',
			'reformat',
			'speed',
			'volume',
			'compression',
			'captions'
		]);
	});

	it('marks every tool inactive with no summaryText when nothing is selected', () => {
		const states = buildToolStates(baseInput());
		for (const tool of states) {
			expect(tool.active).toBe(false);
			expect(tool.summaryText).toBeUndefined();
		}
	});

	it('marks only the tools with a real selection as active, alongside the rest staying inactive', () => {
		const states = buildToolStates(baseInput({ speed: 1.5, volume: 1.5 }));
		const byId = Object.fromEntries(states.map((tool) => [tool.id, tool]));
		expect(byId.speed.active).toBe(true);
		expect(byId.speed.summaryText).toBe('1.50x speed');
		expect(byId.volume.active).toBe(true);
		expect(byId.volume.summaryText).toBe('150% volume');
		expect(byId.trim.active).toBe(false);
		expect(byId.reformat.active).toBe(false);
		expect(byId.compression.active).toBe(false);
		expect(byId.captions.active).toBe(false);
	});
});

describe('buildMissingOptionsMessage', () => {
	it('lists every tool label, lowercased, with an Oxford comma before "or"', () => {
		const message = buildMissingOptionsMessage(buildToolStates(baseInput()));
		expect(message).toBe(
			'Select at least one option to export: trim, reformat, speed, volume, compression, or captions.'
		);
	});

	it('stays correct with a single tool state (no comma, no "or")', () => {
		const message = buildMissingOptionsMessage([
			{ id: 'trim', label: 'Trim', active: false, summaryText: undefined }
		]);
		expect(message).toBe('Select at least one option to export: trim.');
	});

	it('joins exactly two tool states with "or" and no comma', () => {
		const message = buildMissingOptionsMessage([
			{ id: 'trim', label: 'Trim', active: false, summaryText: undefined },
			{ id: 'speed', label: 'Speed', active: false, summaryText: undefined }
		]);
		expect(message).toBe('Select at least one option to export: trim or speed.');
	});
});
