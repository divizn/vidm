<script lang="ts">
	import { fetchFile } from '@ffmpeg/util';
	import { getFFmpeg } from '$lib/ffmpeg/client';
	import { buildReformatArgs, type ReformatMode } from '$lib/ffmpeg/filters';
	import UploadDropzone from '$lib/components/UploadDropzone.svelte';
	import FormatToggle from '$lib/components/FormatToggle.svelte';
	import VideoPreview from '$lib/components/VideoPreview.svelte';

	type Status = 'idle' | 'loading-engine' | 'processing' | 'done' | 'error';

	let status = $state<Status>('idle');
	let progress = $state(0);
	let errorMessage = $state('');
	let mode = $state<ReformatMode>('crop');
	let sourceFile = $state<File | null>(null);
	let outputUrl = $state<string | null>(null);

	async function handleFile(file: File) {
		sourceFile = file;
		if (outputUrl) URL.revokeObjectURL(outputUrl);
		outputUrl = null;
		await run();
	}

	async function run() {
		if (!sourceFile) return;

		errorMessage = '';
		progress = 0;
		status = 'loading-engine';

		try {
			const ffmpeg = await getFFmpeg();
			const offProgress = ffmpeg.on('progress', ({ progress: p }) => {
				progress = Math.round(Math.min(Math.max(p, 0), 1) * 100);
			});

			status = 'processing';

			const inputName = 'input.mp4';
			const outputName = 'output.mp4';
			await ffmpeg.writeFile(inputName, await fetchFile(sourceFile));
			await ffmpeg.exec(buildReformatArgs(inputName, outputName, mode));
			const data = await ffmpeg.readFile(outputName);

			if (outputUrl) URL.revokeObjectURL(outputUrl);
			outputUrl = URL.createObjectURL(
				new Blob([new Uint8Array(data as Uint8Array)], { type: 'video/mp4' })
			);

			await ffmpeg.deleteFile(inputName);
			await ffmpeg.deleteFile(outputName);
			ffmpeg.off('progress', offProgress as never);

			status = 'done';
		} catch (err) {
			status = 'error';
			errorMessage = err instanceof Error ? err.message : String(err);
		}
	}

	function reRun() {
		if (sourceFile) void run();
	}
</script>

<main>
	<h1>vidm — portrait reformatter</h1>
	<p>Upload a landscape video, reformat it to 9:16, preview, and download. Runs entirely in your browser.</p>

	<FormatToggle bind:mode disabled={status === 'loading-engine' || status === 'processing'} />

	<UploadDropzone onFile={handleFile} disabled={status === 'loading-engine' || status === 'processing'} />

	{#if status === 'loading-engine'}
		<p>Loading FFmpeg engine (first run only)…</p>
	{:else if status === 'processing'}
		<p>Reformatting… {progress}%</p>
	{:else if status === 'error'}
		<p class="error">Something went wrong: {errorMessage}</p>
	{/if}

	{#if outputUrl}
		<VideoPreview src={outputUrl} downloadName={`vidm-${mode}.mp4`} />
		{#if sourceFile}
			<button onclick={reRun} disabled={status === 'processing'}>Re-run with current format</button>
		{/if}
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
</style>
