# Color Theme Picker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a 3-palette color theme picker (warm/cool/high-contrast) on top of the existing light/dark toggle, where non-default palettes are lazy-loaded on first selection rather than shipped to every visitor.

**Architecture:** Palette is a second, independent state axis alongside the existing light/dark mode. The default "warm" palette stays inline in `app.css` (zero extra cost). "Cool" and "high-contrast" live in their own CSS files under `src/lib/themes/`, each scoped by a `[data-theme='<name>']` attribute, and are only fetched via a dynamic `import()` the first time a user selects them — Vite code-splits CSS-only dynamic imports into separate chunks natively, no bundler config needed.

**Tech Stack:** SvelteKit, Svelte 5 runes (`$state`), Tailwind CSS v4 (`oklch()` custom properties), bits-ui (via shadcn-svelte "nova" style primitives already used in this repo), `@lucide/svelte` icons, `pnpm`.

## Global Constraints

- All CSS custom properties in new palette files must cover the exact variable set `app.css` already defines: `--background`, `--foreground`, `--card`, `--card-foreground`, `--popover`, `--popover-foreground`, `--primary`, `--primary-foreground`, `--secondary`, `--secondary-foreground`, `--muted`, `--muted-foreground`, `--accent`, `--accent-foreground`, `--destructive`, `--border`, `--input`, `--ring`.
- `--destructive` stays `oklch(0.577 0.245 27.325)` (light) / `oklch(0.704 0.191 22.216)` (dark) in every palette — error color never changes with theme.
- The "warm" palette is never given a `data-theme` attribute and never dynamically imported — it is the zero-cost default baked into `app.css`.
- Palette state (`vidm-color-theme` in `localStorage`) is fully independent from the existing light/dark state (`vidm-theme`) — neither reads nor writes the other's key, and toggling one never touches the other's DOM attribute (`dark` class vs. `data-theme`).
- No new test framework or DOM testing library is being introduced. This project's `vitest` config is `node`-environment, pure-logic only (see `www/vite.config.ts`'s `test.include`); `theme.svelte.ts` and Svelte components are verified via `pnpm run check` (svelte-check) plus manual browser verification, matching how the existing `ThemeToggle.svelte`/`theme.svelte.ts` are verified today (no automated tests exist for them either).
- Run all commands from `www/` (the SvelteKit project root), not the repo root.

---

### Task 1: Palette CSS files + color theme state module

**Files:**
- Create: `www/src/lib/themes/cool.css`
- Create: `www/src/lib/themes/high-contrast.css`
- Modify: `www/src/lib/theme.svelte.ts`

**Interfaces:**
- Consumes: nothing new (this task only touches existing `theme.svelte.ts` and adds standalone CSS files).
- Produces: `colorThemeState: { current: ColorTheme }` ($state, exported), `type ColorTheme = 'warm' | 'cool' | 'high-contrast'` (exported), `setColorTheme(theme: ColorTheme): Promise<void>` (exported async function). Task 3 imports all three from `$lib/theme.svelte`.

- [ ] **Step 1: Create the cool palette CSS file**

Create `www/src/lib/themes/cool.css`:

