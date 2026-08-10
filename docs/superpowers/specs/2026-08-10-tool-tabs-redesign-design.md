# Tool Tabs Redesign — Design Spec

**Goal:** Replace the editor page's four always-stacked `ToolCard`s with an
icon tab strip — one tool's panel visible at a time, like the reference
online video cropper the user found — while keeping the underlying
architecture unchanged: all four tools remain independently on/off and
combinable in a single export. Also converts `SpeedControl` from a
discrete radio group to a continuous slider.

**Not a functional change:** this is purely a navigation/layout change.
Nothing about what can be combined for one export changes — a user can
still enable Speed and Captions together while only one panel is visible
at a time; enabling one tool never disables another.

## 1. `ToolTabs` — icon strip navigation

New component, `www/src/lib/components/ToolTabs.svelte`:

```ts
interface ToolTabItem {
	id: string;
	label: string;
	icon: Component; // from 'svelte', lucide icon component type
	enabled: boolean;
}
let { tabs, active = $bindable() }: { tabs: ToolTabItem[]; active: string } = $props();
```

Renders one button per tab. The active tab shows its icon **and** label
(matches the reference site's active-tab treatment); inactive tabs show
icon only. Each tab shows a small dot/marker when `enabled` is true, so
what's active is visible without opening every panel — this replaces the
"you can only tell what's on by scrolling past every card" gap that
existed even in the current stacked layout, and matters more now that
only one panel is visible at a time.

Icons (all already available via `@lucide/svelte`, an existing
dependency): Reformat → `Crop`, Speed → `Gauge`, Compression → `Archive`,
Captions → `Captions`.

## 2. `+page.svelte`: single active panel instead of four stacked cards

New local state: `activeTool = $state<'reformat' | 'speed' | 'compression' | 'captions'>('reformat')`.

A derived `toolTabs` array feeds `ToolTabs`, built from each tool's
existing enabled condition (`mode !== 'none'`, `speedEnabled`,
`compression.mode !== 'none'`, `captionsEnabled`) — the same booleans
already driving each `ToolCard`'s switch today.

Each of the four existing `<ToolCard>` blocks is unchanged internally —
same `enabled`/`onEnabledChange` wiring, same children — but now wrapped
in `{#if activeTool === 'reformat'}…{/if}` (etc.) instead of rendering
unconditionally one after another. `ToolCard` itself needs no changes;
only how many of its instances are visible at once changes.

Export summary + button stay exactly where the previous redesign put them
— fixed at the bottom of the page, unaffected by which tab is active.

## 3. `SpeedControl`: slider instead of radio group

Replaces the `RadioGroup` of six fixed multipliers with the existing
`Slider` UI component (already used by `CompressionControl`'s CRF
control) bound to `speed`, ranging over the app's existing
`MIN_SPEED`/`MAX_SPEED` constants (0.5–2, from `$lib/ffmpeg/filters`),
step 0.05. The current value displays live as e.g. "1.35x".

To avoid floating-point drift from repeated 0.05 steps, rounding happens
once, at the point `speed` is set (the slider's `onValueChange`), not at
every display site:

```ts
onValueChange={(v) => (speed = Math.round(v * 20) / 20)}
```

Displayed with `.toFixed(2)` wherever shown (the panel's own readout and
`buildExportSummary`'s output).

## 4. Hardening the no-op-export guard

The discrete radio version deliberately excluded `1` as a selectable
value to keep `hasActiveTransform`'s bare `speedEnabled` check from
admitting a no-op export. A continuous slider can land exactly on `1`
(no dead zone is being added — that would be worse UX than just fixing
the guard), so the guard itself needs hardening:

- `+page.svelte`'s `hasActiveTransform`: `speedEnabled` → `speedEnabled && speed !== 1`
- `www/src/lib/editor-summary.ts`'s `buildExportSummary`: same condition
  change, so the export summary line and the actual guard never disagree
  (matching the file's own stated design intent).

This closes a fragility a prior code review flagged: the previous fix
relied on `1` being unreachable via `SpeedControl`'s own option list
rather than the guard itself being correct.

## Out of scope

Everything else from the reference-site research already logged as
separate work: volume control, live speed preview, a trim/cut feature,
and any broader theme change. None of those are touched here.

## Testing

- `www/src/lib/editor-summary.test.ts`: update/add tests for the
  `speed !== 1` condition — `speedEnabled: true, speed: 1` → excluded;
  `speedEnabled: true, speed: 1.35` → `'1.35x speed'` included.
- `ToolTabs.svelte` and the `+page.svelte`/`SpeedControl.svelte` changes
  are Svelte components — not unit-tested, per this repo's established
  convention (only pure `.ts` logic gets test coverage).
- Manual/visual verification on a Cloudflare Preview URL before merge, as
  with prior UI-facing changes in this repo.
