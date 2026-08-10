import type { AspectRatio, CompressionSettings, ReformatMode } from '$lib/ffmpeg/filters';

export interface EditorSummaryInput {
	mode: ReformatMode;
	ratio: AspectRatio;
	speedEnabled: boolean;
	speed: number;
	compression: CompressionSettings;
	captionsEnabled: boolean;
	hasCaptionSegments: boolean;
}

// One-line "what will actually happen on export" summary shown next to the
// Export button — built from exactly the same conditions as the editor
// page's hasActiveTransform guard, so it never promises something the
// export won't do (e.g. captions only list once a transcript actually
// exists, not just because the tool is toggled on).
export function buildExportSummary(input: EditorSummaryInput): string[] {
	const parts: string[] = [];

	if (input.mode === 'crop') parts.push(`Crop ${input.ratio.label}`);
	else if (input.mode === 'blur-pad') parts.push(`Blur pad ${input.ratio.label}`);

	if (input.speedEnabled) parts.push(`${input.speed}x speed`);

	if (input.compression.mode !== 'none') parts.push('Compression');

	if (input.captionsEnabled && input.hasCaptionSegments) parts.push('Captions');

	return parts;
}
