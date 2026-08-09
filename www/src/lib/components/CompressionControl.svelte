<script lang="ts">
	import {
		COMPRESSION_PRESETS,
		MIN_CRF,
		MAX_CRF,
		type CompressionSettings,
		type CompressionMode
	} from '$lib/ffmpeg/filters';
	import { RadioGroup, RadioGroupItem } from '$lib/components/ui/radio-group';
	import { Label } from '$lib/components/ui/label';
	import { Input } from '$lib/components/ui/input';
	import { Slider } from '$lib/components/ui/slider';

	let {
		compression = $bindable(),
		disabled = false
	}: { compression: CompressionSettings; disabled?: boolean } = $props();

	const modes: { value: CompressionMode; label: string }[] = [
		{ value: 'none', label: 'None' },
		{ value: 'preset', label: 'Quality preset' },
		{ value: 'size', label: 'Target file size' },
		{ value: 'custom', label: 'Custom (CRF)' }
	];

	function setMode(mode: CompressionMode) {
		compression = { ...compression, mode };
	}
</script>

<fieldset {disabled} class="space-y-3">
	<legend class="mb-1 text-sm font-semibold">Compression</legend>

	<RadioGroup
		value={compression.mode}
		onValueChange={(v) => setMode(v as CompressionMode)}
		{disabled}
		class="flex w-auto flex-row flex-wrap gap-4"
	>
		{#each modes as m (m.value)}
			<div class="flex items-center gap-2">
				<RadioGroupItem value={m.value} id="compression-mode-{m.value}" />
				<Label for="compression-mode-{m.value}" class="cursor-pointer font-normal">{m.label}</Label
				>
			</div>
		{/each}
	</RadioGroup>

	{#if compression.mode === 'none'}
		<span class="text-muted-foreground text-sm"
			>Uses the encoder's default quality — no explicit target.</span
		>
	{:else if compression.mode === 'preset'}
		<div class="flex flex-wrap items-center gap-4">
			<RadioGroup
				value={String(compression.crf)}
				onValueChange={(v) => (compression = { ...compression, crf: Number(v) })}
				{disabled}
				class="flex w-auto flex-row flex-wrap gap-4"
			>
				{#each COMPRESSION_PRESETS as preset (preset.label)}
					<div class="flex items-center gap-2">
						<RadioGroupItem value={String(preset.crf)} id="compression-preset-{preset.crf}" />
						<Label for="compression-preset-{preset.crf}" class="cursor-pointer font-normal"
							>{preset.label}</Label
						>
					</div>
				{/each}
			</RadioGroup>
		</div>
	{:else if compression.mode === 'size'}
		<div class="flex flex-wrap items-center gap-3">
			<Label for="target-size" class="font-normal">Target size:</Label>
			<Input
				id="target-size"
				type="number"
				min="1"
				step="1"
				class="w-20"
				bind:value={compression.targetMB}
			/>
			<span class="text-sm">MB</span>
			<span class="text-muted-foreground text-sm">Approximate, not exact — single-pass encode.</span
			>
		</div>
	{:else}
		<div class="flex max-w-sm flex-wrap items-center gap-3">
			<Label for="crf-slider" class="font-normal">CRF:</Label>
			<Slider
				id="crf-slider"
				type="single"
				min={MIN_CRF}
				max={MAX_CRF}
				value={compression.crf}
				onValueChange={(v) => (compression = { ...compression, crf: v })}
				{disabled}
				class="w-40"
			/>
			<span class="text-sm tabular-nums">{compression.crf}</span>
			<span class="text-muted-foreground w-full text-sm"
				>Lower = higher quality, larger file.</span
			>
		</div>
	{/if}
</fieldset>
