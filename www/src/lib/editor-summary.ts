import {
	COMPRESSION_PRESETS,
	type AspectRatio,
	type CompressionSettings,
	type GifQualityPreset,
	type OutputFormat,
	type ReformatMode
} from '$lib/ffmpeg/filters';
import { formatTimecode } from '$lib/timecode';

function compressionLabel(compression: CompressionSettings): string {
	if (compression.mode === 'size') return `Compression (~${compression.targetMB}MB)`;
	if (compression.mode === 'preset') {
		const preset = COMPRESSION_PRESETS.find((p) => p.crf === compression.crf);
		if (preset) return `Compression (${preset.label})`;
	}
	return `Compression (CRF ${compression.crf})`;
}

// Only called when formatActive (outputFormat !== 'mp4'), and gif is the
// only other format, so this only ever needs to label that one case.
function formatLabel(gifQuality: GifQualityPreset): string {
	return `GIF (${gifQuality.label})`;
}

export interface EditorSummaryInput {
	mode: ReformatMode;
	ratio: AspectRatio;
	speed: number;
	volume: number;
	compression: CompressionSettings;
	hasCaptionSegments: boolean;
	trimStart: number;
	trimEnd: number;
	sourceDuration: number;
	outputFormat: OutputFormat;
	gifQuality: GifQualityPreset;
}

export type ToolId =
	| 'format'
	| 'trim'
	| 'reformat'
	| 'speed'
	| 'volume'
	| 'compression'
	| 'captions';

export interface ToolState {
	id: ToolId;
	label: string;
	// Whether this tool has a real, non-default selection, the same signal
	// used everywhere a tool's "is it doing anything" state is needed
	// (export gating, tab dots, the export summary). There's no separate
	// "enabled" flag independent of this.
	active: boolean;
	// Only meaningful when active: the export-summary fragment for this
	// tool (e.g. "Trim 0:01.0–0:09.0", "150% volume").
	summaryText?: string;
}

// Single source of truth for "which tools are doing something and what do
// they say about it": every other per-tool list in the editor page
// (hasActiveTransform, each tab's enabled dot, the export summary line, the
// "select at least one option" guard message) derives from this one array
// instead of separately re-deriving the same active/inactive condition.
// Adding a new tool means adding one entry here (plus an icon mapping and a
// panel in +page.svelte, which are unavoidably UI-specific), not hunting
// down every place that used to need a matching hand-edit.
export function buildToolStates(input: EditorSummaryInput): ToolState[] {
	const trimActive = input.trimStart > 0 || input.trimEnd < input.sourceDuration;
	const reformatActive = input.mode !== 'none';
	const speedActive = input.speed !== 1;
	// GIF has no audio track and no CRF/bitrate concept of its own, so
	// neither tool's setting actually does anything while it's selected,
	// same reasoning as ToolTabs locking their tabs out in that state.
	const volumeActive = input.outputFormat !== 'gif' && input.volume !== 1;
	const compressionActive = input.outputFormat !== 'gif' && input.compression.mode !== 'none';
	const captionsActive = input.hasCaptionSegments;
	const formatActive = input.outputFormat !== 'mp4';

	return [
		// Listed first: it decides what Volume/Compression can do (both go
		// inactive/locked once GIF is picked), so it comes before everything
		// it can affect rather than after, in both tab order and the export
		// summary.
		{
			id: 'format',
			label: 'Format',
			active: formatActive,
			summaryText: formatActive ? formatLabel(input.gifQuality) : undefined
		},
		{
			id: 'trim',
			label: 'Trim',
			active: trimActive,
			summaryText: trimActive
				? `Trim ${formatTimecode(input.trimStart)}–${formatTimecode(input.trimEnd)}`
				: undefined
		},
		{
			id: 'reformat',
			label: 'Reformat',
			active: reformatActive,
			summaryText: reformatActive
				? `${input.mode === 'crop' ? 'Crop' : 'Blur pad'} ${input.ratio.label}`
				: undefined
		},
		{
			id: 'speed',
			label: 'Speed',
			active: speedActive,
			summaryText: speedActive ? `${input.speed.toFixed(2)}x speed` : undefined
		},
		{
			id: 'volume',
			label: 'Volume',
			active: volumeActive,
			summaryText: volumeActive ? `${Math.round(input.volume * 100)}% volume` : undefined
		},
		{
			id: 'compression',
			label: 'Compression',
			active: compressionActive,
			summaryText: compressionActive ? compressionLabel(input.compression) : undefined
		},
		{
			id: 'captions',
			label: 'Captions',
			active: captionsActive,
			summaryText: captionsActive ? 'Captions' : undefined
		}
	];
}

// One-line "what will actually happen on export" summary shown next to the
// Export button.
export function buildExportSummary(input: EditorSummaryInput): string[] {
	return buildToolStates(input)
		.filter((tool) => tool.active)
		.map((tool) => tool.summaryText!);
}

// The guard message shown when no tool has a real selection yet: lists
// every tool by name so it can never go stale relative to buildToolStates
// (previously a hand-written sentence that twice fell out of sync when a
// new tool, Trim then Volume, was added without updating it).
export function buildMissingOptionsMessage(toolStates: ToolState[]): string {
	const labels = toolStates.map((tool) => tool.label.toLowerCase());
	let joined: string;
	if (labels.length <= 1) {
		joined = labels[0] ?? '';
	} else if (labels.length === 2) {
		joined = `${labels[0]} or ${labels[1]}`;
	} else {
		joined = `${labels.slice(0, -1).join(', ')}, or ${labels.at(-1)}`;
	}
	return `Select at least one option to export: ${joined}.`;
}
