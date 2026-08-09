<script lang="ts">
	import { transcribeFile } from '$lib/whisper/client';
	import { toSrt, type CaptionSegment } from '$lib/whisper/srt';
	import { DEFAULT_CAPTION_STYLE, type CaptionStyle } from '$lib/captions/style';
	import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import { Label } from '$lib/components/ui/label';
	import CaptionStyleControl from './CaptionStyleControl.svelte';
	import CaptionPreview from './CaptionPreview.svelte';

	let {
		file,
		segments = $bindable([]),
		burnIn = $bindable(false),
		style = $bindable({ ...DEFAULT_CAPTION_STYLE })
	}: {
		file: File;
		segments?: CaptionSegment[];
		burnIn?: boolean;
		style?: CaptionStyle;
	} = $props();

	type Status = 'idle' | 'transcribing' | 'done' | 'error';

	let status = $state<Status>('idle');
	let progress = $state(0);
	let errorMessage = $state('');

	const srtUrl = $derived(
		segments.length
			? URL.createObjectURL(new Blob([toSrt(segments)], { type: 'text/plain' }))
			: null
	);

	const transcript = $derived(segments.map((seg) => seg.text.trim()).join(' '));

	function editSegmentText(index: number, text: string) {
		// Editing invalidates that segment's word-level timing (it no longer
		// matches the edited text), so drop it — burn-in falls back to
		// plain (non-karaoke) text for this segment instead of highlighting
		// against stale word boundaries.
		segments[index] = { ...segments[index], text, words: undefined };
	}

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
						<Input
							type="text"
							value={segment.text}
							oninput={(e) => editSegmentText(i, e.currentTarget.value)}
						/>
					</li>
				{/each}
			</ul>
			{#if srtUrl}
				<Button href={srtUrl} download="captions.srt" variant="outline"
					>Download captions.srt</Button
				>
			{/if}

			<div class="flex items-center gap-2">
				<Checkbox id="burn-captions" bind:checked={burnIn} />
				<Label for="burn-captions" class="cursor-pointer font-normal"
					>Burn captions into exported video</Label
				>
			</div>
			{#if burnIn}
				<CaptionStyleControl bind:style />
				<CaptionPreview {file} {segments} {style} />
			{/if}
		{/if}
	</CardContent>
</Card>
