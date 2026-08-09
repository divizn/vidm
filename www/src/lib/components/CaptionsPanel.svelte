<script lang="ts">
	import { transcribeFile } from '$lib/whisper/client';
	import { toSrt, type CaptionSegment } from '$lib/whisper/srt';

	let { file }: { file: File } = $props();

	type Status = 'idle' | 'transcribing' | 'done' | 'error';

	let status = $state<Status>('idle');
	let progress = $state(0);
	let errorMessage = $state('');
	let segments = $state<CaptionSegment[]>([]);

	const srtUrl = $derived(
		segments.length
			? URL.createObjectURL(new Blob([toSrt(segments)], { type: 'text/plain' }))
			: null
	);

	const transcript = $derived(
		segments
			.map((seg) => seg.text.trim())
			.join(' ')
	);

	async function generate() {
		status = 'transcribing';
		progress = 0;
		errorMessage = '';

		try {
			segments = await transcribeFile(file, (p) => (progress = p));
			status = 'done';
		} catch (err) {
			status = 'error';
			console.error('[captions] transcribe failed, raw error:', err);
			if (err instanceof ErrorEvent) {
				console.error('[captions] ErrorEvent details:', {
					message: err.message,
					filename: err.filename,
					lineno: err.lineno,
					colno: err.colno,
					error: err.error
				});
			}
			errorMessage = err instanceof Error ? err.message : String(err);
		}
	}
</script>

<div class="panel">
	<h2>Captions</h2>

	{#if status === 'idle'}
		<button onclick={generate}>Generate captions</button>
	{:else if status === 'transcribing'}
		<p>Transcribing… {progress}%</p>
	{:else if status === 'error'}
		<p class="error">Something went wrong: {errorMessage}</p>
		<button onclick={generate}>Retry</button>
	{/if}

	{#if status === 'done'}
		<div class="transcript">
			<h3>Transcript</h3>
			<p>{transcript}</p>
		</div>
		<ul class="segments">
			{#each segments as segment, i (i)}
				<li>
					<span class="time">{segment.from} → {segment.to}</span>
					<input type="text" bind:value={segment.text} />
				</li>
			{/each}
		</ul>
		{#if srtUrl}
			<a href={srtUrl} download="captions.srt">Download captions.srt</a>
		{/if}
	{/if}
</div>

<style>
	.panel {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	h2 {
		font-size: 1rem;
		margin: 0;
	}

	.transcript h3 {
		font-size: 0.85rem;
		margin: 0 0 0.25rem;
		color: #666;
	}

	.transcript p {
		margin: 0;
		white-space: pre-wrap;
	}

	.error {
		color: #dc2626;
	}

	.segments {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		max-height: 16rem;
		overflow-y: auto;
	}

	.segments li {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
	}

	.time {
		font-size: 0.75rem;
		color: #666;
	}

	input[type='text'] {
		padding: 0.35rem 0.5rem;
	}
</style>
