<script lang="ts">
	import { cn } from '$lib/utils';

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
	class={cn(
		'border-input bg-muted/30 hover:bg-muted/50 flex min-h-48 cursor-pointer items-center justify-center rounded-lg border-2 border-dashed p-6 text-center transition-colors',
		isDragging && 'border-primary bg-primary/5',
		disabled && 'pointer-events-none opacity-50'
	)}
	ondragover={(e) => {
		e.preventDefault();
		isDragging = true;
	}}
	ondragleave={() => (isDragging = false)}
	ondrop={handleDrop}
>
	<input type="file" accept="video/*" onchange={handleChange} {disabled} hidden />
	<span class="text-muted-foreground text-sm">Drop a video here, or click to choose a file</span>
</label>
