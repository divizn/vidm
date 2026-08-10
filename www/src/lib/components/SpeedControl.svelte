<script lang="ts">
	import { RadioGroup, RadioGroupItem } from '$lib/components/ui/radio-group';
	import { Label } from '$lib/components/ui/label';

	let {
		speed = $bindable(),
		disabled = false
	}: { speed: number; disabled?: boolean } = $props();

	const options = [0.5, 0.75, 1.25, 1.5, 2];
</script>

<fieldset {disabled} class="space-y-2">
	<legend class="mb-1 text-sm font-semibold">Playback speed</legend>
	<RadioGroup
		value={String(speed)}
		onValueChange={(v) => (speed = Number(v))}
		{disabled}
		class="flex w-auto flex-row flex-wrap gap-4"
	>
		{#each options as option (option)}
			<div class="flex items-center gap-2">
				<RadioGroupItem value={String(option)} id="speed-{option}" />
				<Label for="speed-{option}" class="cursor-pointer font-normal">{option}x</Label>
			</div>
		{/each}
	</RadioGroup>
</fieldset>
