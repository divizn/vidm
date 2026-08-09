export type CaptionPosition = 'top' | 'middle' | 'bottom';

export interface CaptionFont {
	label: string;
	// Must match the font file's internal family name — libass's fontselect
	// (no fontconfig in this build) matches purely by name against whatever
	// fontsdir points at, not by filename.
	assFamily: string;
	// Filename under /fonts (served statically and written into ffmpeg's FS
	// under the same name at export time).
	file: string;
}

export const CAPTION_FONTS: CaptionFont[] = [
	{ label: 'Impact', assFamily: 'Anton', file: 'Anton-Regular.ttf' },
	{ label: 'Clean', assFamily: 'Poppins', file: 'Poppins-Bold.ttf' }
];

export const CAPTION_POSITIONS: { label: string; value: CaptionPosition }[] = [
	{ label: 'Top', value: 'top' },
	{ label: 'Middle', value: 'middle' },
	{ label: 'Bottom', value: 'bottom' }
];

export interface CaptionStyle {
	font: CaptionFont;
	position: CaptionPosition;
	textColor: string; // #rrggbb
	highlightColor: string; // #rrggbb — active-word color, karaoke-style
	fontSizePercent: number; // font size as a percentage of output height
}

export const DEFAULT_CAPTION_STYLE: CaptionStyle = {
	font: CAPTION_FONTS[0],
	position: 'bottom',
	textColor: '#FFFFFF',
	highlightColor: '#FFE066',
	fontSizePercent: 7
};

export const MIN_FONT_SIZE_PERCENT = 3;
export const MAX_FONT_SIZE_PERCENT = 12;
