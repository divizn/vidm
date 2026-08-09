<script lang="ts">
	import type { Snippet } from 'svelte';
	import { Card, CardHeader, CardTitle, CardAction, CardContent } from '$lib/components/ui/card';
	import { Switch } from '$lib/components/ui/switch';

	let {
		title,
		enabled,
		onEnabledChange,
		children
	}: {
		title: string;
		enabled: boolean;
		onEnabledChange: (value: boolean) => void;
		children?: Snippet;
	} = $props();
</script>

<Card>
	<CardHeader>
		<CardTitle>{title}</CardTitle>
		<CardAction>
			<Switch
				checked={enabled}
				onCheckedChange={onEnabledChange}
				aria-label={`Toggle ${title}`}
			/>
		</CardAction>
	</CardHeader>
	{#if enabled}
		<CardContent class="space-y-4">
			{@render children?.()}
		</CardContent>
	{/if}
</Card>
