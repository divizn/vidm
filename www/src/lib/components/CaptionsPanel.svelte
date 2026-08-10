<script lang="ts">
	import { transcribeFile } from '$lib/whisper/client';
	import { toSrt, type CaptionSegment } from '$lib/whisper/srt';
	import { DEFAULT_CAPTION_STYLE, type CaptionStyle } from '$lib/captions/style';
	import { loadFFmpeg } from '$lib/ffmpeg/client';
	import { fetchFile } from '@ffmpeg/util';
	import { formatTimecode } from '$lib/timecode';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import CaptionStyleControl from './CaptionStyleControl.svelte';
	import CaptionPreview from './CaptionPreview.svelte';

	let {
		file,
		segments = $bindable([]),
		style = $bindable({ ...DEFAULT_CAPTION_STYLE }),
		trimStart,
		trimEnd,
		sourceDuration
	}: {
		file: File;
		segments?: CaptionSegment[];
		style?: CaptionStyle;
		trimStart: number;
		trimEnd: number;
		sourceDuration: number;
	} = $props();

	const trimActive = $derived(trimStart > 0 || trimEnd < sourceDuration);

	type Status = 'idle' | 'transcribing' | 'done' | 'error';

	let status = $state<Status>(segments.length ? 'done' : 'idle');
	let progress = $state(0);
	let errorMessage = $state('');

	// If trim changes after a transcript already exists, its timestamps no
	// longer correspond to the new range — clear it rather than leaving it
	// silently stale, same philosophy as editSegmentText dropping word-level
	// timing on a manual edit.
	let prevTrimStart = trimStart;
	let prevTrimEnd = trimEnd;

	$effect(() => {
		if ((trimStart !== prevTrimStart || trimEnd !== prevTrimEnd) && segments.length > 0) {
			segments = [];
			status = 'idle';
		}
		prevTrimStart = trimStart;
		prevTrimEnd = trimEnd;
	});

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

	// Re-encodes (doesn't stream-copy) so the cut lands exactly at trimStart
	// — a copy-mode trim can only cut at keyframes, which could desync the
	// transcript from the frame-accurate trim the real export applies later.
	async function extractTrimmedClip(): Promise<File> {
		const ffmpeg = await loadFFmpeg();
		const inputName = 'caption-trim-input.mp4';
		const outputName = 'caption-trim-output.mp4';
		await ffmpeg.writeFile(inputName, await fetchFile(file));
		await ffmpeg.exec([
			'-ss',
			String(trimStart),
			'-i',
			inputName,
			'-t',
			String(trimEnd - trimStart),
			outputName
		]);
		const data = await ffmpeg.readFile(outputName);
		return new File([new Uint8Array(data as Uint8Array)], 'trimmed.mp4', { type: 'video/mp4' });
	}

	async function generate() {
		status = 'transcribing';
		progress = 0;
		errorMessage = '';

		try {
			const transcribeTarget = trimActive ? await extractTrimmedClip() : file;
			segments = await transcribeFile(transcribeTarget, (p) => (progress = p));
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

{#if status === 'idle'}
	<Button onclick={generate}>Generate captions</Button>
	{#if trimActive}
		<p class="text-muted-foreground text-sm">
			Captions will be generated for the trimmed range ({formatTimecode(trimStart)}–{formatTimecode(
				trimEnd
			)}) only.
		</p>
	{/if}
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

	<CaptionStyleControl bind:style />
	<CaptionPreview {segments} {style} />
{/if}
