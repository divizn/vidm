<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	import Footer from '$lib/components/Footer.svelte';
	import { registerSW } from 'virtual:pwa-register';
	import { onMount } from 'svelte';
	import { autoUpdate, refreshOffline } from '$lib/offline/state.svelte';
	import { initInstall } from '$lib/offline/install.svelte';

	let { children } = $props();

	// no-op replaces the plugin's default window.location.reload() on update
	registerSW({ immediate: true, onNeedReload() {} });

	onMount(() => {
		const stopInstall = initInstall();
		(async () => {
			await refreshOffline();
			autoUpdate();
		})();
		return stopInstall;
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<link rel="manifest" href="/manifest.webmanifest" />
	<link rel="apple-touch-icon" href="/apple-touch-icon-180x180.png" />
</svelte:head>

<div class="bg-card mx-auto flex min-h-screen max-w-2xl flex-col px-4">
	<div class="flex-1">
		{@render children()}
	</div>
	<Footer />
</div>
