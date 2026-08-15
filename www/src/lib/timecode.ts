// Formats a duration in seconds as M:SS.s (e.g. 83.4 -> "1:23.4"), rounded
// to the nearest tenth of a second, trim only needs sub-second precision
// for defining an edit point, not frame-accurate display.
export function formatTimecode(totalSeconds: number): string {
	const clamped = Math.max(0, totalSeconds);
	const rounded = Math.round(clamped * 10) / 10;
	const minutes = Math.floor(rounded / 60);
	const seconds = rounded - minutes * 60;
	const secondsStr = seconds.toFixed(1).padStart(4, '0');
	return `${minutes}:${secondsStr}`;
}

// Parses a M:SS(.s) timecode (as produced by formatTimecode) or a plain
// number of seconds (e.g. "45" or "45.5") back into seconds. Returns null
// for anything that doesn't parse to a valid non-negative duration.
export function parseTimecode(text: string): number | null {
	const trimmed = text.trim();
	if (trimmed === '') return null;

	const colonMatch = trimmed.match(/^(\d+):(\d+(?:\.\d+)?)$/);
	if (colonMatch) {
		const minutes = Number(colonMatch[1]);
		const seconds = Number(colonMatch[2]);
		if (seconds >= 60) return null;
		return minutes * 60 + seconds;
	}

	const plain = Number(trimmed);
	return Number.isFinite(plain) && plain >= 0 ? plain : null;
}
