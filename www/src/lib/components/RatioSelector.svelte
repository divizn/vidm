<script lang="ts">
	import { ASPECT_RATIOS, type AspectRatio } from '$lib/ffmpeg/filters';
	import { RadioGroup, RadioGroupItem } from '$lib/components/ui/radio-group';
	import { Label } from '$lib/components/ui/label';

	let {
		ratio = $bindable(),
		disabled = false
	}: { ratio: AspectRatio; disabled?: boolean } = $props();
</script>

<fieldset {disabled} class="space-y-2">
	<legend class="mb-1 text-sm font-semibold">Aspect ratio</legend>
	<RadioGroup
		value={ratio.label}
		onValueChange={(v) => (ratio = ASPECT_RATIOS.find((r) => r.label === v) ?? ratio)}
		{disabled}
		class="flex w-auto flex-row flex-wrap gap-4"
	>
		{#each ASPECT_RATIOS as option (option.label)}
			<div class="flex items-center gap-2">
				<RadioGroupItem value={option.label} id="ratio-{option.label}" />
				<Label for="ratio-{option.label}" class="cursor-pointer font-normal">{option.label}</Label>
			</div>
		{/each}
	</RadioGroup>
</fieldset>
