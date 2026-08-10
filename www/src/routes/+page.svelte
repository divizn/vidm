<script lang="ts">
	import { goto } from '$app/navigation';
	import { fetchFile } from '@ffmpeg/util';
	import { loadFFmpeg } from '$lib/ffmpeg/client';
	import { exportResult } from '$lib/export-state.svelte';
	import {
		buildExportArgs,
		computeOutputDimensions,
		ASPECT_RATIOS,
		DEFAULT_COMPRESSION,
		type ReformatMode,
		type CropRegion,
		type CompressionSettings
	} from '$lib/ffmpeg/filters';
	import { buildAssSubtitle } from '$lib/captions/ass';
	import { buildExportSummary } from '$lib/editor-summary';
	import { DEFAULT_CAPTION_STYLE, type CaptionStyle } from '$lib/captions/style';
	import type { CaptionSegment } from '$lib/whisper/srt';
	import UploadDropzone from '$lib/components/UploadDropzone.svelte';
	import ToolTabs, { type ToolTabItem } from '$lib/components/ToolTabs.svelte';
	import ToolCard from '$lib/components/ToolCard.svelte';
	import FormatToggle from '$lib/components/FormatToggle.svelte';
	import RatioSelector from '$lib/components/RatioSelector.svelte';
	import SpeedControl from '$lib/components/SpeedControl.svelte';
	import CompressionControl from '$lib/components/CompressionControl.svelte';
	import CropPositioner from '$lib/components/CropPositioner.svelte';
	import CaptionsPanel from '$lib/components/CaptionsPanel.svelte';
	import { Button } from '$lib/components/ui/button';
	import ThemeToggle from '$lib/components/ThemeToggle.svelte';
	import CropIcon from '@lucide/svelte/icons/crop';
	import GaugeIcon from '@lucide/svelte/icons/gauge';
	import ArchiveIcon from '@lucide/svelte/icons/archive';
	import CaptionsIcon from '@lucide/svelte/icons/captions';

	type Status = 'configuring' | 'loading-engine' | 'processing' | 'done' | 'error';
	type ActiveTool = 'reformat' | 'speed' | 'compression' | 'captions';

	let status = $state<Status>('configuring');
	let progress = $state(0);
	let errorMessage = $state('');
	let mode = $state<ReformatMode>('none');
	let ratio = $state(ASPECT_RATIOS[0]);
	let speedEnabled = $state(false);
	let speed = $state(1);
	let compression = $state<CompressionSettings>({ ...DEFAULT_COMPRESSION, mode: 'none' });
	let sourceFile = $state<File | null>(null);
	let sourceDuration = $state(0);
	let sourceWidth = $state(0);
	let sourceHeight = $state(0);
	let crop = $state<CropRegion>({ x: 0, y: 0, width: 0, height: 0 });
	let captionSegments = $state<CaptionSegment[]>([]);
	let captionsEnabled = $state(false);
	let captionStyle = $state<CaptionStyle>({ ...DEFAULT_CAPTION_STYLE });
	let activeTool = $state<ActiveTool>('reformat');

	// Every option is independently optional (reformat, speed, compression,
	// captions) — but exporting with literally nothing selected would just
	// re-encode the source unchanged for no reason, so require at least one.
	// speed's own check excludes the no-op 1x value — a continuous slider
	// (unlike the old discrete radio options) can land exactly on it.
	const hasActiveTransform = $derived(
		mode !== 'none' ||
			(speedEnabled && speed !== 1) ||
			compression.mode !== 'none' ||
			(captionsEnabled && captionSegments.length > 0)
	);

	const exportSummary = $derived(
		buildExportSummary({
			mode,
			ratio,
			speedEnabled,
			speed,
			compression,
			captionsEnabled,
			hasCaptionSegments: captionSegments.length > 0
		})
	);

	const toolTabs = $derived([
		{ id: 'reformat', label: 'Reformat', icon: CropIcon, enabled: mode !== 'none' },
		{ id: 'speed', label: 'Speed', icon: GaugeIcon, enabled: speedEnabled },
		{
			id: 'compression',
			label: 'Compression',
			icon: ArchiveIcon,
			enabled: compression.mode !== 'none'
		},
		{ id: 'captions', label: 'Captions', icon: CaptionsIcon, enabled: captionsEnabled }
	]);

	function handleFile(file: File) {
		sourceFile = file;
	}

	function onSourceVideoLoaded(e: Event) {
		const video = e.target as HTMLVideoElement;
		sourceDuration = video.duration;
		sourceWidth = video.videoWidth;
		sourceHeight = video.videoHeight;
	}

	async function run() {
		if (!sourceFile) return;

		errorMessage = '';
		progress = 0;
		status = 'loading-engine';

		try {
			const ffmpeg = await loadFFmpeg();
			const offProgress = ffmpeg.on('progress', ({ progress: p }) => {
				progress = Math.round(Math.min(Math.max(p, 0), 1) * 100);
			});

			status = 'processing';

			const inputName = 'input.mp4';
			const outputName = 'output.mp4';
			await ffmpeg.writeFile(inputName, await fetchFile(sourceFile));

			let captionsAssPath: string | undefined;
			let captionsFontsDir: string | undefined;
			if (captionsEnabled && captionSegments.length > 0) {
				const { width: outW, height: outH } = computeOutputDimensions({
					mode,
					ratio,
					crop,
					sourceWidth,
					sourceHeight
				});
				const assContent = buildAssSubtitle(captionSegments, captionStyle, outW, outH, speed);
				await ffmpeg.writeFile('captions.ass', assContent);
				await ffmpeg.createDir('fonts');
				await ffmpeg.writeFile(
					`fonts/${captionStyle.font.file}`,
					await fetchFile(`/fonts/${captionStyle.font.file}`)
				);
				captionsAssPath = 'captions.ass';
				captionsFontsDir = 'fonts';
			}

			await ffmpeg.exec(
				buildExportArgs(inputName, outputName, {
					mode,
					speed,
					ratio,
					crop,
					compression,
					sourceDurationSeconds: sourceDuration,
					sourceWidth,
					sourceHeight,
					captionsAssPath,
					captionsFontsDir
				})
			);
			const data = await ffmpeg.readFile(outputName);

			exportResult.url = URL.createObjectURL(
				new Blob([new Uint8Array(data as Uint8Array)], { type: 'video/mp4' })
			);
			exportResult.downloadName = `vidm-${mode}${mode !== 'none' ? `-${ratio.label}` : ''}-${speed}x.mp4`;

			ffmpeg.off('progress', offProgress as never);
			status = 'done';
			// Client-side navigation (not a hard reload) — the blob URL above
			// stays valid since it's still the same document. The /export
			// page's "back" button does the hard reload this app actually
			// needs before the next conversion (see its own comment).
			await goto('/export');
		} catch (err) {
			status = 'error';
			errorMessage = err instanceof Error ? err.message : String(err);
		}
	}
