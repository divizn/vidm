# Editor Flow Redesign — Design Spec

**Goal:** Make the single-page editor's four independent tools (reformat,
speed, compression, captions) read as one consistent, seamless flow —
apply each or don't, then export — instead of today's page where each
tool signals "off" a different way, compression defaults on while
everything else defaults off, layout jumps when reformat mode changes,
and the Export button sits *above* the Captions panel instead of after
it.

**Not in scope** (real rough edges, deliberately excluded — see
conversation): the post-export result page's hard-reload transition, and
the error-state display. Both are separate concerns from "toggle each
tool on/off then export."

## Current State (for reference)

`www/src/routes/+page.svelte` holds all edit-configuration state as
page-level `$state` and composes `FormatToggle`, `RatioSelector`,
`SpeedControl`, `CompressionControl`, `CropPositioner`, `CaptionsPanel`,
and the Export `Button` in one scrollable `Card`. Each tool signals
"off" differently: `mode`/`compression.mode` have a `'none'` sentinel
mixed into their radio options, speed has no off state at all (`speed
=== 1` is inferred, not explicit), captions use a separate `burnIn`
checkbox decoupled from whether a transcript exists. Compression
defaults to `'preset'` (on) while the other three default off, which
means the existing "select at least one" export guard almost never
actually fires on a fresh page load.

## Design

### 1. `ToolCard` — one shared wrapper for all four tools

New component, `www/src/lib/components/ToolCard.svelte`:

```svelte
let {
  title,
  enabled,
  onEnabledChange,
  children
}: {
  title: string;
  enabled: boolean;
  onEnabledChange: (v: boolean) => void;
  children?: Snippet;
} = $props();
```

Renders a `Card` with `CardHeader` (title + a `Switch` in `CardAction`,
wired to `enabled`/`onEnabledChange`) and, only when `enabled` is true, a
`CardContent` wrapping `{@render children?.()}`. Off = the card shows
just its header row (no wasted space, no ambiguity about state). On =
that tool's own controls expand below.

`enabled` is a plain prop + callback, not a two-way `bind:`, because two
of the four tools (reformat, compression) don't have a real standalone
boolean — their "enabled" state is *derived* from an existing
`mode`/`compression.mode` field, and turning them on needs to pick a
concrete mode, not just flip a bit. Using the same callback shape for
all four keeps `+page.svelte`'s usage uniform:

```svelte
<ToolCard title="Reformat" enabled={mode !== 'none'}
  onEnabledChange={(v) => (mode = v ? 'crop' : 'none')}>
  ...
</ToolCard>

<ToolCard title="Speed" enabled={speedEnabled}
  onEnabledChange={(v) => { speedEnabled = v; speed = v ? 1.5 : 1; }}>
  ...
</ToolCard>

<ToolCard title="Compression" enabled={compression.mode !== 'none'}
  onEnabledChange={(v) => (compression = { ...compression, mode: v ? 'preset' : 'none' })}>
  ...
</ToolCard>

<ToolCard title="Captions" enabled={captionsEnabled}
  onEnabledChange={(v) => (captionsEnabled = v)}>
  ...
</ToolCard>
```

**Simplification (flagged for approval):** turning reformat or
compression back on after turning it off always resets to the primary
default (`crop`, `preset`) rather than remembering the last-used
sub-mode (e.g. `blur-pad`). Same for speed — always resets to `1.5x`.
This avoids extra "last used" state for a fairly minor convenience; one
click re-picks a different sub-mode if wanted.

### 2. New `Switch` UI primitive

`www/src/lib/components/ui/switch/switch.svelte` — doesn't exist yet.
`bits-ui` (already a dependency) ships a `Switch` primitive
(`Switch.Root` + `Switch.Thumb`); wrap it the same way
`ui/checkbox/checkbox.svelte` wraps `Checkbox` today (same
`cn(...)`/`WithoutChildrenOrChild` conventions), so it matches the
existing UI kit's style instead of introducing a new pattern.

### 3. State model changes in `+page.svelte`

- New `speedEnabled = $state(false)`. Off forces `speed = 1`; the
  `SpeedControl` radio group is only rendered (inside the Speed
  `ToolCard`) when on.
