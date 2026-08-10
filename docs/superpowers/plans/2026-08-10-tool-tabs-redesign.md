# Tool Tabs Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the editor page's four always-stacked `ToolCard`s with an
icon tab strip — one tool's panel visible at a time, matching a reference
online video cropper the user liked — while keeping the app's core
architecture unchanged: all four tools stay independently on/off and
combinable in one export. Also converts `SpeedControl` from a discrete
radio group to a continuous slider.

**Architecture:** A new `ToolTabs` component renders one icon button per
tool (with a small dot when that tool is enabled) and drives which single
`ToolCard` instance is currently mounted in `+page.svelte` — `ToolCard`
itself is reused completely unchanged. `SpeedControl` swaps its
`RadioGroup` for the existing `Slider` UI primitive (already used by
`CompressionControl`'s CRF control). Because a continuous slider can land
exactly on `1` (unlike the old discrete options, which deliberately
excluded it), the no-op-export guard in both `+page.svelte` and
`buildExportSummary` is hardened from bare `speedEnabled` to
`speedEnabled && speed !== 1`.

**Tech Stack:** SvelteKit 5 (runes), TypeScript, Vitest, `@lucide/svelte`
(icons), `bits-ui` (Slider primitive, already in use).

## Global Constraints

- This is purely a navigation/layout change — nothing about which tools
  can be combined for one export changes. Enabling one tool must never
  disable another.
- Pure logic goes in its own `www/src/lib/*.ts` module with a matching
  `*.test.ts` (this repo's convention). Svelte components are not
  unit-tested (no `@testing-library/svelte`, no `.svelte.test.ts` files
  in this repo) — tasks touching only `.svelte` files skip the TDD
  test-first cycle for that reason.
- Icon imports use the per-icon deep-import path this repo already uses
  (see `www/src/lib/components/ThemeToggle.svelte`):
  `import SunIcon from '@lucide/svelte/icons/sun';` — not a barrel import.
- Commit messages: Conventional Commits, no scope, no trailing period, no
  `Co-Authored-By` trailer.
- Branch: `feat/tool-tabs-redesign` is currently checked out and holds
  only the approved design spec commit — implementation continues on this
  branch.
- Design spec: `docs/superpowers/specs/2026-08-10-tool-tabs-redesign-design.md`

---

### Task 1: `SpeedControl` — slider instead of radio group

**Files:**
- Modify: `www/src/lib/components/SpeedControl.svelte` (full replace)

**Interfaces:**
- Props unchanged: `{ speed: number (bindable); disabled?: boolean }` —
  no caller needs to change (`+page.svelte`'s `<SpeedControl bind:speed />`
  keeps working as-is).

- [ ] **Step 1: Replace the file**

Replace all of `www/src/lib/components/SpeedControl.svelte` with:

```svelte
<script lang="ts">
	import { MIN_SPEED, MAX_SPEED } from '$lib/ffmpeg/filters';
	import { Slider } from '$lib/components/ui/slider';
	import { Label } from '$lib/components/ui/label';

	let {
		speed = $bindable(),
		disabled = false
	}: { speed: number; disabled?: boolean } = $props();

	const SPEED_STEP = 0.05;

	// Rounds to the nearest step so repeated 0.05 increments never drift
	// into floating-point noise (e.g. 1.2999999999999998) — done once
	// here, at the point speed is set, rather than reformatting it at
	// every display site.
	function onSpeedChange(value: number) {
		speed = Math.round(value / SPEED_STEP) * SPEED_STEP;
	}
</script>

<fieldset {disabled} class="space-y-2">
	<legend class="mb-1 text-sm font-semibold">Playback speed</legend>
	<div class="flex max-w-sm flex-wrap items-center gap-3">
		<Label for="speed-slider" class="font-normal">Speed:</Label>
		<Slider
			id="speed-slider"
			type="single"
			min={MIN_SPEED}
			max={MAX_SPEED}
			step={SPEED_STEP}
			value={speed}
			onValueChange={onSpeedChange}
			{disabled}
			class="w-40"
		/>
		<span class="text-sm tabular-nums">{speed.toFixed(2)}x</span>
	</div>
</fieldset>
```

- [ ] **Step 2: Type-check**

Run: `cd www && pnpm check`
Expected: PASS, 0 errors.

- [ ] **Step 3: Commit**

```bash
cd /home/phon/Programming/vidm
git add www/src/lib/components/SpeedControl.svelte
git commit -m "feat: replace speed radio group with a continuous slider"
```

---

### Task 2: Harden the no-op-speed guard in `buildExportSummary`

**Files:**
- Modify: `www/src/lib/editor-summary.ts` (full replace)
- Test: `www/src/lib/editor-summary.test.ts` (full replace)

**Interfaces:**
- `buildExportSummary`'s signature is unchanged (`EditorSummaryInput` →
  `string[]`) — only its internal speed condition changes. Consumed
  as-is by Task 4's `+page.svelte`.

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
				speedEnabled: false,
				speed: 1,
				compression: offCompression,
				captionsEnabled: false,
				hasCaptionSegments: false
			})
		).toEqual([]);
	});

	it('includes the ratio label when crop mode is active', () => {
		const result = buildExportSummary({
			mode: 'crop',
			ratio: ASPECT_RATIOS[0],
			speedEnabled: false,
			speed: 1,
			compression: offCompression,
			captionsEnabled: false,
			hasCaptionSegments: false
		});
		expect(result).toEqual(['Crop 9:16']);
	});

	it('labels blur-pad mode distinctly from crop', () => {
		const result = buildExportSummary({
			mode: 'blur-pad',
			ratio: ASPECT_RATIOS[0],
			speedEnabled: false,
			speed: 1,
			compression: offCompression,
			captionsEnabled: false,
			hasCaptionSegments: false
		});
		expect(result).toEqual(['Blur pad 9:16']);
	});

	it('includes the speed multiplier when speed is enabled and not 1x', () => {
		const result = buildExportSummary({
			mode: 'none',
			ratio: ASPECT_RATIOS[0],
			speedEnabled: true,
			speed: 1.5,
			compression: offCompression,
			captionsEnabled: false,
			hasCaptionSegments: false
		});
		expect(result).toEqual(['1.50x speed']);
	});

	it('formats a fractional speed to two decimal places', () => {
		const result = buildExportSummary({
			mode: 'none',
			ratio: ASPECT_RATIOS[0],
			speedEnabled: true,
			speed: 1.35,
			compression: offCompression,
			captionsEnabled: false,
			hasCaptionSegments: false
		});
		expect(result).toEqual(['1.35x speed']);
	});

	it('excludes speed when enabled but left at the no-op 1x value', () => {
		const result = buildExportSummary({
			mode: 'none',
			ratio: ASPECT_RATIOS[0],
			speedEnabled: true,
			speed: 1,
			compression: offCompression,
			captionsEnabled: false,
			hasCaptionSegments: false
		});
		expect(result).toEqual([]);
	});

	it('includes compression when its mode is not none', () => {
		const result = buildExportSummary({
			mode: 'none',
			ratio: ASPECT_RATIOS[0],
			speedEnabled: false,
			speed: 1,
			compression: DEFAULT_COMPRESSION,
			captionsEnabled: false,
			hasCaptionSegments: false
		});
		expect(result).toEqual(['Compression']);
	});

	it('includes captions only when enabled AND a transcript exists', () => {
		expect(
			buildExportSummary({
				mode: 'none',
				ratio: ASPECT_RATIOS[0],
				speedEnabled: false,
				speed: 1,
				compression: offCompression,
				captionsEnabled: true,
				hasCaptionSegments: false
			})
		).toEqual([]);

		expect(
			buildExportSummary({
				mode: 'none',
				ratio: ASPECT_RATIOS[0],
				speedEnabled: false,
				speed: 1,
				compression: offCompression,
				captionsEnabled: true,
				hasCaptionSegments: true
			})
		).toEqual(['Captions']);
	});

	it('lists multiple active tools together, in reformat/speed/compression/captions order', () => {
		const result = buildExportSummary({
			mode: 'crop',
			ratio: ASPECT_RATIOS[0],
			speedEnabled: true,
			speed: 1.5,
			compression: DEFAULT_COMPRESSION,
			captionsEnabled: true,
			hasCaptionSegments: true
		});
		expect(result).toEqual(['Crop 9:16', '1.50x speed', 'Compression', 'Captions']);
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd www && pnpm test -- editor-summary.test.ts`
Expected: FAIL — the two speed-related tests that expect `'1.50x speed'`
(two-decimal format) and the new `speed: 1` exclusion test fail against
the current implementation (which emits `'1.5x speed'` unformatted and
never excludes `speed === 1`).

- [ ] **Step 3: Write the implementation**

Replace all of `www/src/lib/editor-summary.ts` with:

```ts
import type { AspectRatio, CompressionSettings, ReformatMode } from '$lib/ffmpeg/filters';

export interface EditorSummaryInput {
	mode: ReformatMode;
	ratio: AspectRatio;
	speedEnabled: boolean;
	speed: number;
	compression: CompressionSettings;
	captionsEnabled: boolean;
	hasCaptionSegments: boolean;
}

// One-line "what will actually happen on export" summary shown next to the
// Export button — built from exactly the same conditions as the editor
// page's hasActiveTransform guard, so it never promises something the
// export won't do (e.g. captions only list once a transcript actually
// exists, not just because the tool is toggled on; speed only lists when
// it's actually different from 1x, matching the guard's own no-op check).
export function buildExportSummary(input: EditorSummaryInput): string[] {
	const parts: string[] = [];

	if (input.mode === 'crop') parts.push(`Crop ${input.ratio.label}`);
	else if (input.mode === 'blur-pad') parts.push(`Blur pad ${input.ratio.label}`);

	if (input.speedEnabled && input.speed !== 1) parts.push(`${input.speed.toFixed(2)}x speed`);

	if (input.compression.mode !== 'none') parts.push('Compression');

	if (input.captionsEnabled && input.hasCaptionSegments) parts.push('Captions');

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
git commit -m "fix: exclude no-op 1x speed from the export summary and guard"
```

---

### Task 3: `ToolTabs` icon-strip navigation component

**Files:**
- Create: `www/src/lib/components/ToolTabs.svelte`

**Interfaces:**
- Produces: `ToolTabs` component — props `tabs: ToolTabItem[]`,
  `active: string`, `onActiveChange: (id: string) => void`. Deliberately
  a plain value + callback, not Svelte's two-way `bind:` — `active` is
  generically typed `string` here, but Task 4's `+page.svelte` will pass
  a narrower string-literal union, and this repo already has a
  established idiom for exactly that mismatch (see `RadioGroup`'s
  `value`/`onValueChange`, used the same way by `FormatToggle` and
  `CompressionControl` instead of `bind:`). Also exports the
  `ToolTabItem` interface (`{ id: string; label: string; icon:
  LucideIcon; enabled: boolean }`) for Task 4 to build its tab array
  against.

- [ ] **Step 1: Create the component**

Create `www/src/lib/components/ToolTabs.svelte`:

```svelte
<script lang="ts">
	import type { LucideIcon } from '@lucide/svelte';

	export interface ToolTabItem {
		id: string;
		label: string;
		icon: LucideIcon;
		enabled: boolean;
	}

	let {
		tabs,
		active,
		onActiveChange
	}: { tabs: ToolTabItem[]; active: string; onActiveChange: (id: string) => void } = $props();

	function tabClass(id: string): string {
		const base =
			'relative flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm transition-colors';
		return active === id
			? `${base} border-primary bg-primary/10 text-foreground`
			: `${base} border-transparent text-muted-foreground hover:bg-muted`;
	}
</script>

<div class="flex flex-wrap gap-2" role="tablist">
	{#each tabs as tab (tab.id)}
		{@const Icon = tab.icon}
		<button
			type="button"
			role="tab"
			aria-selected={active === tab.id}
			class={tabClass(tab.id)}
			onclick={() => onActiveChange(tab.id)}
		>
			<Icon class="size-4" />
			{#if active === tab.id}
				<span>{tab.label}</span>
			{/if}
			{#if tab.enabled}
				<span
					class="bg-primary absolute -top-0.5 -right-0.5 size-2 rounded-full"
					aria-hidden="true"
				></span>
			{/if}
		</button>
	{/each}
</div>
```

- [ ] **Step 2: Type-check**

Run: `cd www && pnpm check`
Expected: PASS, 0 errors. (`ToolTabs` isn't consumed anywhere yet, so
this only checks it compiles standalone.)

- [ ] **Step 3: Commit**

```bash
cd /home/phon/Programming/vidm
git add www/src/lib/components/ToolTabs.svelte
git commit -m "feat: add ToolTabs icon-strip navigation for the editor's tool panels"
```

---

### Task 4: Rewire `+page.svelte` to use `ToolTabs`

**Files:**
- Modify: `www/src/routes/+page.svelte` (full replace)

**Interfaces:**
- Consumes: `ToolTabs`/`ToolTabItem` (Task 3), the hardened
  `buildExportSummary` (Task 2). `SpeedControl`'s prop interface is
  unchanged (Task 1), so its call site here doesn't change.

- [ ] **Step 1: Replace the file**

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
	import ToolTabs, { type ToolTabItem } from '$lib/components/ToolTabs.svelte';
	import ToolCard from '$lib/components/ToolCard.svelte';
	import FormatToggle from '$lib/components/FormatToggle.svelte';
	import RatioSelector from '$lib/components/RatioSelector.svelte';
	import SpeedControl from '$lib/components/SpeedControl.svelte';
	import CompressionControl from '$lib/components/CompressionControl.svelte';
	import CropPositioner from '$lib/components/CropPositioner.svelte';
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
	let speedEnabled = $state(false);
	let speed = $state(1);
	let compression = $state<CompressionSettings>({ ...DEFAULT_COMPRESSION, mode: 'none' });
	let sourceFile = $state<File | null>(null);
	let sourceDuration = $state(0);
	let sourceWidth = $state(0);
	let sourceHeight = $state(0);
	let crop = $state<CropRegion>({ x: 0, y: 0, width: 0, height: 0 });
	let captionSegments = $state<CaptionSegment[]>([]);
	let captionsEnabled = $state(false);
	let captionStyle = $state<CaptionStyle>({ ...DEFAULT_CAPTION_STYLE });
	let activeTool = $state<ActiveTool>('reformat');

	// Every option is independently optional (reformat, speed, compression,
	// captions) — but exporting with literally nothing selected would just
	// re-encode the source unchanged for no reason, so require at least one.
	// speed's own check excludes the no-op 1x value — a continuous slider
	// (unlike the old discrete radio options) can land exactly on it.
	const hasActiveTransform = $derived(
		mode !== 'none' ||
			(speedEnabled && speed !== 1) ||
			compression.mode !== 'none' ||
			(captionsEnabled && captionSegments.length > 0)
	);

	const exportSummary = $derived(
		buildExportSummary({
			mode,
			ratio,
			speedEnabled,
			speed,
			compression,
			captionsEnabled,
			hasCaptionSegments: captionSegments.length > 0
		})
	);

	const toolTabs = $derived([
		{ id: 'reformat', label: 'Reformat', icon: CropIcon, enabled: mode !== 'none' },
		{ id: 'speed', label: 'Speed', icon: GaugeIcon, enabled: speedEnabled },
		{
			id: 'compression',
			label: 'Compression',
			icon: ArchiveIcon,
			enabled: compression.mode !== 'none'
		},
		{ id: 'captions', label: 'Captions', icon: CaptionsIcon, enabled: captionsEnabled }
	]);

	function handleFile(file: File) {
		sourceFile = file;
	}

	function onSourceVideoLoaded(e: Event) {
		const video = e.target as HTMLVideoElement;
		sourceDuration = video.duration;
		sourceWidth = video.videoWidth;
		sourceHeight = video.videoHeight;
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
			if (captionsEnabled && captionSegments.length > 0) {
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

	{#if sourceFile}
		<!-- svelte-ignore a11y_media_has_caption -->
		<video
			src={URL.createObjectURL(sourceFile)}
			onloadedmetadata={onSourceVideoLoaded}
			hidden
		></video>
	{/if}

	{#if sourceFile && (status === 'configuring' || status === 'error')}
		<ToolTabs
			tabs={toolTabs}
			active={activeTool}
			onActiveChange={(id) => (activeTool = id as ActiveTool)}
		/>

		{#if activeTool === 'reformat'}
			<ToolCard
				title="Reformat"
				enabled={mode !== 'none'}
				onEnabledChange={(v) => (mode = v ? 'crop' : 'none')}
			>
				<FormatToggle bind:mode />
				<RatioSelector bind:ratio />
				{#if mode === 'crop'}
					<CropPositioner file={sourceFile} {ratio} bind:crop />
				{/if}
			</ToolCard>
		{:else if activeTool === 'speed'}
			<ToolCard
				title="Speed"
				enabled={speedEnabled}
				onEnabledChange={(v) => {
					speedEnabled = v;
					speed = v ? 1.5 : 1;
				}}
			>
				<SpeedControl bind:speed />
			</ToolCard>
		{:else if activeTool === 'compression'}
			<ToolCard
				title="Compression"
				enabled={compression.mode !== 'none'}
				onEnabledChange={(v) => (compression = { ...compression, mode: v ? 'preset' : 'none' })}
			>
				<CompressionControl bind:compression />
			</ToolCard>
		{:else if activeTool === 'captions'}
			<ToolCard
				title="Captions"
				enabled={captionsEnabled}
				onEnabledChange={(v) => (captionsEnabled = v)}
			>
				<CaptionsPanel file={sourceFile} bind:segments={captionSegments} bind:style={captionStyle} />
			</ToolCard>
		{/if}

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

- [ ] **Step 2: Full verification**

Run, in order, from `www/`:

```bash
pnpm check
pnpm test
pnpm build
```

Expected: all three PASS. `pnpm check` fully clean (0 errors). `pnpm test`
shows all tests passing (54 existing + Task 2's 2 net-new tests = 56
total), no regressions.

- [ ] **Step 3: Commit**

```bash
cd /home/phon/Programming/vidm
git add www/src/routes/+page.svelte
git commit -m "feat: navigate editor tools via ToolTabs instead of stacked cards"
```

---

### Task 5: Verify on a Cloudflare Preview URL, then push and open a PR

**Files:** none (verification and git/deploy operations only).

**Interfaces:** none — this task only runs commands and inspects output.

- [ ] **Step 1: Get a Preview URL without touching production**

Run, from `www/`:

```bash
pnpm build
rm -f build/_redirects build/ffmpeg/ffmpeg-core.wasm build/whisper/ggml-tiny.en-q5_1.bin
pnpm exec wrangler versions upload
```

The `rm -f` step mirrors what CI's deploy job does (see
`.github/workflows/ci.yml`) — `ffmpeg-core.wasm` and the whisper model are
served from R2, not the static asset bundle. `wrangler versions upload`
uploads a new Worker *version* without shifting production traffic. Note
the printed preview URL for the next step.

- [ ] **Step 2: Smoke-test the preview URL**

```bash
curl -s -o /dev/null -w "homepage: %{http_code}\n" "<preview-url>/"
curl -s -o /dev/null -w "ffmpeg-core.wasm: %{http_code}\n" "<preview-url>/ffmpeg/ffmpeg-core.wasm"
curl -s -o /dev/null -w "whisper model: %{http_code}\n" "<preview-url>/whisper/ggml-tiny.en-q5_1.bin"
```

Expected: all three `200`.

- [ ] **Step 3: Hand off for visual confirmation**

Report the preview URL to the user and ask them to open it, upload a
video, and confirm: an icon tab strip (Reformat/Speed/Compression/
Captions) appears after upload, one tool's panel shows at a time, the
active tab shows its label while inactive tabs are icon-only, each tab
shows a small dot once that tool is switched on, switching tabs never
loses another tool's already-configured state (e.g. enable Compression,
switch to Speed, switch back to Compression — it should still be on with
your settings), the Speed panel now shows a slider (not radio buttons)
that can't be set to exactly "1x" in a way that enables Export with
nothing else on, and an actual export with at least one tool active still
completes. Do not proceed to Step 4 until they confirm it looks and
behaves right.

- [ ] **Step 4: Push and open a PR**

Once the user confirms:

```bash
cd /home/phon/Programming/vidm
git push -u origin feat/tool-tabs-redesign
gh pr create --title "feat: navigate editor tools via icon tabs instead of stacked cards" --body "$(cat <<'EOF'
## Summary
- Replaced the editor page's four always-stacked ToolCards with an icon tab strip (Reformat/Speed/Compression/Captions) — one tool's panel visible at a time, inspired by a reference online video cropper. Purely a navigation change: all four tools remain independently on/off and combinable in a single export.
- Converted SpeedControl from a discrete radio group to a continuous slider (0.5x-2x, 0.05 steps).
- Hardened the no-op-export guard (`hasActiveTransform` and `buildExportSummary`) from bare `speedEnabled` to `speedEnabled && speed !== 1`, since a continuous slider can land exactly on 1x, unlike the old discrete options which deliberately excluded it.
- Design spec: `docs/superpowers/specs/2026-08-10-tool-tabs-redesign-design.md`

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
