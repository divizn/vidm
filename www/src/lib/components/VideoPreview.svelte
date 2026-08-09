<script lang="ts">
	import { Card, CardContent } from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';

	let { src, downloadName }: { src: string; downloadName: string } = $props();
</script>

<Card class="w-fit">
	<CardContent class="flex flex-col items-center gap-3">
		<!-- svelte-ignore a11y_media_has_caption -->
		<video controls {src} class="max-h-[70vh] max-w-80 rounded-md bg-black"></video>
		<Button href={src} download={downloadName}>Download {downloadName}</Button>
	</CardContent>
</Card>