```css
[data-theme='cool'] {
	--background: oklch(0.99 0.002 240);
	--foreground: oklch(0.18 0.006 240);
	--card: oklch(1 0 0);
	--card-foreground: oklch(0.18 0.006 240);
	--popover: oklch(1 0 0);
	--popover-foreground: oklch(0.18 0.006 240);
	--primary: oklch(0.6 0.15 250);
	--primary-foreground: oklch(0.99 0.005 250);
	--secondary: oklch(0.96 0.004 240);
	--secondary-foreground: oklch(0.25 0.008 240);
	--muted: oklch(0.96 0.004 240);
	--muted-foreground: oklch(0.5 0.012 240);
	--accent: oklch(0.94 0.03 250);
	--accent-foreground: oklch(0.3 0.06 250);
	--destructive: oklch(0.577 0.245 27.325);
	--border: oklch(0.9 0.006 240);
	--input: oklch(0.9 0.006 240);
	--ring: oklch(0.6 0.15 250 / 50%);
}
[data-theme='cool'].dark {
	--background: oklch(0.16 0.012 250);
	--foreground: oklch(0.96 0.004 240);
	--card: oklch(0.21 0.014 250);
	--card-foreground: oklch(0.96 0.004 240);
	--popover: oklch(0.21 0.014 250);
	--popover-foreground: oklch(0.96 0.004 240);
	--primary: oklch(0.7 0.14 250);
	--primary-foreground: oklch(0.2 0.03 250);
	--secondary: oklch(0.27 0.012 250);
	--secondary-foreground: oklch(0.96 0.004 240);
	--muted: oklch(0.27 0.012 250);
	--muted-foreground: oklch(0.7 0.01 240);
	--accent: oklch(0.32 0.05 250);
	--accent-foreground: oklch(0.9 0.03 250);
	--destructive: oklch(0.704 0.191 22.216);
	--border: oklch(0.85 0.015 250 / 14%);
	--input: oklch(0.85 0.015 250 / 17%);
	--ring: oklch(0.7 0.14 250 / 55%);
}
```

- [ ] **Step 2: Create the high-contrast palette CSS file**

Create `www/src/lib/themes/high-contrast.css`:

```css
[data-theme='high-contrast'] {
	--background: oklch(1 0 0);
	--foreground: oklch(0 0 0);
	--card: oklch(1 0 0);
	--card-foreground: oklch(0 0 0);
	--popover: oklch(1 0 0);
	--popover-foreground: oklch(0 0 0);
	--primary: oklch(0.45 0.18 250);
	--primary-foreground: oklch(1 0 0);
	--secondary: oklch(0.93 0 0);
	--secondary-foreground: oklch(0 0 0);
	--muted: oklch(0.93 0 0);
	--muted-foreground: oklch(0.25 0 0);
	--accent: oklch(0.93 0 0);
	--accent-foreground: oklch(0 0 0);
	--destructive: oklch(0.5 0.22 27);
	--border: oklch(0 0 0 / 40%);
	--input: oklch(0 0 0 / 40%);
	--ring: oklch(0.45 0.18 250 / 60%);
}
[data-theme='high-contrast'].dark {
	--background: oklch(0 0 0);
	--foreground: oklch(1 0 0);
	--card: oklch(0.05 0 0);
	--card-foreground: oklch(1 0 0);
	--popover: oklch(0.05 0 0);
	--popover-foreground: oklch(1 0 0);
	--primary: oklch(0.75 0.16 250);
	--primary-foreground: oklch(0.05 0 0);
	--secondary: oklch(0.15 0 0);
	--secondary-foreground: oklch(1 0 0);
	--muted: oklch(0.15 0 0);
	--muted-foreground: oklch(0.8 0 0);
	--accent: oklch(0.15 0 0);
	--accent-foreground: oklch(1 0 0);
	--destructive: oklch(0.75 0.19 25);
	--border: oklch(1 0 0 / 40%);
	--input: oklch(1 0 0 / 40%);
	--ring: oklch(0.75 0.16 250 / 60%);
}
```

- [ ] **Step 3: Extend `theme.svelte.ts` with color theme state**

Replace the full contents of `www/src/lib/theme.svelte.ts` with:

