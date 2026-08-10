import { describe, expect, it } from 'vitest';
import { formatTimecode, parseTimecode } from './timecode';

describe('formatTimecode', () => {
	it('formats whole seconds under a minute with a zero-padded seconds component', () => {
		expect(formatTimecode(5)).toBe('0:05.0');
	});

	it('formats zero as 0:00.0', () => {
		expect(formatTimecode(0)).toBe('0:00.0');
	});

	it('formats minutes and seconds together', () => {
		expect(formatTimecode(83.44)).toBe('1:23.4');
	});

	it('rounds to the nearest tenth of a second', () => {
		expect(formatTimecode(83.46)).toBe('1:23.5');
	});

	it('clamps negative input to zero', () => {
		expect(formatTimecode(-5)).toBe('0:00.0');
	});

	it('carries seconds rounding up into the next minute correctly', () => {
		expect(formatTimecode(59.96)).toBe('1:00.0');
	});
});

describe('parseTimecode', () => {
	it('parses a M:SS.s timecode', () => {
		expect(parseTimecode('1:23.4')).toBe(83.4);
	});

	it('parses a M:SS timecode with no fractional part', () => {
		expect(parseTimecode('0:05')).toBe(5);
	});

	it('parses a plain integer as seconds', () => {
		expect(parseTimecode('45')).toBe(45);
	});

	it('parses a plain decimal as seconds', () => {
		expect(parseTimecode('45.5')).toBe(45.5);
	});

	it('returns null for unparseable text', () => {
		expect(parseTimecode('abc')).toBeNull();
	});

	it('returns null when the seconds component is 60 or more', () => {
		expect(parseTimecode('1:75')).toBeNull();
	});

	it('returns null for negative values', () => {
		expect(parseTimecode('-5')).toBeNull();
	});

	it('returns null for empty input', () => {
		expect(parseTimecode('  ')).toBeNull();
	});
});
