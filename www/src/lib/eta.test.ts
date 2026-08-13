import { describe, expect, it } from 'vitest';
import { countdownSeconds, formatEta } from './eta';

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
