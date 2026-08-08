<script lang="ts">
	let { src, downloadName }: { src: string; downloadName: string } = $props();
</script>

<div class="preview">
	<!-- svelte-ignore a11y_media_has_caption -->
	<video controls {src}></video>
	<a href={src} download={downloadName}>Download {downloadName}</a>
</div>

<style>
	.preview {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.75rem;
	}

	video {
		max-width: 320px;
		max-height: 70vh;
		background: #000;
		border-radius: 0.5rem;
	}
</style>
