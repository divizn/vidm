<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	import Footer from '$lib/components/Footer.svelte';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<div class="bg-card mx-auto flex min-h-screen max-w-2xl flex-col px-4">
	<div class="flex-1">
		{@render children()}
	</div>
	<Footer />
</div>