- New `captionsEnabled = $state(false)` **replaces** `burnCaptions`.
  `CaptionsPanel` loses its `burnIn` bindable prop and the standalone
  "Burn captions into exported video" checkbox — being enabled at all
  now means captions get burned in once a transcript exists. Toggling
  captions off does **not** discard `captionSegments` (they're still
  `+page.svelte`-owned `$state`, so they survive the `CaptionsPanel`
  unmounting) — it only excludes them from the next export. Inside
  `CaptionsPanel`, `CaptionStyleControl` and `CaptionPreview` — currently
  gated on `{#if burnIn}` — become gated on `{#if status === 'done'}`
  instead: since the panel itself is only mounted while the Captions
  `ToolCard` is enabled, reaching a finished transcript already implies
  burn-in intent, so there's no remaining case where a transcript exists
  but the style controls should stay hidden.
- `mode` and `compression.mode` keep their existing `'none'` sentinel
  (no shape change — `filters.ts` and `buildExportArgs` are untouched)
  but their radio components (`FormatToggle`, `CompressionControl`) drop
  the `'none'`/`'None'` option from their own choice list, since the
  `ToolCard` switch now owns that state exclusively. Both components
  are only ever rendered while already enabled (inside the `{#if
  enabled}` in `ToolCard`), so they never need to represent "off"
  internally.
- `hasActiveTransform` simplifies to:
  ```ts
  const hasActiveTransform = $derived(
    mode !== 'none' ||
      speedEnabled ||
      compression.mode !== 'none' ||
      (captionsEnabled && captionSegments.length > 0)
  );
  ```
  Since every tool now defaults off, this guard is actually reachable on
  a fresh page load (today it almost never is, because compression
  defaults on).
- `run()`'s caption-burn-in guard changes from `burnCaptions &&
  captionSegments.length > 0` to `captionsEnabled && captionSegments.length
  > 0` — same shape, renamed flag.

### 4. Page layout order and export summary

Cards render in this order: **Reformat → Speed → Compression →
Captions**, then a compact one-line summary + the Export button as the
last thing on the page (never buried above Captions again). `RatioSelector`
and `CropPositioner` move inside the Reformat `ToolCard`'s children
(shown when enabled / when `mode === 'crop'` respectively) instead of
`RatioSelector` living in the shared top `Card` and `CropPositioner`
being an entirely separate `Card` — both live and jump only within
their own already-expanding tool card now, not shifting the rest of the
page.

New small pure function `buildExportSummary(config): string[]` — e.g.
returns `['Crop 9:16', '1.5x speed', 'Captions']` — built from the same
state used for `hasActiveTransform`, joined with `·` for display next to
the Export button. Lives in a new `www/src/lib/editor-summary.ts` with
its own test file (`editor-summary.test.ts`), matching this repo's
convention of testing pure logic outside Svelte components (same
pattern as `ass.ts`/`filters.ts`/`srt.ts`). Signature sketch:

```ts
interface EditorSummaryInput {
  mode: ReformatMode;
  ratio: { label: string };
  speedEnabled: boolean;
  speed: number;
  compression: CompressionSettings;
  captionsEnabled: boolean;
  hasCaptionSegments: boolean;
}
function buildExportSummary(input: EditorSummaryInput): string[]
```

Only lists "Captions" when `captionsEnabled && hasCaptionSegments` — same
condition as the export guard, so the summary never promises something
the export won't actually do.

### 5. Testing

- `editor-summary.test.ts` (new): covers each tool's on/off contribution
  to the summary list, empty-state (nothing enabled → `[]`), and the
  captions-enabled-but-no-transcript-yet case (excluded from summary).
- `ToolCard.svelte` and the trimmed `FormatToggle`/`CompressionControl`
  option lists aren't unit-tested — this repo doesn't unit-test Svelte
  components, only pure logic (existing convention).
- Manual/visual verification on a Cloudflare Preview URL before merge,
  same as the caption-style-preview redesign — this is a purely visual
  flow change that automated tests can't confirm end-to-end.
