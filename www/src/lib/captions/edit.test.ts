import { describe, expect, it } from 'vitest';
import { addSegment, setSegmentTimes, shiftSegments } from './edit';
import type { CaptionSegment } from '$lib/whisper/srt';

const seg = (from: string, to: string, text = 'x'): CaptionSegment => ({ from, to, text });

describe('addSegment', () => {
	it('inserts in time order so the srt numbering follows playback', () => {
		const out = addSegment(
			[seg('00:00:00,000', '00:00:01,000'), seg('00:00:05,000', '00:00:06,000')],
			3,
			10
		);
		expect(out.map((s) => s.from)).toEqual(['00:00:00,000', '00:00:03,000', '00:00:05,000']);
		expect(out[1].to).toBe('00:00:05,000');
	});

	it('keeps a line added at the very end inside the clip', () => {
		const [added] = addSegment([], 10, 10);
		expect(added).toMatchObject({ from: '00:00:09,900', to: '00:00:10,000' });
	});
});

describe('setSegmentTimes', () => {
	it('pushes the end forward when the start is moved past it', () => {
		const [out] = setSegmentTimes([seg('00:00:01,000', '00:00:02,000')], 0, { from: 4 }, 10);
		expect(out).toMatchObject({ from: '00:00:04,000', to: '00:00:04,100' });
	});

	it('never lets the end land before the start', () => {
		const [out] = setSegmentTimes([seg('00:00:03,000', '00:00:05,000')], 0, { to: 1 }, 10);
		expect(out).toMatchObject({ from: '00:00:03,000', to: '00:00:03,100' });
	});

	it('drops stale word timing and re-sorts', () => {
		const words = [{ text: 'x', from: 0, to: 1 }];
		const out = setSegmentTimes(
			[{ ...seg('00:00:00,000', '00:00:01,000'), words }, seg('00:00:02,000', '00:00:03,000')],
			0,
			{ from: 5, to: 6 },
			10
		);
		expect(out.map((s) => s.from)).toEqual(['00:00:02,000', '00:00:05,000']);
		expect(out[1].words).toBeUndefined();
	});
});

describe('shiftSegments', () => {
	it('re-bases onto a later trim start, clipping and dropping lines outside it', () => {
		const words = [{ text: 'x', from: 3, to: 3.5 }];
		const out = shiftSegments(
			[
				seg('00:00:00,000', '00:00:01,000'),
				seg('00:00:01,500', '00:00:03,000'),
				{ ...seg('00:00:03,000', '00:00:20,000'), words }
			],
			-2,
			5
		);
		expect(out).toEqual([
			seg('00:00:00,000', '00:00:01,000'),
			{ ...seg('00:00:01,000', '00:00:05,000'), words: [{ text: 'x', from: 1, to: 1.5 }] }
		]);
	});
});
