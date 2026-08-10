# Video Preview + Implicit Enable Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the editor's video preview always visible (not just while
actively cropping), and remove the per-tool on/off `Switch`/`ToolCard`
entirely — a tool counts as "in use" the moment the user makes a real
selection within it, not via a separate toggle.

**Architecture:** `CropPositioner.svelte` is replaced by
`VideoPreview.svelte` — the same drag/resize/grid-overlay logic, but
always mounted (not nested inside the Reformat panel), with its crop-box
overlay gated behind a new `showCropBox` prop instead of being
unconditional. `ToolCard.svelte` is deleted; each tool's controls render
directly. `speedEnabled`/`captionsEnabled` booleans are removed —
`speed !== 1` and `captionSegments.length > 0` become the sole "in use"
signals, simplifying `hasActiveTransform`, `buildExportSummary`, and the
`toolTabs` enabled-dot conditions.

**Tech Stack:** SvelteKit 5 (runes), TypeScript, Vitest.

## Global Constraints

- Not a functional change to combinability — all four tools stay
  independently usable together in one export.
- Pure logic goes in its own `www/src/lib/*.ts` module with a matching
  `*.test.ts`. Svelte components are not unit-tested in this repo.
- Commit messages: Conventional Commits, no scope, no trailing period, no
  `Co-Authored-By` trailer.
- Branch: `feat/tool-tabs-redesign` is currently checked out — it already
  has the tool-tabs redesign work plus a merged `feat/crop-positioner-polish`.
  Implementation continues on this same branch (not yet pushed).
- Design spec: `docs/superpowers/specs/2026-08-10-video-preview-implicit-enable-design.md`

---

### Task 1: Simplify `buildExportSummary`

**Files:**
- Modify: `www/src/lib/editor-summary.ts` (full replace)
- Test: `www/src/lib/editor-summary.test.ts` (full replace)

**Interfaces:**
- `EditorSummaryInput` drops `speedEnabled` and `captionsEnabled` —
  becomes `{ mode: ReformatMode; ratio: AspectRatio; speed: number;
  compression: CompressionSettings; hasCaptionSegments: boolean }`.
  Consumed by Task 3's `+page.svelte`.

- [ ] **Step 1: Write the failing tests**

Replace all of `www/src/lib/editor-summary.test.ts` with:

```ts
import { describe, expect, it } from 'vitest';
import { buildExportSummary } from './editor-summary';
import { ASPECT_RATIOS, DEFAULT_COMPRESSION, type CompressionSettings } from '$lib/ffmpeg/filters';

const offCompression: CompressionSettings = { mode: 'none', crf: 23, targetMB: 10 };

describe('buildExportSummary', () => {
	it('returns an empty list when nothing is enabled', () => {
		expect(
			buildExportSummary({
				mode: 'none',
				ratio: ASPECT_RATIOS[0],
				speed: 1,
				compression: offCompression,
				hasCaptionSegments: false
			})
		).toEqual([]);
	});

	it('includes the ratio label when crop mode is active', () => {
		const result = buildExportSummary({
			mode: 'crop',
			ratio: ASPECT_RATIOS[0],
			speed: 1,
			compression: offCompression,
			hasCaptionSegments: false
		});
		expect(result).toEqual(['Crop 9:16']);
	});

	it('labels blur-pad mode distinctly from crop', () => {
		const result = buildExportSummary({
			mode: 'blur-pad',
			ratio: ASPECT_RATIOS[0],
			speed: 1,
			compression: offCompression,
			hasCaptionSegments: false
		});
		expect(result).toEqual(['Blur pad 9:16']);
	});

	it('includes the speed multiplier when speed is not 1x', () => {
		const result = buildExportSummary({
			mode: 'none',
			ratio: ASPECT_RATIOS[0],
			speed: 1.5,
			compression: offCompression,
			hasCaptionSegments: false
		});
		expect(result).toEqual(['1.50x speed']);
	});

	it('formats a fractional speed to two decimal places', () => {
		const result = buildExportSummary({
			mode: 'none',
			ratio: ASPECT_RATIOS[0],
			speed: 1.35,
			compression: offCompression,
			hasCaptionSegments: false
		});
		expect(result).toEqual(['1.35x speed']);
	});

	it('excludes speed when left at the no-op 1x value', () => {
		const result = buildExportSummary({
			mode: 'none',
			ratio: ASPECT_RATIOS[0],
			speed: 1,
			compression: offCompression,
			hasCaptionSegments: false
		});
		expect(result).toEqual([]);
	});

	it('includes compression when its mode is not none', () => {
		const result = buildExportSummary({
			mode: 'none',
			ratio: ASPECT_RATIOS[0],
			speed: 1,
			compression: DEFAULT_COMPRESSION,
			hasCaptionSegments: false
		});
		expect(result).toEqual(['Compression']);
	});

	it('includes captions only when a transcript exists', () => {
		expect(
			buildExportSummary({
				mode: 'none',
				ratio: ASPECT_RATIOS[0],
				speed: 1,
				compression: offCompression,
				hasCaptionSegments: false
			})
		).toEqual([]);

		expect(
			buildExportSummary({
				mode: 'none',
				ratio: ASPECT_RATIOS[0],
				speed: 1,
				compression: offCompression,
				hasCaptionSegments: true
			})
		).toEqual(['Captions']);
	});

	it('lists multiple active tools together, in reformat/speed/compression/captions order', () => {
		const result = buildExportSummary({
			mode: 'crop',
			ratio: ASPECT_RATIOS[0],
			speed: 1.5,
			compression: DEFAULT_COMPRESSION,
			hasCaptionSegments: true
		});
		expect(result).toEqual(['Crop 9:16', '1.50x speed', 'Compression', 'Captions']);
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd www && pnpm test -- editor-summary.test.ts`
Expected: FAIL — a type error / extra-argument mismatch against the
current `EditorSummaryInput`, which still requires `speedEnabled`/
`captionsEnabled`.

