# Lazy-Loaded Color Themes — Design Spec

**Goal:** Add selectable color themes (accent palettes) beyond the current
binary light/dark mode, without shipping every theme's CSS to every visitor.
Each theme's variables are only downloaded when that theme is selected.

**Status:** Future feature — not scheduled to a roadmap phase yet. This spec
exists to capture the design before implementation starts.

**Scope:** New theming layer, additive to the existing light/dark toggle.
2-3 example palettes to prove the mechanism, not a final palette list.

## Current state

`www/src/app.css` defines CSS custom properties (`--background`, `--primary`,
`--primary-foreground`, etc.) on `:root` (light) and `.dark` (dark mode),
mapped into Tailwind's `--color-*` tokens via `@theme inline`.
`www/src/lib/theme.svelte.ts` holds a `$state<{ current: 'light' | 'dark' }>`,
toggles the `dark` class on `<html>`, and persists the choice to
`localStorage` (`vidm-theme` key). `app.css` is imported directly in
`+layout.svelte` and is small — both light and dark variants ship in the
initial bundle today, which is fine at two variants but doesn't scale to N
themes.

## Theme model: orthogonal accent layer

Themes are **independent of light/dark** — each theme still has its own
light and dark variants and respects whichever mode `theme.svelte.ts` is
currently in. A theme is not a light/dark replacement; it's a second,
orthogonal axis (mode × palette).

Each theme defines the same variable set app.css already defines for
`:root`/`.dark`, but scoped under a `[data-theme="<name>"]` attribute
instead, with both a `[data-theme="<name>"]` (light) and
`[data-theme="<name>"].dark` (dark) block:

```css
/* src/lib/themes/ocean.css */
[data-theme='ocean'] {
	--primary: oklch(0.6 0.15 220);
	--primary-foreground: oklch(0.98 0.005 220);
	/* ...rest of the variable set... */
}
[data-theme='ocean'].dark {
	--primary: oklch(0.7 0.13 220);
	--primary-foreground: oklch(0.2 0.03 220);
}
```

The default theme (today's palette) stays inline in `app.css` under
`:root`/`.dark` with no `data-theme` attribute required — visitors who never
open the theme picker pay no extra request.

## Lazy loading mechanism

Selecting a non-default theme calls `await import('$lib/themes/<name>.css')`.
Vite/SvelteKit code-splits CSS-only modules into their own chunk, fetched
once on first selection and cached by the browser thereafter — no new
bundler config needed, this is native Vite behavior. Once the import
resolves, `theme.svelte.ts` sets `data-theme` on `document.documentElement`
(alongside the existing `dark` class toggle, unchanged).

Theme choice persists to `localStorage` (new key, e.g. `vidm-color-theme`).
On the next load, if a non-default theme was previously selected, its CSS
chunk is re-imported during init before the class/attribute is applied —
same pattern `theme.svelte.ts` already uses for light/dark on load, just
async.

## Adding a new theme

1. Add `src/lib/themes/<name>.css` with `[data-theme='<name>']` and
   `[data-theme='<name>'].dark` blocks covering the same variable set as
   `app.css`.
2. Add `<name>` to the theme picker's option list (new UI component, not yet
   designed — out of scope for this spec).

## Out of scope

- The theme picker UI (dropdown/swatches component) — separate design.
- Per-theme preview without switching (would need eager-loading a preview
  swatch color per theme, decided when the picker is designed).
- Any specific palette names/colors beyond 2-3 proof-of-concept examples.