</script>

<main class="mx-auto flex max-w-2xl flex-col gap-5 px-4 py-8">
	<div class="flex items-start justify-between gap-4">
		<div class="space-y-1">
			<h1 class="text-2xl font-bold tracking-tight">vidm — lightweight video editor</h1>
			<p class="text-muted-foreground text-sm">
				Upload a video, then reformat, adjust speed, compress, and caption it. Runs entirely in your browser.
			</p>
		</div>
		<ThemeToggle />
	</div>

	{#if status === 'configuring' && !sourceFile}
		<UploadDropzone onFile={handleFile} />
	{/if}

	{#if sourceFile}
		<!-- svelte-ignore a11y_media_has_caption -->
		<video
			src={URL.createObjectURL(sourceFile)}
			onloadedmetadata={onSourceVideoLoaded}
			hidden
		></video>
	{/if}

	{#if sourceFile && (status === 'configuring' || status === 'error')}
		<ToolTabs
			tabs={toolTabs}
			active={activeTool}
			onActiveChange={(id) => (activeTool = id as ActiveTool)}
		/>

		{#if activeTool === 'reformat'}
			<ToolCard
				title="Reformat"
				enabled={mode !== 'none'}
				onEnabledChange={(v) => (mode = v ? 'crop' : 'none')}
			>
				<FormatToggle bind:mode />
				<RatioSelector bind:ratio />
				{#if mode === 'crop'}
					<CropPositioner file={sourceFile} {ratio} bind:crop />
				{/if}
			</ToolCard>
		{:else if activeTool === 'speed'}
			<ToolCard
				title="Speed"
				enabled={speedEnabled}
				onEnabledChange={(v) => {
					speedEnabled = v;
					speed = v ? 1.5 : 1;
				}}
			>
				<SpeedControl bind:speed />
			</ToolCard>
		{:else if activeTool === 'compression'}
			<ToolCard
				title="Compression"
				enabled={compression.mode !== 'none'}
				onEnabledChange={(v) => (compression = { ...compression, mode: v ? 'preset' : 'none' })}
			>
				<CompressionControl bind:compression />
			</ToolCard>
		{:else if activeTool === 'captions'}
			<ToolCard
				title="Captions"
				enabled={captionsEnabled}
				onEnabledChange={(v) => (captionsEnabled = v)}
			>
				<CaptionsPanel file={sourceFile} bind:segments={captionSegments} bind:style={captionStyle} />
			</ToolCard>
		{/if}

		<div class="flex flex-col items-start gap-1.5">
			{#if exportSummary.length > 0}
				<p class="text-muted-foreground text-sm">{exportSummary.join(' · ')}</p>
			{/if}
			<Button onclick={run} disabled={!hasActiveTransform}>Export</Button>
			{#if !hasActiveTransform}
				<p class="text-muted-foreground text-sm">
					Select at least one option — reformat, speed, compression, or captions — to export.
				</p>
			{/if}
		</div>
	{/if}

	{#if status === 'loading-engine'}
		<p class="text-muted-foreground text-sm">Loading FFmpeg engine…</p>
	{:else if status === 'processing'}
		<p class="text-muted-foreground text-sm">Reformatting… {progress}%</p>
	{:else if status === 'error'}
		<p class="text-destructive text-sm">Something went wrong: {errorMessage}</p>
	{/if}
</main>
