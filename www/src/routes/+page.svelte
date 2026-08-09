<script lang="ts">
	import { fetchFile } from '@ffmpeg/util';
	import { loadFFmpeg } from '$lib/ffmpeg/client';
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
	import { DEFAULT_CAPTION_STYLE, type CaptionStyle } from '$lib/captions/style';
	import type { CaptionSegment } from '$lib/whisper/srt';
	import UploadDropzone from '$lib/components/UploadDropzone.svelte';
	import FormatToggle from '$lib/components/FormatToggle.svelte';
	import RatioSelector from '$lib/components/RatioSelector.svelte';
	import SpeedControl from '$lib/components/SpeedControl.svelte';
	import CompressionControl from '$lib/components/CompressionControl.svelte';
	import CropPositioner from '$lib/components/CropPositioner.svelte';
	import CaptionsPanel from '$lib/components/CaptionsPanel.svelte';
	import VideoPreview from '$lib/components/VideoPreview.svelte';
	import { Card, CardContent } from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import ThemeToggle from '$lib/components/ThemeToggle.svelte';

	type Status = 'configuring' | 'loading-engine' | 'processing' | 'done' | 'error';

	let status = $state<Status>('configuring');
	let progress = $state(0);
	let errorMessage = $state('');
	let mode = $state<ReformatMode>('crop');
	let ratio = $state(ASPECT_RATIOS[0]);
	let speed = $state(1);
	let compression = $state<CompressionSettings>({ ...DEFAULT_COMPRESSION });
	let sourceFile = $state<File | null>(null);
	let sourceDuration = $state(0);
	let sourceWidth = $state(0);
	let sourceHeight = $state(0);
	let outputUrl = $state<string | null>(null);
	let crop = $state<CropRegion>({ x: 0, y: 0, width: 0, height: 0 });
	let captionSegments = $state<CaptionSegment[]>([]);
	let burnCaptions = $state(false);
	let captionStyle = $state<CaptionStyle>({ ...DEFAULT_CAPTION_STYLE });

	// Every option is independently optional (reformat, speed, compression,
	// captions) — but exporting with literally nothing selected would just
	// re-encode the source unchanged for no reason, so require at least one.
	const hasActiveTransform = $derived(
		mode !== 'none' ||
			speed !== 1 ||
			compression.mode !== 'none' ||
			(burnCaptions && captionSegments.length > 0)
	);

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
			if (burnCaptions && captionSegments.length > 0) {
				const { width: outW, height: outH } = computeOutputDimensions({
					mode,
					ratio,
					crop,
					sourceWidth,
					sourceHeight
				});
				const assContent = buildAssSubtitle(captionSegments, captionStyle, outW, outH);
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

			outputUrl = URL.createObjectURL(
				new Blob([new Uint8Array(data as Uint8Array)], { type: 'video/mp4' })
			);

			ffmpeg.off('progress', offProgress as never);
			status = 'done';
		} catch (err) {
			status = 'error';
			errorMessage = err instanceof Error ? err.message : String(err);
		}
	}
</script>

<main class="mx-auto flex max-w-2xl flex-col gap-5 px-4 py-8">
	<div class="flex items-start justify-between gap-4">
		<div class="space-y-1">
			<h1 class="text-2xl font-bold tracking-tight">vidm — portrait reformatter</h1>
			<p class="text-muted-foreground text-sm">
				Upload a landscape video, reformat it, preview, and download. Runs entirely in your
				browser.
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
		<Card>
			<CardContent class="space-y-5">
				<FormatToggle bind:mode />
				{#if mode !== 'none'}
					<RatioSelector bind:ratio />
				{/if}
				<SpeedControl bind:speed />
				<CompressionControl bind:compression />
			</CardContent>
		</Card>

		{#if mode === 'crop'}
			<Card>
				<CardContent>
					<CropPositioner file={sourceFile} {ratio} bind:crop />
				</CardContent>
			</Card>
		{/if}

		<div class="flex flex-col items-start gap-1.5">
			<Button onclick={run} disabled={!hasActiveTransform}>Export</Button>
			{#if !hasActiveTransform}
				<p class="text-muted-foreground text-sm">
					Select at least one option — reformat, speed, compression, or captions — to export.
				</p>
			{/if}
		</div>

		<CaptionsPanel
			file={sourceFile}
			bind:segments={captionSegments}
			bind:burnIn={burnCaptions}
			bind:style={captionStyle}
		/>
	{/if}

	{#if status === 'loading-engine'}
		<p class="text-muted-foreground text-sm">Loading FFmpeg engine…</p>
	{:else if status === 'processing'}
		<p class="text-muted-foreground text-sm">Reformatting… {progress}%</p>
	{:else if status === 'error'}
		<p class="text-destructive text-sm">Something went wrong: {errorMessage}</p>
	{/if}

	{#if outputUrl}
		<VideoPreview
			src={outputUrl}
			downloadName={`vidm-${mode}${mode !== 'none' ? `-${ratio.label}` : ''}-${speed}x.mp4`}
		/>
		<p class="text-muted-foreground text-sm">To reformat another video, refresh the page.</p>
	{/if}
</main>
