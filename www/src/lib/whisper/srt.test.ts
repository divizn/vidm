import { describe, expect, it } from 'vitest';
import { parseSrt, toSrt, type CaptionSegment } from './srt';

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

describe('parseSrt', () => {
	it('round-trips what toSrt exports', () => {
		const segments: CaptionSegment[] = [
			{ from: '00:00:01,000', to: '00:00:02,500', text: 'hello' },
			{ from: '00:01:00,000', to: '01:00:00,040', text: 'world' }
		];
		expect(parseSrt(toSrt(segments))).toEqual(segments);
	});

	it('handles a BOM, CRLF, multi-line cues and blank cues', () => {
		const text = '﻿1\r\n00:00:01,000 --> 00:00:02,000\r\nline one\r\nline two\r\n\r\n2\r\n00:00:03,000 --> 00:00:04,000\r\n\r\n';
		expect(parseSrt(text)).toEqual([
			{ from: '00:00:01,000', to: '00:00:02,000', text: 'line one line two' }
		]);
	});

	it('reads WebVTT: header, dot millis, no hours, cue settings', () => {
		const text = 'WEBVTT\n\nNOTE hi\n\nintro\n00:05.5 --> 00:07.000 align:start line:0\nhey';
		expect(parseSrt(text)).toEqual([{ from: '00:00:05,500', to: '00:00:07,000', text: 'hey' }]);
	});
});
