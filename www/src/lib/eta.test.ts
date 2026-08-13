import { describe, expect, it } from 'vitest';
import { blendEstimate, countdownSeconds, emaNext, formatEta, remainingFromChunks } from './eta';

describe('emaNext', () => {
	it('takes the first sample as-is', () => {
		expect(emaNext(null, 12)).toBe(12);
	});

	it('weights the latest sample by the smoothing factor', () => {
		expect(emaNext(10, 20, 0.3)).toBeCloseTo(13, 10);
	});

	// The regression this guards: remaining time is rate x chunks-left, so with
	// 30 chunks outstanding a reactive rate turns one slow chunk into a ~45s
	// jump in the label. The default must stay well damped.
	it('barely moves on a single slow chunk at the default smoothing', () => {
		const rate = emaNext(8, 24);
		expect((rate - 8) * 30).toBeLessThan(60);
	});

	// The reason for using an EMA at all: a cumulative mean stays anchored to
	// early samples, so a machine that slows down mid-run keeps under-estimating.
	it('converges toward a changed throughput within a few samples', () => {
		let ema: number | null = 10;
		for (let i = 0; i < 6; i++) ema = emaNext(ema, 30, 0.3);
		expect(ema).toBeGreaterThan(24);
	});

	it('is not dragged far by a single outlier', () => {
		expect(emaNext(10, 120, 0.3)).toBeLessThan(45);
	});
});

describe('remainingFromChunks', () => {
	it('multiplies the per-chunk estimate by the work left', () => {
		expect(remainingFromChunks(8, 5)).toBe(40);
	});

	it('handles a part-done chunk', () => {
		expect(remainingFromChunks(10, 2.5)).toBe(25);
	});

	it('never returns a negative estimate', () => {
		expect(remainingFromChunks(8, -3)).toBe(0);
	});
});

describe('countdownSeconds', () => {
	it('counts the estimate down as the clock advances', () => {
		expect(countdownSeconds(60, 1000, 1000)).toBe(60);
		expect(countdownSeconds(60, 1000, 11000)).toBe(50);
	});

	it('never goes negative when the estimate is overshot', () => {
		expect(countdownSeconds(5, 1000, 60000)).toBe(0);
	});
});

describe('formatEta', () => {
	it('formats under a minute as seconds only', () => {
		expect(formatEta(42)).toBe('42s');
	});

	it('formats minutes and seconds', () => {
		expect(formatEta(125)).toBe('2m 5s');
	});
});

describe('blendEstimate', () => {
	it('adopts the first estimate outright', () => {
		expect(blendEstimate(null, 120)).toBe(120);
	});

	it('eases toward a revised estimate rather than snapping', () => {
		expect(blendEstimate(100, 200, 0.25)).toBe(125);
	});

	it('converges on the new estimate over repeated updates', () => {
		let shown = 100;
		for (let i = 0; i < 12; i++) shown = blendEstimate(shown, 200, 0.25);
		expect(shown).toBeGreaterThan(190);
	});
});
