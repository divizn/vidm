<script lang="ts">
	import type { ReformatMode } from '$lib/ffmpeg/filters';
	import { RadioGroup, RadioGroupItem } from '$lib/components/ui/radio-group';
	import { Label } from '$lib/components/ui/label';

	let {
		mode = $bindable(),
		disabled = false
	}: { mode: ReformatMode; disabled?: boolean } = $props();

	const options: { value: ReformatMode; label: string }[] = [
		{ value: 'crop', label: 'Center crop' },
		{ value: 'blur-pad', label: 'Blur padded' }
	];
</script>

<fieldset {disabled} class="space-y-2">
	<legend class="mb-1 text-sm font-semibold">Portrait format</legend>
	<RadioGroup
		value={mode}
		onValueChange={(v) => (mode = v as ReformatMode)}
		{disabled}
		class="flex w-auto flex-row gap-4"
	>
		{#each options as option (option.value)}
			<div class="flex items-center gap-2">
				<RadioGroupItem value={option.value} id="format-{option.value}" />
				<Label for="format-{option.value}" class="cursor-pointer font-normal">{option.label}</Label>
			</div>
		{/each}
	</RadioGroup>
</fieldset>
