# CropPositioner Polish — Design Spec

**Goal:** Add a rule-of-thirds grid overlay and a live output-pixel-dimension
readout to `www/src/lib/components/CropPositioner.svelte`, inspired by
common patterns in other online video croppers (e.g. online-video-cutter.com).

**Scope:** Additive only — no prop/interface changes, no other files touched.

## 1. Rule-of-thirds grid

A semi-transparent 3×3 grid (2 vertical + 2 horizontal lines at 1/3 and 2/3)
drawn inside the existing crop box div (`CropPositioner.svelte`, the
`absolute cursor-grab ...` div around line 163), via a nested overlay div
using two CSS `linear-gradient` backgrounds — no new state, pure CSS.

## 2. Live pixel-dimension readout

`CropPositioner` already has `sourceWidth`, `sourceHeight`, `ratio`, and a
reactive `crop` region. A new `$derived` calls the existing
`computeOutputDimensions({ mode: 'crop', ratio, crop, sourceWidth,
sourceHeight })` (already exported from `$lib/ffmpeg/filters`, already used
by `+page.svelte` for the real export) and displays the resulting `width ×
height` as text near the crop box, updating live as the box is dragged or
resized.

## Out of scope

Everything else from the reference tool (trim/cut timeline, volume slider,
live speed preview, theme changes, 8-point free-form resize handles) — each
is its own separate piece of work, tracked separately.
