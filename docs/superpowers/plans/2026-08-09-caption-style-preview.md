# Caption Style Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `CaptionPreview.svelte`'s video-composited caption overlay (which never matches the actual export framing once crop/reformat is applied) with a standalone caption style preview — real transcript text, auto-cycling through the actual words, fully decoupled from the video frame.

**Architecture:** A `requestAnimationFrame` loop drives a synthetic `previewTime` clock instead of a real video's `timeupdate`, feeding it into the existing, already-tested `getActiveCaption()`. A new pure function, `advancePreviewTime`, handles wrap-around (loop back to the first segment's start once past the last segment's end) and gets its own unit test, matching this repo's convention of testing pure logic in `ass.ts`/`filters.ts`/`srt.ts`. `CaptionOverlay.svelte` needs no changes — it's already decoupled from video.

**Tech Stack:** SvelteKit 5 (runes: `$state`, `$props`, `$effect`), TypeScript, Vitest.

## Global Constraints

- Pure logic goes in `www/src/lib/captions/ass.ts`; any new pure-logic function there gets a test in `www/src/lib/captions/ass.test.ts` alongside it (existing repo convention, enforced by this project's CI).
- No native `<video>` element in the new preview — this is the whole point of the redesign (see spec: `docs/superpowers/specs/2026-08-09-caption-style-preview-design.md`).
- Commit messages: Conventional Commits, no scope, no trailing period, no `Co-Authored-By` trailer (this repo's established convention).
- Branch: `feat/caption-style-preview` (already created and checked out).

---

### Task 1: `advancePreviewTime` pure function + test

**Files:**
- Modify: `www/src/lib/captions/ass.ts` (insert after `getActiveCaption`, which ends at line 135, before the `buildAssSubtitle` comment at line 137)
- Test: `www/src/lib/captions/ass.test.ts` (insert after the `getActiveCaption` describe block, which ends at line 173)

**Interfaces:**
- Produces: `advancePreviewTime(current: number, deltaSeconds: number, segments: CaptionSegment[]): number` — exported from `www/src/lib/captions/ass.ts`. Consumed by Task 2's `CaptionPreview.svelte`.

- [ ] **Step 1: Write the failing tests**

Add to `www/src/lib/captions/ass.test.ts`, right after the closing `});` of the `describe('getActiveCaption', ...)` block (current last line, 173):

```ts
describe('advancePreviewTime', () => {
	const segments: CaptionSegment[] = [
		{ from: '00:00:01,000', to: '00:00:02,000', text: 'Hello' },
		{ from: '00:00:02,000', to: '00:00:04,000', text: 'world' }
	];

	it('advances by deltaSeconds within range', () => {
		expect(advancePreviewTime(1, 0.5, segments)).toBe(1.5);
	});

	it('wraps back to the first segment start once past the last segment end', () => {
		expect(advancePreviewTime(3.9, 0.5, segments)).toBe(1);
	});

	it('returns 0 for an empty segments array', () => {
		expect(advancePreviewTime(5, 1, [])).toBe(0);
	});
});
```

Also add `advancePreviewTime` to the existing import block at the top of the file (currently lines 2-9):

```ts
import {
	advancePreviewTime,
	buildAssSubtitle,
	escapeAssText,
	getActiveCaption,
	hexToAssColor,
	parseSrtTimestamp,
	toAssTimestamp
} from './ass';
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd www && pnpm test -- ass.test.ts`
Expected: FAIL — `advancePreviewTime` is not exported from `./ass` (TypeScript/import error, or `undefined is not a function` depending on how Vitest surfaces it).

- [ ] **Step 3: Write the implementation**

Add to `www/src/lib/captions/ass.ts`, right after `getActiveCaption`'s closing `}` (current line 135) and before the `// Builds a full .ass subtitle document...` comment (current line 137):

```ts

// Advances the illustrative caption-style preview's synthetic clock by
// deltaSeconds, wrapping back to the first segment's start (not 0) once
// past the last segment's end — avoids the loop sitting on a dead silent
// gap if there's lead-in before captions begin. Used by CaptionPreview's
// auto-cycling demo, which has no real video/audio driving a `timeupdate`.
export function advancePreviewTime(
	current: number,
	deltaSeconds: number,
	segments: CaptionSegment[]
): number {
	if (segments.length === 0) return 0;
	const start = parseSrtTimestamp(segments[0].from);
	const end = parseSrtTimestamp(segments[segments.length - 1].to);
	const next = current + deltaSeconds;
	return next >= end ? start : next;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd www && pnpm test -- ass.test.ts`
Expected: PASS, all tests in the file green (existing tests plus the 3 new ones).

- [ ] **Step 5: Commit**

```bash
cd /home/phon/Programming/vidm
git add www/src/lib/captions/ass.ts www/src/lib/captions/ass.test.ts
git commit -m "feat: add advancePreviewTime for the caption style preview's synthetic clock"
```

---

### Task 2: Rewrite `CaptionPreview.svelte`

**Files:**
- Modify: `www/src/lib/components/CaptionPreview.svelte` (full rewrite — current file is 123 lines)

**Interfaces:**
- Consumes: `advancePreviewTime(current, deltaSeconds, segments)` and `parseSrtTimestamp(ts)` from `$lib/captions/ass` (Task 1). `CaptionOverlay` component (props unchanged: `segments`, `style`, `currentTime`, `containerHeight`).
- Produces: `CaptionPreview` component with props `{ segments: CaptionSegment[]; style: CaptionStyle }` — **the `file` prop is removed**. Task 3's `CaptionsPanel.svelte` must stop passing it.

- [ ] **Step 1: Replace the full file contents**

Replace all of `www/src/lib/components/CaptionPreview.svelte` with:

```svelte
<script lang="ts">
	import CaptionOverlay from './CaptionOverlay.svelte';
	import { advancePreviewTime, parseSrtTimestamp } from '$lib/captions/ass';
	import type { CaptionSegment } from '$lib/whisper/srt';
	import type { CaptionStyle } from '$lib/captions/style';

	let { segments, style }: { segments: CaptionSegment[]; style: CaptionStyle } = $props();

	const PREVIEW_HEIGHT_PX = 224;

	let previewTime = $state(segments[0] ? parseSrtTimestamp(segments[0].from) : 0);

	// Auto-cycles the preview's synthetic clock — there's no real video/audio
	// to drive it, so this is a standalone rAF loop instead of a `timeupdate`
	// listener. `segments` is read fresh on every tick via the reactive prop
	// (not a snapshot captured at effect-start), so editing caption text
	// mid-preview stays in sync without restarting the loop.
	$effect(() => {
		let rafId: number;
		let lastTimestamp: number | undefined;

		function tick(timestamp: number) {
			if (lastTimestamp !== undefined) {
				const deltaSeconds = (timestamp - lastTimestamp) / 1000;
				previewTime = advancePreviewTime(previewTime, deltaSeconds, segments);
			}
			lastTimestamp = timestamp;
			rafId = requestAnimationFrame(tick);
		}

		rafId = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(rafId);
	});
</script>

<div
	class="relative mx-auto flex max-w-[420px] items-center justify-center rounded-md bg-black"
	style:height={`${PREVIEW_HEIGHT_PX}px`}
>
	<CaptionOverlay
		{segments}
		{style}
		currentTime={previewTime}
		containerHeight={PREVIEW_HEIGHT_PX}
	/>
</div>
<p class="text-muted-foreground mt-1.5 text-center text-sm">
	Preview of caption styling — cycles through your actual transcript, not the final video frame.
</p>
```

- [ ] **Step 2: Type-check**

Run: `cd www && pnpm check`
Expected: PASS, 0 errors. (This will catch the removed `file` prop reference in `CaptionsPanel.svelte` if Task 3 hasn't been done yet — expected to fail at this point if so; if it fails only on `CaptionsPanel.svelte`'s stale `file` prop, that's expected and resolved by Task 3. If it fails on anything inside `CaptionPreview.svelte` itself, fix before proceeding.)

- [ ] **Step 3: Commit**

```bash
cd /home/phon/Programming/vidm
git add www/src/lib/components/CaptionPreview.svelte
git commit -m "feat: replace video-composited caption preview with standalone style preview"
```

---

### Task 3: Update `CaptionsPanel.svelte` call site

**Files:**
- Modify: `www/src/lib/components/CaptionsPanel.svelte:117`

**Interfaces:**
- Consumes: `CaptionPreview` with the new `{ segments, style }` prop signature from Task 2.

- [ ] **Step 1: Drop the `file` prop from the call site**

In `www/src/lib/components/CaptionsPanel.svelte`, change line 117 from:

```svelte
				<CaptionPreview {file} {segments} {style} />
```

to:

```svelte
				<CaptionPreview {segments} {style} />
```

(`file` stays a `CaptionsPanel` prop — it's still used by `generate()` calling `transcribeFile(file, ...)` at line 53 — this change only stops passing it down to `CaptionPreview`, which no longer needs it.)

- [ ] **Step 2: Full verification**

Run, in order, from `www/`:

```bash
pnpm check
pnpm test
pnpm build
```

Expected: all three PASS. `pnpm check` should now be fully clean (Task 2's expected-failure-if-run-alone is resolved by this step). `pnpm test` should show the 3 new `advancePreviewTime` tests plus all existing tests passing (39 existing + 3 new = 42 total, per the last known count of 39).

- [ ] **Step 3: Commit**

```bash
cd /home/phon/Programming/vidm
git add www/src/lib/components/CaptionsPanel.svelte
git commit -m "feat: stop passing unused file prop to CaptionPreview"
```

---

### Task 4: Verify on a Cloudflare Preview URL, then push and open a PR

**Files:** none (verification and git/deploy operations only).

**Interfaces:** none — this task only runs commands and inspects output.

- [ ] **Step 1: Get a Preview URL without touching production**

Run, from `www/`:

```bash
pnpm exec wrangler versions upload
```

This uploads a new Worker *version* without shifting production traffic to it (unlike `wrangler deploy`, which ships straight to 100% production) — output includes a preview URL specific to this version, in a form like `https://<version-id>-vidm.<subdomain>.workers.dev`. Note the exact printed URL for the next step.

- [ ] **Step 2: Smoke-test the preview URL**

```bash
curl -s -o /dev/null -w "homepage: %{http_code}\n" "<preview-url>/"
curl -s -o /dev/null -w "ffmpeg-core.wasm: %{http_code}\n" "<preview-url>/ffmpeg/ffmpeg-core.wasm"
```

Expected: both `200`. This confirms the preview version deployed correctly and the R2-backed asset routing still works on a non-production version — it does **not** confirm the caption preview itself looks correct, since that requires a real browser.

- [ ] **Step 3: Hand off for visual confirmation**

This environment has no browser available (Playwright/chrome-devtools both fail with "Chrome executable not found" — confirmed earlier this session). Report the preview URL to the user and ask them to open it, generate/load captions with burn-in enabled, and confirm the new preview: shows a plain dark box (no video), cycles through the real transcript text, and the karaoke highlight visibly advances word-by-word. Do not proceed to Step 4 until they confirm it looks right — this is exactly the kind of UI change `CLAUDE.md` calls out as needing real verification before claiming success, not just build/test passing.

This is also the first real test of whether Workers' `preview_urls` feature (enabled in `wrangler.jsonc` but never exercised — see `project_vidm_status` memory) is a viable answer to the project's phase-4 preview-environment need. Note the outcome either way when reporting back.

- [ ] **Step 4: Push and open a PR**

Once the user confirms the preview looks right:

```bash
cd /home/phon/Programming/vidm
git push -u origin feat/caption-style-preview
gh pr create --title "feat: replace video-composited caption preview with standalone style preview" --body "$(cat <<'EOF'
## Summary
- The pre-export caption preview composited captions on top of the *source* video, but crop/reformat is applied on top of that same source at export time — so the preview never matched the actual export framing. Building a frame-accurate preview would require actually running the ffmpeg export.
- Replaced with a standalone caption style preview: real transcript text, auto-cycling through the actual words via the existing `getActiveCaption()` fed a synthetic clock, decoupled entirely from the video frame. No video element, no controls — just an auto-looping demo of the caption styling itself.
- New pure function `advancePreviewTime` (with tests) handles the synthetic clock's wrap-around.
- Design spec: `docs/superpowers/specs/2026-08-09-caption-style-preview-design.md`

## Test plan
- [x] `pnpm check`/`pnpm test`/`pnpm build` all pass
- [x] Verified on a Cloudflare Preview URL (`wrangler versions upload`, not a production deploy) — visually confirmed by the user before opening this PR
EOF
)"
```

- [ ] **Step 5: Wait for CI, then merge**

Check CI status (`gh pr checks <number>`), wait for the `test` job to pass, then:

```bash
gh pr merge <number> --merge --delete-branch
```

This will trigger the gated `deploy` job (fixed in PR #23 — only runs after `test` passes) on the merge-to-main push, which ships this to production automatically.
