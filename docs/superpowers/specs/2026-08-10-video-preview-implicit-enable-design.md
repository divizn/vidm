# Video Preview + Implicit Enable — Design Spec

**Goal:** Make the video preview always visible (not just while cropping),
and remove the per-tool on/off `Switch`/`ToolCard` entirely — a tool is
"in use" the moment the user actually picks something within it, matching
the reference site's model now that each tool already has its own tab.

**Not a functional change to combinability:** all four tools remain
independently usable together in one export; this only changes how
"in use" is signaled (an explicit switch → an implicit real selection).

## 1. `VideoPreview` replaces `CropPositioner`

Today there are two separate `<video>` elements: a hidden one in
`+page.svelte` used only to read `sourceWidth`/`sourceHeight`/
`sourceDuration`, and `CropPositioner`'s own visible one with the crop-box
overlay (only ever mounted while the Reformat tab shows crop mode).

New component `www/src/lib/components/VideoPreview.svelte` (replaces
`CropPositioner.svelte`, deleted) owns a single `<video>` element,
**always rendered** once a file is uploaded — positioned right below
`ToolTabs`, above whichever tool's controls are showing. It keeps
`CropPositioner`'s existing drag/resize/grid-overlay/dimension-readout
logic unchanged, gated behind a new `showCropBox: boolean` prop instead
of being unconditionally shown: when true, the crop box (grid, resize
handle, live "Output: WxHpx" readout) overlays on top of the same video;
when false, it's just the plain video. `sourceWidth`/`sourceHeight`/
`sourceDuration` become bindable props (previously local-only in
`CropPositioner`, and separately duplicated in `+page.svelte`'s own
`onSourceVideoLoaded`) — `+page.svelte` no longer needs its own hidden
`<video>` or that handler at all.

`+page.svelte` computes `showCropBox={mode === 'crop' && activeTool === 'reformat'}`
— the crop box only overlays while actively viewing the Reformat tab, not
merely because crop mode is set while looking at another tool (that would
be visual clutter unrelated to what the user is currently doing).

Because `VideoPreview` is always mounted (never unmounted by tab
switches, same reasoning as the earlier tab-switch state-preservation
fix), its internal drag state survives navigating away and back — a
configured crop box is never lost.

## 2. No more `ToolCard`/`Switch` — implicit enable

`ToolCard.svelte` is deleted. Each tool's controls render directly (no
Card border, no title, no switch) inside the same always-mounted,
CSS-`hidden`-toggled wrapper `<div>`s already used for tab switching.
Each panel's own internal layout is otherwise unchanged — e.g. the
Reformat panel still shows `FormatToggle` then `RatioSelector`, just
without a Card wrapper around them and without `CropPositioner` nested
inside (that's now `VideoPreview`, living above all four panels, not
inside any one of them). Nothing needs to explicitly turn a tool "on" —
using it is enough:

- **Reformat**: `mode` already starts at `'none'`, and `FormatToggle`'s
  radio group already only offers `crop`/`blur-pad` (no `'none'` entry) —
  passing `value={mode}` when `mode === 'none'` already renders with
  nothing checked, since `'none'` matches no radio item. No component
  change needed here; only the `ToolCard` wrapper that used to force
  `mode` to `'crop'` on toggle-on goes away.
- **Compression**: same story — already defaults to `compression.mode === 'none'`,
  and `CompressionControl`'s radio group already excludes `'none'`. No
  component change needed.
- **Speed**: the separate `speedEnabled` boolean is removed entirely.
  `speed !== 1` (already used for the export guard, see below) becomes
  the sole "in use" signal — the slider simply starts at `1` (no change)
  and picking any other value is itself the "enable."
- **Captions**: the separate `captionsEnabled` boolean is removed
  entirely. `captionSegments.length > 0` (having a transcript) becomes
  the sole "in use" signal.

## 3. State/logic simplification this enables

`+page.svelte`'s `hasActiveTransform` simplifies to:

```ts
const hasActiveTransform = $derived(
	mode !== 'none' || speed !== 1 || compression.mode !== 'none' || captionSegments.length > 0
);
```

`buildExportSummary`'s `EditorSummaryInput` drops the now-redundant
`speedEnabled`/`captionsEnabled` fields — its speed condition becomes
`input.speed !== 1`, its captions condition becomes bare
`input.hasCaptionSegments`.

`toolTabs`'s per-tab `enabled` (drives each tab's dot indicator) updates
to match: `mode !== 'none'`, `speed !== 1`, `compression.mode !== 'none'`,
`captionSegments.length > 0`.

Removing `ToolCard` also removes every `onEnabledChange` callback from
`+page.svelte`'s template — tools no longer need "turn on and pick a
sensible default" logic (e.g. speed used to jump to `1.5` on enable);
picking a value *is* the action now.

## Out of scope

Everything else already logged as separate work: volume control, a
trim/cut feature, any further theme change.

## Testing

- `editor-summary.test.ts`: update to match the simplified
  `EditorSummaryInput` (drop `speedEnabled`/`captionsEnabled` from every
  test fixture) and the new bare `speed !== 1` / `hasCaptionSegments`
  conditions.
- `VideoPreview.svelte`/`+page.svelte` changes are Svelte components —
  not unit-tested, per this repo's established convention.
- Manual/visual verification on a Cloudflare Preview URL before merge, as
  with prior UI-facing changes in this repo — specifically re-confirming
  the tab-switch state-preservation scenarios (configured crop survives
  switching away and back; an in-progress or completed transcription
  survives switching away and back) still hold with the new component.
