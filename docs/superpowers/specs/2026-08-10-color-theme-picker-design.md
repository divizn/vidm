# Color Theme Picker — Design Spec

**Goal:** Implement the accent-palette layer described in
[`2026-08-10-lazy-loaded-themes-design.md`](2026-08-10-lazy-loaded-themes-design.md)
(the "lazy-loaded color themes" spec), which left the picker UI and specific
palettes undesigned. This spec fills in both: three palettes (warm, cool,
high-contrast) and a dropdown picker in the header.

**Priority:** The lazy-loading mechanism is the main thing this spec needs to
get right — non-default palette CSS must not ship to visitors who never open
the picker, and must load on first selection via Vite's native async-import
code-splitting, not eager bundling.

**Status:** Approved, ready for implementation planning.

## Theme model (unchanged from the parent spec)

Palette is orthogonal to light/dark mode. Each palette has its own light and
dark variant and still respects whichever mode `theme.svelte.ts` is
currently in — palette and mode are two independent axes.

- **warm** — today's existing default palette. Stays inline in `app.css`
  under `:root`/`.dark` with no `data-theme` attribute. Zero extra cost:
  visitors who never open the picker never load anything extra.
- **cool** — new. Blue-gray neutrals (hue 240), blue accent (hue 250).
- **high-contrast** — new. Near-grayscale neutrals (chroma 0) with a single
  reserved, AAA-contrast accent hue for interactive elements, so color never
  carries meaning on its own but interactive elements stay identifiable.
  Borders bumped to 40% opacity (vs. today's 14-17%) so structure stays
  visible without relying on color.

`--destructive` stays the same universal red across all three palettes —
error color shouldn't shift with theme.

## Palette values

Each new file mirrors `app.css`'s existing variable set
(`--background`, `--foreground`, `--card`, `--card-foreground`, `--popover`,
`--popover-foreground`, `--primary`, `--primary-foreground`, `--secondary`,
`--secondary-foreground`, `--muted`, `--muted-foreground`, `--accent`,
`--accent-foreground`, `--destructive`, `--border`, `--input`, `--ring`),
scoped under `[data-theme='<name>']` (light) and `[data-theme='<name>'].dark`
(dark), same shape as the example in the parent spec.

### `src/lib/themes/cool.css`

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

### `src/lib/themes/high-contrast.css`

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

## State management

`src/lib/theme.svelte.ts` gains a second, independent piece of state
alongside the existing `themeState` (light/dark):

```ts
const COLOR_THEME_STORAGE_KEY = 'vidm-color-theme';
type ColorTheme = 'warm' | 'cool' | 'high-contrast';

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

if (colorThemeState.current !== 'warm') {
	setColorTheme(colorThemeState.current);
}
```

On module init, if a non-warm theme was previously persisted, `setColorTheme`
fires once to (re-)load that palette's CSS chunk and set `data-theme`. Unlike
the existing light/dark `apply()` call — which is synchronous, so it always
completes before first paint — this is async because of the dynamic import.
**Accepted tradeoff:** a returning visitor with a persisted non-warm theme
will see a brief flash of the warm (default) palette on reload until the
chunk resolves, typically imperceptible from cache after the first visit.
Avoiding this would mean blocking initial render on the import (e.g. a
render-blocking inline script in `app.html`), which adds meaningful
complexity for a cosmetic flash on repeat visits — not worth it here.

This keeps the two axes (mode, palette) fully independent: toggling
light/dark never touches `data-theme`, and switching palette never touches
the `dark` class.

## UI

- Add shadcn-svelte's `dropdown-menu` component (bits-ui based, via the CLI —
  no such component exists in this project yet; `popover`/`radio-group`-style
  components were added the same way previously)
- New `src/lib/components/ColorThemeToggle.svelte`: an icon button (palette
  icon) that opens the dropdown, listing all 3 themes each with a small color
  swatch (using that theme's `--primary` value) + label, current selection
  marked
- Placed directly next to the existing `<ThemeToggle />` in
  `src/routes/+page.svelte:178`, as a separate, independent control — not
  merged into one menu

## Error handling

None needed beyond what already exists: `import()` of a static, build-time-
known path (`./themes/${theme}.css` with `theme` restricted to the
`ColorTheme` union) can't fail in a way the app needs to recover from at
runtime — if the chunk 404s, that's a deploy/build problem, not a state this
code needs to handle gracefully.

## Testing

No UI unit-test infrastructure exists in this project currently. Verify
manually in the browser:

1. **Lazy loading (the priority item)** — with devtools network tab open,
   confirm no `cool.css`/`high-contrast.css` chunk loads on initial page load
   with the default warm theme; confirm exactly one chunk request fires the
   first time each non-warm theme is selected, and none on subsequent
   reselection (browser cache).
2. All 3 palettes × 2 modes (6 combinations) render correctly.
3. Palette selection persists across reload; light/dark selection persists
   independently of palette.
4. Switching palette doesn't fight with the light/dark toggle (both axes
   stay independently correct in all combinations).
5. `svelte-check` and lint pass as usual.

## Out of scope

- Any palette beyond these 3.
- Per-theme preview swatches without switching (the dropdown swatches use
  each theme's actual `--primary` value, which is small/cheap enough to
  hardcode inline rather than requiring the full CSS chunk — no separate
  preview mechanism needed).
