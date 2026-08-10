<script lang="ts">
	import type { LucideIcon } from '@lucide/svelte';

	export interface ToolTabItem {
		id: string;
		label: string;
		icon: LucideIcon;
		enabled: boolean;
	}

	let {
		tabs,
		active,
		onActiveChange
	}: { tabs: ToolTabItem[]; active: string; onActiveChange: (id: string) => void } = $props();

	function tabClass(id: string): string {
		const base =
			'relative flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm transition-colors';
		return active === id
			? `${base} border-primary bg-primary/10 text-foreground`
			: `${base} border-transparent text-muted-foreground hover:bg-muted`;
	}
</script>

<div class="flex flex-wrap gap-2" role="tablist">
	{#each tabs as tab (tab.id)}
		{@const Icon = tab.icon}
		<button
			type="button"
			role="tab"
			aria-selected={active === tab.id}
			aria-label={tab.label}
			title={tab.label}
			class={tabClass(tab.id)}
			onclick={() => onActiveChange(tab.id)}
		>
			<Icon class="size-4" />
			{#if active === tab.id}
				<span>{tab.label}</span>
			{/if}
			{#if tab.enabled}
				<span
					class="bg-primary absolute -top-0.5 -right-0.5 size-2 rounded-full"
					aria-hidden="true"
				></span>
			{/if}
		</button>
	{/each}
</div>
