# Volume Control + Labeled CRF Slider Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a new Volume tool (gain slider, export wiring, live preview) and add labeled tick marks to the existing custom-CRF slider, sharing one new `SliderTicks` component.

**Architecture:** `filters.ts` gains a `volume` export option and a composable audio-filter chain (atempo + volume, comma-joined). A new `SliderTicks.svelte` renders tick marks/labels under any slider by percentage position, used by both a new `VolumeControl.svelte` and the existing `CompressionControl.svelte`. `SourcePreview.svelte` drops its hardcoded `muted` attribute and mirrors a new `volume` prop onto the video element, same pattern as its existing `speed` → `playbackRate` mirror. `+page.svelte` wires a new "Volume" tool tab in between Speed and Compression.

**Tech Stack:** SvelteKit (TypeScript, Svelte 5 runes), Vitest, bits-ui `Slider` primitive, `@lucide/svelte` icons.

## Global Constraints

- Volume range: 0–200%, step 5, stored internally as a 0–2 multiplier (`MIN_VOLUME = 0`, `MAX_VOLUME = 2`, `DEFAULT_VOLUME = 1`) — exact values from the spec.
- `volume !== 1` is the tool's own "active" signal — no separate enabled flag, matching every other tool in this codebase.
- `HTMLMediaElement.volume` caps at `1.0` — the preview can only mirror 0–100% accurately; 100–200% (boost) is export-only. This is a documented limitation, not a bug to work around.
- CRF tick labels reuse the existing `COMPRESSION_PRESETS` array (18/23/28 → "Best quality"/"Balanced"/"Smallest file") — no new constants for CRF ticks.
- Conventional Commits messages, no scope, no trailing period, no Co-Authored-By trailer (this repo's established convention).

---

## File Structure

- **Modify** `www/src/lib/ffmpeg/filters.ts` — add `MIN_VOLUME`/`MAX_VOLUME`/`DEFAULT_VOLUME`, `volume` on `ExportOptions`, composable audio filter chain in `buildExportArgs`.
- **Modify** `www/src/lib/ffmpeg/filters.test.ts` — new test cases for volume export args.
- **Create** `www/src/lib/components/SliderTicks.svelte` — shared presentational tick-marks component.
- **Create** `www/src/lib/components/VolumeControl.svelte` — new tool panel, mirrors `SpeedControl.svelte`.
- **Modify** `www/src/lib/components/CompressionControl.svelte` — add `SliderTicks` under the custom-CRF slider.
- **Modify** `www/src/lib/components/SourcePreview.svelte` — drop hardcoded `muted`, add `volume` prop + mirror effect.
- **Modify** `www/src/lib/editor-summary.ts` — add volume line to `buildExportSummary`.
- **Modify** `www/src/lib/editor-summary.test.ts` — new test cases for the volume summary line.
- **Modify** `www/src/routes/+page.svelte` — `volume` state, new tab, panel, wiring into `hasActiveTransform`/`buildExportArgs`/`SourcePreview`.

---

## Task 1: `filters.ts` — volume export option and composable audio filter chain

**Files:**
- Modify: `www/src/lib/ffmpeg/filters.ts`
- Test: `www/src/lib/ffmpeg/filters.test.ts`

**Interfaces:**
- Produces: `MIN_VOLUME: number`, `MAX_VOLUME: number`, `DEFAULT_VOLUME: number` (exported constants); `ExportOptions.volume: number` (new required field); `buildExportArgs` now reads `options.volume` and includes it in the audio filter chain and re-encode decision.

- [ ] **Step 1: Write the failing tests**

Add to `www/src/lib/ffmpeg/filters.test.ts`. First, update the existing `baseOptions` helper (around line 60) to include a default `volume: 1`:

```ts
function baseOptions(overrides: Partial<ExportOptions> = {}): ExportOptions {
	return {
		mode: 'crop',
		speed: 1,
		volume: 1,
		ratio: RATIO_9_16,
		crop: CROP,
		compression: DEFAULT_COMPRESSION,
		sourceDurationSeconds: 10,
		trimStart: 0,
		trimEnd: 10,
		sourceWidth: 1920,
		sourceHeight: 1080,
		...overrides
	};
}
```

Then add these new cases inside `describe('buildExportArgs', ...)`, after the existing atempo-chain tests:

```ts
	it('default volume (1) does not force an audio re-encode on its own', () => {
		const args = buildExportArgs('in.mp4', 'out.mp4', baseOptions({ volume: 1 }));

		expect(args).not.toContain('-filter:a');
		expect(args).toContain('copy');
	});

	it('non-1 volume adds a volume filter and forces an audio re-encode', () => {
		const args = buildExportArgs('in.mp4', 'out.mp4', baseOptions({ volume: 1.5 }));

		expect(args).toContain('-filter:a');
		expect(args[args.indexOf('-filter:a') + 1]).toBe('volume=1.5');
		expect(args).toContain('aac');
		expect(args).not.toContain('copy');
	});

	it('combines speed and volume into a single comma-chained -filter:a', () => {
		const args = buildExportArgs('in.mp4', 'out.mp4', baseOptions({ speed: 1.5, volume: 0.5 }));

		expect(args[args.indexOf('-filter:a') + 1]).toBe('atempo=1.5,volume=0.5');
	});

	it('volume alone still forces the "none" mode off its -c:v copy fast path\'s audio side', () => {
		const args = buildExportArgs(
			'in.mp4',
			'out.mp4',
			baseOptions({ mode: 'none', volume: 0, compression: { mode: 'none', crf: 23, targetMB: 10 } })
		);

		expect(args).toContain('-filter:a');
		expect(args[args.indexOf('-filter:a') + 1]).toBe('volume=0');
	});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd www && pnpm test -- filters.test.ts`
Expected: FAIL — `ExportOptions` has no `volume` property (TypeScript error) and/or the new assertions fail since `buildExportArgs` doesn't read `volume` yet.

- [ ] **Step 3: Implement**

In `www/src/lib/ffmpeg/filters.ts`:

Add near `MIN_SPEED`/`MAX_SPEED` (after line 50):

```ts
// Gain multiplier for ffmpeg's `volume` audio filter. 1 = unchanged
// (default, inactive — same "no separate enabled flag" convention as
// every other tool). 0 = silent. HTMLMediaElement.volume caps at 1.0 in
// the browser, so the in-editor preview (SourcePreview) can only mirror
// 0-1 accurately; boosting above 1 is export-only, see its own comment.
export const MIN_VOLUME = 0;
export const MAX_VOLUME = 2;
export const DEFAULT_VOLUME = 1;
```

Add `volume: number;` to the `ExportOptions` interface, right after `speed: number;` (line 124):

```ts
export interface ExportOptions {
	mode: ReformatMode;
	speed: number;
	volume: number;
	ratio: AspectRatio;
	crop: CropRegion;
	compression: CompressionSettings;
	sourceDurationSeconds: number;
	trimStart: number;
	trimEnd: number;
	sourceWidth: number;
	sourceHeight: number;
	captionsAssPath?: string;
	captionsFontsDir?: string;
}
```

In `buildExportArgs`, destructure `volume` from `options` (add to the destructuring block starting at line 174, right after `speed`):

```ts
	const {
		mode,
		speed,
		volume,
		ratio,
		crop,
		compression,
		sourceDurationSeconds,
		trimStart,
		trimEnd,
		sourceWidth,
		sourceHeight,
		captionsAssPath,
		captionsFontsDir
	} = options;
```

Update `needsAudioReencode` (line 204) to include volume:

```ts
	const needsVolumeFilter = volume !== 1;
	const needsAudioReencode =
		needsSpeedFilters || needsVolumeFilter || compression.mode === 'size' || trimIsActive;
```

Replace the existing audio filter block (lines 281-286):

```ts
	if (needsAudioReencode) {
		if (needsSpeedFilters) args.push('-filter:a', buildAtempoChain(speed));
		args.push('-c:a', 'aac', '-b:a', `${AUDIO_BITRATE_KBPS}k`);
	} else {
		args.push('-c:a', 'copy');
	}
```

with a version that composes a filter chain instead of a single atempo-only call:

```ts
	if (needsAudioReencode) {
		const audioFilters: string[] = [];
		if (needsSpeedFilters) audioFilters.push(buildAtempoChain(speed));
		if (needsVolumeFilter) audioFilters.push(`volume=${volume}`);
		if (audioFilters.length > 0) args.push('-filter:a', audioFilters.join(','));
		args.push('-c:a', 'aac', '-b:a', `${AUDIO_BITRATE_KBPS}k`);
	} else {
		args.push('-c:a', 'copy');
	}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd www && pnpm test -- filters.test.ts`
Expected: PASS, all cases including the four new ones.

- [ ] **Step 5: Type-check**

Run: `cd www && pnpm check`
Expected: fails right now — `+page.svelte`'s `buildExportArgs` call doesn't pass `volume` yet. That's expected; it gets fixed in Task 6. Confirm the *only* new error is the missing `volume` property at the `buildExportArgs` call site in `+page.svelte` (not an error inside `filters.ts` itself).

- [ ] **Step 6: Commit**

```bash
git add www/src/lib/ffmpeg/filters.ts www/src/lib/ffmpeg/filters.test.ts
git commit -m "feat: add volume export option to buildExportArgs"
```

---

## Task 2: `SliderTicks.svelte` — shared tick-marks component

**Files:**
- Create: `www/src/lib/components/SliderTicks.svelte`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: a Svelte component with props `min: number`, `max: number`, `ticks: { value: number; label: string }[]`, used by Task 3 (`VolumeControl`) and Task 4 (`CompressionControl`).

This component is pure presentational layout (position ticks by percentage), consistent with how other presentational-only components in this codebase (e.g. the crop grid overlay in `SourcePreview.svelte`) have no dedicated test file — skip a test step here, matching that established pattern.

- [ ] **Step 1: Write the component**

```svelte
<script lang="ts">
	let {
		min,
		max,
		ticks
	}: { min: number; max: number; ticks: { value: number; label: string }[] } = $props();

	function positionPercent(value: number): number {
		return ((value - min) / (max - min)) * 100;
	}
</script>

<div class="relative h-4 w-full text-xs">
	{#each ticks as tick (tick.value)}
		<div
			class="text-muted-foreground absolute top-0 flex -translate-x-1/2 flex-col items-center gap-0.5"
			style:left={`${positionPercent(tick.value)}%`}
		>
			<span class="bg-border h-1.5 w-px"></span>
			<span class="whitespace-nowrap">{tick.label}</span>
		</div>
	{/each}
</div>
```

- [ ] **Step 2: Verify it compiles**

Run: `cd www && pnpm check`
Expected: no new errors introduced by this file (it isn't imported anywhere yet, so this just confirms the `.svelte` file itself is syntactically/type valid).

- [ ] **Step 3: Commit**

```bash
git add www/src/lib/components/SliderTicks.svelte
git commit -m "feat: add SliderTicks component for labeled slider scales"
```

---

## Task 3: `VolumeControl.svelte` — new tool panel

**Files:**
- Create: `www/src/lib/components/VolumeControl.svelte`

**Interfaces:**
- Consumes: `MIN_VOLUME`, `MAX_VOLUME` from `$lib/ffmpeg/filters` (Task 1); `SliderTicks` from `$lib/components/SliderTicks.svelte` (Task 2); `Slider`/`Label` from `$lib/components/ui/slider` and `$lib/components/ui/label` (existing).
- Produces: a component with `volume = $bindable()` (number, 0-2 internal scale) and `disabled = false` props, used by Task 6 (`+page.svelte`).

- [ ] **Step 1: Write the component**

```svelte
<script lang="ts">
	import { MIN_VOLUME, MAX_VOLUME } from '$lib/ffmpeg/filters';
	import { Slider } from '$lib/components/ui/slider';
	import { Label } from '$lib/components/ui/label';
	import SliderTicks from '$lib/components/SliderTicks.svelte';

	let {
		volume = $bindable(),
		disabled = false
	}: { volume: number; disabled?: boolean } = $props();

	const VOLUME_STEP = 0.05;
	const MIN_PERCENT = MIN_VOLUME * 100;
	const MAX_PERCENT = MAX_VOLUME * 100;

	// UI works in whole percent (0-200); filters.ts/buildExportArgs work in
	// the 0-2 multiplier the volume filter itself expects — convert at the
	// boundary rather than carrying two representations through the app.
	const volumePercent = $derived(Math.round(volume * 100));

	function onVolumeChange(percent: number) {
		volume = Math.round(percent) / 100;
	}
</script>

<fieldset {disabled} class="space-y-2">
	<legend class="mb-1 text-sm font-semibold">Volume</legend>
	<div class="flex items-center gap-3">
		<Label for="volume-slider" class="font-normal">Volume:</Label>
		<Slider
			id="volume-slider"
			type="single"
			min={MIN_PERCENT}
			max={MAX_PERCENT}
			step={VOLUME_STEP * 100}
			value={volumePercent}
			onValueChange={onVolumeChange}
			{disabled}
			class="flex-1"
		/>
		<span class="text-sm tabular-nums">{volumePercent}%</span>
	</div>
	<SliderTicks min={MIN_PERCENT} max={MAX_PERCENT} ticks={[{ value: 100, label: 'Original' }]} />
	{#if volumePercent > 100}
		<p class="text-muted-foreground text-sm">
			The in-editor preview can't play louder than the original — boost above 100% is audible
			only in the exported file.
		</p>
	{/if}
</fieldset>
```

- [ ] **Step 2: Verify it compiles**

Run: `cd www && pnpm check`
Expected: no new errors (not imported anywhere yet).

- [ ] **Step 3: Commit**

```bash
git add www/src/lib/components/VolumeControl.svelte
git commit -m "feat: add VolumeControl component"
```

---

## Task 4: CRF slider tick labels

**Files:**
- Modify: `www/src/lib/components/CompressionControl.svelte`

**Interfaces:**
- Consumes: `SliderTicks` from Task 2; `COMPRESSION_PRESETS`, `MIN_CRF`, `MAX_CRF` (already imported in this file).

- [ ] **Step 1: Add the import**

In `www/src/lib/components/CompressionControl.svelte`, add to the existing import block (after line 12's `Slider` import):

```ts
	import SliderTicks from '$lib/components/SliderTicks.svelte';
```

- [ ] **Step 2: Add `SliderTicks` under the custom-CRF slider**

Replace the custom-mode block (currently lines 81-99):

```svelte
	{:else}
		<div class="space-y-1.5">
			<div class="flex items-center gap-3">
				<Label for="crf-slider" class="font-normal">CRF:</Label>
				<Slider
					id="crf-slider"
					type="single"
					min={MIN_CRF}
					max={MAX_CRF}
					value={compression.crf}
					onValueChange={(v) => (compression = { ...compression, crf: v })}
					{disabled}
					class="flex-1"
				/>
				<span class="text-sm tabular-nums">{compression.crf}</span>
			</div>
			<SliderTicks
				min={MIN_CRF}
				max={MAX_CRF}
				ticks={COMPRESSION_PRESETS.map((preset) => ({ value: preset.crf, label: preset.label }))}
			/>
			<p class="text-muted-foreground text-sm">Lower = higher quality, larger file.</p>
		</div>
	{/if}
```

- [ ] **Step 3: Verify it compiles**

Run: `cd www && pnpm check`
Expected: PASS, no new errors.

- [ ] **Step 4: Manual check (dev server)**

Run: `cd www && pnpm dev`, open the app, upload any video, go to the Compression tool, select "Custom (CRF)", confirm three tick labels ("Best quality", "Balanced", "Smallest file") appear under the slider at roughly the 0%, ~36%, ~71% positions along the track (18, 23, 28 within the 18-32 range). Stop the dev server afterward.

- [ ] **Step 5: Commit**

```bash
git add www/src/lib/components/CompressionControl.svelte
git commit -m "feat: add labeled tick marks to the custom CRF slider"
```

---

## Task 5: `SourcePreview.svelte` — unmute and mirror volume

**Files:**
- Modify: `www/src/lib/components/SourcePreview.svelte`

**Interfaces:**
- Consumes: nothing new from other tasks (no import needed — this is a plain numeric prop).
- Produces: a new `volume = 1` prop on `SourcePreview`, consumed by Task 6 (`+page.svelte`).

- [ ] **Step 1: Add the `volume` prop**

In the props destructuring block (lines 4-28), add `volume = 1` alongside the existing `speed = 1`:

```ts
	let {
		file,
		ratio,
		crop = $bindable(),
		showCropBox,
		sourceWidth = $bindable(0),
		sourceHeight = $bindable(0),
		sourceDuration = $bindable(0),
		trimStart = 0,
		trimEnd = 0,
		clampToTrim = false,
		speed = 1,
		volume = 1
	}: {
		file: File;
		ratio: AspectRatio;
		crop: CropRegion;
		showCropBox: boolean;
		sourceWidth?: number;
		sourceHeight?: number;
		sourceDuration?: number;
		trimStart?: number;
		trimEnd?: number;
		clampToTrim?: boolean;
		speed?: number;
		volume?: number;
	} = $props();
```

- [ ] **Step 2: Add the volume-mirroring effect**

Add right after the existing `playbackRate` effect (after line 114):

```ts
	// Mirrors the Volume tool's value onto the preview element, same pattern
	// as the playbackRate mirror above. HTMLMediaElement.volume caps at 1.0
	// in the browser — values above 1 (a boosted export) clamp to the
	// loudest the native element can actually play; see VolumeControl's own
	// note about this limitation.
	$effect(() => {
		if (!videoEl) return;
		videoEl.volume = Math.min(1, volume);
	});
```

- [ ] **Step 3: Drop the hardcoded `muted` attribute**

In the template's `<video>` element (around line 208-217), remove `muted`:

```svelte
	<video
		bind:this={videoEl}
		src={objectUrl}
		onloadedmetadata={onLoadedMetadata}
		ontimeupdate={onTimeUpdate}
		controls
		playsinline
		class="block w-full rounded-md"
	></video>
```

- [ ] **Step 4: Verify it compiles**

Run: `cd www && pnpm check`
Expected: PASS (the new `volume` prop is optional with a default, so existing callers that don't pass it still type-check).

- [ ] **Step 5: Commit**

```bash
git add www/src/lib/components/SourcePreview.svelte
git commit -m "feat: unmute source preview and mirror the volume setting"
```

---

## Task 6: `editor-summary.ts` — volume summary line

**Files:**
- Modify: `www/src/lib/editor-summary.ts`
- Test: `www/src/lib/editor-summary.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `EditorSummaryInput.volume: number` (new required field), read by `buildExportSummary`.

- [ ] **Step 1: Write the failing tests**

In `www/src/lib/editor-summary.test.ts`, update `baseInput` to include a default `volume: 1`:

```ts
function baseInput(overrides: Partial<EditorSummaryInput> = {}): EditorSummaryInput {
	return {
		mode: 'none',
		ratio: ASPECT_RATIOS[0],
		speed: 1,
		volume: 1,
		compression: offCompression,
		hasCaptionSegments: false,
		trimStart: 0,
		trimEnd: 10,
		sourceDuration: 10,
		...overrides
	};
}
```

Add these new cases after the existing speed-related tests:

```ts
	it('includes the volume percentage when volume is not 100%', () => {
		expect(buildExportSummary(baseInput({ volume: 1.5 }))).toEqual(['150% volume']);
	});

	it('excludes volume when left at the no-op 100% value', () => {
		expect(buildExportSummary(baseInput({ volume: 1 }))).toEqual([]);
	});

	it('rounds a fractional volume percentage', () => {
		expect(buildExportSummary(baseInput({ volume: 0.325 }))).toEqual(['33% volume']);
	});
```

Update the existing "lists multiple active tools together" test to also cover volume — replace it with:

```ts
	it('lists multiple active tools together, in trim/reformat/speed/volume/compression/captions order', () => {
		const result = buildExportSummary(
			baseInput({
				mode: 'crop',
				speed: 1.5,
				volume: 0.5,
				compression: DEFAULT_COMPRESSION,
				hasCaptionSegments: true,
				trimStart: 1,
				trimEnd: 9
			})
		);
		expect(result).toEqual([
			'Trim 0:01.0–0:09.0',
			'Crop 9:16',
			'1.50x speed',
			'50% volume',
			'Compression (Balanced)',
			'Captions'
		]);
	});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd www && pnpm test -- editor-summary.test.ts`
Expected: FAIL — `EditorSummaryInput` has no `volume` property, and the multi-tool test's expected array won't match (no volume line produced yet).

- [ ] **Step 3: Implement**

In `www/src/lib/editor-summary.ts`, add `volume: number;` to `EditorSummaryInput` (after `speed: number;`, line 21):

```ts
export interface EditorSummaryInput {
	mode: ReformatMode;
	ratio: AspectRatio;
	speed: number;
	volume: number;
	compression: CompressionSettings;
	hasCaptionSegments: boolean;
	trimStart: number;
	trimEnd: number;
	sourceDuration: number;
}
```

Add the volume line to `buildExportSummary`, right after the existing speed line (after line 45's `if (input.speed !== 1) parts.push(...)`):

```ts
	if (input.volume !== 1) parts.push(`${Math.round(input.volume * 100)}% volume`);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd www && pnpm test -- editor-summary.test.ts`
Expected: PASS, all cases.

- [ ] **Step 5: Commit**

```bash
git add www/src/lib/editor-summary.ts www/src/lib/editor-summary.test.ts
git commit -m "feat: add volume line to the export summary"
```

---

## Task 7: Wire the Volume tab into `+page.svelte`

**Files:**
- Modify: `www/src/routes/+page.svelte`

**Interfaces:**
- Consumes: `MIN_VOLUME`, `DEFAULT_VOLUME` from `$lib/ffmpeg/filters` (Task 1); `VolumeControl` from `$lib/components/VolumeControl.svelte` (Task 3); the new `volume` prop on `SourcePreview` (Task 5); the new `volume` field on `ExportOptions` (Task 1) and `EditorSummaryInput` (Task 6); `Volume2Icon` from `@lucide/svelte/icons/volume-2`.

This is the integration task — it's what makes Tasks 1-6 actually reachable from the UI. No new automated test (this file has no existing test coverage of its own — it's covered by the project's manual/Playwright convention, consistent with how the last several editor-page changes, e.g. PR #30, were verified).

- [ ] **Step 1: Add the icon import**

Add alongside the other `@lucide/svelte/icons/*` imports (after line 36):

```ts
	import Volume2Icon from '@lucide/svelte/icons/volume-2';
```

- [ ] **Step 2: Add the `VolumeControl` import**

Add alongside the other `$lib/components/*` imports (after line 24's `SpeedControl` import):

```ts
	import VolumeControl from '$lib/components/VolumeControl.svelte';
```

- [ ] **Step 3: Import `DEFAULT_VOLUME`**

Update the `$lib/ffmpeg/filters` import block (lines 6-14) to include `DEFAULT_VOLUME`:

```ts
	import {
		buildExportArgs,
		computeOutputDimensions,
		ASPECT_RATIOS,
		DEFAULT_COMPRESSION,
		DEFAULT_VOLUME,
		type ReformatMode,
		type CropRegion,
		type CompressionSettings
	} from '$lib/ffmpeg/filters';
```

- [ ] **Step 4: Add `volume` state**

Add right after `let speed = $state(1);` (line 46):

```ts
	let volume = $state(DEFAULT_VOLUME);
```

- [ ] **Step 5: Widen the `ActiveTool` type**

Update line 39:

```ts
	type ActiveTool = 'trim' | 'reformat' | 'speed' | 'volume' | 'compression' | 'captions';
```

- [ ] **Step 6: Add volume to `hasActiveTransform`**

Update the `$derived` block (lines 86-93) to include `volume !== 1`:

```ts
	const hasActiveTransform = $derived(
		trimStart > 0 ||
			trimEnd < sourceDuration ||
			mode !== 'none' ||
			speed !== 1 ||
			volume !== 1 ||
			compression.mode !== 'none' ||
			captionSegments.length > 0
	);
```

- [ ] **Step 7: Pass volume into `buildExportSummary`**

Update the `exportSummary` derived block (lines 95-106) to include `volume`:

```ts
	const exportSummary = $derived(
		buildExportSummary({
			mode,
			ratio,
			speed,
			volume,
			compression,
			hasCaptionSegments: captionSegments.length > 0,
			trimStart,
			trimEnd,
			sourceDuration
		})
	);
```

- [ ] **Step 8: Add the Volume tab**

Update `toolTabs` (lines 108-130) to insert a Volume tab after Speed and before Compression:

```ts
	const toolTabs = $derived([
		{
			id: 'trim',
			label: 'Trim',
			icon: ScissorsIcon,
			enabled: trimStart > 0 || trimEnd < sourceDuration
		},
		{ id: 'reformat', label: 'Reformat', icon: CropIcon, enabled: mode !== 'none' },
		{ id: 'speed', label: 'Speed', icon: GaugeIcon, enabled: speed !== 1 },
		{ id: 'volume', label: 'Volume', icon: Volume2Icon, enabled: volume !== 1 },
		{
			id: 'compression',
			label: 'Compression',
			icon: ArchiveIcon,
			enabled: compression.mode !== 'none'
		},
		{
			id: 'captions',
			label: 'Captions',
			icon: CaptionsIcon,
			enabled: captionSegments.length > 0,
			disabledReason: hasVisitedTrim ? undefined : 'Check your trim range first'
		}
	]);
```

- [ ] **Step 9: Pass volume into `buildExportArgs`**

Update the `run()` function's `buildExportArgs` call (lines 193-208) to include `volume`:

```ts
			await ffmpeg.exec(
				buildExportArgs(inputName, outputName, {
					mode,
					speed,
					volume,
					ratio,
					crop,
					compression,
					sourceDurationSeconds: sourceDuration,
					trimStart,
					trimEnd,
					sourceWidth,
					sourceHeight,
					captionsAssPath,
					captionsFontsDir
				})
			);
```

- [ ] **Step 10: Pass volume into `SourcePreview`**

Update the `<SourcePreview>` element (lines 257-269) to add `{volume}`:

```svelte
				<SourcePreview
					file={sourceFile}
					{ratio}
					bind:crop
					{showCropBox}
					bind:sourceWidth
					bind:sourceHeight
					bind:sourceDuration
					{trimStart}
					{trimEnd}
					clampToTrim={activeTool === 'trim'}
					{speed}
					{volume}
				/>
```

- [ ] **Step 11: Add the Volume panel**

Add a new panel div right after the Speed panel (after line 284's closing `</div>` for the speed block):

```svelte
					<div class={activeTool === 'volume' ? 'space-y-4' : 'hidden'}>
						<VolumeControl bind:volume />
					</div>
```

- [ ] **Step 12: Run the full test suite and type-check**

Run: `cd www && pnpm check && pnpm test`
Expected: PASS — this is the point where Task 1's Step 5 "expected failure" (missing `volume` in the `buildExportArgs` call) gets resolved.

- [ ] **Step 13: Manual verification (dev server)**

Run: `cd www && pnpm dev`, open the app, upload a video with an audible audio track:
- Confirm a "Volume" tab appears between Speed and Compression, with a speaker icon.
- Open it, drag the slider — confirm the video preview is now audible (not silent) and the volume audibly follows the slider from 0% (silent) to 100% (normal).
- Push the slider above 100% — confirm the "can't play louder than the original" note appears, and the preview's audible level doesn't get any louder past 100%.
- Confirm the export summary line at the bottom shows e.g. "150% volume" when set above 100%.
- Export at a non-default volume (e.g. 50%) with nothing else changed, confirm export completes; play the downloaded file back and confirm it's audibly quieter than the source.
- Stop the dev server afterward.

- [ ] **Step 14: Commit**

```bash
git add www/src/routes/+page.svelte
git commit -m "feat: wire the Volume tool tab into the editor page"
```

---

## Task 8: Full verification pass

**Files:** none (verification only).

- [ ] **Step 1: Run the full check/test/build pipeline**

Run: `cd www && pnpm check && pnpm test && pnpm build`
Expected: all three pass cleanly.

- [ ] **Step 2: Confirm CI will pass**

Re-read `.github/workflows/ci.yml`'s `test` job steps and confirm Step 1 above already covers everything it runs (type-check, test, build) — no separate action needed here beyond having just run them locally.

- [ ] **Step 3: Report status**

No commit needed for this task (verification-only) — report the pass/fail status of Step 1 back before moving to PR creation.
