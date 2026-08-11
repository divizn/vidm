<script lang="ts">
	let {
		min,
		max,
		ticks
	}: { min: number; max: number; ticks: { value: number; label: string }[] } = $props();

	function positionPercent(value: number): number {
		return ((value - min) / (max - min)) * 100;
	}
</script>

<div class="relative h-4 w-full text-xs">
	{#each ticks as tick (tick.value)}
		<div
			class="text-muted-foreground absolute top-0 flex -translate-x-1/2 flex-col items-center gap-0.5"
			style:left={`${positionPercent(tick.value)}%`}
		>
			<span class="bg-border h-1.5 w-px"></span>
			<span class="whitespace-nowrap">{tick.label}</span>
		</div>
	{/each}
</div>
