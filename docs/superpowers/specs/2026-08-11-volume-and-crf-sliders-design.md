# Volume control + labeled CRF slider

## Summary

Two changes, bundled because they share one small piece of UI infrastructure:

1. **Volume — new tool.** A gain slider (0–200%, default 100%/unchanged),
   its own tool tab, wired into export via ffmpeg's `volume` audio filter
   and mirrored live onto the in-editor preview.
2. **CRF slider — labeled scale.** The existing custom-CRF slider
   (Compression tool) gets tick marks/labels at the same CRF values the
   preset mode already names (18 "Best quality", 23 "Balanced", 28
   "Smallest file"), so the raw 18–32 range has a reference point.

Both sliders get the same "tick marks + labels under the track"
treatment, built once as a shared `SliderTicks` component rather than
duplicated.

## Volume

### Range and defaults

- `MIN_VOLUME = 0`, `MAX_VOLUME = 2`, `DEFAULT_VOLUME = 1`, step 5
  (i.e. 0%–200% in the UI, stored as a 0–2 multiplier internally, same
  convention as `speed`).
- 0% = silent. 100% = unchanged (default, inactive — same "no separate
  enabled flag" convention as every other tool: `volume !== 1` is itself
  the on/off signal).

### Export (`www/src/lib/ffmpeg/filters.ts`)

- `ExportOptions` gains `volume: number`.
- `needsAudioReencode` becomes:
  `needsSpeedFilters || volume !== 1 || compression.mode === 'size' || trimIsActive`
  — volume can't ride the `-c:a copy` fast path once gain is applied,
  same reasoning already applied to speed/trim/size-target.
- Audio filter construction changes from the current single
  `if (needsSpeedFilters) args.push('-filter:a', buildAtempoChain(speed))`
  into a small filter-chain array: push the atempo chain if speed is
  active, push `volume=${volume}` if volume is active, join with commas,
  push once as a single `-filter:a` value (ffmpeg comma-chains audio
  filters same as video). Order: atempo then volume — commutative for
  linear gain, doesn't affect output, just keeps it deterministic.

### In-editor preview (`SourcePreview.svelte`)

- Drop the hardcoded `muted` attribute on the `<video>` element — this is
  the first time this app plays audio in the editor itself, for any tool.
- New `volume = 1` prop. A `$effect` sets
  `videoEl.volume = Math.min(1, volume)`, mirroring the existing
  `playbackRate` effect's pattern exactly.
- **Known limitation, by design, not a bug**: `HTMLMediaElement.volume`
  is capped at `1.0` by the browser — there is no way to make native
  audio playback louder than "normal." So the preview accurately mirrors
  0–100% (silence through unchanged), but 100–200% (boost) sounds
  identical to 100% in the preview; only the real ffmpeg export actually
  applies the boost. `VolumeControl` shows a short note to this effect
  once the slider is above 100%.

### UI

- `VolumeControl.svelte` (new, same shape as `SpeedControl.svelte`): a
  `fieldset` with one `Slider` (0–200, step 5), a `%` readout, and
  `SliderTicks` marking 100 as "Original."
- New tab in `www/src/routes/+page.svelte`'s `toolTabs`:
  `{ id: 'volume', label: 'Volume', icon: Volume2Icon, enabled: volume !== 1 }`,
  placed after Speed and before Compression (both Speed and Volume are
  simple single-slider "playback property" controls).
- `hasActiveTransform` and the `buildExportArgs` call both gain `volume`.
- New panel div in the tool-panel `Card`, same CSS-hide-not-unmount
  pattern (`class={activeTool === 'volume' ? 'space-y-4' : 'hidden'}`)
  every other tab already uses.
- `{volume}` passed down to `SourcePreview`.
- `editor-summary.ts`'s `buildExportSummary` gains a line:
  `if (input.volume !== 1) parts.push(\`${Math.round(input.volume * 100)}% volume\`)`.

## CRF slider labels

- `CompressionControl.svelte`'s custom-CRF-mode `Slider` gets a
  `SliderTicks` below it, ticks built from the existing
  `COMPRESSION_PRESETS` array (`{ value: preset.crf, label: preset.label }`
  for each of the three presets) — no new constants needed, reuses the
  same source of truth the preset-mode radio buttons already read from.

## `SliderTicks.svelte` (new, shared)

Small presentational component. Props: `min: number`, `max: number`,
`ticks: { value: number; label: string }[]`. Renders one absolutely
positioned tick + label per entry, positioned by
`(value - min) / (max - min) * 100%`, below a track-width container.
Pure layout math — no state, no test file needed (consistent with how
other presentational-only components in this codebase are treated).

## Testing

- `filters.test.ts`: new cases — volume-only export args (correct
  `-filter:a volume=X`, forces re-encode from the `'none'` copy path),
  volume combined with speed (comma-chained `-filter:a`), volume at
  default (1) does not force re-encode on its own.
- `editor-summary.test.ts`: new case — volume summary line appears only
  when `volume !== 1`.
- Manual/Playwright verification (per this project's established
  pattern): upload a video with audio, drag the volume slider, confirm
  the in-editor preview's audible level changes for 0–100% and caps
  audibly at 100% above that; export at a non-default volume and confirm
  the output file's audio is actually louder/quieter (e.g. via `ffprobe`
  loudness or just an audible check); confirm the CRF slider's tick
  labels line up with the correct positions at 18/23/28.

## Out of scope

- No mute *toggle* separate from the slider (0% already is mute) — per
  the "simple gain slider" scope decision made during brainstorming.
- No loudness normalization — flat multiplier only, matching how CRF/
  speed are similarly simple, single-knob controls.
- No change to the preset/target-size CRF UI — only the custom-CRF
  slider gets tick labels, since preset mode is already labeled via its
  radio buttons.
