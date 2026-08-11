<script lang="ts">
	import { Slider as SliderPrimitive } from 'bits-ui';
	import { cn, type WithoutChildrenOrChild } from '$lib/utils.js';

	// VLC-style wedge/cone volume slider: the track is clipped into a wedge
	// (thin at the quiet end, thick at the loud end), with a thin vertical
	// notch as the thumb instead of a round handle — visually distinct from
	// the generic bar Slider used elsewhere, but built on the same bits-ui
	// primitive for drag/keyboard/touch handling.
	let {
		ref = $bindable(null),
		value = $bindable(),
		class: className,
		...restProps
	}: WithoutChildrenOrChild<SliderPrimitive.RootProps> = $props();

	// Deeper wedge than the first pass — thinner at the quiet end (0%), much
	// thicker at the loud end (100%), for a more dramatic/visible cone shape
	// now that the track has more height (h-12) to work with.
	const WEDGE_CLIP =
		'polygon(0% 58%, 100% 4%, 100% 96%, 0% 42%)';
</script>

<SliderPrimitive.Root
	bind:ref
	bind:value={value as never}
	data-slot="volume-slider"
	orientation="horizontal"
	class={cn(
		'relative flex h-12 w-full touch-none items-center select-none data-disabled:opacity-50',
		className
	)}
	{...restProps}
>
	{#snippet children({ thumbItems })}
		<span
			data-slot="volume-slider-track"
			class="relative h-full w-full overflow-hidden bg-muted"
			style:clip-path={WEDGE_CLIP}
		>
			<SliderPrimitive.Range
				data-slot="volume-slider-range"
				class="absolute inset-y-0 left-0 bg-[linear-gradient(90deg,var(--primary),color-mix(in_oklch,var(--primary),white_35%))]"
			/>
		</span>
		{#each thumbItems as thumb (thumb.index)}
			<SliderPrimitive.Thumb
				data-slot="volume-slider-thumb"
				index={thumb.index}
				class="relative w-1 self-stretch rounded-sm bg-white shadow-[0_0_6px_rgba(0,0,0,0.5)] transition-shadow block select-none disabled:pointer-events-none disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-hidden after:absolute after:-inset-3"
			/>
		{/each}
	{/snippet}
</SliderPrimitive.Root>
