<script lang="ts">
	import Share from '@lucide/svelte/icons/share';
	import { Button } from '$lib/components/ui/button';
	import { install, promptInstall } from '$lib/offline/install.svelte';

	const label = matchMedia('(pointer: coarse)').matches ? 'Add to Home Screen' : 'Install app';
	let showSteps = $state(false);
</script>

{#if install.mode === 'prompt'}
	<Button variant="outline" size="sm" class="justify-self-start" onclick={promptInstall}>{label}</Button>
{:else if install.mode === 'ios'}
	{#if showSteps}
		<ol class="text-muted-foreground space-y-1">
			<li class="flex items-center gap-1.5">
				1. Tap the Share button <Share class="size-4" aria-hidden="true" />
			</li>
			<li>2. Choose Add to Home Screen</li>
		</ol>
	{:else}
		<Button variant="outline" size="sm" class="justify-self-start" onclick={() => (showSteps = true)}>
			{label}
		</Button>
	{/if}
{/if}
