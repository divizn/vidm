import { formatSrtTimestamp, parseSrtTimestamp, type CaptionSegment } from '$lib/whisper/srt';

export const NEW_CAPTION_SECONDS = 2;
export const MIN_CAPTION_SECONDS = 0.1;

const start = (s: CaptionSegment) => parseSrtTimestamp(s.from);

function sorted(segments: CaptionSegment[]): CaptionSegment[] {
	return [...segments].sort((a, b) => start(a) - start(b));
}

// times are seconds from the start of the (trimmed) clip, same as transcripts
export function addSegment(
	segments: CaptionSegment[],
	at: number,
	clipDuration: number
): CaptionSegment[] {
	const from = Math.min(Math.max(0, at), Math.max(0, clipDuration - MIN_CAPTION_SECONDS));
	const to = Math.min(from + NEW_CAPTION_SECONDS, clipDuration);
	return sorted([
		...segments,
		{ from: formatSrtTimestamp(from), to: formatSrtTimestamp(to), text: '' }
	]);
}

// keeps from < to inside the clip; word timing no longer matches, so it's dropped
export function setSegmentTimes(
	segments: CaptionSegment[],
	index: number,
	times: { from?: number; to?: number },
	clipDuration: number
): CaptionSegment[] {
	const seg = segments[index];
	let from = times.from ?? start(seg);
	let to = times.to ?? parseSrtTimestamp(seg.to);
	from = Math.min(Math.max(0, from), clipDuration - MIN_CAPTION_SECONDS);
	to = Math.min(Math.max(to, from + MIN_CAPTION_SECONDS), clipDuration);
	const next = [...segments];
	next[index] = {
		text: seg.text,
		from: formatSrtTimestamp(from),
		to: formatSrtTimestamp(to)
	};
	return sorted(next);
}

// re-bases segments when the trim start moves, dropping any that fall outside the new clip
export function shiftSegments(
	segments: CaptionSegment[],
	delta: number,
	clipDuration: number
): CaptionSegment[] {
	return segments.flatMap((seg) => {
		const from = Math.max(0, start(seg) + delta);
		const to = Math.min(clipDuration, parseSrtTimestamp(seg.to) + delta);
		if (to - from < MIN_CAPTION_SECONDS) return [];
		return [
			{
				...seg,
				from: formatSrtTimestamp(from),
				to: formatSrtTimestamp(to),
				words: seg.words?.map((w) => ({ ...w, from: w.from + delta, to: w.to + delta }))
			}
		];
	});
}
