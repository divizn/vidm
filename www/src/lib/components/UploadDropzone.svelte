<script lang="ts">
	let { onFile, disabled = false }: { onFile: (file: File) => void; disabled?: boolean } =
		$props();

	let isDragging = $state(false);

	function handleDrop(event: DragEvent) {
		event.preventDefault();
		isDragging = false;
		const file = event.dataTransfer?.files?.[0];
		if (file) onFile(file);
	}

	function handleChange(event: Event) {
		const file = (event.target as HTMLInputElement).files?.[0];
		if (file) onFile(file);
	}
</script>

<label
	class="dropzone"
	class:dragging={isDragging}
	class:disabled
	ondragover={(e) => {
		e.preventDefault();
		isDragging = true;
	}}
	ondragleave={() => (isDragging = false)}
	ondrop={handleDrop}
>
	<input type="file" accept="video/*" onchange={handleChange} {disabled} hidden />
	<span>Drop a video here, or click to choose a file</span>
</label>

<style>
	.dropzone {
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 12rem;
		border: 2px dashed #888;
		border-radius: 0.5rem;
		cursor: pointer;
		text-align: center;
		padding: 1rem;
	}

	.dropzone.dragging {
		border-color: #4f46e5;
		background: rgba(79, 70, 229, 0.08);
	}

	.dropzone.disabled {
		opacity: 0.5;
		pointer-events: none;
	}
</style>
