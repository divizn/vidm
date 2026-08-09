import { describe, expect, it } from 'vitest';
import { toSrt, type CaptionSegment } from './srt';

describe('toSrt', () => {
	it('numbers segments starting at 1 and formats the standard SRT block shape', () => {
		const segments: CaptionSegment[] = [
			{ from: '00:00:00,000', to: '00:00:02,500', text: 'Hello.' },
			{ from: '00:00:02,500', to: '00:00:05,000', text: 'World.' }
		];

		expect(toSrt(segments)).toBe(
			'1\n00:00:00,000 --> 00:00:02,500\nHello.\n' +
				'\n' +
				'2\n00:00:02,500 --> 00:00:05,000\nWorld.\n'
		);
	});

	it('trims surrounding whitespace from segment text', () => {
		const segments: CaptionSegment[] = [{ from: '00:00:00,000', to: '00:00:01,000', text: '  Hi.  ' }];
		expect(toSrt(segments)).toContain('\nHi.\n');
	});

	it('returns an empty string for no segments', () => {
		expect(toSrt([])).toBe('');
	});
});
