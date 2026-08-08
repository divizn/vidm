<script lang="ts">
	let {
		speed = $bindable(),
		disabled = false
	}: { speed: number; disabled?: boolean } = $props();

	const options = [0.5, 0.75, 1, 1.25, 1.5, 2];
</script>

<fieldset {disabled}>
	<legend>Playback speed</legend>
	{#each options as option (option)}
		<label>
			<input type="radio" name="playback-speed" value={option} bind:group={speed} />
			{option}x
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
