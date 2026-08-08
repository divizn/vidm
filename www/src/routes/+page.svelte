<script lang="ts">
	import { fetchFile } from '@ffmpeg/util';
	import { loadFFmpeg } from '$lib/ffmpeg/client';
	import {
		buildExportArgs,
		ASPECT_RATIOS,
		DEFAULT_COMPRESSION,
		type ReformatMode,
		type CropRegion,
		type CompressionSettings
	} from '$lib/ffmpeg/filters';
	import UploadDropzone from '$lib/components/UploadDropzone.svelte';
	import FormatToggle from '$lib/components/FormatToggle.svelte';
	import RatioSelector from '$lib/components/RatioSelector.svelte';
	import SpeedControl from '$lib/components/SpeedControl.svelte';
	import CompressionControl from '$lib/components/CompressionControl.svelte';
	import CropPositioner from '$lib/components/CropPositioner.svelte';
	import VideoPreview from '$lib/components/VideoPreview.svelte';

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
	let outputUrl = $state<string | null>(null);
	let crop = $state<CropRegion>({ x: 0, y: 0, width: 0, height: 0 });

	function handleFile(file: File) {
		sourceFile = file;
	}

	function onDurationVideoLoaded(e: Event) {
		sourceDuration = (e.target as HTMLVideoElement).duration;
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
			await ffmpeg.exec(
				buildExportArgs(inputName, outputName, {
					mode,
					speed,
					ratio,
					crop,
					compression,
					sourceDurationSeconds: sourceDuration
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

<main>
	<h1>vidm — portrait reformatter</h1>
	<p>Upload a landscape video, reformat it, preview, and download. Runs entirely in your browser.</p>

	{#if status === 'configuring' && !sourceFile}
		<UploadDropzone onFile={handleFile} />
	{/if}

	{#if sourceFile}
		<!-- svelte-ignore a11y_media_has_caption -->
		<video
			src={URL.createObjectURL(sourceFile)}
			onloadedmetadata={onDurationVideoLoaded}
			hidden
		></video>
	{/if}

	{#if sourceFile && (status === 'configuring' || status === 'error')}
		<FormatToggle bind:mode />
		<RatioSelector bind:ratio />
		<SpeedControl bind:speed />
		<CompressionControl bind:compression />

		{#if mode === 'crop'}
			<CropPositioner file={sourceFile} {ratio} bind:crop />
		{/if}

		<button onclick={run}>Export</button>
	{/if}

	{#if status === 'loading-engine'}
		<p>Loading FFmpeg engine…</p>
	{:else if status === 'processing'}
		<p>Reformatting… {progress}%</p>
	{:else if status === 'error'}
		<p class="error">Something went wrong: {errorMessage}</p>
	{/if}

	{#if outputUrl}
		<VideoPreview src={outputUrl} downloadName={`vidm-${mode}-${ratio.label}-${speed}x.mp4`} />
		<p class="note">To reformat another video, refresh the page.</p>
	{/if}
</main>

<style>
	main {
		max-width: 640px;
		margin: 0 auto;
		padding: 2rem 1rem;
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
	}

	.error {
		color: #dc2626;
	}

	.note {
		font-size: 0.9rem;
		color: #666;
	}

	button {
		align-self: flex-start;
		padding: 0.5rem 1.25rem;
		font-weight: 600;
	}
</style>
