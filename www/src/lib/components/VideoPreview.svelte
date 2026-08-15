<script lang="ts">
	import { Card, CardContent } from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';

	let { src, downloadName }: { src: string; downloadName: string } = $props();
	// A GIF blob URL can't play in a <video> element: browsers don't decode
	// GIF as a video source at all.
	const isGif = $derived(downloadName.toLowerCase().endsWith('.gif'));
</script>

<Card class="w-fit">
	<CardContent class="flex flex-col items-center gap-3">
		{#if isGif}
			<img {src} alt="Exported GIF" class="max-h-[70vh] max-w-80 rounded-md bg-black" />
		{:else}
			<!-- svelte-ignore a11y_media_has_caption -->
			<video controls {src} class="max-h-[70vh] max-w-80 rounded-md bg-black"></video>
		{/if}
		<Button href={src} download={downloadName}>Download {downloadName}</Button>
	</CardContent>
</Card>
