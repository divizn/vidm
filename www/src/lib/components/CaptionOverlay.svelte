<script lang="ts">
	import { getActiveCaption } from '$lib/captions/ass';
	import type { CaptionSegment } from '$lib/whisper/srt';
	import type { CaptionStyle } from '$lib/captions/style';

	let {
		segments,
		style,
		currentTime,
		containerHeight
	}: {
		segments: CaptionSegment[];
		style: CaptionStyle;
		currentTime: number;
		containerHeight: number;
	} = $props();

	const active = $derived(getActiveCaption(segments, currentTime));

	// Mirrors buildAssSubtitle's MarginV (6% of frame height), top/bottom
	// only, "middle" is always vertically centered regardless of margin,
	// same as the ASS alignment codes it approximates.
	const positionStyle = $derived(
		style.position === 'top'
			? 'top: 6%;'
			: style.position === 'bottom'
				? 'bottom: 6%;'
				: 'top: 50%; transform: translateY(-50%);'
	);

	// Relative to the video frame's own rendered height, same as
	// buildAssSubtitle sizing off PlayResY, not the viewport, so the
	// preview scales correctly regardless of how big the <video> is shown.
	const fontSizePx = $derived((style.fontSizePercent / 100) * containerHeight);
</script>

{#if active}
	<div
		class="pointer-events-none absolute inset-x-[5%] flex justify-center text-center"
		style={positionStyle}
	>
		<p
			style:font-family={style.font.assFamily}
			style:font-size={`${fontSizePx}px`}
			style:-webkit-text-stroke={`${Math.max(1, fontSizePx * 0.06)}px black`}
			style:text-shadow="0 0 0.15em black"
			class="m-0 leading-tight font-bold"
		>
			{#each active as word, i (i)}<span
					style:color={word.highlighted ? style.highlightColor : style.textColor}
					>{word.text}</span
				>{i < active.length - 1 ? ' ' : ''}{/each}
		</p>
	</div>
{/if}