- [ ] **Step 3: Write the implementation**

Replace all of `www/src/lib/editor-summary.ts` with:

```ts
import type { AspectRatio, CompressionSettings, ReformatMode } from '$lib/ffmpeg/filters';

export interface EditorSummaryInput {
	mode: ReformatMode;
	ratio: AspectRatio;
	speed: number;
	compression: CompressionSettings;
	hasCaptionSegments: boolean;
}

// One-line "what will actually happen on export" summary shown next to the
// Export button — built from exactly the same conditions as the editor
// page's hasActiveTransform guard, so it never promises something the
// export won't do. There's no separate "enabled" flag for any tool
// anymore — a real selection (a non-1x speed, a picked reformat/
// compression mode, an actual transcript) is itself the signal.
export function buildExportSummary(input: EditorSummaryInput): string[] {
	const parts: string[] = [];

	if (input.mode === 'crop') parts.push(`Crop ${input.ratio.label}`);
	else if (input.mode === 'blur-pad') parts.push(`Blur pad ${input.ratio.label}`);

	if (input.speed !== 1) parts.push(`${input.speed.toFixed(2)}x speed`);

	if (input.compression.mode !== 'none') parts.push('Compression');

	if (input.hasCaptionSegments) parts.push('Captions');

	return parts;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd www && pnpm test -- editor-summary.test.ts`
Expected: PASS, all 9 tests green.

- [ ] **Step 5: Commit**

```bash
cd /home/phon/Programming/vidm
git add www/src/lib/editor-summary.ts www/src/lib/editor-summary.test.ts
git commit -m "refactor: derive export summary conditions from real selections, not enabled flags"
```

---

### Task 2: `VideoPreview` replaces `CropPositioner`

**Files:**
- Delete: `www/src/lib/components/CropPositioner.svelte`
- Create: `www/src/lib/components/VideoPreview.svelte`

**Interfaces:**
- Produces: `VideoPreview` component — props `file: File`, `ratio:
  AspectRatio`, `crop: CropRegion` (bindable), `showCropBox: boolean`,
  `sourceWidth?: number` (bindable, default 0), `sourceHeight?: number`
  (bindable, default 0), `sourceDuration?: number` (bindable, default 0).
  Consumed by Task 3's `+page.svelte`, which no longer needs its own
  hidden `<video>`/`onSourceVideoLoaded` for source metadata — this
  component is now the sole source of it.

