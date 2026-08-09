<script lang="ts">
	import { transcribeFile } from '$lib/whisper/client';
	import { toSrt, type CaptionSegment } from '$lib/whisper/srt';
	import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';

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

	const transcript = $derived(segments.map((seg) => seg.text.trim()).join(' '));

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

<Card>
	<CardHeader>
		<CardTitle>Captions</CardTitle>
	</CardHeader>
	<CardContent class="space-y-4">
		{#if status === 'idle'}
			<Button onclick={generate}>Generate captions</Button>
		{:else if status === 'transcribing'}
			<p class="text-muted-foreground text-sm">Transcribing… {progress}%</p>
		{:else if status === 'error'}
			<p class="text-destructive text-sm">Something went wrong: {errorMessage}</p>
			<Button onclick={generate}>Retry</Button>
		{/if}

		{#if status === 'done'}
			<div class="space-y-1">
				<h3 class="text-muted-foreground text-sm font-medium">Transcript</h3>
				<p class="text-sm whitespace-pre-wrap">{transcript}</p>
			</div>
			<ul class="max-h-64 space-y-2 overflow-y-auto">
				{#each segments as segment, i (i)}
					<li class="space-y-1">
						<span class="text-muted-foreground text-xs">{segment.from} → {segment.to}</span>
						<Input type="text" bind:value={segment.text} />
					</li>
				{/each}
			</ul>
			{#if srtUrl}
				<Button href={srtUrl} download="captions.srt" variant="outline"
					>Download captions.srt</Button
				>
			{/if}
		{/if}
	</CardContent>
</Card>