```ts
const STORAGE_KEY = 'vidm-theme';
const COLOR_THEME_STORAGE_KEY = 'vidm-color-theme';

type Theme = 'light' | 'dark';
export type ColorTheme = 'warm' | 'cool' | 'high-contrast';

function systemPrefersDark(): boolean {
	return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function apply(theme: Theme) {
	document.documentElement.classList.toggle('dark', theme === 'dark');
}

// SSR is disabled app-wide, so this only ever runs in the browser — no
// window/document guards needed at the call site.
export const themeState = $state<{ current: Theme }>({
	current: (localStorage.getItem(STORAGE_KEY) as Theme | null) ?? (systemPrefersDark() ? 'dark' : 'light')
});

apply(themeState.current);

export function toggleTheme() {
	themeState.current = themeState.current === 'dark' ? 'light' : 'dark';
	localStorage.setItem(STORAGE_KEY, themeState.current);
	apply(themeState.current);
}

export const colorThemeState = $state<{ current: ColorTheme }>({
	current: (localStorage.getItem(COLOR_THEME_STORAGE_KEY) as ColorTheme | null) ?? 'warm'
});

export async function setColorTheme(theme: ColorTheme) {
	if (theme !== 'warm') {
		await import(`./themes/${theme}.css`);
	}
	colorThemeState.current = theme;
	localStorage.setItem(COLOR_THEME_STORAGE_KEY, theme);
	if (theme === 'warm') {
		delete document.documentElement.dataset.theme;
	} else {
		document.documentElement.dataset.theme = theme;
	}
}

// Async, unlike apply() above — a returning visitor with a persisted
// non-warm theme sees a brief flash of the warm (default) palette until
// this dynamic import resolves. Accepted tradeoff: avoiding it would mean
// a render-blocking inline script in app.html, not worth it for a cosmetic
// flash that's gone from cache after the first visit.
if (colorThemeState.current !== 'warm') {
	setColorTheme(colorThemeState.current);
}
```

- [ ] **Step 4: Type-check**

Run: `cd www && pnpm run check`
Expected: passes with no errors.

- [ ] **Step 5: Build to confirm the dynamic import resolves**

Run: `cd www && pnpm run build`
Expected: build succeeds. This proves Vite can statically analyze the
`` `./themes/${theme}.css` `` template-literal dynamic import against the
`ColorTheme` union and resolve both files — a build failure here would mean
the import path or file names don't line up.

- [ ] **Step 6: Commit**

```bash
cd www
git add src/lib/themes/cool.css src/lib/themes/high-contrast.css src/lib/theme.svelte.ts
git commit -m "feat: add cool and high-contrast palettes with lazy-loaded color theme state"
```

---

### Task 2: Add dropdown-menu UI primitive

**Files:**
- Create: `www/src/lib/components/ui/dropdown-menu/` (generated by shadcn-svelte CLI, then verified/adjusted)

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: `$lib/components/ui/dropdown-menu` exporting Svelte components `DropdownMenu`, `DropdownMenuTrigger`, `DropdownMenuContent`, `DropdownMenuRadioGroup`, `DropdownMenuRadioItem` (bits-ui-based). Task 3 imports these by name.

- [ ] **Step 1: Run the shadcn-svelte CLI to add the component**

Run: `cd www && pnpm dlx shadcn-svelte@latest add dropdown-menu`

This follows the same process the existing `switch` and `radio-group`
primitives in `src/lib/components/ui/` were added with (bits-ui-based,
"nova" style, per `components.json`).

- [ ] **Step 2: Verify the generated exports**

Open `www/src/lib/components/ui/dropdown-menu/index.ts`. Confirm it exports
(possibly among others) components aliased as: `DropdownMenu` (the root),
`DropdownMenuTrigger`, `DropdownMenuContent`, `DropdownMenuRadioGroup`,
`DropdownMenuRadioItem` — matching the existing alias convention in
`src/lib/components/ui/switch/index.ts` (`Root as Switch`) and
`src/lib/components/ui/radio-group/index.ts` (`Root as RadioGroup`,
`Item as RadioGroupItem`). If any of these five aliases is missing, add it
to `index.ts` following that same `X as Y` pattern, pointing at the
corresponding generated `.svelte` file (`menu.svelte` → `DropdownMenu`,
`menu-trigger.svelte` → `DropdownMenuTrigger`, `dropdown-menu-content.svelte`
→ `DropdownMenuContent`, `menu-radio-group.svelte` → `DropdownMenuRadioGroup`,
`menu-radio-item.svelte` → `DropdownMenuRadioItem`). Do not remove any
other exports the CLI generated.

