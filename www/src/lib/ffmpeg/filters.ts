const WIDTH = 1080;
const HEIGHT = 1920;

// atempo only accepts 0.5-2.0 in a single filter instance; values outside
// that need chaining multiple atempo filters, which isn't supported here.
export const MIN_SPEED = 0.5;
export const MAX_SPEED = 2;

// setsar=1: without it, players stretch the (correctly-encoded) 1080x1920
// frame because of a stale SAR left over from the filter chain.
//
// Blur-padded fill (blur background + centered overlay) is deferred: any
// filtergraph merging two video streams via overlay hangs the multi-threaded
// core's filter setup, reproduced with both a `split`-based and a
// two-separate-`-i`-reads version. Revisit once resolved (single-threaded
// fallback for that mode, or a non-overlay padding approach).
export function buildExportArgs(inputName: string, outputName: string, speed: number): string[] {
	const videoFilters = [
		`scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=increase`,
		`crop=${WIDTH}:${HEIGHT}`,
		'setsar=1'
	];

	if (speed === 1) {
		return ['-i', inputName, '-vf', videoFilters.join(','), '-c:a', 'copy', outputName];
	}

	videoFilters.push(`setpts=PTS/${speed}`);
	return [
		'-i',
		inputName,
		'-vf',
		videoFilters.join(','),
		'-filter:a',
		`atempo=${speed}`,
		'-c:a',
		'aac',
		// -threads caps libx264's own pthread usage. Without it, the video
		// encoder's threads exhaust the WASM core's fixed pthread pool,
		// leaving none for the AAC encoder — it deadlocks waiting for a
		// worker that never frees up. 4 leaves enough headroom.
		'-threads',
		'4',
		outputName
	];
}
