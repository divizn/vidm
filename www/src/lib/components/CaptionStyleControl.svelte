<script lang="ts">
	import {
		CAPTION_FONTS,
		CAPTION_POSITIONS,
		MIN_FONT_SIZE_PERCENT,
		MAX_FONT_SIZE_PERCENT,
		type CaptionStyle,
		type CaptionPosition
	} from '$lib/captions/style';
	import { RadioGroup, RadioGroupItem } from '$lib/components/ui/radio-group';
	import { Label } from '$lib/components/ui/label';
	import { Input } from '$lib/components/ui/input';
	import { Slider } from '$lib/components/ui/slider';

	let {
		style = $bindable(),
		disabled = false
	}: { style: CaptionStyle; disabled?: boolean } = $props();
</script>

<fieldset {disabled} class="space-y-3">
	<legend class="mb-1 text-sm font-semibold">Caption style</legend>

	<div class="flex flex-wrap items-center gap-4">
		<RadioGroup
			value={style.font.label}
			onValueChange={(v) =>
				(style = { ...style, font: CAPTION_FONTS.find((f) => f.label === v) ?? style.font })}
			{disabled}
			class="flex w-auto flex-row flex-wrap gap-4"
		>
			{#each CAPTION_FONTS as font (font.label)}
				<div class="flex items-center gap-2">
					<RadioGroupItem value={font.label} id="caption-font-{font.label}" />
					<Label for="caption-font-{font.label}" class="cursor-pointer font-normal"
						>{font.label}</Label
					>
				</div>
			{/each}
		</RadioGroup>
	</div>

	<div class="flex flex-wrap items-center gap-4">
		<RadioGroup
			value={style.position}
			onValueChange={(v) => (style = { ...style, position: v as CaptionPosition })}
			{disabled}
			class="flex w-auto flex-row flex-wrap gap-4"
		>
			{#each CAPTION_POSITIONS as pos (pos.value)}
				<div class="flex items-center gap-2">
					<RadioGroupItem value={pos.value} id="caption-pos-{pos.value}" />
					<Label for="caption-pos-{pos.value}" class="cursor-pointer font-normal">{pos.label}</Label
					>
				</div>
			{/each}
		</RadioGroup>
	</div>

	<div class="flex max-w-sm flex-wrap items-center gap-3">
		<Label for="caption-size-slider" class="font-normal">Size:</Label>
		<Slider
			id="caption-size-slider"
			type="single"
			min={MIN_FONT_SIZE_PERCENT}
			max={MAX_FONT_SIZE_PERCENT}
			value={style.fontSizePercent}
			onValueChange={(v) => (style = { ...style, fontSizePercent: v })}
			{disabled}
			class="w-40"
		/>
		<span class="text-sm tabular-nums">{style.fontSizePercent}%</span>
	</div>

	<div class="flex flex-wrap items-center gap-4">
		<div class="flex items-center gap-2">
			<Label for="caption-text-color" class="font-normal">Text</Label>
			<Input
				id="caption-text-color"
				type="color"
				class="h-8 w-14 p-1"
				bind:value={style.textColor}
			/>
		</div>
		<div class="flex items-center gap-2">
			<Label for="caption-highlight-color" class="font-normal">Highlight</Label>
			<Input
				id="caption-highlight-color"
				type="color"
				class="h-8 w-14 p-1"
				bind:value={style.highlightColor}
			/>
		</div>
	</div>
</fieldset>
