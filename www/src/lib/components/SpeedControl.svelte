<script lang="ts">
	import { MIN_SPEED, MAX_SPEED } from '$lib/ffmpeg/filters';
	import { Slider } from '$lib/components/ui/slider';
	import { Label } from '$lib/components/ui/label';

	let {
		speed = $bindable(),
		disabled = false
	}: { speed: number; disabled?: boolean } = $props();

	const SPEED_STEP = 0.05;

	// Rounds to the nearest step so repeated 0.05 increments never drift
	// into floating-point noise (e.g. 1.2999999999999998) — done once
	// here, at the point speed is set, rather than reformatting it at
	// every display site.
	function onSpeedChange(value: number) {
		speed = Math.round(value * 20) / 20;
	}
</script>

<fieldset {disabled} class="space-y-2">
	<legend class="mb-1 text-sm font-semibold">Playback speed</legend>
	<div class="flex max-w-sm flex-wrap items-center gap-3">
		<Label for="speed-slider" class="font-normal">Speed:</Label>
		<Slider
			id="speed-slider"
			type="single"
			min={MIN_SPEED}
			max={MAX_SPEED}
			step={SPEED_STEP}
			value={speed}
			onValueChange={onSpeedChange}
			{disabled}
			class="w-40"
		/>
		<span class="text-sm tabular-nums">{speed.toFixed(2)}x</span>
	</div>
</fieldset>
