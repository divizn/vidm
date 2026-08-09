<script lang="ts">
	import { themeState, toggleTheme } from '$lib/theme.svelte';
	import { Button } from '$lib/components/ui/button';
	import SunIcon from '@lucide/svelte/icons/sun';
	import MoonIcon from '@lucide/svelte/icons/moon';
</script>

<Button
	variant="ghost"
	size="icon"
	onclick={toggleTheme}
	aria-label={themeState.current === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
>
	{#if themeState.current === 'dark'}
		<SunIcon class="size-4" />
	{:else}
		<MoonIcon class="size-4" />
	{/if}
</Button>
