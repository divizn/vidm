import { describe, expect, it } from 'vitest';
import {
	advancePreviewTime,
	buildAssSubtitle,
	escapeAssText,
	getActiveCaption,
	hexToAssColor,
	parseSrtTimestamp,
	toAssTimestamp
} from './ass';
import { DEFAULT_CAPTION_STYLE } from './style';
import type { CaptionSegment } from '$lib/whisper/srt';

describe('parseSrtTimestamp', () => {
	it('converts hh:mm:ss,sss to seconds', () => {
		expect(parseSrtTimestamp('00:00:02,500')).toBe(2.5);
		expect(parseSrtTimestamp('01:02:03,004')).toBe(3723.004);
	});

	it('returns 0 for an unrecognized format', () => {
		expect(parseSrtTimestamp('nope')).toBe(0);
	});
});

describe('toAssTimestamp', () => {
	it('formats seconds as h:mm:ss.cc', () => {
		expect(toAssTimestamp(2.5)).toBe('0:00:02.50');
		expect(toAssTimestamp(3723.004)).toBe('1:02:03.00');
	});

	it('clamps negative input to zero', () => {
		expect(toAssTimestamp(-5)).toBe('0:00:00.00');
	});
});

describe('hexToAssColor', () => {
	it('converts #rrggbb to ASS BGR order with opaque alpha', () => {
		expect(hexToAssColor('#FFFFFF')).toBe('&H00FFFFFF&');
		expect(hexToAssColor('#112233')).toBe('&H00332211&');
	});
});

describe('escapeAssText', () => {
	it('escapes braces and backslashes, converts newlines to \\N', () => {
		expect(escapeAssText('a{b}c\\d\ne')).toBe('a\\{b\\}c\\\\d\\Ne');
	});
});

describe('buildAssSubtitle', () => {
	it('includes a matching PlayRes and the style font family', () => {
		const segments: CaptionSegment[] = [
			{ from: '00:00:00,000', to: '00:00:02,000', text: 'Hello.' }
		];
		const ass = buildAssSubtitle(segments, DEFAULT_CAPTION_STYLE, 1080, 1920);
		expect(ass).toContain('PlayResX: 1080');
		expect(ass).toContain('PlayResY: 1920');
		expect(ass).toContain(`Style: Default,${DEFAULT_CAPTION_STYLE.font.assFamily}`);
	});

	it('emits one plain dialogue line per segment when no word timing is present', () => {
		const segments: CaptionSegment[] = [
			{ from: '00:00:00,000', to: '00:00:02,000', text: 'Hello.' },
			{ from: '00:00:02,000', to: '00:00:04,000', text: 'World.' }
		];
		const ass = buildAssSubtitle(segments, DEFAULT_CAPTION_STYLE, 1080, 1920);
		const dialogues = ass.split('\n').filter((line) => line.startsWith('Dialogue:'));
		expect(dialogues).toHaveLength(2);
		expect(dialogues[0]).toContain('Hello.');
		expect(dialogues[1]).toContain('World.');
	});

	it('emits one dialogue event per word, with the active word color-highlighted', () => {
		const segments: CaptionSegment[] = [
			{
				from: '00:00:00,000',
				to: '00:00:02,000',
				text: 'Hello world',
				words: [
					{ text: 'Hello', from: 0, to: 0.5 },
					{ text: 'world', from: 0.5, to: 1 }
				]
			}
		];
		const ass = buildAssSubtitle(segments, DEFAULT_CAPTION_STYLE, 1080, 1920);
		const dialogues = ass.split('\n').filter((line) => line.startsWith('Dialogue:'));
		expect(dialogues).toHaveLength(2);

		const highlight = hexToAssColor(DEFAULT_CAPTION_STYLE.highlightColor);
		expect(dialogues[0]).toContain(`{\\c${highlight}}Hello{\\c`);
		expect(dialogues[0]).toContain('world');
		expect(dialogues[1]).toContain(`{\\c${highlight}}world{\\c`);

		// First word's window runs to the second word's start; second word's
		// window runs to the segment end.
		expect(dialogues[0]).toContain(`${toAssTimestamp(0)},${toAssTimestamp(0.5)}`);
		expect(dialogues[1]).toContain(`${toAssTimestamp(0.5)},${toAssTimestamp(2)}`);
	});

	it('falls back to plain text when word timing does not overlap the segment', () => {
		const segments: CaptionSegment[] = [
			{
				from: '00:00:00,000',
				to: '00:00:02,000',
				text: 'Hello world',
				words: [{ text: 'Hello', from: 5, to: 6 }]
			}
		];
		const ass = buildAssSubtitle(segments, DEFAULT_CAPTION_STYLE, 1080, 1920);
		const dialogues = ass.split('\n').filter((line) => line.startsWith('Dialogue:'));
		expect(dialogues).toHaveLength(1);
		expect(dialogues[0]).toContain('Hello world');
		expect(dialogues[0]).not.toContain('\\c');
	});

	it('skips segments with zero or negative duration', () => {
		const segments: CaptionSegment[] = [
			{ from: '00:00:02,000', to: '00:00:02,000', text: 'Bad.' }
		];
		const ass = buildAssSubtitle(segments, DEFAULT_CAPTION_STYLE, 1080, 1920);
		expect(ass).not.toContain('Bad.');
	});
});

