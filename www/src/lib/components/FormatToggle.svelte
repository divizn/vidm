<script lang="ts">
	import type { ReformatMode } from '$lib/ffmpeg/filters';

	let {
		mode = $bindable(),
		disabled = false
	}: { mode: ReformatMode; disabled?: boolean } = $props();

	const options: { value: ReformatMode; label: string }[] = [
		{ value: 'crop', label: 'Center crop' },
		{ value: 'blur-pad', label: 'Blur padded' }
	];
</script>

<fieldset {disabled}>
	<legend>Portrait format</legend>
	{#each options as option (option.value)}
		<label>
			<input type="radio" name="reformat-mode" value={option.value} bind:group={mode} />
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
