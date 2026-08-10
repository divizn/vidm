<script lang="ts">
	import { colorThemeState, setColorTheme, type ColorTheme } from '$lib/theme.svelte';
	import { Button } from '$lib/components/ui/button';
	import {
		DropdownMenu,
		DropdownMenuTrigger,
		DropdownMenuContent,
		DropdownMenuRadioGroup,
		DropdownMenuRadioItem
	} from '$lib/components/ui/dropdown-menu';
	import PaletteIcon from '@lucide/svelte/icons/palette';

	const PALETTES: { value: ColorTheme; label: string; swatch: string }[] = [
		{ value: 'warm', label: 'Warm', swatch: 'oklch(0.65 0.15 22)' },
		{ value: 'cool', label: 'Cool', swatch: 'oklch(0.6 0.15 250)' },
		{ value: 'high-contrast', label: 'High contrast', swatch: 'oklch(0.45 0.2 290)' }
	];

	function onValueChange(value: string) {
		setColorTheme(value as ColorTheme);
	}
</script>

<DropdownMenu>
	<DropdownMenuTrigger>
		{#snippet child({ props })}
			<Button {...props} variant="ghost" size="icon" aria-label="Choose color theme">
				<PaletteIcon class="size-4" />
			</Button>
		{/snippet}
	</DropdownMenuTrigger>
	<DropdownMenuContent align="end">
		<DropdownMenuRadioGroup value={colorThemeState.current} {onValueChange}>
			{#each PALETTES as palette (palette.value)}
				<DropdownMenuRadioItem value={palette.value}>
					<span
						class="mr-2 inline-block size-3 rounded-full border border-black/10"
						style={`background-color: ${palette.swatch}`}
					></span>
					{palette.label}
				</DropdownMenuRadioItem>
			{/each}
		</DropdownMenuRadioGroup>
	</DropdownMenuContent>
</DropdownMenu>
