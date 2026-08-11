<script lang="ts">
	import { Slider as SliderPrimitive } from "bits-ui";
	import { cn, type WithoutChildrenOrChild } from "$lib/utils.js";

	let {
		ref = $bindable(null),
		value = $bindable(),
		orientation = "horizontal",
		class: className,
		...restProps
	}: WithoutChildrenOrChild<SliderPrimitive.RootProps> = $props();
</script>

<!--
Discriminated Unions + Destructing (required for bindable) do not
get along, so we shut typescript up by casting `value` to `never`.
-->
<SliderPrimitive.Root
	bind:ref
	bind:value={value as never}
	data-slot="slider"
	{orientation}
	class={cn(
		"relative flex w-full touch-none items-center select-none data-disabled:opacity-50 data-[orientation=vertical]:min-h-40 data-[orientation=vertical]:h-full data-[orientation=vertical]:w-auto data-[orientation=vertical]:flex-col",
		className
	)}
	{...restProps}
>
	{#snippet children({ thumbItems })}
		<span
			data-slot="slider-track"
			data-orientation={orientation}
			class={cn(
				"rounded-full bg-muted relative grow overflow-hidden data-[orientation=horizontal]:h-2.5 data-[orientation=horizontal]:w-full data-[orientation=vertical]:h-full data-[orientation=vertical]:w-2.5"
			)}
		>
			<SliderPrimitive.Range
				data-slot="slider-range"
				class={cn(
					"absolute select-none rounded-full data-[orientation=horizontal]:h-full data-[orientation=vertical]:w-full",
					"bg-[linear-gradient(90deg,var(--primary),color-mix(in_oklch,var(--primary),white_35%))]"
				)}
			/>
		</span>
		{#each thumbItems as thumb (thumb.index)}
			<SliderPrimitive.Thumb
				data-slot="slider-thumb"
				index={thumb.index}
				class="relative size-3 rounded-full bg-white transition-[box-shadow] block shrink-0 select-none disabled:pointer-events-none disabled:opacity-50 after:absolute after:-inset-2 shadow-[0_0_0_4px_color-mix(in_oklch,var(--primary),transparent_65%),0_0_10px_2px_color-mix(in_oklch,var(--primary),transparent_50%)]"
			/>
		{/each}
	{/snippet}
</SliderPrimitive.Root>
