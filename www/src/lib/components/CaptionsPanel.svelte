<script lang="ts">
	import {
		pickBackend,
		transcribe,
		backendLabel,
		explainBackend,
		isFixableByUser,
		TRANSCRIBE_CHUNK_SECONDS,
		type TranscribeProgress,
		type BackendSelection,
		type TranscriptionQuality
	} from '$lib/whisper';
	import type { AudioChunk } from '$lib/whisper/client';
	import { wavToFloat32 } from '$lib/whisper/wav';
	import { estimateRemainingSeconds, formatEta } from '$lib/eta';
	import { toSrt, type CaptionSegment } from '$lib/whisper/srt';
	import { DEFAULT_CAPTION_STYLE, type CaptionStyle } from '$lib/captions/style';
	import { loadFFmpeg, resetFFmpeg } from '$lib/ffmpeg/client';
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
		sourceDuration,
		generating = $bindable(false)
	}: {
		file: File;
		segments?: CaptionSegment[];
		style?: CaptionStyle;
		trimStart: number;
		trimEnd: number;
		sourceDuration: number;
		// True while a transcription is in flight — lets the parent lock trim
		// editing for the duration, since extractAudioForTranscription below
		// captures trimStart/trimEnd once at the start of the run and a mid-flight
		// trim change would silently desync the eventual transcript from the
		// range it actually covers.
		generating?: boolean;
	} = $props();

	const trimActive = $derived(trimStart > 0 || trimEnd < sourceDuration);

	type Status = 'idle' | 'transcribing' | 'done' | 'error';

	let status = $state<Status>(segments.length ? 'done' : 'idle');
	let progress = $state(0);
	// 0 until the model download starts, 100 once weights are cached. Only the
	// WebGPU path ever moves this — the CPU model is fetched by whisper.cpp
	// itself with no progress signal.
	let downloadPercent = $state(0);
	let startedAt = $state(0);
	let errorMessage = $state('');
	// Which engine this run picked, and why. Null until the first run resolves
	// it — there is nothing honest to display before detection has happened.
	let engine = $state<BackendSelection | null>(null);
	// Speed/accuracy tier for the GPU path. 'quality' is whisper-base (default),
	// 'fast' is whisper-tiny. Ignored by the CPU path, which has one model.
	let quality = $state<TranscriptionQuality>('quality');
	const etaSeconds = $derived(estimateRemainingSeconds(startedAt, progress));

	// If trim changes after a transcript already exists, its timestamps no
	// longer correspond to the new range — clear it rather than leaving it
	// silently stale, same philosophy as editSegmentText dropping word-level
	// timing on a manual edit. clearedByTrimChange drives an explanatory
	// message so this doesn't look like captions just vanished for no
	// reason — reset the moment a fresh transcript exists again.
	let prevTrimStart = trimStart;
	let prevTrimEnd = trimEnd;
	let clearedByTrimChange = $state(false);

	$effect(() => {
		if ((trimStart !== prevTrimStart || trimEnd !== prevTrimEnd) && segments.length > 0) {
			segments = [];
			status = 'idle';
			clearedByTrimChange = true;
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
	let transcriptExpanded = $state(false);
	let transcriptEl = $state<HTMLParagraphElement | undefined>(undefined);
	let transcriptOverflows = $state(false);
	$effect(() => {
		transcript;
		transcriptExpanded;
		if (transcriptEl) {
			transcriptOverflows = transcriptEl.scrollHeight > transcriptEl.clientHeight;
		}
	});

	function editSegmentText(index: number, text: string) {
		// Editing invalidates that segment's word-level timing (it no longer
		// matches the edited text), so drop it — burn-in falls back to
		// plain (non-karaoke) text for this segment instead of highlighting
		// against stale word boundaries.
		segments[index] = { ...segments[index], text, words: undefined };
	}

	// Always extracts a clean mono 16kHz WAV via ffmpeg before transcribing
	// — not just when trim is active. Whisper's own audio loader
	// (@transcribe/transcriber's audioFileToPcm32) hands the raw file
	// straight to the browser's decodeAudioData(), which can fail on
	// large/high-bitrate video (confirmed: a 140MB, ~39Mbps 2560x1440
	// screen recording reliably failed there) — and that library swallows
	// the real decode error, returning null, which then crashes deep in
	// the whisper WASM module trying to read `.length` off it. Extracting
	// a small, uncompressed, already-whisper-format audio file up front
	// sidesteps the browser's container decoding entirely, for every file
	// (trimmed or not), not just an edge case.
	// Re-encodes (doesn't stream-copy) so an active trim's cut lands
	// exactly at trimStart — a copy-mode trim can only cut at keyframes,
	// which could desync the transcript from the frame-accurate trim the
	// real export applies later.
	// Splits the extracted audio into TRANSCRIBE_CHUNK_SECONDS-long WAV
	// files via ffmpeg's segment muxer in the same pass, rather than
	// extracting one long WAV and slicing it in JS — see
	// TRANSCRIBE_CHUNK_SECONDS for why chunked transcription exists.
	async function extractAudioChunksForTranscription(): Promise<AudioChunk[]> {
		const ffmpeg = await loadFFmpeg();
		const inputName = 'caption-audio-input.mp4';
		const chunkPattern = 'caption-audio-chunk-%03d.wav';
		await ffmpeg.writeFile(inputName, await fetchFile(file));
		await ffmpeg.exec([
			...(trimActive ? ['-ss', String(trimStart), '-t', String(trimEnd - trimStart)] : []),
			'-i',
			inputName,
			'-vn',
			'-ac',
			'1',
			'-ar',
			'16000',
			'-c:a',
			'pcm_s16le',
			'-f',
			'segment',
			'-segment_time',
			String(TRANSCRIBE_CHUNK_SECONDS),
			'-reset_timestamps',
			'1',
			chunkPattern
		]);

		const chunkNames = (await ffmpeg.listDir('/'))
			.map((entry) => entry.name)
			.filter((name) => /^caption-audio-chunk-\d+\.wav$/.test(name))
			.sort();

		const chunks: AudioChunk[] = [];
		for (let i = 0; i < chunkNames.length; i++) {
			const data = await ffmpeg.readFile(chunkNames[i]);
			chunks.push({
				file: new File([new Uint8Array(data as Uint8Array)], chunkNames[i], { type: 'audio/wav' }),
				offsetSeconds: i * TRANSCRIBE_CHUNK_SECONDS
			});
		}

		// This ffmpeg instance is shared with (and outlives this call into)
		// the main export flow — leaving these behind on its virtual FS just
		// adds unnecessary memory pressure for whatever runs next, so clean
		// up now that the chunk data has been copied out into `chunks`.
		await ffmpeg.deleteFile(inputName);
		for (const name of chunkNames) {
			await ffmpeg.deleteFile(name);
		}

		return chunks;
	}

	// GPU path counterpart to extractAudioChunksForTranscription: same flags and
	// the same re-encoding trim handling, but one continuous WAV instead of 30s
	// segments, because transformers.js does its own overlapping-stride chunking
	// and merges boundaries better than a hard cut can.
	async function extractAudioForTranscription(): Promise<Float32Array> {
		const ffmpeg = await loadFFmpeg();
		const inputName = 'caption-audio-input.mp4';
		const outputName = 'caption-audio.wav';
		await ffmpeg.writeFile(inputName, await fetchFile(file));
		await ffmpeg.exec([
			...(trimActive ? ['-ss', String(trimStart), '-t', String(trimEnd - trimStart)] : []),
			'-i',
			inputName,
			'-vn',
			'-ac',
			'1',
			'-ar',
			'16000',
			'-c:a',
			'pcm_s16le',
			outputName
		]);

		const data = (await ffmpeg.readFile(outputName)) as Uint8Array;
		// Copy out before deleting, then free the virtual FS entries — this
		// ffmpeg instance is shared with the export flow and outlives this call.
		const samples = wavToFloat32(
			data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer
		);
		await ffmpeg.deleteFile(inputName);
		await ffmpeg.deleteFile(outputName);
		return samples;
	}

	async function generate() {
		status = 'transcribing';
		progress = 0;
		downloadPercent = 0;
		startedAt = Date.now();
		errorMessage = '';
		clearedByTrimChange = false;
		transcriptExpanded = false;
		generating = true;

		try {
			const selection = await pickBackend();
			// Surfaced in the UI, not just the console: "why did this run on CPU"
			// was unanswerable without devtools, and the most common cause
			// (hardware acceleration switched off) is one the user can fix.
			engine = selection;
			// Restart the ETA clock at the first real transcription tick. Elapsed
			// time before that point is model download plus (on the GPU path)
			// shader compilation — one-off costs that don't recur per percent, so
			// extrapolating from them made early estimates absurd: a run showing
			// 3% reported ~51 minutes remaining.
			let timingTranscription = false;
			const onProgress = (update: TranscribeProgress) => {
				if (update.phase === 'downloading') {
					downloadPercent = Math.round(update.percent);
				} else {
					downloadPercent = 100;
					if (!timingTranscription) {
						timingTranscription = true;
						startedAt = Date.now();
					}
					progress = Math.round(update.percent);
				}
			};

			segments =
				selection.backend === 'webgpu'
					? await transcribe(
							{
								backend: 'webgpu',
								getAudio: extractAudioForTranscription,
								options: { quality, wordTimestamps: style.wordHighlight }
							},
							onProgress,
							async () => {
								// Reached only once the GPU attempt (extraction or
								// transcription) has actually failed — restart the ETA
								// clock and clear the download banner so the fallback's
								// timing/UI isn't polluted by the failed attempt, then
								// extract fresh audio for the CPU path (never reuse
								// anything left over from the GPU attempt).
								startedAt = Date.now();
								downloadPercent = 0;
								progress = 0;
								// The badge claimed GPU; the run is finishing on CPU. Say
								// so rather than leaving a stale, now-wrong label up.
								engine = { backend: 'wasm', reason: 'adapter-error' };
								return extractAudioChunksForTranscription();
							}
						)
					: await transcribe(
							{ backend: 'wasm', chunks: await extractAudioChunksForTranscription() },
							onProgress
						);
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
			resetFFmpeg();
		} finally {
			generating = false;
		}
	}
</script>

{#if status === 'idle'}
	{#if clearedByTrimChange}
		<p class="text-muted-foreground text-sm">
			Trim changed since these captions were generated, so they no longer match. Regenerate to
			pick up the new range.
		</p>
	{/if}
	<Button onclick={generate}>{clearedByTrimChange ? 'Regenerate captions' : 'Generate captions'}</Button>
	{#if trimActive}
		<p class="text-muted-foreground text-sm">
			Captions will be generated for the trimmed range ({formatTimecode(trimStart)}–{formatTimecode(
				trimEnd
			)}) only.
		</p>
	{/if}
{:else if status === 'transcribing'}
	{#if downloadPercent > 0 && downloadPercent < 100}
		<p class="text-muted-foreground text-sm">
			Downloading speech model, one time, about 130&nbsp;MB ({downloadPercent}%)
		</p>
	{/if}
	<p class="text-muted-foreground text-sm">
		Transcribing{engine ? ` on ${backendLabel(engine)}` : ''}… {progress}%{etaSeconds !== null
			? `, about ${formatEta(etaSeconds)} remaining`
			: ''}
	</p>
	{@render engineHint()}
{:else if status === 'error'}
	<p class="text-destructive text-sm">Something went wrong: {errorMessage}</p>
	<Button onclick={generate}>Retry</Button>
{/if}

{#snippet engineHint()}
	{#if engine && isFixableByUser(engine)}
		<p class="text-muted-foreground text-sm">
			Running on CPU because no GPU was available. Turning on hardware acceleration in your
			browser settings, then reloading, will make transcription substantially faster.
		</p>
	{/if}
{/snippet}

{#if status === 'done'}
	{#if engine}
		<p class="text-muted-foreground text-xs" title={explainBackend(engine)}>
			Transcribed on {backendLabel(engine)}
		</p>
	{/if}
	{@render engineHint()}
	<div class="space-y-1">
		<h3 class="text-muted-foreground text-sm font-medium">Transcript</h3>
		<p
			bind:this={transcriptEl}
			class="text-sm whitespace-pre-wrap {transcriptExpanded ? '' : 'line-clamp-4'}"
		>
			{transcript}
		</p>
		{#if transcriptOverflows || transcriptExpanded}
			<Button
				variant="link"
				class="h-auto p-0 text-xs"
				onclick={() => (transcriptExpanded = !transcriptExpanded)}
			>
				{transcriptExpanded ? 'Show less' : 'Show more'}
			</Button>
		{/if}
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