- [ ] **Step 3: Type-check**

Run: `cd www && pnpm run check`
Expected: passes with no errors.

- [ ] **Step 4: Commit**

```bash
cd www
git add src/lib/components/ui/dropdown-menu
git commit -m "feat: add dropdown-menu UI primitive"
```

---

### Task 3: ColorThemeToggle component, wiring, and verification

**Files:**
- Create: `www/src/lib/components/ColorThemeToggle.svelte`
- Modify: `www/src/routes/+page.svelte:29` (import), `www/src/routes/+page.svelte:178` (render)

**Interfaces:**
- Consumes: `colorThemeState`, `setColorTheme`, `type ColorTheme` from `$lib/theme.svelte` (Task 1); `DropdownMenu`, `DropdownMenuTrigger`, `DropdownMenuContent`, `DropdownMenuRadioGroup`, `DropdownMenuRadioItem` from `$lib/components/ui/dropdown-menu` (Task 2); `Button` from `$lib/components/ui/button` (existing).
- Produces: `ColorThemeToggle` component, rendered in `+page.svelte`. Nothing downstream consumes this.

- [ ] **Step 1: Write `ColorThemeToggle.svelte`**

Create `www/src/lib/components/ColorThemeToggle.svelte`:

```svelte
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
		{ value: 'high-contrast', label: 'High contrast', swatch: 'oklch(0.45 0.18 250)' }
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
```

The swatch colors are each palette's `--primary` value, hardcoded here
deliberately (not read from the lazy-loaded CSS) — this is the cheap,
build-time-known preview the parent spec's "Out of scope" section calls
for, and it must NOT trigger loading the palette's CSS chunk just to show
a dot.

- [ ] **Step 2: Wire it into the page header**

In `www/src/routes/+page.svelte`, add the import near the existing
`ThemeToggle` import (around line 29):

```ts
import ColorThemeToggle from '$lib/components/ColorThemeToggle.svelte';
```

Then render it next to `<ThemeToggle />` (around line 178):

```svelte
<div class="flex items-center gap-1">
	<ColorThemeToggle />
	<ThemeToggle />
</div>
```

replacing the bare `<ThemeToggle />` line so the two controls sit together
as a group, each independent.

- [ ] **Step 3: Type-check**

Run: `cd www && pnpm run check`
Expected: passes with no errors.

- [ ] **Step 4: Manual verification — start the dev server**

Run: `cd www && pnpm run dev`
Open the printed local URL in a browser.

- [ ] **Step 5: Manual verification — lazy loading (the priority item)**

Open browser devtools → Network tab, filter by CSS, then hard-reload the
page with the default warm theme active. Confirm **no** `cool.css` or
`high-contrast.css` request appears. Click the palette icon, select
"Cool" — confirm exactly one new CSS chunk request fires. Switch to
"High contrast" — confirm one more request fires for that chunk. Switch
back to "Cool" — confirm no new network request fires (served from cache)
and the palette still applies correctly.

- [ ] **Step 6: Manual verification — all 6 combinations**

For each of warm/cool/high-contrast × light/dark (toggle both controls
independently), confirm the page background, text, cards, buttons, and
borders all render with that palette's colors and remain readable —
particularly high-contrast, where borders and text should look
noticeably crisper than warm/cool.

- [ ] **Step 7: Manual verification — persistence and independence**

Select "Cool" + dark mode, reload the page — confirm both selections
persist. Then switch only the light/dark toggle — confirm the palette
selection (Cool) is unaffected. Then switch only the palette to
"High contrast" — confirm the light/dark mode is unaffected.

- [ ] **Step 8: Run the full check suite**

Run: `cd www && pnpm run check && pnpm test`
Expected: both pass (the existing pure-logic test suite is unrelated to
this change but should still pass untouched).

- [ ] **Step 9: Commit**

```bash
cd www
git add src/lib/components/ColorThemeToggle.svelte src/routes/+page.svelte
git commit -m "feat: add color theme picker UI"
```
