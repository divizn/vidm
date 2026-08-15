import { formatSrtTimestamp, type CaptionSegment, type CaptionWord } from './srt';

// transformers.js returns a flat list of word chunks when asked for
// `return_timestamps: 'word'`, but the app's data model (and the ASS burn-in)
// is segment-level with nested word timings, so the flat list is regrouped
// here. The whisper.cpp backend gets segmentation for free from whisper's own
// output; this is the GPU path's equivalent.
export interface WordChunk {
	text: string;
	timestamp: [number, number | null];
}

// A caption that runs longer than this is uncomfortable to read on screen.
const MAX_SEGMENT_SECONDS = 5;
// A pause longer than this reads as a natural caption break.
const MAX_GAP_SECONDS = 0.8;

function isSentenceEnd(text: string): boolean {
	return /[.!?]$/.test(text);
}

function toSegment(words: CaptionWord[]): CaptionSegment {
	return {
		from: formatSrtTimestamp(words[0].from),
		to: formatSrtTimestamp(words[words.length - 1].to),
		text: words.map((word) => word.text).join(' '),
		words
	};
}

// Used when word timings weren't requested: chunks are already whole caption
// lines, so they map across directly with no `words` (burn-in falls back to
// plain text). Passing these to groupWordsIntoSegments would treat each whole
// sentence as a single word.
export function segmentsFromChunks(chunks: WordChunk[]): CaptionSegment[] {
	const segments: CaptionSegment[] = [];
	let previousEnd = 0;
	for (const chunk of chunks) {
		const text = chunk.text.trim();
		const [start, end] = chunk.timestamp ?? [];
		if (!text || typeof start !== 'number' || !Number.isFinite(start)) continue;
		const resolvedEnd = typeof end === 'number' && Number.isFinite(end) ? end : previousEnd || start;
		previousEnd = resolvedEnd;
		segments.push({
			from: formatSrtTimestamp(start),
			to: formatSrtTimestamp(resolvedEnd),
			text
		});
	}
	return segments;
}

export function groupWordsIntoSegments(chunks: WordChunk[]): CaptionSegment[] {
	const segments: CaptionSegment[] = [];
	let current: CaptionWord[] = [];

	for (const chunk of chunks) {
		const text = chunk.text.trim();
		const [start, end] = chunk.timestamp ?? [];
		if (!text || typeof start !== 'number' || !Number.isFinite(start)) continue;

		const previous = current[current.length - 1];
		// transformers.js leaves the final word's end timestamp null; fall back
		// to the previous word's end so the segment still closes at a real time.
		const resolvedEnd =
			typeof end === 'number' && Number.isFinite(end) ? end : (previous?.to ?? start);

		if (previous) {
			const tooLong = resolvedEnd - current[0].from > MAX_SEGMENT_SECONDS;
			const longGap = start - previous.to > MAX_GAP_SECONDS;
			if (isSentenceEnd(previous.text) || tooLong || longGap) {
				segments.push(toSegment(current));
				current = [];
			}
		}

		current.push({ text, from: start, to: resolvedEnd });
	}

	if (current.length) segments.push(toSegment(current));
	return segments;
}