- [ ] **Step 1: Delete the old file**

```bash
cd /home/phon/Programming/vidm
git rm www/src/lib/components/CropPositioner.svelte
```

- [ ] **Step 2: Create the replacement**

Create `www/src/lib/components/VideoPreview.svelte`:

```svelte
<script lang="ts">
	import { computeOutputDimensions, type AspectRatio, type CropRegion } from '$lib/ffmpeg/filters';

	let {
		file,
		ratio,
		crop = $bindable(),
		showCropBox,
		sourceWidth = $bindable(0),
		sourceHeight = $bindable(0),
		sourceDuration = $bindable(0)
	}: {
		file: File;
		ratio: AspectRatio;
		crop: CropRegion;
		showCropBox: boolean;
		sourceWidth?: number;
		sourceHeight?: number;
		sourceDuration?: number;
	} = $props();

	let videoEl: HTMLVideoElement | undefined = $state();
	let renderedWidth = $state(0);
	let renderedHeight = $state(0);

	// Fraction (0-1) of the way through the available drag range, per axis.
	let offsetXFrac = $state(0.5);
	let offsetYFrac = $state(0.5);

	// 1 = the largest box that fits the ratio (the old fixed behavior);
	// smaller zooms in, cropping a tighter region. Bounded below so the
	// crop region can't shrink to something degenerate.
	const MIN_BOX_SCALE = 0.3;
	let boxScale = $state(1);

	const objectUrl = $derived(URL.createObjectURL(file));

	function onLoadedMetadata() {
		if (!videoEl) return;
		sourceWidth = videoEl.videoWidth;
		sourceHeight = videoEl.videoHeight;
		sourceDuration = videoEl.duration;
		renderedWidth = videoEl.clientWidth;
		renderedHeight = videoEl.clientHeight;
		// Some browsers (notably Firefox) never paint a frame for a paused,
		// non-autoplaying <video> until something actually requests one — a
		// negligible forced seek triggers the decode+paint without visibly
		// scrubbing, so the preview shows real content instead of black.
		videoEl.currentTime = 0.001;
	}

	// Largest box with the target ratio that fits inside the source frame,
	// as a fraction of the source's own width/height — the boxScale=1
	// reference size that resizing scales down from.
	const boxFrac = $derived.by(() => {
		if (!sourceWidth || !sourceHeight) return { w: 1, h: 1 };
		const sourceRatio = sourceWidth / sourceHeight;
		const targetRatio = ratio.w / ratio.h;
		return targetRatio < sourceRatio
			? { w: (sourceRatio ? targetRatio / sourceRatio : 1), h: 1 }
			: { w: 1, h: sourceRatio / targetRatio };
	});

	// The box's actual on-screen size, after applying the resize scale —
	// still exactly ratio-locked, since both axes scale by the same factor.
	const boxSizeFrac = $derived({ w: boxFrac.w * boxScale, h: boxFrac.h * boxScale });

	// libx264 requires even width/height (yuv420p chroma subsampling) —
	// round down to the nearest even number, never up, so the crop region
	// never exceeds the source frame.
	function toEven(n: number): number {
		return Math.floor(n / 2) * 2;
	}

	$effect(() => {
		if (!sourceWidth || !sourceHeight) return;
		const boxW = toEven(boxSizeFrac.w * sourceWidth);
		const boxH = toEven(boxSizeFrac.h * sourceHeight);
		const slackX = sourceWidth - boxW;
		const slackY = sourceHeight - boxH;
		crop = {
			width: boxW,
			height: boxH,
			x: toEven(offsetXFrac * slackX),
			y: toEven(offsetYFrac * slackY)
		};
	});

	// Live readout of the actual export resolution this crop region will
	// produce — reuses the same computeOutputDimensions call +page.svelte
	// makes for the real export, so what's shown here never drifts from
	// what actually gets encoded.
	const outputSize = $derived(
		computeOutputDimensions({ mode: 'crop', ratio, crop, sourceWidth, sourceHeight })
	);

	let dragging = false;
	let dragStartX = 0;
	let dragStartY = 0;
	let dragStartOffsetX = 0;
	let dragStartOffsetY = 0;

	function onPointerDown(e: PointerEvent) {
		dragging = true;
		dragStartX = e.clientX;
		dragStartY = e.clientY;
		dragStartOffsetX = offsetXFrac;
		dragStartOffsetY = offsetYFrac;
		(e.target as HTMLElement).setPointerCapture(e.pointerId);
	}

	function onPointerMove(e: PointerEvent) {
		if (!dragging || !renderedWidth || !renderedHeight) return;
		const slackXPx = (1 - boxSizeFrac.w) * renderedWidth;
		const slackYPx = (1 - boxSizeFrac.h) * renderedHeight;
		const dx = e.clientX - dragStartX;
		const dy = e.clientY - dragStartY;
		offsetXFrac = slackXPx > 0 ? clamp01(dragStartOffsetX + dx / slackXPx) : 0.5;
		offsetYFrac = slackYPx > 0 ? clamp01(dragStartOffsetY + dy / slackYPx) : 0.5;
	}

	function onPointerUp() {
		dragging = false;
	}

	// Resize via the bottom-right handle, anchored at the box's current
	// top-left corner (that corner stays put; only the opposite corner
	// moves) — horizontal drag distance alone drives the scale, since the
	// ratio lock means the vertical size is already implied by it.
	let resizing = false;
	let resizeStartX = 0;
	let resizeStartScale = 1;
	let resizeAnchorLeftPx = 0;
	let resizeAnchorTopPx = 0;

	function onResizePointerDown(e: PointerEvent) {
		e.stopPropagation();
		if (!renderedWidth || !renderedHeight) return;
		resizing = true;
		resizeStartX = e.clientX;
		resizeStartScale = boxScale;
		resizeAnchorLeftPx = offsetXFrac * (1 - boxSizeFrac.w) * renderedWidth;
		resizeAnchorTopPx = offsetYFrac * (1 - boxSizeFrac.h) * renderedHeight;
		(e.target as HTMLElement).setPointerCapture(e.pointerId);
	}

	function onResizePointerMove(e: PointerEvent) {
		if (!resizing || !renderedWidth || !boxFrac.w) return;
		const maxWidthPx = boxFrac.w * renderedWidth;
		const minWidthPx = boxFrac.w * MIN_BOX_SCALE * renderedWidth;
		const startWidthPx = boxFrac.w * resizeStartScale * renderedWidth;
		const dx = e.clientX - resizeStartX;
		const newWidthPx = Math.min(maxWidthPx, Math.max(minWidthPx, startWidthPx + dx));
		boxScale = newWidthPx / maxWidthPx;

		const newSizeFrac = { w: boxFrac.w * boxScale, h: boxFrac.h * boxScale };
		const slackXPx = (1 - newSizeFrac.w) * renderedWidth;
		const slackYPx = (1 - newSizeFrac.h) * renderedHeight;
		offsetXFrac = slackXPx > 0 ? clamp01(resizeAnchorLeftPx / slackXPx) : 0.5;
		offsetYFrac = slackYPx > 0 ? clamp01(resizeAnchorTopPx / slackYPx) : 0.5;
	}

	function onResizePointerUp() {
		resizing = false;
	}

	function clamp01(n: number): number {
		return Math.min(1, Math.max(0, n));
	}
</script>

<div class="relative mx-auto max-w-[480px]">
	<video
		bind:this={videoEl}
		src={objectUrl}
		onloadedmetadata={onLoadedMetadata}
		muted
		playsinline
		class="block w-full rounded-md"
	></video>
	{#if showCropBox && sourceWidth}
		<div
			class="border-primary bg-primary/20 absolute cursor-grab touch-none border-2 active:cursor-grabbing"
			style:width={`${boxSizeFrac.w * 100}%`}
			style:height={`${boxSizeFrac.h * 100}%`}
			style:left={`${offsetXFrac * (1 - boxSizeFrac.w) * 100}%`}
			style:top={`${offsetYFrac * (1 - boxSizeFrac.h) * 100}%`}
			onpointerdown={onPointerDown}
			onpointermove={onPointerMove}
			onpointerup={onPointerUp}
		>
			<div
				class="pointer-events-none absolute inset-0"
				style:background-image={`linear-gradient(to right, color-mix(in srgb, var(--primary) 50%, transparent) 1px, transparent 1px), linear-gradient(to bottom, color-mix(in srgb, var(--primary) 50%, transparent) 1px, transparent 1px)`}
				style:background-size="33.333% 33.333%"
			></div>
			<div
				class="border-primary bg-primary absolute -right-1.5 -bottom-1.5 size-4 touch-none rounded-full border-2 cursor-nwse-resize"
				onpointerdown={onResizePointerDown}
				onpointermove={onResizePointerMove}
				onpointerup={onResizePointerUp}
			></div>
		</div>
	{/if}
</div>
{#if showCropBox && sourceWidth}
	<p class="text-muted-foreground mt-1.5 text-center text-sm tabular-nums">
		Output: {outputSize.width} × {outputSize.height}px
	</p>
	<p class="text-muted-foreground mt-1.5 text-center text-sm">
		Drag the box to reposition, or the corner handle to resize.
	</p>
{/if}
```

