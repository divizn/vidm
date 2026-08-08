<script lang="ts">
	import { ASPECT_RATIOS, type AspectRatio } from '$lib/ffmpeg/filters';

	let {
		ratio = $bindable(),
		disabled = false
	}: { ratio: AspectRatio; disabled?: boolean } = $props();
</script>

<fieldset {disabled}>
	<legend>Aspect ratio</legend>
	{#each ASPECT_RATIOS as option (option.label)}
		<label>
			<input
				type="radio"
				name="aspect-ratio"
				checked={ratio.label === option.label}
				onchange={() => (ratio = option)}
			/>
			{option.label}
		</label>
	{/each}
</fieldset>

<style>
	fieldset {
		display: flex;
		gap: 1rem;
		align-items: center;
		border: none;
		padding: 0;
		flex-wrap: wrap;
	}

	legend {
		font-weight: 600;
		margin-right: 0.5rem;
	}

	label {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		cursor: pointer;
	}
</style>
