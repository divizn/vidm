<script lang="ts">
	import {
		COMPRESSION_PRESETS,
		MIN_CRF,
		MAX_CRF,
		type CompressionSettings,
		type CompressionMode
	} from '$lib/ffmpeg/filters';

	let {
		compression = $bindable(),
		disabled = false
	}: { compression: CompressionSettings; disabled?: boolean } = $props();

	const modes: { value: CompressionMode; label: string }[] = [
		{ value: 'preset', label: 'Quality preset' },
		{ value: 'size', label: 'Target file size' },
		{ value: 'custom', label: 'Custom (CRF)' }
	];

	function setMode(mode: CompressionMode) {
		compression = { ...compression, mode };
	}
</script>

<fieldset {disabled}>
	<legend>Compression</legend>

	<div class="modes">
		{#each modes as m (m.value)}
			<label>
				<input
					type="radio"
					name="compression-mode"
					checked={compression.mode === m.value}
					onchange={() => setMode(m.value)}
				/>
				{m.label}
			</label>
		{/each}
	</div>

	{#if compression.mode === 'preset'}
		<div class="row">
			{#each COMPRESSION_PRESETS as preset (preset.label)}
				<label>
					<input
						type="radio"
						name="compression-preset"
						checked={compression.crf === preset.crf}
						onchange={() => (compression = { ...compression, crf: preset.crf })}
					/>
					{preset.label}
				</label>
			{/each}
		</div>
	{:else if compression.mode === 'size'}
		<div class="row">
			<label>
				Target size:
				<input
					type="number"
					min="1"
					step="1"
					bind:value={compression.targetMB}
				/>
				MB
			</label>
			<span class="hint">Approximate, not exact — single-pass encode.</span>
		</div>
	{:else}
		<div class="row">
			<label>
				CRF:
				<input
					type="range"
					min={MIN_CRF}
					max={MAX_CRF}
					bind:value={compression.crf}
				/>
				{compression.crf}
			</label>
			<span class="hint">Lower = higher quality, larger file.</span>
		</div>
	{/if}
</fieldset>

<style>
	fieldset {
		border: none;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	legend {
		font-weight: 600;
		margin-bottom: 0.35rem;
	}

	.modes,
	.row {
		display: flex;
		gap: 1rem;
		align-items: center;
		flex-wrap: wrap;
	}

	label {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		cursor: pointer;
	}

	.hint {
		font-size: 0.85rem;
		color: #666;
	}

	input[type='number'] {
		width: 4rem;
	}
</style>