Note the two `<p>` helper lines moved inside the `showCropBox` guard —
previously this component only ever existed while crop mode was active,
so "Drag the box…" was always relevant when mounted at all. Now it's
always mounted (for the plain video), so that instructional text (and the
output-size readout) should only show when there's actually a crop box on
screen to refer to.

- [ ] **Step 3: Type-check**

Run: `cd www && pnpm check`
Expected: errors are acceptable only in `www/src/routes/+page.svelte`
(still importing the now-deleted `CropPositioner` — fixed in Task 3). Any
error inside `VideoPreview.svelte` itself must be fixed before proceeding.

- [ ] **Step 4: Commit**

```bash
cd /home/phon/Programming/vidm
git add www/src/lib/components/CropPositioner.svelte www/src/lib/components/VideoPreview.svelte
git commit -m "feat: replace CropPositioner with an always-visible VideoPreview"
```

---

### Task 3: Rewire `+page.svelte` — drop `ToolCard`, wire `VideoPreview`, implicit enable

**Files:**
- Delete: `www/src/lib/components/ToolCard.svelte`
- Modify: `www/src/routes/+page.svelte` (full replace)

**Interfaces:**
- Consumes: `VideoPreview` (Task 2), the simplified `buildExportSummary`
  (Task 1). `ToolCard` is no longer imported or used anywhere.

