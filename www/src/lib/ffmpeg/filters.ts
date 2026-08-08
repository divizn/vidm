export type ReformatMode = 'crop' | 'blur-pad';

const WIDTH = 1080;
const HEIGHT = 1920;

// setsar=1: without it, blur-pad's overlay leaves a stale SAR that makes
// players stretch the (correctly-encoded) 1080x1920 frame.
export const REFORMAT_FILTERS: Record<ReformatMode, string> = {
	crop: `scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=increase,crop=${WIDTH}:${HEIGHT},setsar=1`,
	'blur-pad': `split[bg][fg];[bg]scale=${WIDTH}:${HEIGHT},boxblur=20:5[bg];[fg]scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=decrease[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2,setsar=1`
};

export function buildReformatArgs(
	inputName: string,
	outputName: string,
	mode: ReformatMode
): string[] {
	return ['-i', inputName, '-vf', REFORMAT_FILTERS[mode], '-c:a', 'copy', outputName];
}
