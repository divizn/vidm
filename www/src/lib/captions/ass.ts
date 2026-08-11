import { parseSrtTimestamp, type CaptionSegment, type CaptionWord } from '$lib/whisper/srt';
import type { CaptionStyle, CaptionPosition } from './style';

export { parseSrtTimestamp };

// seconds -> ASS's "h:mm:ss.cc" (centiseconds).
export function toAssTimestamp(seconds: number): string {
	const totalCentiseconds = Math.max(0, Math.round(seconds * 100));
	const cs = totalCentiseconds % 100;
	const totalSeconds = Math.floor(totalCentiseconds / 100);
	const s = totalSeconds % 60;
	const totalMinutes = Math.floor(totalSeconds / 60);
	const m = totalMinutes % 60;
	const h = Math.floor(totalMinutes / 60);
	const pad2 = (n: number) => String(n).padStart(2, '0');
	return `${h}:${pad2(m)}:${pad2(s)}.${pad2(cs)}`;
}

// #rrggbb -> ASS's "&HAABBGGRR&" (BGR order, alpha 00 = opaque).
export function hexToAssColor(hex: string): string {
	const clean = hex.replace('#', '');
	const r = clean.slice(0, 2);
	const g = clean.slice(2, 4);
	const b = clean.slice(4, 6);
	return `&H00${b}${g}${r}`.toUpperCase() + '&';
}

export function escapeAssText(text: string): string {
	return text.replace(/\\/g, '\\\\').replace(/\{/g, '\\{').replace(/\}/g, '\\}').replace(/\n/g, '\\N');
}

const ALIGNMENT: Record<CaptionPosition, number> = { bottom: 2, middle: 5, top: 8 };

function dialogueLine(start: number, end: number, text: string): string {
	return `Dialogue: 0,${toAssTimestamp(start)},${toAssTimestamp(end)},Default,,0,0,0,,${text}`;
}

// Segment/word timestamps are on the transcript's original timeline, but
// `setpts=PTS/speed` retimes the video's own timeline by the same factor —
// dividing here keeps burned-in captions aligned with the sped-up/slowed
// video instead of drifting by exactly the speed factor.
function toOutputTime(seconds: number, speed: number): number {
	return seconds / speed;
}

// Word timing is independent of segment timing (different source: token
// offsets vs. segment offsets), so it can drift slightly outside the
// segment's own bounds — clamp to the segment and drop anything that
// collapses to zero (or negative) duration once clamped. Shared by both
// the ASS burn-in export and the live preview overlay so they agree on
// which word is "active" at a given time.
function clampWordsToSegment(seg: CaptionSegment, segStart: number, segEnd: number): CaptionWord[] {
	if (!seg.words) return [];
	return seg.words
		.map((w) => ({ text: w.text, from: Math.max(w.from, segStart), to: Math.min(w.to, segEnd) }))
		.filter((w) => w.to > w.from);
}

// Word-level highlight: one dialogue event per word, spanning from that
// word's own start to the next word's start (or segment end for the last
// word) — this keeps the caption continuously visible for the whole
// segment while the "active" word progressively updates, rather than only
// lighting up for the word's own (often very short) duration.
function buildSegmentDialogues(
	seg: CaptionSegment,
	baseColor: string,
	highlightColor: string,
	speed: number
): string[] {
	const segStart = parseSrtTimestamp(seg.from);
	const segEnd = parseSrtTimestamp(seg.to);
	if (segEnd <= segStart) return [];

	const plainSegmentText = escapeAssText(seg.text.trim());
	const clamped = clampWordsToSegment(seg, segStart, segEnd);
	if (clamped.length === 0) {
		return [dialogueLine(toOutputTime(segStart, speed), toOutputTime(segEnd, speed), plainSegmentText)];
	}

	const lines: string[] = [];

	if (clamped[0].from > segStart + 0.01) {
		const plainWords = clamped.map((w) => escapeAssText(w.text)).join(' ');
		lines.push(
			dialogueLine(toOutputTime(segStart, speed), toOutputTime(clamped[0].from, speed), plainWords)
		);
	}

	for (let i = 0; i < clamped.length; i++) {
		const start = clamped[i].from;
		const end = i + 1 < clamped.length ? clamped[i + 1].from : segEnd;
		if (end <= start) continue;
		const text = clamped
			.map((w, idx) =>
				idx === i
					? `{\\c${highlightColor}}${escapeAssText(w.text)}{\\c${baseColor}}`
					: escapeAssText(w.text)
			)
			.join(' ');
		lines.push(dialogueLine(toOutputTime(start, speed), toOutputTime(end, speed), text));
	}

	return lines;
}