- [ ] **Step 1: Delete `ToolCard.svelte`**

```bash
cd /home/phon/Programming/vidm
git rm www/src/lib/components/ToolCard.svelte
```

- [ ] **Step 2: Replace `+page.svelte`**

Replace all of `www/src/routes/+page.svelte` with:

```svelte
<script lang="ts">
	import { goto } from '$app/navigation';
	import { fetchFile } from '@ffmpeg/util';
	import { loadFFmpeg } from '$lib/ffmpeg/client';
	import { exportResult } from '$lib/export-state.svelte';
	import {
		buildExportArgs,
		computeOutputDimensions,
		ASPECT_RATIOS,
		DEFAULT_COMPRESSION,
		type ReformatMode,
		type CropRegion,
		type CompressionSettings
	} from '$lib/ffmpeg/filters';
	import { buildAssSubtitle } from '$lib/captions/ass';
	import { buildExportSummary } from '$lib/editor-summary';
	import { DEFAULT_CAPTION_STYLE, type CaptionStyle } from '$lib/captions/style';
	import type { CaptionSegment } from '$lib/whisper/srt';
	import UploadDropzone from '$lib/components/UploadDropzone.svelte';
	import ToolTabs from '$lib/components/ToolTabs.svelte';
	import VideoPreview from '$lib/components/VideoPreview.svelte';
	import FormatToggle from '$lib/components/FormatToggle.svelte';
	import RatioSelector from '$lib/components/RatioSelector.svelte';
	import SpeedControl from '$lib/components/SpeedControl.svelte';
	import CompressionControl from '$lib/components/CompressionControl.svelte';
	import CaptionsPanel from '$lib/components/CaptionsPanel.svelte';
	import { Button } from '$lib/components/ui/button';
	import ThemeToggle from '$lib/components/ThemeToggle.svelte';
	import CropIcon from '@lucide/svelte/icons/crop';
	import GaugeIcon from '@lucide/svelte/icons/gauge';
	import ArchiveIcon from '@lucide/svelte/icons/archive';
	import CaptionsIcon from '@lucide/svelte/icons/captions';

	type Status = 'configuring' | 'loading-engine' | 'processing' | 'done' | 'error';
	type ActiveTool = 'reformat' | 'speed' | 'compression' | 'captions';

	let status = $state<Status>('configuring');
	let progress = $state(0);
	let errorMessage = $state('');
	let mode = $state<ReformatMode>('none');
	let ratio = $state(ASPECT_RATIOS[0]);
	let speed = $state(1);
	let compression = $state<CompressionSettings>({ ...DEFAULT_COMPRESSION, mode: 'none' });
	let sourceFile = $state<File | null>(null);
	let sourceDuration = $state(0);
	let sourceWidth = $state(0);
	let sourceHeight = $state(0);
	let crop = $state<CropRegion>({ x: 0, y: 0, width: 0, height: 0 });
	let captionSegments = $state<CaptionSegment[]>([]);
	let captionStyle = $state<CaptionStyle>({ ...DEFAULT_CAPTION_STYLE });
	let activeTool = $state<ActiveTool>('reformat');

	// Every option is independently optional (reformat, speed, compression,
	// captions) — but exporting with literally nothing selected would just
	// re-encode the source unchanged for no reason, so require at least one.
	// There's no separate "enabled" flag for any tool — a real selection
	// (a non-1x speed, a picked reformat/compression mode, an actual
	// transcript) is itself the signal.
	const hasActiveTransform = $derived(
		mode !== 'none' || speed !== 1 || compression.mode !== 'none' || captionSegments.length > 0
	);

	const exportSummary = $derived(
		buildExportSummary({
			mode,
			ratio,
			speed,
			compression,
			hasCaptionSegments: captionSegments.length > 0
		})
	);

	const toolTabs = $derived([
		{ id: 'reformat', label: 'Reformat', icon: CropIcon, enabled: mode !== 'none' },
		{ id: 'speed', label: 'Speed', icon: GaugeIcon, enabled: speed !== 1 },
		{
			id: 'compression',
			label: 'Compression',
			icon: ArchiveIcon,
			enabled: compression.mode !== 'none'
		},
		{ id: 'captions', label: 'Captions', icon: CaptionsIcon, enabled: captionSegments.length > 0 }
	]);

	// The crop box only overlays the video while actively viewing the
	// Reformat tab in crop mode — showing it while the user is looking at
	// a different tool's panel would be irrelevant clutter.
	const showCropBox = $derived(mode === 'crop' && activeTool === 'reformat');

	function handleFile(file: File) {
		sourceFile = file;
	}

	async function run() {
		if (!sourceFile) return;

		errorMessage = '';
		progress = 0;
		status = 'loading-engine';

		try {
			const ffmpeg = await loadFFmpeg();
			const offProgress = ffmpeg.on('progress', ({ progress: p }) => {
				progress = Math.round(Math.min(Math.max(p, 0), 1) * 100);
			});

			status = 'processing';

			const inputName = 'input.mp4';
			const outputName = 'output.mp4';
			await ffmpeg.writeFile(inputName, await fetchFile(sourceFile));

			let captionsAssPath: string | undefined;
			let captionsFontsDir: string | undefined;
			if (captionSegments.length > 0) {
				const { width: outW, height: outH } = computeOutputDimensions({
					mode,
					ratio,
					crop,
					sourceWidth,
					sourceHeight
				});
				const assContent = buildAssSubtitle(captionSegments, captionStyle, outW, outH, speed);
				await ffmpeg.writeFile('captions.ass', assContent);
				await ffmpeg.createDir('fonts');
				await ffmpeg.writeFile(
					`fonts/${captionStyle.font.file}`,
					await fetchFile(`/fonts/${captionStyle.font.file}`)
				);
				captionsAssPath = 'captions.ass';
				captionsFontsDir = 'fonts';
			}

			await ffmpeg.exec(
				buildExportArgs(inputName, outputName, {
					mode,
					speed,
					ratio,
					crop,
					compression,
					sourceDurationSeconds: sourceDuration,
					sourceWidth,
					sourceHeight,
					captionsAssPath,
					captionsFontsDir
				})
			);
			const data = await ffmpeg.readFile(outputName);

			exportResult.url = URL.createObjectURL(
				new Blob([new Uint8Array(data as Uint8Array)], { type: 'video/mp4' })
			);
			exportResult.downloadName = `vidm-${mode}${mode !== 'none' ? `-${ratio.label}` : ''}-${speed}x.mp4`;

			ffmpeg.off('progress', offProgress as never);
			status = 'done';
			// Client-side navigation (not a hard reload) — the blob URL above
			// stays valid since it's still the same document. The /export
			// page's "back" button does the hard reload this app actually
			// needs before the next conversion (see its own comment).
			await goto('/export');
		} catch (err) {
			status = 'error';
			errorMessage = err instanceof Error ? err.message : String(err);
		}
	}
</script>

<main class="mx-auto flex max-w-2xl flex-col gap-5 px-4 py-8">
	<div class="flex items-start justify-between gap-4">
		<div class="space-y-1">
			<h1 class="text-2xl font-bold tracking-tight">vidm — lightweight video editor</h1>
			<p class="text-muted-foreground text-sm">
				Upload a video, then reformat, adjust speed, compress, and caption it. Runs entirely in your browser.
			</p>
		</div>
		<ThemeToggle />
	</div>

	{#if status === 'configuring' && !sourceFile}
		<UploadDropzone onFile={handleFile} />
	{/if}

	{#if sourceFile && (status === 'configuring' || status === 'error')}
		<ToolTabs
			tabs={toolTabs}
			active={activeTool}
			onActiveChange={(id) => (activeTool = id as ActiveTool)}
		/>

		<VideoPreview
			file={sourceFile}
			{ratio}
			bind:crop
			{showCropBox}
			bind:sourceWidth
			bind:sourceHeight
			bind:sourceDuration
		/>

		<div class={activeTool === 'reformat' ? 'space-y-4' : 'hidden'}>
			<FormatToggle bind:mode />
			<RatioSelector bind:ratio />
		</div>
		<div class={activeTool === 'speed' ? 'space-y-4' : 'hidden'}>
			<SpeedControl bind:speed />
		</div>
		<div class={activeTool === 'compression' ? 'space-y-4' : 'hidden'}>
			<CompressionControl bind:compression />
		</div>
		<div class={activeTool === 'captions' ? 'space-y-4' : 'hidden'}>
			<CaptionsPanel file={sourceFile} bind:segments={captionSegments} bind:style={captionStyle} />
		</div>

		<div class="flex flex-col items-start gap-1.5">
			{#if exportSummary.length > 0}
				<p class="text-muted-foreground text-sm">{exportSummary.join(' · ')}</p>
			{/if}
			<Button onclick={run} disabled={!hasActiveTransform}>Export</Button>
			{#if !hasActiveTransform}
				<p class="text-muted-foreground text-sm">
					Select at least one option — reformat, speed, compression, or captions — to export.
				</p>
			{/if}
		</div>
	{/if}

	{#if status === 'loading-engine'}
		<p class="text-muted-foreground text-sm">Loading FFmpeg engine…</p>
	{:else if status === 'processing'}
		<p class="text-muted-foreground text-sm">Reformatting… {progress}%</p>
	{:else if status === 'error'}
		<p class="text-destructive text-sm">Something went wrong: {errorMessage}</p>
	{/if}
</main>
```

