export interface CaptionWord {
	text: string;
	from: number; // seconds
	to: number; // seconds
}

export interface CaptionSegment {
	from: string; // hh:mm:ss,sss
	to: string; // hh:mm:ss,sss
	text: string;
	// Word-level timing within the segment, for karaoke-style highlight
	// burn-in. Absent if whisper didn't return token timestamps.
	words?: CaptionWord[];
}

// whisper.cpp's segment.timestamps.{from,to} are already in SRT's
// "hh:mm:ss,sss" format, so this is just numbering + joining.
export function toSrt(segments: CaptionSegment[]): string {
	return segments
		.map((seg, i) => `${i + 1}\n${seg.from} --> ${seg.to}\n${seg.text.trim()}\n`)
		.join('\n');
}

// hh:mm:ss,sss (SRT) -> seconds.
export function parseSrtTimestamp(ts: string): number {
	const match = ts.match(/^(\d+):(\d{2}):(\d{2}),(\d{3})$/);
	if (!match) return 0;
	const [, h, m, s, ms] = match;
	return Number(h) * 3600 + Number(m) * 60 + Number(s) + Number(ms) / 1000;
}

// seconds -> SRT's "hh:mm:ss,sss".
export function formatSrtTimestamp(seconds: number): string {
	const totalMs = Math.max(0, Math.round(seconds * 1000));
	const ms = totalMs % 1000;
	const totalSeconds = Math.floor(totalMs / 1000);
	const s = totalSeconds % 60;
	const totalMinutes = Math.floor(totalSeconds / 60);
	const m = totalMinutes % 60;
	const h = Math.floor(totalMinutes / 60);
	const pad = (n: number, len = 2) => String(n).padStart(len, '0');
	return `${pad(h)}:${pad(m)}:${pad(s)},${pad(ms, 3)}`;
}

// .srt or .vtt text -> segments; cue numbers, vtt headers and cue settings are ignored
export function parseSrt(text: string): CaptionSegment[] {
	const time = /(?:(\d+):)?(\d{1,2}):(\d{2})[,.](\d{1,3})/;
	const toSeconds = (m: RegExpMatchArray) =>
		Number(m[1] ?? 0) * 3600 +
		Number(m[2]) * 60 +
		Number(m[3]) +
		Number(m[4].padEnd(3, '0')) / 1000;

	return text
		.replace(/^﻿/, '')
		.split(/\r?\n\s*\r?\n/)
		.flatMap((block) => {
			const lines = block.split(/\r?\n/);
			const i = lines.findIndex((line) => line.includes('-->'));
			if (i === -1) return [];
			const [fromPart, toPart] = lines[i].split('-->');
			const from = fromPart.match(time);
			const to = toPart.match(time);
			const body = lines
				.slice(i + 1)
				.map((line) => line.trim())
				.filter(Boolean)
				.join(' ');
			if (!from || !to || !body) return [];
			return [
				{
					from: formatSrtTimestamp(toSeconds(from)),
					to: formatSrtTimestamp(toSeconds(to)),
					text: body
				}
			];
		});
}
