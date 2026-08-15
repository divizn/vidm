<script lang="ts">
	import type { LucideIcon } from '@lucide/svelte';

	export interface ToolTabItem {
		id: string;
		label: string;
		icon: LucideIcon;
		enabled: boolean;
		// Set to lock the tab out entirely (unclickable, dimmed), distinct
		// from `enabled` above, which just marks whether the tool already
		// has a real selection. The string is shown as the tab's tooltip in
		// place of its label, explaining why it's locked.
		disabledReason?: string;
	}

	let {
		tabs,
		active,
		onActiveChange
	}: { tabs: ToolTabItem[]; active: string; onActiveChange: (id: string) => void } = $props();

	function tabClass(id: string, locked: boolean): string {
		const base =
			'relative flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm transition-colors';
		if (locked) return `${base} border-transparent text-muted-foreground/50 cursor-not-allowed`;
		return active === id
			? `${base} border-primary bg-primary/10 text-foreground`
			: `${base} border-transparent text-muted-foreground hover:bg-muted`;
	}
</script>

<div class="flex flex-wrap gap-2" role="tablist">
	{#each tabs as tab (tab.id)}
		{@const Icon = tab.icon}
		{@const locked = !!tab.disabledReason}
		<button
			type="button"
			role="tab"
			aria-selected={active === tab.id}
			aria-disabled={locked}
			aria-label={tab.label}
			title={locked ? tab.disabledReason : tab.label}
			class={tabClass(tab.id, locked)}
			onclick={() => !locked && onActiveChange(tab.id)}
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
