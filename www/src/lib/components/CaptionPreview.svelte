<script lang="ts">
	import CaptionOverlay from './CaptionOverlay.svelte';
	import { advancePreviewTime, parseSrtTimestamp } from '$lib/captions/ass';
	import type { CaptionSegment } from '$lib/whisper/srt';
	import type { CaptionStyle } from '$lib/captions/style';

	let { segments, style }: { segments: CaptionSegment[]; style: CaptionStyle } = $props();

	const PREVIEW_HEIGHT_PX = 224;

	let previewTime = $state(segments[0] ? parseSrtTimestamp(segments[0].from) : 0);

	// Auto-cycles the preview's synthetic clock — there's no real video/audio
	// to drive it, so this is a standalone rAF loop instead of a `timeupdate`
	// listener. `segments` is read fresh on every tick via the reactive prop
	// (not a snapshot captured at effect-start), so editing caption text
	// mid-preview stays in sync without restarting the loop.
	//
	// Checked once (not reactively) — there's no scrubbing/pause control by
	// design, so a user with prefers-reduced-motion set just gets the preview
	// parked on the first segment's start instead of looping indefinitely.
	const prefersReducedMotion =
		typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

	$effect(() => {
		if (prefersReducedMotion) return;

		let rafId: number;
		let lastTimestamp: number | undefined;

		function tick(timestamp: number) {
			if (lastTimestamp !== undefined) {
				const deltaSeconds = (timestamp - lastTimestamp) / 1000;
				previewTime = advancePreviewTime(previewTime, deltaSeconds, segments);
			}
			lastTimestamp = timestamp;
			rafId = requestAnimationFrame(tick);
		}

		rafId = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(rafId);
	});
</script>

<div
	class="relative mx-auto max-w-[420px] overflow-hidden rounded-md bg-black"
	style:height={`${PREVIEW_HEIGHT_PX}px`}
>
	<CaptionOverlay
		{segments}
		{style}
		currentTime={previewTime}
		containerHeight={PREVIEW_HEIGHT_PX}
	/>
</div>
<p class="text-muted-foreground mt-1.5 text-center text-sm">
	Preview of caption styling — cycles through your actual transcript, not the final video frame.
</p>
