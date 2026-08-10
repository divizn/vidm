# Video trim — design

## Overview

Add a Trim tool to the editor: users pick an in/out range on the uploaded
video, and export clips to just that range. Trim is a peer of the existing
Reformat/Speed/Compression/Captions tools — its own tab, independently
optional, combinable with any of the others.

## UI & placement

A new "Trim" tab in `ToolTabs` (scissors icon), following the same pattern
as the other tools: shown alongside Reformat/Speed/Compression/Captions,
with the existing "active" indicator dot lit whenever the trim range isn't
the full video.

Its panel, `TrimControl.svelte`, holds:

- A dual-thumb range slider bound to `[trimStart, trimEnd]`, range `0` to
  `sourceDuration`. bits-ui's `Slider` primitive (already wrapped in
  `$lib/components/ui/slider`) supports `type="multiple"` with an array
  value out of the box — no custom draggable overlay needed, unlike the
  crop box (which represents a spatial, not temporal, selection).
- Two numeric time fields (mm:ss, editable text input, parsed and
  clamped), kept in sync with the slider in both directions.
- A minimum gap enforced between the two handles (0.5s) so they can't
  collapse to a zero-length range.

## State & preview clamping

`+page.svelte` gains `trimStart`/`trimEnd` state (`$state<number>`), each
initialized to `0` and `sourceDuration` respectively. Since
`sourceDuration` isn't known until the video's metadata loads, an
`$effect` sets `trimEnd = sourceDuration` the first time it becomes
nonzero (mirrors how `crop` gets derived once metadata is available).
Uploading a new file resets trim to the full range, same as other
per-file state.

`hasActiveTransform` gains an OR clause:
`trimStart > 0 || trimEnd < sourceDuration`. `editor-summary.ts` gains a
`Trim mm:ss–mm:ss` entry in `buildExportSummary` under the same condition.
A trim-only export (no other tool active) is valid — it just clips the
file unchanged otherwise.

`SourcePreview` takes two new props: `trimStart`/`trimEnd`, and a
`clampToTrim` boolean (true when `activeTool === 'trim'`, same pattern as
the existing `showCropBox` prop). While clamped: entering the Trim tab
seeks the video to `trimStart`; during playback, hitting `trimEnd` stops
and loops back to `trimStart` rather than continuing into the untrimmed
tail.

## Export (`filters.ts`)

`ExportOptions` gains `trimStart`/`trimEnd`. When the range isn't the full
video, `buildExportArgs` prepends `-ss <trimStart> -t <trimEnd -
trimStart>` as **input** options (before `-i`) — for blur-pad's
dual-stream case, before both `-i` occurrences of the same input. `-t`
(duration) is used rather than `-to` (absolute end) to sidestep
`-to`'s input-option semantics, which are relative to the file's own
start rather than to `-ss`. When the range is the full video, no trim
args are added at all, so the existing "no other transform → `-c:v copy`"
fast path is untouched.

The size-target compression math (`compression.mode === 'size'`) switches
its duration input from the full `sourceDurationSeconds` to the trimmed
duration: `(trimEnd - trimStart) / speed`.

## Captions interaction

Trim is captured before transcription: when the user opens Captions with
an active (non-full) trim range, "Generate captions" transcribes only
that range, so segment timestamps come out already 0-based relative to
`trimStart` — no retroactive shifting needed, and they line up directly
with the trimmed+exported video's own PTS (which itself resets to ~0 at
the trim point once re-encoded).

To make that true, `CaptionsPanel`'s generate step, when trim is active,
first uses ffmpeg to extract the `[trimStart, trimEnd]` sub-clip and
transcribes that instead of the full file. This extraction must
re-encode, not stream-copy: a copy-mode trim can only cut at keyframes,
which could desync the transcript from the frame-accurate trim the real
export applies later.

This introduces a second ffmpeg.wasm call site (existing code only calls
`loadFFmpeg()` once, from the main export flow). Per the known
threading constraint, a second multi-threaded ffmpeg instance can't
initialize while an earlier one is still alive in the same page — a
latent issue that's never surfaced because there's only ever been one
call site. `loadFFmpeg()` will be changed to memoize/cache its instance
(module-level cached promise) so `CaptionsPanel`'s extraction and the
main export share one loaded engine safely, regardless of call order.

If the user changes the trim range after captions already exist, the
existing segments are cleared rather than left silently stale (their
timestamps would no longer correspond to the new range) — consistent
with the existing behavior where editing a segment's text drops its
now-invalid word-level timing.

## Edge cases

- New file upload resets trim to the full range.
- Minimum trim duration of 0.5s enforced at the slider/input level.
- Trim-only export (no other tool active) is valid.
- Full-range trim (`trimStart === 0 && trimEnd === sourceDuration`) is
  treated as "trim inactive" everywhere — no export args, no summary
  line, no active-tab dot, no caption pre-extraction.
