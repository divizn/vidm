<script lang="ts">
	import { untrack } from 'svelte';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import InstallButton from '$lib/components/InstallButton.svelte';
	import { install } from '$lib/offline/install.svelte';
	import { offline, saveForOffline } from '$lib/offline/state.svelte';
	import { toMB, type SetId } from '$lib/offline/sets';

	let { open = $bindable(false) } = $props();

	let captions = $state(false);
	let done = $state(false);

	const editingSaved = $derived(offline.status.editing !== 'missing');
	const chosen = $derived<SetId[]>(
		(['editing', 'captions'] as const).filter(
			(s) => offline.status[s] === 'missing' && (s === 'editing' || captions)
		)
	);
	const bytes = (s: SetId) => offline.manifest?.sets[s].bytes ?? 0;
	const downloadMB = $derived(toMB(chosen.reduce((sum, s) => sum + bytes(s), 0)));

	$effect(() => {
		if (!open) return;
		untrack(() => {
			done = false;
			captions = offline.status.editing !== 'missing';
			offline.error = '';
		});
	});

	async function download() {
		await saveForOffline(chosen);
		if (!offline.error) done = true;
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Content>
		{#if done}
			<Dialog.Header>
				<Dialog.Title>vidm now works offline.</Dialog.Title>
			</Dialog.Header>
			<InstallButton />
			<Dialog.Footer showCloseButton />
		{:else}
			<Dialog.Header>
				<Dialog.Title>Use vidm offline?</Dialog.Title>
			</Dialog.Header>
			<div class="space-y-3">
				{#if !editingSaved}
					<div class="flex items-start gap-2">
						<Checkbox id="offline-editing" checked disabled class="mt-0.5" />
						<label for="offline-editing" class="grid gap-0.5">
							<span>Video editing ({toMB(bytes('editing'))} MB)</span>
							<span class="text-muted-foreground">trim, reformat, speed, compress, export</span>
						</label>
					</div>
				{/if}
				<div class="flex items-start gap-2">
					<Checkbox id="offline-captions" bind:checked={captions} class="mt-0.5" />
					<label for="offline-captions" class="grid gap-0.5">
						<span>Auto-captions too (+{toMB(bytes('captions'))} MB)</span>
						<span class="text-muted-foreground">otherwise saved the first time you use them</span>
					</label>
				</div>
			</div>
			{#if offline.error}
				<p class="text-destructive">{offline.error}</p>
			{/if}
			<Dialog.Description class="text-xs">
				Your videos are never uploaded. You can remove these files from your browser's site settings.
			</Dialog.Description>
			{#if install.mode === 'ios'}
				<p class="text-muted-foreground text-xs">
					Safari may clear offline files after about a week without a visit, unless vidm is on your
					Home Screen.
				</p>
			{/if}
			<InstallButton />
			<Dialog.Footer>
				<Dialog.Close>
					{#snippet child({ props })}
						<Button variant="outline" {...props}>Not now</Button>
					{/snippet}
				</Dialog.Close>
				<Button onclick={download} disabled={!!offline.progress || chosen.length === 0}>
					{#if offline.progress}
						Saving… {toMB(offline.progress.done)} / {toMB(offline.progress.total)} MB
					{:else}
						Download {downloadMB} MB
					{/if}
				</Button>
			</Dialog.Footer>
		{/if}
	</Dialog.Content>
</Dialog.Root>
