# Caption style preview redesign

## Problem

`CaptionsPanel.svelte`'s pre-export preview (`CaptionPreview.svelte` +
`CaptionOverlay.svelte`) composites the caption overlay on top of the
*source* video — but the export applies crop/reformat on top of that
same source, so the preview never reflects the actual export framing.
The component already discloses this ("exact framing depends on the
reformat mode"), but a disclosed mismatch is still a mismatch, and
building a true frame-accurate preview would mean actually running the
ffmpeg export, which defeats the point of a live preview.

## Decision

Stop trying to simulate "captions composited into the video frame."
Replace it with a standalone caption *style* preview: real transcript
text, cycling through the actual words, decoupled entirely from the
video frame and from crop/reformat. Simpler illustrative demo, not a
frame-accurate simulation — auto-loops on its own, no scrubbing/controls,
since there's no real video/audio driving it anymore.

## Components changed

- **`CaptionPreview.svelte`** — drop the `<video>` element, the
  play/pause/scrub controls, and the context-menu-blocking (all existed
  solely to manage the video element's native controls/fullscreen
  behavior colliding with the overlay; none of it applies once there's
  no video). Replace with a fixed-height dark box (matches the current
  video's `bg-black` background, so arbitrary text/highlight colors stay
  legible). Drop the `file` prop — no longer needed since there's no
  video source to load.
- **`CaptionOverlay.svelte`** — unchanged. It already takes `segments`,
  `style`, `currentTime`, `containerHeight` as props, fully decoupled
  from the video already.
- **`CaptionsPanel.svelte`** — one-line change: stop passing `file` to
  `CaptionPreview`.

## Data flow

A `requestAnimationFrame` loop advances a local `previewTime` state each
frame and feeds it into the existing `getActiveCaption(segments,
previewTime)` — the same tested function the real export's karaoke
windowing logic already shares, just fed a synthetic clock instead of a
real video's `timeupdate`.

Wrap-around (loop back to the start once past the last segment) is a
new pure function, `advancePreviewTime(current, deltaSeconds, segments)`,
added alongside `getActiveCaption` in `captions/ass.ts`. It wraps back to
the *first* segment's start time, not `0`, so the loop doesn't sit on a
dead silent gap if there's lead-in before captions begin.

## Edge cases

- Empty `segments` → render nothing. Practically unreachable today
  (the panel only renders `CaptionPreview` once transcription has
  succeeded and produced segments), but guard anyway.
- A segment with zero clamped words → already falls back to plain
  non-highlighted text via `getActiveCaption`'s existing logic; no new
  handling needed.

## Testing

- Unit test for `advancePreviewTime`'s wrap-around math, added to
  `captions/ass.test.ts` (this repo's convention: new pure-logic
  functions in `ass.ts`/`filters.ts`/`srt.ts` get a test alongside them).
- `pnpm check` / `pnpm test` / `pnpm build` as usual.
- Real visual verification: this session's environment has no browser
  available (Playwright/chrome-devtools both fail with "Chrome
  executable not found"). Plan: implement on this branch, get it onto a
  Cloudflare **Preview URL** rather than merging straight to `main` —
  need to confirm the actual mechanism (`wrangler versions upload`
  rather than a plain `wrangler deploy`, which ships straight to 100%
  production) — and validate visually there before merging. This is
  also the first real test of whether Workers' `preview_urls` feature
  (enabled but never exercised, see `project_vidm_status` memory)
  actually answers the phase-4 preview-environment need that originally
  motivated the Pages→Workers migration.

## Out of scope

- No change to the real export/burn-in path (`buildAssSubtitle`,
  `buildSegmentDialogues`, `clampWordsToSegment`) — this is purely a
  pre-export preview UX change.
- No attempt to mimic the target output aspect ratio in the preview box
  — confirmed with the user: a plain flexible box is fine, no crop/ratio
  simulation at all.
