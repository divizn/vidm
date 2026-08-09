<script lang="ts">
	import PlayIcon from '@lucide/svelte/icons/play';
	import PauseIcon from '@lucide/svelte/icons/pause';
	import CaptionOverlay from './CaptionOverlay.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Slider } from '$lib/components/ui/slider';
	import type { CaptionSegment } from '$lib/whisper/srt';
	import type { CaptionStyle } from '$lib/captions/style';

	let { file, segments, style }: { file: File; segments: CaptionSegment[]; style: CaptionStyle } =
		$props();

	let videoEl: HTMLVideoElement | undefined = $state();
	let currentTime = $state(0);
	let duration = $state(0);
	let paused = $state(true);
	let containerHeight = $state(0);
	// True only while the user is dragging the scrub slider — avoids the
	// video's own timeupdate events fighting the drag position.
	let seeking = $state(false);

	const objectUrl = $derived(URL.createObjectURL(file));

	// Recomputed on every timeupdate (fires several times a second during
	// playback anyway) rather than via a ResizeObserver — cheap, and this is
	// only a preview widget, so staying stale until the next tick after a
	// window resize is an acceptable tradeoff for the simpler code.
	function onTimeUpdate() {
		if (!videoEl || seeking) return;
		currentTime = videoEl.currentTime;
		containerHeight = videoEl.clientHeight;
	}

	function onLoadedMetadata() {
		if (!videoEl) return;
		duration = videoEl.duration;
		containerHeight = videoEl.clientHeight;
	}

	function togglePlay() {
		if (!videoEl) return;
		if (videoEl.paused) videoEl.play();
		else videoEl.pause();
	}

	function onSeek(value: number) {
		seeking = true;
		currentTime = value;
		if (videoEl) videoEl.currentTime = value;
	}

	function onSeekCommit() {
		seeking = false;
	}

	function formatTime(seconds: number): string {
		const s = Math.floor(seconds % 60);
		const m = Math.floor(seconds / 60);
		return `${m}:${String(s).padStart(2, '0')}`;
	}

	// The browser's native right-click "Full screen"/"Picture in picture"
	// context menu fullscreens the bare <video> element, leaving the caption
	// overlay (a separate sibling element) behind — captions would just
	// disappear. There's no cross-browser API to fullscreen the video+overlay
	// pair together as one unit reliably, so block those entry points instead
	// (no `controls` attribute means there's no built-in fullscreen button to
	// worry about either).
	function onContextMenu(e: MouseEvent) {
		e.preventDefault();
	}
</script>

<div class="relative mx-auto max-w-[420px]">
	<!-- svelte-ignore a11y_media_has_caption -->
	<video
		bind:this={videoEl}
		src={objectUrl}
		playsinline
		disablePictureInPicture
		disableRemotePlayback
		oncontextmenu={onContextMenu}
		ontimeupdate={onTimeUpdate}
		onloadedmetadata={onLoadedMetadata}
		onplay={() => (paused = false)}
		onpause={() => (paused = true)}
		class="block w-full rounded-md bg-black"
	></video>
	{#if containerHeight > 0}
		<CaptionOverlay {segments} {style} {currentTime} {containerHeight} />
	{/if}
</div>

<!-- Custom controls, placed below the frame rather than the browser's
     native overlay controls — those would sit on top of bottom-positioned
     captions and make the preview unreadable. -->
<div class="mx-auto flex max-w-[420px] items-center gap-2 pt-2">
	<Button size="icon" variant="outline" onclick={togglePlay} aria-label={paused ? 'Play' : 'Pause'}>
		{#if paused}
			<PlayIcon class="size-4" />
		{:else}
			<PauseIcon class="size-4" />
		{/if}
	</Button>
	<span class="text-muted-foreground w-9 shrink-0 text-xs tabular-nums">{formatTime(currentTime)}</span>
	<Slider
		type="single"
		min={0}
		max={duration || 1}
		step={0.01}
		value={currentTime}
		onValueChange={onSeek}
		onValueCommit={onSeekCommit}
		class="flex-1"
	/>
	<span class="text-muted-foreground w-9 shrink-0 text-right text-xs tabular-nums"
		>{formatTime(duration)}</span
	>
</div>
<p class="text-muted-foreground mt-1.5 text-center text-sm">
	Preview only — text/timing match the export, exact framing depends on the reformat mode.
</p>
