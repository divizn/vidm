# Editor Flow Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the single-page editor (`www/src/routes/+page.svelte`) so
its four independent tools — reformat, speed, compression, captions — each
present a consistent on/off toggle instead of today's four different
"how do I turn this off" conventions, defaulting every tool to off, and
move the Export button (with a live summary of what's active) to the end
of the page, after Captions, instead of before it.

**Architecture:** A new shared `ToolCard` component wraps each tool in a
`Card` with a header `Switch` — off collapses to just the header, on
expands the tool's existing controls below it. `+page.svelte` drives each
`ToolCard`'s `enabled`/`onEnabledChange` from its own state (two of the
four tools, reformat and compression, already have a `'none'` sentinel to
derive `enabled` from; speed and captions get a new explicit boolean each).
A new pure function `buildExportSummary` (tested, alongside this repo's
other pure-logic modules) builds the one-line "what will happen on export"
summary from the same state that drives the export-guard.

**Tech Stack:** SvelteKit 5 (runes: `$state`, `$props`, `$derived`,
`$bindable`), TypeScript, Vitest, `bits-ui` (Switch primitive), Tailwind.

## Global Constraints

- Pure logic goes in its own `www/src/lib/*.ts` module with a matching
  `*.test.ts` (this repo's established convention — see `ass.ts`,
  `filters.ts`, `srt.ts`). Svelte components (`.svelte` files) are **not**
  unit-tested in this repo — no `@testing-library/svelte` is installed, no
  `.svelte.test.ts` files exist. Tasks that only touch `.svelte` files skip
  the TDD test-first cycle for that reason; only the one new `.ts` module in
  this plan (`editor-summary.ts`) gets full TDD treatment.
- Out of scope (explicitly, per the approved design spec): the post-export
  result page's hard-reload transition, and the `status === 'error'`
  display. Do not touch `www/src/routes/export/+page.svelte` or the error
  message rendering in this plan.
