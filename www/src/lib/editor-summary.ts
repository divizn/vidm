import {
	COMPRESSION_PRESETS,
	type AspectRatio,
	type CompressionSettings,
	type ReformatMode
} from '$lib/ffmpeg/filters';

function compressionLabel(compression: CompressionSettings): string {
	if (compression.mode === 'size') return `Compression (~${compression.targetMB}MB)`;
	if (compression.mode === 'preset') {
		const preset = COMPRESSION_PRESETS.find((p) => p.crf === compression.crf);
		if (preset) return `Compression (${preset.label})`;
	}
	return `Compression (CRF ${compression.crf})`;
}

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

	if (input.compression.mode !== 'none') parts.push(compressionLabel(input.compression));

	if (input.hasCaptionSegments) parts.push('Captions');

	return parts;
}
