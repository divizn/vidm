<script lang="ts">
	let {
		min,
		max,
		ticks
	}: { min: number; max: number; ticks: { value: number; label: string }[] } = $props();

	function positionPercent(value: number): number {
		return ((value - min) / (max - min)) * 100;
	}

	function translateClass(percent: number): string {
		if (percent <= 0) return 'translate-x-0';
		if (percent >= 100) return '-translate-x-full';
		return '-translate-x-1/2';
	}
</script>

<div class="relative h-7 w-full text-xs">
	{#each ticks as tick (tick.value)}
		{@const percent = positionPercent(tick.value)}
		<div
			class="text-muted-foreground absolute top-0 flex flex-col items-center gap-0.5 {translateClass(
				percent
			)}"
			style:left={`${percent}%`}
		>
			<span class="bg-border h-1.5 w-px"></span>
			<span class="whitespace-nowrap">{tick.label}</span>
		</div>
	{/each}
</div>
