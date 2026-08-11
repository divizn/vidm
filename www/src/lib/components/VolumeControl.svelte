<script lang="ts">
	import { MIN_VOLUME, MAX_VOLUME } from '$lib/ffmpeg/filters';
	import { Slider } from '$lib/components/ui/slider';
	import { Label } from '$lib/components/ui/label';
	import SliderTicks from '$lib/components/SliderTicks.svelte';

	let {
		volume = $bindable(),
		disabled = false
	}: { volume: number; disabled?: boolean } = $props();

	const VOLUME_STEP = 0.05;
	const MIN_PERCENT = MIN_VOLUME * 100;
	const MAX_PERCENT = MAX_VOLUME * 100;

	// UI works in whole percent (0-200); filters.ts/buildExportArgs work in
	// the 0-2 multiplier the volume filter itself expects — convert at the
	// boundary rather than carrying two representations through the app.
	const volumePercent = $derived(Math.round(volume * 100));

	function onVolumeChange(percent: number) {
		volume = Math.round(percent) / 100;
	}
</script>

<fieldset {disabled} class="space-y-2">
	<legend class="mb-1 text-sm font-semibold">Volume</legend>
	<div class="flex items-center gap-3">
		<Label for="volume-slider" class="font-normal">Volume:</Label>
		<div class="flex-1 space-y-1.5">
			<Slider
				id="volume-slider"
				type="single"
				min={MIN_PERCENT}
				max={MAX_PERCENT}
				step={VOLUME_STEP * 100}
				value={volumePercent}
				onValueChange={onVolumeChange}
				{disabled}
				class="w-full"
			/>
			<SliderTicks min={MIN_PERCENT} max={MAX_PERCENT} ticks={[{ value: 100, label: 'Original' }]} />
		</div>
		<span class="text-sm tabular-nums">{volumePercent}%</span>
	</div>
	{#if volumePercent > 100}
		<p class="text-muted-foreground text-sm">
			The in-editor preview can't play louder than the original — boost above 100% is audible
			only in the exported file.
		</p>
	{/if}
</fieldset>
