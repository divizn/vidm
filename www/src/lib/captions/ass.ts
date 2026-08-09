import type { CaptionSegment } from '$lib/whisper/srt';
import type { CaptionStyle, CaptionPosition } from './style';

// hh:mm:ss,sss (SRT) -> seconds.
export function parseSrtTimestamp(ts: string): number {
	const match = ts.match(/^(\d+):(\d{2}):(\d{2}),(\d{3})$/);
	if (!match) return 0;
	const [, h, m, s, ms] = match;
	return Number(h) * 3600 + Number(m) * 60 + Number(s) + Number(ms) / 1000;
}

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

// Word-level highlight: one dialogue event per word, spanning from that
// word's own start to the next word's start (or segment end for the last
// word) — this keeps the caption continuously visible for the whole
// segment while the "active" word progressively updates, rather than only
// lighting up for the word's own (often very short) duration.
function buildSegmentDialogues(
	seg: CaptionSegment,
	baseColor: string,
	highlightColor: string
): string[] {
	const segStart = parseSrtTimestamp(seg.from);
	const segEnd = parseSrtTimestamp(seg.to);
	if (segEnd <= segStart) return [];

	const plainSegmentText = escapeAssText(seg.text.trim());
	const words = seg.words;
	if (!words || words.length === 0) {
		return [dialogueLine(segStart, segEnd, plainSegmentText)];
	}

	const clamped = words
		.map((w) => ({ text: w.text, from: Math.max(w.from, segStart), to: Math.min(w.to, segEnd) }))
		.filter((w) => w.to > w.from);
	if (clamped.length === 0) {
		return [dialogueLine(segStart, segEnd, plainSegmentText)];
	}

	const lines: string[] = [];

	if (clamped[0].from > segStart + 0.01) {
		const plainWords = clamped.map((w) => escapeAssText(w.text)).join(' ');
		lines.push(dialogueLine(segStart, clamped[0].from, plainWords));
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
		lines.push(dialogueLine(start, end, text));
	}

	return lines;
}

// Builds a full .ass subtitle document for burn-in via FFmpeg's `ass`
// filter. width/height must match the output frame size exactly (PlayResX/
// PlayResY) so libass doesn't apply its own auto-scaling on top of ours.
export function buildAssSubtitle(
	segments: CaptionSegment[],
	style: CaptionStyle,
	width: number,
	height: number
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

	const events = segments.flatMap((seg) => buildSegmentDialogues(seg, baseColor, highlightColor));
	return header + events.join('\n') + '\n';
}