- Commit messages: Conventional Commits, no scope, no trailing period, no
  `Co-Authored-By` trailer (this repo's established convention).
- Branch: `docs/editor-flow-redesign` is currently checked out and holds
  only the approved design spec commit — implementation continues on this
  branch (rename to `feat/...` before pushing/opening a PR, since it's no
  longer docs-only once code lands — see Task 7).
- Design spec: `docs/superpowers/specs/2026-08-09-editor-flow-redesign-design.md`
  — read for full rationale; this plan's Global Constraints and each task's
  Interfaces section summarize the parts implementers need verbatim.

---

### Task 1: Add the `Switch` UI primitive

**Files:**
- Create: `www/src/lib/components/ui/switch/switch.svelte`
- Create: `www/src/lib/components/ui/switch/index.ts`

**Interfaces:**
- Produces: `Switch` component — props `checked: boolean` (bindable),
  `onCheckedChange?: (checked: boolean) => void`, `disabled?: boolean`,
  `class?: string`, plus any other `bits-ui` `Switch.RootProps`. Exported
  from `$lib/components/ui/switch`. Consumed by Task 3's `ToolCard`.

- [ ] **Step 1: Create the Switch primitive**

`bits-ui` (already a dependency — see `www/package.json`) ships a `Switch`
export with `Switch.Root`/`Switch.Thumb`, the same shape `Checkbox` in this
codebase already wraps (see `www/src/lib/components/ui/checkbox/checkbox.svelte`
for the pattern this mirrors — `cn(...)`, `WithoutChildrenOrChild`, bindable
`ref`).

Create `www/src/lib/components/ui/switch/switch.svelte`:

```svelte
<script lang="ts">
	import { Switch as SwitchPrimitive } from "bits-ui";
	import { cn, type WithoutChildrenOrChild } from "$lib/utils.js";

	let {
		ref = $bindable(null),
		checked = $bindable(false),
		class: className,
		...restProps
	}: WithoutChildrenOrChild<SwitchPrimitive.RootProps> = $props();
</script>

<SwitchPrimitive.Root
	bind:ref
	bind:checked
	data-slot="switch"
	class={cn(
		"peer data-[state=checked]:bg-primary data-[state=unchecked]:bg-input focus-visible:border-ring focus-visible:ring-ring/50 inline-flex h-[1.15rem] w-8 shrink-0 items-center rounded-full border border-transparent shadow-xs transition-all outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50",
		className
	)}
	{...restProps}
>
	<SwitchPrimitive.Thumb
		data-slot="switch-thumb"
		class="bg-background pointer-events-none block size-4 rounded-full ring-0 transition-transform data-[state=checked]:translate-x-[calc(100%-2px)] data-[state=unchecked]:translate-x-0"
	/>
</SwitchPrimitive.Root>
```

- [ ] **Step 2: Create the barrel export**

Create `www/src/lib/components/ui/switch/index.ts` (matches
`www/src/lib/components/ui/checkbox/index.ts`'s exact pattern):

```ts
import Root from "./switch.svelte";
export {
	Root,
	//
	Root as Switch,
};
```

- [ ] **Step 3: Type-check**

Run: `cd www && pnpm check`
Expected: PASS, 0 errors.

- [ ] **Step 4: Commit**

```bash
cd /home/phon/Programming/vidm
git add www/src/lib/components/ui/switch/
git commit -m "feat: add Switch UI primitive"
```

---

### Task 2: `buildExportSummary` pure function + tests

**Files:**
- Create: `www/src/lib/editor-summary.ts`
- Test: `www/src/lib/editor-summary.test.ts`

**Interfaces:**
- Produces: `buildExportSummary(input: EditorSummaryInput): string[]` and
  `EditorSummaryInput` interface, exported from `www/src/lib/editor-summary.ts`.
  Consumed by Task 6's `+page.svelte`.

- [ ] **Step 1: Write the failing tests**

Create `www/src/lib/editor-summary.test.ts`:

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

	it('includes the speed multiplier when speed is enabled', () => {
		const result = buildExportSummary({
			mode: 'none',
			ratio: ASPECT_RATIOS[0],
			speedEnabled: true,
			speed: 1.5,
			compression: offCompression,
			captionsEnabled: false,
			hasCaptionSegments: false
		});
		expect(result).toEqual(['1.5x speed']);
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
		expect(result).toEqual(['Crop 9:16', '1.5x speed', 'Compression', 'Captions']);
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd www && pnpm test -- editor-summary.test.ts`
Expected: FAIL — `./editor-summary` module doesn't exist yet.

- [ ] **Step 3: Write the implementation**

Create `www/src/lib/editor-summary.ts`:

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
// exists, not just because the tool is toggled on).
export function buildExportSummary(input: EditorSummaryInput): string[] {
	const parts: string[] = [];

	if (input.mode === 'crop') parts.push(`Crop ${input.ratio.label}`);
	else if (input.mode === 'blur-pad') parts.push(`Blur pad ${input.ratio.label}`);

	if (input.speedEnabled) parts.push(`${input.speed}x speed`);

	if (input.compression.mode !== 'none') parts.push('Compression');

	if (input.captionsEnabled && input.hasCaptionSegments) parts.push('Captions');

	return parts;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd www && pnpm test -- editor-summary.test.ts`
Expected: PASS, all 7 tests green.

- [ ] **Step 5: Commit**

```bash
cd /home/phon/Programming/vidm
git add www/src/lib/editor-summary.ts www/src/lib/editor-summary.test.ts
git commit -m "feat: add buildExportSummary for the editor's export-readiness line"
```

---

### Task 3: `ToolCard` component

**Files:**
- Create: `www/src/lib/components/ToolCard.svelte`

**Interfaces:**
- Consumes: `Switch` from `$lib/components/ui/switch` (Task 1).
- Produces: `ToolCard` component — props `title: string`, `enabled: boolean`,
  `onEnabledChange: (value: boolean) => void`, `children?: Snippet`.
  Consumed by Task 6's `+page.svelte`.

- [ ] **Step 1: Create the component**

Create `www/src/lib/components/ToolCard.svelte`:

```svelte
<script lang="ts">
	import type { Snippet } from 'svelte';
	import { Card, CardHeader, CardTitle, CardAction, CardContent } from '$lib/components/ui/card';
	import { Switch } from '$lib/components/ui/switch';

	let {
		title,
		enabled,
		onEnabledChange,
		children
	}: {
		title: string;
		enabled: boolean;
		onEnabledChange: (value: boolean) => void;
		children?: Snippet;
	} = $props();
</script>

<Card>
	<CardHeader>
		<CardTitle>{title}</CardTitle>
		<CardAction>
			<Switch
				checked={enabled}
				onCheckedChange={onEnabledChange}
				aria-label={`Toggle ${title}`}
			/>
		</CardAction>
	</CardHeader>
	{#if enabled}
		<CardContent class="space-y-4">
			{@render children?.()}
		</CardContent>
	{/if}
</Card>
```

- [ ] **Step 2: Type-check**

Run: `cd www && pnpm check`
Expected: PASS, 0 errors. (`ToolCard` isn't used anywhere yet, so this only
checks the component compiles standalone.)

- [ ] **Step 3: Commit**

```bash
cd /home/phon/Programming/vidm
git add www/src/lib/components/ToolCard.svelte
git commit -m "feat: add ToolCard, a collapsible on/off wrapper for editor tools"
```

---

### Task 4: Trim the `'none'` option from `FormatToggle` and `CompressionControl`

**Files:**
- Modify: `www/src/lib/components/FormatToggle.svelte` (full replace)
- Modify: `www/src/lib/components/CompressionControl.svelte` (full replace)

**Interfaces:**
- `FormatToggle`'s `mode` prop type is unchanged (`ReformatMode` — still
  `'crop' | 'blur-pad' | 'none'`), but its own radio options no longer
  offer `'none'` — callers (Task 6) must guarantee `mode` is never
  `'none'` while this component is mounted.
- `CompressionControl`'s `compression.mode` type is unchanged, but its own
  radio options no longer offer `'none'` — callers (Task 6) must guarantee
  `compression.mode` is never `'none'` while this component is mounted.

Both components currently mix a `'none'`/`'None'` choice into their own
radio group — that choice moves to `ToolCard`'s switch (Task 3), which is
the only thing that will ever set `mode`/`compression.mode` back to
`'none'`. Once wired up in Task 6, both components are only ever rendered
while already enabled, so neither needs to represent "off" internally
anymore.

- [ ] **Step 1: Replace `FormatToggle.svelte`**

Replace all of `www/src/lib/components/FormatToggle.svelte` with:

```svelte
<script lang="ts">
	import type { ReformatMode } from '$lib/ffmpeg/filters';
	import { RadioGroup, RadioGroupItem } from '$lib/components/ui/radio-group';
	import { Label } from '$lib/components/ui/label';

	let {
		mode = $bindable(),
		disabled = false
	}: { mode: ReformatMode; disabled?: boolean } = $props();

	const options: { value: ReformatMode; label: string }[] = [
		{ value: 'crop', label: 'Center crop' },
		{ value: 'blur-pad', label: 'Blur padded' }
	];
</script>

<fieldset {disabled} class="space-y-2">
	<legend class="mb-1 text-sm font-semibold">Portrait format</legend>
	<RadioGroup
		value={mode}
		onValueChange={(v) => (mode = v as ReformatMode)}
		{disabled}
		class="flex w-auto flex-row gap-4"
	>
		{#each options as option (option.value)}
			<div class="flex items-center gap-2">
				<RadioGroupItem value={option.value} id="format-{option.value}" />
				<Label for="format-{option.value}" class="cursor-pointer font-normal">{option.label}</Label>
			</div>
		{/each}
	</RadioGroup>
</fieldset>
```

- [ ] **Step 2: Replace `CompressionControl.svelte`**

Replace all of `www/src/lib/components/CompressionControl.svelte` with:

```svelte
<script lang="ts">
	import {
		COMPRESSION_PRESETS,
		MIN_CRF,
		MAX_CRF,
		type CompressionSettings,
		type CompressionMode
	} from '$lib/ffmpeg/filters';
	import { RadioGroup, RadioGroupItem } from '$lib/components/ui/radio-group';
	import { Label } from '$lib/components/ui/label';
	import { Input } from '$lib/components/ui/input';
	import { Slider } from '$lib/components/ui/slider';

	let {
		compression = $bindable(),
		disabled = false
	}: { compression: CompressionSettings; disabled?: boolean } = $props();

	const modes: { value: CompressionMode; label: string }[] = [
		{ value: 'preset', label: 'Quality preset' },
		{ value: 'size', label: 'Target file size' },
		{ value: 'custom', label: 'Custom (CRF)' }
	];

	function setMode(mode: CompressionMode) {
		compression = { ...compression, mode };
	}
</script>

<fieldset {disabled} class="space-y-3">
	<legend class="mb-1 text-sm font-semibold">Compression</legend>

	<RadioGroup
		value={compression.mode}
		onValueChange={(v) => setMode(v as CompressionMode)}
		{disabled}
		class="flex w-auto flex-row flex-wrap gap-4"
	>
		{#each modes as m (m.value)}
			<div class="flex items-center gap-2">
				<RadioGroupItem value={m.value} id="compression-mode-{m.value}" />
				<Label for="compression-mode-{m.value}" class="cursor-pointer font-normal">{m.label}</Label
				>
			</div>
		{/each}
	</RadioGroup>

	{#if compression.mode === 'preset'}
		<div class="flex flex-wrap items-center gap-4">
			<RadioGroup
				value={String(compression.crf)}
				onValueChange={(v) => (compression = { ...compression, crf: Number(v) })}
				{disabled}
				class="flex w-auto flex-row flex-wrap gap-4"
			>
				{#each COMPRESSION_PRESETS as preset (preset.label)}
					<div class="flex items-center gap-2">
						<RadioGroupItem value={String(preset.crf)} id="compression-preset-{preset.crf}" />
						<Label for="compression-preset-{preset.crf}" class="cursor-pointer font-normal"
							>{preset.label}</Label
						>
					</div>
				{/each}
			</RadioGroup>
		</div>
	{:else if compression.mode === 'size'}
		<div class="flex flex-wrap items-center gap-3">
			<Label for="target-size" class="font-normal">Target size:</Label>
			<Input
				id="target-size"
				type="number"
				min="1"
				step="1"
				class="w-20"
				bind:value={compression.targetMB}
			/>
			<span class="text-sm">MB</span>
			<span class="text-muted-foreground text-sm">Approximate, not exact — single-pass encode.</span
			>
		</div>
	{:else}
		<div class="flex max-w-sm flex-wrap items-center gap-3">
			<Label for="crf-slider" class="font-normal">CRF:</Label>
			<Slider
				id="crf-slider"
				type="single"
				min={MIN_CRF}
				max={MAX_CRF}
				value={compression.crf}
				onValueChange={(v) => (compression = { ...compression, crf: v })}
				{disabled}
				class="w-40"
			/>
			<span class="text-sm tabular-nums">{compression.crf}</span>
			<span class="text-muted-foreground w-full text-sm"
				>Lower = higher quality, larger file.</span
			>
		</div>
	{/if}
</fieldset>
```

- [ ] **Step 3: Type-check**

Run: `cd www && pnpm check`
Expected: FAIL is acceptable at this point only if the sole errors are in
`www/src/routes/+page.svelte` (not yet updated — Task 6). Any error inside
`FormatToggle.svelte` or `CompressionControl.svelte` themselves must be
fixed before proceeding.

- [ ] **Step 4: Commit**

```bash
cd /home/phon/Programming/vidm
git add www/src/lib/components/FormatToggle.svelte www/src/lib/components/CompressionControl.svelte
git commit -m "refactor: drop the none option from FormatToggle and CompressionControl"
```

---

### Task 5: Drop `burnIn` from `CaptionsPanel`, unwrap its outer `Card`

**Files:**
- Modify: `www/src/lib/components/CaptionsPanel.svelte` (full replace)

**Interfaces:**
- Produces: `CaptionsPanel` component with props `{ file: File; segments?: CaptionSegment[]; style?: CaptionStyle }` — **`burnIn` bindable prop is removed**. Task 6's `+page.svelte` must stop passing/binding it.
- **Breaking layout change:** `CaptionsPanel` no longer renders its own
  outer `Card`/`CardHeader`/`CardTitle` — it now renders bare content
  (a `Button`, transcript text, segment list, `CaptionStyleControl`,
  `CaptionPreview`). It's designed to be mounted *inside* a parent `Card`
  (Task 6 mounts it inside a `ToolCard`, which already provides the
  "Captions" title and card chrome) — mounting it bare (outside any Card)
  would leave it without a visible container.

Currently `CaptionsPanel` has a `burnIn` checkbox, independent of whether
a transcript exists, that gates whether `CaptionStyleControl`/`CaptionPreview`
show and whether the export actually burns captions in. Per the approved
design, the panel being enabled (mounted) at all now means burn-in is
implied once a transcript exists — the checkbox goes away, and the two
style/preview components key off `status === 'done'` instead of `burnIn`.

- [ ] **Step 1: Replace `CaptionsPanel.svelte`**

Replace all of `www/src/lib/components/CaptionsPanel.svelte` with:

```svelte
<script lang="ts">
	import { transcribeFile } from '$lib/whisper/client';
	import { toSrt, type CaptionSegment } from '$lib/whisper/srt';
	import { DEFAULT_CAPTION_STYLE, type CaptionStyle } from '$lib/captions/style';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import CaptionStyleControl from './CaptionStyleControl.svelte';
	import CaptionPreview from './CaptionPreview.svelte';

	let {
		file,
		segments = $bindable([]),
		style = $bindable({ ...DEFAULT_CAPTION_STYLE })
	}: {
		file: File;
		segments?: CaptionSegment[];
		style?: CaptionStyle;
	} = $props();

	type Status = 'idle' | 'transcribing' | 'done' | 'error';

	let status = $state<Status>('idle');
	let progress = $state(0);
	let errorMessage = $state('');

	const srtUrl = $derived(
		segments.length
			? URL.createObjectURL(new Blob([toSrt(segments)], { type: 'text/plain' }))
			: null
	);

	const transcript = $derived(segments.map((seg) => seg.text.trim()).join(' '));

	function editSegmentText(index: number, text: string) {
		// Editing invalidates that segment's word-level timing (it no longer
		// matches the edited text), so drop it — burn-in falls back to
		// plain (non-karaoke) text for this segment instead of highlighting
		// against stale word boundaries.
		segments[index] = { ...segments[index], text, words: undefined };
	}

	async function generate() {
		status = 'transcribing';
		progress = 0;
		errorMessage = '';

		try {
			segments = await transcribeFile(file, (p) => (progress = p));
			status = 'done';
		} catch (err) {
			status = 'error';
			console.error('[captions] transcribe failed, raw error:', err);
			if (err instanceof ErrorEvent) {
				console.error('[captions] ErrorEvent details:', {
					message: err.message,
					filename: err.filename,
					lineno: err.lineno,
					colno: err.colno,
					error: err.error
				});
			}
			errorMessage = err instanceof Error ? err.message : String(err);
		}
	}
</script>

{#if status === 'idle'}
	<Button onclick={generate}>Generate captions</Button>
{:else if status === 'transcribing'}
	<p class="text-muted-foreground text-sm">Transcribing… {progress}%</p>
{:else if status === 'error'}
	<p class="text-destructive text-sm">Something went wrong: {errorMessage}</p>
	<Button onclick={generate}>Retry</Button>
{/if}

{#if status === 'done'}
	<div class="space-y-1">
		<h3 class="text-muted-foreground text-sm font-medium">Transcript</h3>
		<p class="text-sm whitespace-pre-wrap">{transcript}</p>
	</div>
	<ul class="max-h-64 space-y-2 overflow-y-auto">
		{#each segments as segment, i (i)}
			<li class="space-y-1">
				<span class="text-muted-foreground text-xs">{segment.from} → {segment.to}</span>
				<Input
					type="text"
					value={segment.text}
					oninput={(e) => editSegmentText(i, e.currentTarget.value)}
				/>
			</li>
		{/each}
	</ul>
	{#if srtUrl}
		<Button href={srtUrl} download="captions.srt" variant="outline"
			>Download captions.srt</Button
		>
	{/if}

	<CaptionStyleControl bind:style />
	<CaptionPreview {segments} {style} />
{/if}
```

- [ ] **Step 2: Type-check**

Run: `cd www && pnpm check`
Expected: errors are acceptable only in `www/src/routes/+page.svelte`
(still passing the now-removed `burnIn` prop — fixed in Task 6). Any error
inside `CaptionsPanel.svelte` itself must be fixed before proceeding.

- [ ] **Step 3: Commit**

```bash
cd /home/phon/Programming/vidm
git add www/src/lib/components/CaptionsPanel.svelte
git commit -m "refactor: drop the burnIn checkbox from CaptionsPanel"
```

---

### Task 6: Rewire `+page.svelte`

**Files:**
- Modify: `www/src/routes/+page.svelte` (full replace)

**Interfaces:**
- Consumes: `ToolCard` (Task 3), `buildExportSummary` (Task 2), the trimmed
  `FormatToggle`/`CompressionControl` (Task 4), the unwrapped `CaptionsPanel`
  (Task 5).

This is the integration task: new state (`speedEnabled`, `captionsEnabled`
replacing `burnCaptions`, `compression` now defaulting to `mode: 'none'`),
the simplified `hasActiveTransform` guard, the new `exportSummary` derived
value, and the page template reordered into four `ToolCard`s followed by
the summary + Export button.

- [ ] **Step 1: Replace `+page.svelte`**

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
	import ToolCard from '$lib/components/ToolCard.svelte';
	import FormatToggle from '$lib/components/FormatToggle.svelte';
	import RatioSelector from '$lib/components/RatioSelector.svelte';
	import SpeedControl from '$lib/components/SpeedControl.svelte';
	import CompressionControl from '$lib/components/CompressionControl.svelte';
	import CropPositioner from '$lib/components/CropPositioner.svelte';
	import CaptionsPanel from '$lib/components/CaptionsPanel.svelte';
	import { Button } from '$lib/components/ui/button';
	import ThemeToggle from '$lib/components/ThemeToggle.svelte';

	type Status = 'configuring' | 'loading-engine' | 'processing' | 'done' | 'error';

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

	// Every option is independently optional (reformat, speed, compression,
	// captions) — but exporting with literally nothing selected would just
	// re-encode the source unchanged for no reason, so require at least one.
	const hasActiveTransform = $derived(
		mode !== 'none' ||
			speedEnabled ||
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

		<ToolCard
			title="Compression"
			enabled={compression.mode !== 'none'}
			onEnabledChange={(v) => (compression = { ...compression, mode: v ? 'preset' : 'none' })}
		>
			<CompressionControl bind:compression />
		</ToolCard>

		<ToolCard
			title="Captions"
			enabled={captionsEnabled}
			onEnabledChange={(v) => (captionsEnabled = v)}
		>
			<CaptionsPanel file={sourceFile} bind:segments={captionSegments} bind:style={captionStyle} />
		</ToolCard>

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

Expected: all three PASS. `pnpm check` fully clean (0 errors — this
resolves Task 4/5's expected-if-run-alone `+page.svelte` errors). `pnpm test`
shows all existing tests plus Task 2's 7 new `buildExportSummary` tests
passing, no regressions.

- [ ] **Step 3: Commit**

```bash
cd /home/phon/Programming/vidm
git add www/src/routes/+page.svelte
git commit -m "feat: redesign editor page as four toggleable tool cards"
```

---

### Task 7: Verify on a Cloudflare Preview URL, then push and open a PR

**Files:** none (verification and git/deploy operations only).

**Interfaces:** none — this task only runs commands and inspects output.

- [ ] **Step 1: Rename the branch**

The branch is currently `docs/editor-flow-redesign` (named when it held
only the design-spec commit). Now that code has landed on it, rename it to
match this repo's convention for feature branches:

```bash
cd /home/phon/Programming/vidm
git branch -m docs/editor-flow-redesign feat/editor-flow-redesign
```

- [ ] **Step 2: Get a Preview URL without touching production**

Run, from `www/`:

```bash
pnpm build
rm -f build/_redirects build/ffmpeg/ffmpeg-core.wasm build/whisper/ggml-tiny.en-q5_1.bin
pnpm exec wrangler versions upload
```

The `rm -f` step mirrors what CI's deploy job does before deploying (see
`.github/workflows/ci.yml`) — `ffmpeg-core.wasm` and the whisper model
exceed Workers' 25 MiB static-asset limit and are served from R2 instead
(already uploaded there; this doesn't re-upload them). `wrangler versions
upload` uploads a new Worker *version* without shifting production
traffic (unlike `wrangler deploy`) — output includes a preview URL in the
form `https://<version-id>-vidm.<subdomain>.workers.dev`. Note the exact
printed URL for the next step.

- [ ] **Step 3: Smoke-test the preview URL**

```bash
curl -s -o /dev/null -w "homepage: %{http_code}\n" "<preview-url>/"
curl -s -o /dev/null -w "ffmpeg-core.wasm: %{http_code}\n" "<preview-url>/ffmpeg/ffmpeg-core.wasm"
curl -s -o /dev/null -w "whisper model: %{http_code}\n" "<preview-url>/whisper/ggml-tiny.en-q5_1.bin"
```

Expected: all three `200`. This confirms the version deployed and asset
routing works — it does **not** confirm the redesigned flow looks/behaves
correctly, which needs a real browser.

- [ ] **Step 4: Hand off for visual confirmation**

Report the preview URL to the user and ask them to open it, upload a
video, and confirm: all four tools (Reformat, Speed, Compression,
Captions) start collapsed/off; toggling each one's switch expands its
controls in place without layout jumping elsewhere on the page; the
Export button is disabled with nothing toggled on and enables once
something is; the summary line above Export accurately reflects what's
toggled on; the Captions card no longer has a separate "burn in"
checkbox; and an actual export (with at least one tool active) still
completes successfully. Do not proceed to Step 5 until they confirm it
looks and behaves right.

- [ ] **Step 5: Push and open a PR**

Once the user confirms:

```bash
cd /home/phon/Programming/vidm
git push -u origin feat/editor-flow-redesign
gh pr create --title "feat: redesign editor page as four toggleable tool cards" --body "$(cat <<'EOF'
## Summary
- Replaced the editor page's inconsistent per-tool "how do I turn this off" conventions (a `none` radio option mixed into reformat/compression, no off-state at all for speed, a separate burn-in checkbox for captions) with one shared `ToolCard` component: every tool gets a header switch, off collapses to just the header, on expands that tool's controls.
- Every tool now defaults off (compression previously defaulted on, which meant the "select at least one" export guard almost never actually fired) — the guard is now reachable on a fresh page load.
- Export button + a live one-line summary of what's active now sit at the very end of the page, after Captions, instead of before it.
- Design spec: `docs/superpowers/specs/2026-08-09-editor-flow-redesign-design.md`

## Test plan
- [x] `pnpm check`/`pnpm test`/`pnpm build` all pass
- [x] Verified on a Cloudflare Preview URL (`wrangler versions upload`, not a production deploy) — visually confirmed by the user before opening this PR
EOF
)"
```

- [ ] **Step 6: Wait for CI, then merge**

Check CI status (`gh pr checks <number>`), wait for the `test` job to
pass, then ask the user for explicit merge confirmation before running:

```bash
gh pr merge <number> --merge --delete-branch
```

This triggers the gated `deploy` job on the merge-to-main push, which
ships this to production automatically. Watch that run to completion
(`gh run watch <run-id> --exit-status`) and confirm the `deploy` job
succeeds before reporting done.
