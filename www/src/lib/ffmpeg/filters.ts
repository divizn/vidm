const WIDTH = 1080;
const HEIGHT = 1920;

// setsar=1: without it, players stretch the (correctly-encoded) 1080x1920
// frame because of a stale SAR left over from the filter chain.
//
// Blur-padded fill (blur background + centered overlay) is deferred: any
// filtergraph merging two video streams via overlay hangs the multi-threaded
// core's filter setup, reproduced with both a `split`-based and a
// two-separate-`-i`-reads version. Revisit once resolved (single-threaded
// fallback for that mode, or a non-overlay padding approach).
export function buildCropArgs(inputName: string, outputName: string): string[] {
	return [
		'-i',
		inputName,
		'-vf',
		`scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=increase,crop=${WIDTH}:${HEIGHT},setsar=1`,
		'-c:a',
		'copy',
		outputName
	];
}