export interface ActiveCaptionWord {
	text: string;
	highlighted: boolean;
}

// Live-preview counterpart to buildAssSubtitle: given the current playback
// time, resolves which words (if any) should be showing and which one (if
// any) is "active" — using the exact same windowing as the ASS export
// (clampWordsToSegment + "active until the next word starts") so the
// preview and the actual burn-in never disagree. Returns null when no
// segment covers `time` (nothing shows, matching the real burn-in).
export function getActiveCaption(segments: CaptionSegment[], time: number): ActiveCaptionWord[] | null {
	const seg = segments.find(
		(s) => time >= parseSrtTimestamp(s.from) && time < parseSrtTimestamp(s.to)
	);
	if (!seg) return null;

	const segStart = parseSrtTimestamp(seg.from);
	const segEnd = parseSrtTimestamp(seg.to);
	const clamped = clampWordsToSegment(seg, segStart, segEnd);
	if (clamped.length === 0) {
		return [{ text: seg.text.trim(), highlighted: false }];
	}

	if (time < clamped[0].from) {
		return clamped.map((w) => ({ text: w.text, highlighted: false }));
	}

	let activeIndex = 0;
	for (let i = 0; i < clamped.length; i++) {
		if (clamped[i].from <= time) activeIndex = i;
	}

	return clamped.map((w, i) => ({ text: w.text, highlighted: i === activeIndex }));
}

// Advances the illustrative caption-style preview's synthetic clock by
// deltaSeconds, wrapping back to the first segment's start (not 0) once
// past the last segment's end — avoids the loop sitting on a dead silent
// gap if there's lead-in before captions begin. Used by CaptionPreview's
// auto-cycling demo, which has no real video/audio driving a `timeupdate`.
export function advancePreviewTime(
	current: number,
	deltaSeconds: number,
	segments: CaptionSegment[]
): number {
	if (segments.length === 0) return 0;
	const start = parseSrtTimestamp(segments[0].from);
	const end = parseSrtTimestamp(segments[segments.length - 1].to);
	const next = current + deltaSeconds;
	return next >= end ? start : next;
}

// Builds a full .ass subtitle document for burn-in via FFmpeg's `ass`
// filter. width/height must match the output frame size exactly (PlayResX/
// PlayResY) so libass doesn't apply its own auto-scaling on top of ours.
// `speed` must match the export's playback-speed setting — the `ass` filter
// burns in against the video's already-retimed (`setpts=PTS/speed`) PTS, so
// dialogue timestamps built from the original transcript need the same
// scaling or they drift out of sync with the sped-up/slowed video.
export function buildAssSubtitle(
	segments: CaptionSegment[],
	style: CaptionStyle,
	width: number,
	height: number,
	speed: number = 1
): string {
	const fontSize = Math.round((style.fontSizePercent / 100) * height);
	const outline = Math.max(2, Math.round(fontSize * 0.06));
	const marginV = Math.round(height * 0.06);
	const marginLR = Math.round(width * 0.05);
	const align = ALIGNMENT[style.position];
	const baseColor = hexToAssColor(style.textColor);
	const highlightColor = hexToAssColor(style.highlightColor);

	const header =
		`[Script Info]\n` +
		`ScriptType: v4.00+\n` +
		`PlayResX: ${width}\n` +
		`PlayResY: ${height}\n` +
		`ScaledBorderAndShadow: yes\n\n` +
		`[V4+ Styles]\n` +
		`Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\n` +
		`Style: Default,${style.font.assFamily},${fontSize},${baseColor},${baseColor},&H00000000&,&H80000000&,0,0,0,0,100,100,0,0,1,${outline},1,${align},${marginLR},${marginLR},${marginV},1\n\n` +
		`[Events]\n` +
		`Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n`;

	const events = segments.flatMap((seg) =>
		buildSegmentDialogues(seg, baseColor, highlightColor, speed)
	);
	return header + events.join('\n') + '\n';
}
