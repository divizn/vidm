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