Note `onSourceVideoLoaded` and the old hidden `<video>` are gone entirely
— `VideoPreview`'s bindable `sourceWidth`/`sourceHeight`/`sourceDuration`
now supply that data directly.

- [ ] **Step 3: Full verification**

Run, in order, from `www/`:

```bash
pnpm check
pnpm test
pnpm build
```

Expected: all three PASS. `pnpm check` fully clean (0 errors — resolves
Task 2's expected-if-run-alone `+page.svelte` errors). `pnpm test` shows
all tests passing (56 total — same count as before, Task 1 changed
existing tests' shape but not their number), no regressions.

- [ ] **Step 4: Commit**

```bash
cd /home/phon/Programming/vidm
git add www/src/routes/+page.svelte
git commit -m "feat: remove per-tool switch in favor of implicit enable by selection"
```

---

### Task 4: Verify on a Cloudflare Preview URL, then push and open a PR

**Files:** none (verification and git/deploy operations only).

**Interfaces:** none — this task only runs commands and inspects output.

- [ ] **Step 1: Get a Preview URL without touching production**

Run, from `www/`:

```bash
pnpm build
rm -f build/_redirects build/ffmpeg/ffmpeg-core.wasm build/whisper/ggml-tiny.en-q5_1.bin
pnpm exec wrangler versions upload
```

Note the printed preview URL for the next step.

- [ ] **Step 2: Smoke-test the preview URL**

```bash
curl -s -o /dev/null -w "homepage: %{http_code}\n" "<preview-url>/"
curl -s -o /dev/null -w "ffmpeg-core.wasm: %{http_code}\n" "<preview-url>/ffmpeg/ffmpeg-core.wasm"
curl -s -o /dev/null -w "whisper model: %{http_code}\n" "<preview-url>/whisper/ggml-tiny.en-q5_1.bin"
```

Expected: all three `200`.

- [ ] **Step 3: Hand off for visual confirmation**

Report the preview URL to the user and ask them to open it, upload a
video, and confirm: the video preview is visible immediately after
upload and stays visible across every tab (not just Reformat); picking
"Center crop" in the Reformat tab immediately shows the crop box
overlaid on that same video, with the grid and live "Output: WxHpx"
readout from the earlier crop-positioner-polish work still present;
switching to Speed/Compression/Captions never shows the crop box; no tab
has a separate on/off switch anymore — picking a reformat mode, moving
the speed slider off 1x, picking a compression mode, or generating a
transcript is itself what makes the export summary line and each tab's
dot indicator light up; switching tabs still preserves a configured crop
box and in-progress/completed transcription exactly as before; and an
actual export with at least one real selection still completes. Do not
proceed to Step 4 until they confirm it looks and behaves right.

- [ ] **Step 4: Push and open a PR**

Once the user confirms:

```bash
cd /home/phon/Programming/vidm
git push -u origin feat/tool-tabs-redesign
gh pr create --title "feat: always-visible video preview and implicit tool enable" --body "$(cat <<'EOF'
## Summary
- Icon-tab navigation for the editor's four tools (Reformat/Speed/Compression/Captions), replacing the old always-stacked cards — one panel visible at a time, tool state preserved across tab switches.
- Video preview is now always visible (not just while cropping) — `VideoPreview` replaces `CropPositioner`, with the crop-box overlay showing only while actively viewing the Reformat tab in crop mode.
- Removed the per-tool on/off switch entirely — a tool counts as "in use" the moment you make a real selection within it (a non-1x speed, a picked reformat/compression mode, an actual transcript), not via a separate toggle.
- Speed control converted from a radio group to a continuous slider.
- Includes the earlier crop-positioner-polish work (rule-of-thirds grid + live output-dimension readout), merged into this branch.
- Design specs: `docs/superpowers/specs/2026-08-10-tool-tabs-redesign-design.md`, `docs/superpowers/specs/2026-08-10-crop-positioner-polish-design.md`, `docs/superpowers/specs/2026-08-10-video-preview-implicit-enable-design.md`

## Test plan
- [x] `pnpm check`/`pnpm test`/`pnpm build` all pass
- [x] Verified on a Cloudflare Preview URL (`wrangler versions upload`, not a production deploy) — visually confirmed by the user before opening this PR
EOF
)"
```

- [ ] **Step 5: Wait for CI, then merge**

Check CI status (`gh pr checks <number>`), wait for the `test` job to
pass, then ask the user for explicit merge confirmation before running:

```bash
gh pr merge <number> --merge --delete-branch
```

Watch the resulting `main` deploy run to completion
(`gh run watch <run-id> --exit-status`) and confirm the `deploy` job
succeeds before reporting done.
