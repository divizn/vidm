<script lang="ts">
	import { GIF_QUALITY_PRESETS, type GifQualityPreset, type OutputFormat } from '$lib/ffmpeg/filters';
	import { RadioGroup, RadioGroupItem } from '$lib/components/ui/radio-group';
	import { Label } from '$lib/components/ui/label';

	let {
		outputFormat = $bindable(),
		gifQuality = $bindable()
	}: { outputFormat: OutputFormat; gifQuality: GifQualityPreset } = $props();

	const formats: { value: OutputFormat; label: string }[] = [
		{ value: 'mp4', label: 'MP4' },
		{ value: 'gif', label: 'GIF' }
	];
</script>

<fieldset class="space-y-3">
	<legend class="mb-1 text-sm font-semibold">Output format</legend>
	<RadioGroup
		value={outputFormat}
		onValueChange={(v) => (outputFormat = v as OutputFormat)}
		class="flex w-auto flex-row gap-4"
	>
		{#each formats as format (format.value)}
			<div class="flex items-center gap-2">
				<RadioGroupItem value={format.value} id="output-format-{format.value}" />
				<Label for="output-format-{format.value}" class="cursor-pointer font-normal"
					>{format.label}</Label
				>
			</div>
		{/each}
	</RadioGroup>

	{#if outputFormat === 'gif'}
		<div class="space-y-1.5">
			<span class="text-sm font-normal">GIF quality</span>
			<RadioGroup
				value={gifQuality.label}
				onValueChange={(v) => (gifQuality = GIF_QUALITY_PRESETS.find((p) => p.label === v)!)}
				class="flex w-auto flex-row flex-wrap gap-4"
			>
				{#each GIF_QUALITY_PRESETS as preset (preset.label)}
					<div class="flex items-center gap-2">
						<RadioGroupItem value={preset.label} id="gif-quality-{preset.label}" />
						<Label for="gif-quality-{preset.label}" class="cursor-pointer font-normal"
							>{preset.label}</Label
						>
					</div>
				{/each}
			</RadioGroup>
			<p class="text-muted-foreground text-sm">
				GIFs have no audio — Volume and Compression are disabled while GIF is selected.
			</p>
		</div>
	{/if}
</fieldset>
