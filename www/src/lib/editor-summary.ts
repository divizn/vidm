import type { AspectRatio, CompressionSettings, ReformatMode } from '$lib/ffmpeg/filters';

export interface EditorSummaryInput {
	mode: ReformatMode;
	ratio: AspectRatio;
	speed: number;
	compression: CompressionSettings;
	hasCaptionSegments: boolean;
}

// One-line "what will actually happen on export" summary shown next to the
// Export button — built from exactly the same conditions as the editor
// page's hasActiveTransform guard, so it never promises something the
// export won't do. There's no separate "enabled" flag for any tool
// anymore — a real selection (a non-1x speed, a picked reformat/
// compression mode, an actual transcript) is itself the signal.
export function buildExportSummary(input: EditorSummaryInput): string[] {
	const parts: string[] = [];

	if (input.mode === 'crop') parts.push(`Crop ${input.ratio.label}`);
	else if (input.mode === 'blur-pad') parts.push(`Blur pad ${input.ratio.label}`);

	if (input.speed !== 1) parts.push(`${input.speed.toFixed(2)}x speed`);

	if (input.compression.mode !== 'none') parts.push('Compression');

	if (input.hasCaptionSegments) parts.push('Captions');

	return parts;
}