describe('getActiveCaption', () => {
	const withWords: CaptionSegment[] = [
		{
			from: '00:00:00,000',
			to: '00:00:02,000',
			text: 'Hello world',
			words: [
				{ text: 'Hello', from: 0, to: 0.5 },
				{ text: 'world', from: 0.5, to: 1 }
			]
		}
	];

	it('returns null outside any segment', () => {
		expect(getActiveCaption(withWords, 5)).toBeNull();
	});

	it('highlights the word whose window contains the current time', () => {
		expect(getActiveCaption(withWords, 0.2)).toEqual([
			{ text: 'Hello', highlighted: true },
			{ text: 'world', highlighted: false }
		]);
		// Second word's window runs from its own start (0.5) to the segment
		// end (2), matching buildAssSubtitle's dialogue windowing exactly.
		expect(getActiveCaption(withWords, 1.9)).toEqual([
			{ text: 'Hello', highlighted: false },
			{ text: 'world', highlighted: true }
		]);
	});

	it('highlights nothing before the first word starts', () => {
		const segments: CaptionSegment[] = [
			{
				from: '00:00:00,000',
				to: '00:00:02,000',
				text: 'Hello world',
				words: [{ text: 'Hello', from: 0.5, to: 1 }]
			}
		];
		expect(getActiveCaption(segments, 0.1)).toEqual([{ text: 'Hello', highlighted: false }]);
	});

	it('returns plain (non-highlighted) text when there is no word timing', () => {
		const segments: CaptionSegment[] = [
			{ from: '00:00:00,000', to: '00:00:02,000', text: 'Hello world' }
		];
		expect(getActiveCaption(segments, 1)).toEqual([
			{ text: 'Hello world', highlighted: false }
		]);
	});
});

describe('advancePreviewTime', () => {
	const segments: CaptionSegment[] = [
		{ from: '00:00:01,000', to: '00:00:02,000', text: 'Hello' },
		{ from: '00:00:02,000', to: '00:00:04,000', text: 'world' }
	];

	it('advances by deltaSeconds within range', () => {
		expect(advancePreviewTime(1, 0.5, segments)).toBe(1.5);
	});

	it('wraps back to the first segment start once past the last segment end', () => {
		expect(advancePreviewTime(3.9, 0.5, segments)).toBe(1);
	});

	it('returns 0 for an empty segments array', () => {
		expect(advancePreviewTime(5, 1, [])).toBe(0);
	});

	it('wraps when next lands exactly on the last segment end', () => {
		expect(advancePreviewTime(3.5, 0.5, segments)).toBe(1);
	});

	it('wraps correctly with a single-segment array', () => {
		expect(advancePreviewTime(1.9, 0.2, [segments[0]])).toBe(1);
	});
});
