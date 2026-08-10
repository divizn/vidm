<script lang="ts">
	import { exportResult } from '$lib/export-state.svelte';
	import VideoPreview from '$lib/components/VideoPreview.svelte';
	import { Button } from '$lib/components/ui/button';

	// A real full-page navigation, not SvelteKit's client-side goto() — a
	// fresh document is required so a new FFmpeg() instance can load
	// cleanly for the next conversion (see the never-two-instances
	// constraint in $lib/ffmpeg/client.ts). This is also literally the
	// "refresh" the editor needs: all its component state resets for free.
	function backToEditor() {
		window.location.href = '/';
	}
</script>

<main class="flex flex-col items-center gap-5 py-8">
	{#if exportResult.url && exportResult.downloadName}
		<VideoPreview src={exportResult.url} downloadName={exportResult.downloadName} />
	{:else}
		<p class="text-muted-foreground text-sm">
			Nothing to show — go back and export a video first.
		</p>
	{/if}
	<Button onclick={backToEditor} variant="outline">← Back to editor</Button>
</main>
