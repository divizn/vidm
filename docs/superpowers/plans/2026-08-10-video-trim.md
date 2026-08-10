# Video Trim Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Trim tool to vidm's editor — an in/out range the user picks on the uploaded video, applied on export and (when active) scoping caption transcription to just that range.

**Architecture:** Trim is a peer of the existing Reformat/Speed/Compression/Captions tools: its own `ToolTabs` entry, its own state (`trimStart`/`trimEnd`) in `+page.svelte`, and its own panel component (`TrimControl.svelte`) using bits-ui's dual-thumb `Slider` (`type="multiple"`) plus synced mm:ss text inputs. `SourcePreview` gains playback clamping to the range. `filters.ts`'s `buildExportArgs` gains `-ss`/`-t` input-side trim args and switches its size-mode duration math to the trimmed duration. `CaptionsPanel` pre-extracts the trimmed sub-clip via ffmpeg before transcribing (when trim is active) so caption timestamps come out already relative to the trim start — which requires `loadFFmpeg()` to be memoized, since a second concurrent ffmpeg.wasm instance can't initialize.

**Tech Stack:** SvelteKit 5 (runes: `$state`/`$props`/`$bindable`/`$effect`/`$derived`), TypeScript, Tailwind, bits-ui (shadcn-svelte primitives), vitest, ffmpeg.wasm.

## Global Constraints

- Minimum trim duration: 0.5 seconds, enforced at the slider/input level (both handles can't collapse together).
- A trim range covering the full source (`trimStart === 0 && trimEnd === sourceDuration`) is treated as "trim inactive" everywhere: no export args, no summary line, no active-tab indicator dot, no caption pre-extraction.
- `-ss`/`-t` are added as **input** options (before `-i`), using `-t` (duration) rather than `-to` (absolute end) — `-to` as an input option is relative to the file's own start, not to `-ss`, which would be a correctness bug.
- Caption transcription, when trim is active, must run against a **re-encoded** (not stream-copied) sub-clip — stream-copy can only cut at keyframes, which could desync the transcript from the frame-accurate trim the real export applies.
- `loadFFmpeg()` must be memoized (one instance per page load, shared by every caller) — a second multi-threaded ffmpeg.wasm instance cannot initialize while an earlier one is still alive.
- New file upload resets trim to the full range, same as other per-file state.

---

### Task 1: Timecode formatting helpers

**Files:**
- Create: `www/src/lib/timecode.ts`
- Test: `www/src/lib/timecode.test.ts`

**Interfaces:**
- Consumes: nothing (pure functions, no imports from app code).
- Produces: `formatTimecode(totalSeconds: number): string` — formats as `M:SS.s` (e.g. `83.4` → `"1:23.4"`, `5` → `"0:05.0"`), rounded to the nearest tenth of a second, clamped to non-negative. `parseTimecode(text: string): number | null` — parses a `M:SS(.s)` string (as produced by `formatTimecode`) or a plain non-negative number of seconds (e.g. `"45"`, `"45.5"`) back to seconds; returns `null` for anything that doesn't parse to a valid non-negative duration (including a seconds component `>= 60`).

- [ ] **Step 1: Write the failing tests**

```typescript
// www/src/lib/timecode.test.ts
import { describe, expect, it } from 'vitest';
import { formatTimecode, parseTimecode } from './timecode';

describe('formatTimecode', () => {
	it('formats whole seconds under a minute with a zero-padded seconds component', () => {
		expect(formatTimecode(5)).toBe('0:05.0');
	});

	it('formats zero as 0:00.0', () => {
		expect(formatTimecode(0)).toBe('0:00.0');
	});

	it('formats minutes and seconds together', () => {
		expect(formatTimecode(83.44)).toBe('1:23.4');
	});

	it('rounds to the nearest tenth of a second', () => {
		expect(formatTimecode(83.46)).toBe('1:23.5');
	});

	it('clamps negative input to zero', () => {
		expect(formatTimecode(-5)).toBe('0:00.0');
	});

	it('carries seconds rounding up into the next minute correctly', () => {
		expect(formatTimecode(59.96)).toBe('1:00.0');
	});
});

describe('parseTimecode', () => {
	it('parses a M:SS.s timecode', () => {
		expect(parseTimecode('1:23.4')).toBe(83.4);
	});

	it('parses a M:SS timecode with no fractional part', () => {
		expect(parseTimecode('0:05')).toBe(5);
	});

	it('parses a plain integer as seconds', () => {
		expect(parseTimecode('45')).toBe(45);
	});

	it('parses a plain decimal as seconds', () => {
		expect(parseTimecode('45.5')).toBe(45.5);
	});

	it('returns null for unparseable text', () => {
		expect(parseTimecode('abc')).toBeNull();
	});

	it('returns null when the seconds component is 60 or more', () => {
		expect(parseTimecode('1:75')).toBeNull();
	});

	it('returns null for negative values', () => {
		expect(parseTimecode('-5')).toBeNull();
	});

	it('returns null for empty input', () => {
		expect(parseTimecode('  ')).toBeNull();
	});
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run (from `www/`): `npx vitest run src/lib/timecode.test.ts`
Expected: FAIL — `./timecode` has no exported member `formatTimecode`/`parseTimecode` (module doesn't exist yet).

- [ ] **Step 3: Implement `timecode.ts`**

```typescript
// www/src/lib/timecode.ts

// Formats a duration in seconds as M:SS.s (e.g. 83.4 -> "1:23.4"), rounded
// to the nearest tenth of a second — trim only needs sub-second precision
// for defining an edit point, not frame-accurate display.
export function formatTimecode(totalSeconds: number): string {
	const clamped = Math.max(0, totalSeconds);
	const rounded = Math.round(clamped * 10) / 10;
	const minutes = Math.floor(rounded / 60);
	const seconds = rounded - minutes * 60;
	const secondsStr = seconds.toFixed(1).padStart(4, '0');
	return `${minutes}:${secondsStr}`;
}

// Parses a M:SS(.s) timecode (as produced by formatTimecode) or a plain
// number of seconds (e.g. "45" or "45.5") back into seconds. Returns null
// for anything that doesn't parse to a valid non-negative duration.
export function parseTimecode(text: string): number | null {
	const trimmed = text.trim();
	if (trimmed === '') return null;

	const colonMatch = trimmed.match(/^(\d+):(\d+(?:\.\d+)?)$/);
	if (colonMatch) {
		const minutes = Number(colonMatch[1]);
		const seconds = Number(colonMatch[2]);
		if (seconds >= 60) return null;
		return minutes * 60 + seconds;
	}

	const plain = Number(trimmed);
	return Number.isFinite(plain) && plain >= 0 ? plain : null;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run (from `www/`): `npx vitest run src/lib/timecode.test.ts`
Expected: PASS (all 14 tests)

- [ ] **Step 5: Commit**

```bash
git add www/src/lib/timecode.ts www/src/lib/timecode.test.ts
git commit -m "feat: add mm:ss timecode format/parse helpers"
```

---

### Task 2: Trim support in `filters.ts` export args

**Files:**
- Modify: `www/src/lib/ffmpeg/filters.ts`
- Modify: `www/src/lib/ffmpeg/filters.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `ExportOptions` gains `trimStart: number` and `trimEnd: number` (seconds, into the source file's own timeline; caller must default to `[0, sourceDurationSeconds]` when trim is untouched). New exported constant `MIN_TRIM_DURATION_SECONDS = 0.5`. `buildExportArgs` behavior: when `trimStart > 0 || trimEnd < sourceDurationSeconds`, prepends `-ss <trimStart> -t <trimEnd - trimStart>` before every `-i <inputName>` occurrence (one for normal/crop modes, two for blur-pad). The `'size'` compression mode's duration budget switches from `sourceDurationSeconds` to `(trimEnd - trimStart)`.

- [ ] **Step 1: Update `baseOptions()` and write the failing tests**

In `www/src/lib/ffmpeg/filters.test.ts`, update `baseOptions()` to include the two new required fields (keep `sourceDurationSeconds: 10` — it's still needed as the reference "full duration" to detect whether trim is active):

```typescript
function baseOptions(overrides: Partial<ExportOptions> = {}): ExportOptions {
	return {
		mode: 'crop',
		speed: 1,
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

Add a new `describe('trim', ...)` block right after the existing `describe('buildExportArgs', ...)` tests (still inside the outer `buildExportArgs` describe, or as a sibling — place it directly before the closing `});` of `describe('buildExportArgs', ...)`):

```typescript
	describe('trim', () => {
		it('adds no trim args when the range covers the full source duration', () => {
			const args = buildExportArgs('in.mp4', 'out.mp4', baseOptions());
			expect(args).not.toContain('-ss');
			expect(args).not.toContain('-t');
		});

		it('adds -ss/-t as input options before -i when the trim range is active', () => {
			const args = buildExportArgs('in.mp4', 'out.mp4', baseOptions({ trimStart: 2, trimEnd: 8 }));

			expect(args).toContain('-ss');
			expect(args[args.indexOf('-ss') + 1]).toBe('2');
			expect(args).toContain('-t');
			expect(args[args.indexOf('-t') + 1]).toBe('6');

			const firstInputIndex = args.indexOf('-i');
			expect(args.indexOf('-ss')).toBeLessThan(firstInputIndex);
			expect(args.indexOf('-t')).toBeLessThan(firstInputIndex);
		});

		it('treats trimStart alone (trimEnd left at the full duration) as an active trim', () => {
			const args = buildExportArgs('in.mp4', 'out.mp4', baseOptions({ trimStart: 3, trimEnd: 10 }));
			expect(args[args.indexOf('-ss') + 1]).toBe('3');
			expect(args[args.indexOf('-t') + 1]).toBe('7');
		});

		it('treats trimEnd alone (trimStart left at 0) as an active trim', () => {
			const args = buildExportArgs('in.mp4', 'out.mp4', baseOptions({ trimStart: 0, trimEnd: 6 }));
			expect(args[args.indexOf('-ss') + 1]).toBe('0');
			expect(args[args.indexOf('-t') + 1]).toBe('6');
		});

		it('adds trim args before both inputs in blur-pad mode', () => {
			const args = buildExportArgs(
				'in.mp4',
				'out.mp4',
				baseOptions({ mode: 'blur-pad', trimStart: 1, trimEnd: 9 })
			);

			const ssIndices = args.reduce<number[]>((acc, a, i) => (a === '-ss' ? [...acc, i] : acc), []);
			const inputIndices = args.reduce<number[]>((acc, a, i) => (a === '-i' ? [...acc, i] : acc), []);
			expect(ssIndices).toHaveLength(2);
			expect(inputIndices).toHaveLength(2);
			expect(ssIndices[0]).toBeLessThan(inputIndices[0]);
			expect(ssIndices[1]).toBeLessThan(inputIndices[1]);
			expect(args[ssIndices[0] + 1]).toBe('1');
			expect(args[ssIndices[1] + 1]).toBe('1');
		});

		it('budgets size-mode compression against the trimmed duration, not the full source', () => {
			const full = buildExportArgs(
				'in.mp4',
				'out.mp4',
				baseOptions({ compression: { mode: 'size', crf: 23, targetMB: 3 } })
			);
			const trimmed = buildExportArgs(
				'in.mp4',
				'out.mp4',
				baseOptions({
					trimStart: 5,
					trimEnd: 10, // half the 10s source
					compression: { mode: 'size', crf: 23, targetMB: 3 }
				})
			);

			const fullKbps = Number(full[full.indexOf('-b:v') + 1].replace('k', ''));
			const trimmedKbps = Number(trimmed[trimmed.indexOf('-b:v') + 1].replace('k', ''));

			// Same 3MB budget over half the duration -> roughly double the bitrate.
			expect(trimmedKbps).toBeGreaterThan(fullKbps * 1.8);
			expect(trimmedKbps).toBeLessThan(fullKbps * 2.2);
		});
	});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run (from `www/`): `npx vitest run src/lib/ffmpeg/filters.test.ts`
Expected: FAIL — `baseOptions()` won't satisfy the `ExportOptions` type (missing `trimStart`/`trimEnd`) and the new `trim` describe block's assertions fail since no trim args are emitted yet.

- [ ] **Step 3: Implement the trim args in `filters.ts`**

Add the constant near `MIN_SPEED`/`MAX_SPEED`:

```typescript
// A trim range narrower than this would produce a degenerate (near-zero
// length) clip — enforced at the UI layer (TrimControl), referenced here
// so the export/UI code share one source of truth.
export const MIN_TRIM_DURATION_SECONDS = 0.5;
```

Add to `ExportOptions`:

```typescript
export interface ExportOptions {
	mode: ReformatMode;
	speed: number;
	ratio: AspectRatio;
	crop: CropRegion;
	compression: CompressionSettings;
	sourceDurationSeconds: number;
	// Trim range in seconds, into the source file's own timeline. Equal to
	// [0, sourceDurationSeconds] when trim is inactive — callers must
	// default it that way so this module can tell "no trim" apart from "a
	// deliberately narrow range" without a separate enabled flag.
	trimStart: number;
	trimEnd: number;
	// Source frame dimensions — used so blur-pad (which keeps the whole
	// frame) doesn't upscale beyond what the source actually has.
	sourceWidth: number;
	sourceHeight: number;
	captionsAssPath?: string;
	captionsFontsDir?: string;
}
```

In `buildExportArgs`, destructure `trimStart, trimEnd` from `options`, compute the trim args once, and use them for every `-i`:

```typescript
export function buildExportArgs(
	inputName: string,
	outputName: string,
	options: ExportOptions
): string[] {
	const {
		mode,
		speed,
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

	// Applied as *input* options (before -i), using -t (duration) rather
	// than -to (absolute end) — -to as an input option is relative to the
	// file's own start, not to -ss, which would double-trim the tail.
	const trimIsActive = trimStart > 0 || trimEnd < sourceDurationSeconds;
	const trimArgs = trimIsActive ? ['-ss', String(trimStart), '-t', String(trimEnd - trimStart)] : [];

	const needsSpeedFilters = speed !== 1;
	...
```

Update the input-building section:

```typescript
	const args: string[] = [];
	args.push(...trimArgs, '-i', inputName);
	if (mode === 'blur-pad') args.push(...trimArgs, '-i', inputName);
```

(This replaces the old `const args = ['-i', inputName]; if (mode === 'blur-pad') args.push('-i', inputName);` lines — everything after stays the same, since later code does `args.push(...)` rather than reassigning.)

Update the size-mode duration calculation:

```typescript
	if (compression.mode === 'size') {
		// Single-pass average-bitrate approximation, not two-pass...
		const outputDurationSec = (trimEnd - trimStart) / speed;
		...
```

(Only the `sourceDurationSeconds` reference on that one line changes to `(trimEnd - trimStart)` — `sourceDurationSeconds` itself stays a required field, still used above for `trimIsActive`.)

- [ ] **Step 4: Run the tests to verify they pass**

Run (from `www/`): `npx vitest run src/lib/ffmpeg/filters.test.ts`
Expected: PASS (all existing tests + new `trim` describe block)

- [ ] **Step 5: Commit**

```bash
git add www/src/lib/ffmpeg/filters.ts www/src/lib/ffmpeg/filters.test.ts
git commit -m "feat: add trim range support to ffmpeg export args"
```

---

### Task 3: Trim entry in the export summary

**Files:**
- Modify: `www/src/lib/editor-summary.ts`
- Modify: `www/src/lib/editor-summary.test.ts`

**Interfaces:**
- Consumes: `formatTimecode` from `$lib/timecode` (Task 1).
- Produces: `EditorSummaryInput` gains `trimStart: number`, `trimEnd: number`, `sourceDuration: number`. `buildExportSummary` prepends a `` `Trim ${formatTimecode(trimStart)}–${formatTimecode(trimEnd)}` `` entry (before the reformat/speed/compression/captions entries) whenever `trimStart > 0 || trimEnd < sourceDuration`.

- [ ] **Step 1: Rewrite the test file with a shared `baseInput()` helper and new trim tests**

`filters.test.ts` already uses a `baseOptions()` helper for exactly this reason (many required fields, most tests only vary one). `editor-summary.test.ts` predates that pattern and constructs an inline object per test; since every existing test now needs the 3 new required fields anyway, bring it in line:

```typescript
// www/src/lib/editor-summary.test.ts
import { describe, expect, it } from 'vitest';
import { buildExportSummary, type EditorSummaryInput } from './editor-summary';
import { ASPECT_RATIOS, DEFAULT_COMPRESSION, type CompressionSettings } from '$lib/ffmpeg/filters';

const offCompression: CompressionSettings = { mode: 'none', crf: 23, targetMB: 10 };

function baseInput(overrides: Partial<EditorSummaryInput> = {}): EditorSummaryInput {
	return {
		mode: 'none',
		ratio: ASPECT_RATIOS[0],
		speed: 1,
		compression: offCompression,
		hasCaptionSegments: false,
		trimStart: 0,
		trimEnd: 10,
		sourceDuration: 10,
		...overrides
	};
}

describe('buildExportSummary', () => {
	it('returns an empty list when nothing is enabled', () => {
		expect(buildExportSummary(baseInput())).toEqual([]);
	});

	it('includes the ratio label when crop mode is active', () => {
		expect(buildExportSummary(baseInput({ mode: 'crop' }))).toEqual(['Crop 9:16']);
	});

	it('labels blur-pad mode distinctly from crop', () => {
		expect(buildExportSummary(baseInput({ mode: 'blur-pad' }))).toEqual(['Blur pad 9:16']);
	});

	it('includes the speed multiplier when speed is not 1x', () => {
		expect(buildExportSummary(baseInput({ speed: 1.5 }))).toEqual(['1.50x speed']);
	});

	it('formats a fractional speed to two decimal places', () => {
		expect(buildExportSummary(baseInput({ speed: 1.35 }))).toEqual(['1.35x speed']);
	});

	it('excludes speed when left at the no-op 1x value', () => {
		expect(buildExportSummary(baseInput({ speed: 1 }))).toEqual([]);
	});

	it('includes compression when its mode is not none', () => {
		expect(buildExportSummary(baseInput({ compression: DEFAULT_COMPRESSION }))).toEqual([
			'Compression'
		]);
	});

	it('includes captions only when a transcript exists', () => {
		expect(buildExportSummary(baseInput({ hasCaptionSegments: false }))).toEqual([]);
		expect(buildExportSummary(baseInput({ hasCaptionSegments: true }))).toEqual(['Captions']);
	});

	it('includes a trim entry when the range is not the full source', () => {
		expect(buildExportSummary(baseInput({ trimStart: 2.5, trimEnd: 8 }))).toEqual([
			'Trim 0:02.5–0:08.0'
		]);
	});

	it('excludes trim when the range covers the full source duration', () => {
		expect(buildExportSummary(baseInput({ trimStart: 0, trimEnd: 10 }))).toEqual([]);
	});

	it('includes trim when only the start has moved', () => {
		expect(buildExportSummary(baseInput({ trimStart: 3, trimEnd: 10 }))).toEqual([
			'Trim 0:03.0–0:10.0'
		]);
	});

	it('includes trim when only the end has moved', () => {
		expect(buildExportSummary(baseInput({ trimStart: 0, trimEnd: 7 }))).toEqual([
			'Trim 0:00.0–0:07.0'
		]);
	});

	it('lists multiple active tools together, in trim/reformat/speed/compression/captions order', () => {
		const result = buildExportSummary(
			baseInput({
				mode: 'crop',
				speed: 1.5,
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
			'Compression',
			'Captions'
		]);
	});
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run (from `www/`): `npx vitest run src/lib/editor-summary.test.ts`
Expected: FAIL — `EditorSummaryInput` doesn't have `trimStart`/`trimEnd`/`sourceDuration` yet, and the trim-specific assertions fail.

- [ ] **Step 3: Implement in `editor-summary.ts`**

```typescript
import {
	COMPRESSION_PRESETS,
	type AspectRatio,
	type CompressionSettings,
	type ReformatMode
} from '$lib/ffmpeg/filters';
import { formatTimecode } from '$lib/timecode';

function compressionLabel(compression: CompressionSettings): string {
	if (compression.mode === 'size') return `Compression (~${compression.targetMB}MB)`;
	if (compression.mode === 'preset') {
		const preset = COMPRESSION_PRESETS.find((p) => p.crf === compression.crf);
		if (preset) return `Compression (${preset.label})`;
	}
	return `Compression (CRF ${compression.crf})`;
}

export interface EditorSummaryInput {
	mode: ReformatMode;
	ratio: AspectRatio;
	speed: number;
	compression: CompressionSettings;
	hasCaptionSegments: boolean;
	trimStart: number;
	trimEnd: number;
	sourceDuration: number;
}

export function buildExportSummary(input: EditorSummaryInput): string[] {
	const parts: string[] = [];

	if (input.trimStart > 0 || input.trimEnd < input.sourceDuration) {
		parts.push(`Trim ${formatTimecode(input.trimStart)}–${formatTimecode(input.trimEnd)}`);
	}

	if (input.mode === 'crop') parts.push(`Crop ${input.ratio.label}`);
	else if (input.mode === 'blur-pad') parts.push(`Blur pad ${input.ratio.label}`);

	if (input.speed !== 1) parts.push(`${input.speed.toFixed(2)}x speed`);

	if (input.compression.mode !== 'none') parts.push(compressionLabel(input.compression));

	if (input.hasCaptionSegments) parts.push('Captions');

	return parts;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run (from `www/`): `npx vitest run src/lib/editor-summary.test.ts`
Expected: PASS (all tests)

- [ ] **Step 5: Commit**

```bash
git add www/src/lib/editor-summary.ts www/src/lib/editor-summary.test.ts
git commit -m "feat: add trim entry to the export summary"
```

---

### Task 4: Memoize `loadFFmpeg()`

**Files:**
- Modify: `www/src/lib/ffmpeg/client.ts`
- Test: `www/src/lib/ffmpeg/client.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `loadFFmpeg(): Promise<FFmpeg>` — same external signature as before (still `await`-able from any call site), but now returns the *same* instance/promise on every call within a page load instead of constructing a new `FFmpeg()` each time. This is what lets Task 8's `CaptionsPanel` safely call it alongside `+page.svelte`'s existing call.

This is the one non-UI task with a mocked unit test — `vite.config.ts` already documents that unit tests stick to pure logic with no real DOM/WASM; this test follows that by mocking `@ffmpeg/ffmpeg` and `@ffmpeg/util` entirely, so it only exercises the caching control flow, not any real WASM loading.

- [ ] **Step 1: Write the failing test**

```typescript
// www/src/lib/ffmpeg/client.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const loadMock = vi.fn().mockResolvedValue(undefined);
let constructCount = 0;

vi.mock('@ffmpeg/ffmpeg', () => ({
	FFmpeg: class {
		on = vi.fn();
		load = loadMock;
		constructor() {
			constructCount++;
		}
	}
}));

vi.mock('@ffmpeg/util', () => ({
	toBlobURL: vi.fn().mockResolvedValue('blob:mock')
}));

beforeEach(() => {
	vi.resetModules();
	constructCount = 0;
	loadMock.mockClear();
});

describe('loadFFmpeg', () => {
	it('constructs and loads only one FFmpeg instance, shared across concurrent and later calls', async () => {
		const { loadFFmpeg } = await import('./client');

		const [a, b] = await Promise.all([loadFFmpeg(), loadFFmpeg()]);
		const c = await loadFFmpeg();

		expect(a).toBe(b);
		expect(b).toBe(c);
		expect(constructCount).toBe(1);
		expect(loadMock).toHaveBeenCalledTimes(1);
	});
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run (from `www/`): `npx vitest run src/lib/ffmpeg/client.test.ts`
Expected: FAIL — `constructCount` is 2 (current `loadFFmpeg` calls `new FFmpeg()` unconditionally every call).

- [ ] **Step 3: Implement the memoization in `client.ts`**

```typescript
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL } from '@ffmpeg/util';

// Self-hosted, multi-threaded core — needs COOP/COEP (see vite.config.ts).
const CORE_BASE_URL = '/ffmpeg';

// A second multi-threaded instance can't initialize while an earlier one is
// still alive in the same page (its pthread worker pool never spins up) —
// confirmed not fixable by terminating the old instance first, with or
// without a grace period. Originally the app only ever called this once
// (from the main export flow); trim's caption pre-extraction now needs a
// loaded engine too, so this caches the first load and hands every caller
// the same instance instead of racing a second one into existence.
let ffmpegPromise: Promise<FFmpeg> | null = null;

export function loadFFmpeg(): Promise<FFmpeg> {
	if (!ffmpegPromise) {
		ffmpegPromise = loadFFmpegInstance();
	}
	return ffmpegPromise;
}

async function loadFFmpegInstance(): Promise<FFmpeg> {
	const ffmpeg = new FFmpeg();
	ffmpeg.on('log', ({ message }) => console.debug('[ffmpeg]', message));

	await ffmpeg.load({
		coreURL: await toBlobURL(`${CORE_BASE_URL}/ffmpeg-core.js`, 'text/javascript'),
		wasmURL: await toBlobURL(`${CORE_BASE_URL}/ffmpeg-core.wasm`, 'application/wasm'),
		workerURL: await toBlobURL(`${CORE_BASE_URL}/ffmpeg-core.worker.js`, 'text/javascript')
	});

	return ffmpeg;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run (from `www/`): `npx vitest run src/lib/ffmpeg/client.test.ts`
Expected: PASS

- [ ] **Step 5: Run the full test suite and typecheck to confirm no regressions**

Run (from `www/`): `npx vitest run && npm run check`
Expected: All tests PASS, 0 typecheck errors (`+page.svelte`'s existing `await loadFFmpeg()` call site is untouched — signature is unchanged).

- [ ] **Step 6: Commit**

```bash
git add www/src/lib/ffmpeg/client.ts www/src/lib/ffmpeg/client.test.ts
git commit -m "fix: memoize loadFFmpeg so multiple call sites share one instance"
```

---

### Task 5: `TrimControl.svelte` component

**Files:**
- Create: `www/src/lib/components/TrimControl.svelte`

**Interfaces:**
- Consumes: `MIN_TRIM_DURATION_SECONDS` from `$lib/ffmpeg/filters` (Task 2); `formatTimecode`/`parseTimecode` from `$lib/timecode` (Task 1); `Slider` from `$lib/components/ui/slider`; `Label` from `$lib/components/ui/label`; `Input` from `$lib/components/ui/input`.
- Produces: `TrimControl` component with props `{ trimStart: number (bindable), trimEnd: number (bindable), sourceDuration: number, disabled?: boolean }`. Renders a dual-thumb slider (range `0`–`sourceDuration`) and two mm:ss text inputs, both kept in sync and both enforcing the `MIN_TRIM_DURATION_SECONDS` gap.

No automated test — this repo has no test coverage for `.svelte` components (`SpeedControl.svelte`, `CompressionControl.svelte`, etc. are all untested; only pure `.ts` logic is unit-tested, per `vite.config.ts`'s own comment). Verified manually via the dev server in Task 6, once it's wired into the page.

- [ ] **Step 1: Write the component**

```svelte
<script lang="ts">
	import { MIN_TRIM_DURATION_SECONDS } from '$lib/ffmpeg/filters';
	import { formatTimecode, parseTimecode } from '$lib/timecode';
	import { Slider } from '$lib/components/ui/slider';
	import { Label } from '$lib/components/ui/label';
	import { Input } from '$lib/components/ui/input';

	let {
		trimStart = $bindable(),
		trimEnd = $bindable(),
		sourceDuration,
		disabled = false
	}: {
		trimStart: number;
		trimEnd: number;
		sourceDuration: number;
		disabled?: boolean;
	} = $props();

	const TRIM_STEP = 0.1;

	function onSliderChange(value: number[]) {
		const [start, end] = value;
		if (end - start < MIN_TRIM_DURATION_SECONDS) return;
		trimStart = start;
		trimEnd = end;
	}

	// Text inputs are one-way (value= not bind:value=) and commit on
	// change/blur rather than every keystroke — re-formatting the field on
	// every keystroke (which a two-way bind would do, since trimStart
	// changing re-renders the formatted string) would fight the user
	// mid-type.
	function onStartInput(text: string) {
		const parsed = parseTimecode(text);
		if (parsed === null) return;
		trimStart = Math.min(Math.max(parsed, 0), trimEnd - MIN_TRIM_DURATION_SECONDS);
	}

	function onEndInput(text: string) {
		const parsed = parseTimecode(text);
		if (parsed === null) return;
		trimEnd = Math.max(Math.min(parsed, sourceDuration), trimStart + MIN_TRIM_DURATION_SECONDS);
	}
</script>

<fieldset {disabled} class="space-y-3">
	<legend class="mb-1 text-sm font-semibold">Trim</legend>
	<Slider
		type="multiple"
		min={0}
		max={sourceDuration}
		step={TRIM_STEP}
		value={[trimStart, trimEnd]}
		onValueChange={onSliderChange}
		{disabled}
	/>
	<div class="flex flex-wrap items-center gap-3">
		<Label for="trim-start" class="font-normal">Start:</Label>
		<Input
			id="trim-start"
			type="text"
			value={formatTimecode(trimStart)}
			onchange={(e) => onStartInput(e.currentTarget.value)}
			class="w-24"
			{disabled}
		/>
		<Label for="trim-end" class="font-normal">End:</Label>
		<Input
			id="trim-end"
			type="text"
			value={formatTimecode(trimEnd)}
			onchange={(e) => onEndInput(e.currentTarget.value)}
			class="w-24"
			{disabled}
		/>
		<span class="text-muted-foreground text-sm"
			>Duration: {formatTimecode(trimEnd - trimStart)}</span
		>
	</div>
</fieldset>
```

- [ ] **Step 2: Typecheck**

Run (from `www/`): `npm run check`
Expected: 0 errors. (The component isn't imported anywhere yet, so this only confirms it's internally well-typed — full behavior is verified once wired in Task 6.)

- [ ] **Step 3: Commit**

```bash
git add www/src/lib/components/TrimControl.svelte
git commit -m "feat: add TrimControl component"
```

---

### Task 6: Wire Trim into `+page.svelte`

**Files:**
- Modify: `www/src/routes/+page.svelte`

**Interfaces:**
- Consumes: `TrimControl` (Task 5), updated `buildExportArgs`/`ExportOptions` (Task 2), updated `buildExportSummary`/`EditorSummaryInput` (Task 3).
- Produces: `+page.svelte` state `trimStart: number`, `trimEnd: number` — consumed by Task 7 (`SourcePreview` props) and Task 8 (`CaptionsPanel` props).

- [ ] **Step 1: Add trim state, icon import, and reset-on-upload**

Add the icon import near the other `@lucide/svelte/icons/*` imports:

```typescript
import ScissorsIcon from '@lucide/svelte/icons/scissors';
```

Add state right after the existing `crop` state declaration:

```typescript
	let trimStart = $state(0);
	// 0 doubles as "not yet initialized" until sourceDuration loads (see the
	// $effect below) — TrimControl and buildExportSummary both treat
	// trimEnd < sourceDuration as "trim active", so this must become the
	// real duration before either renders anything trim-related.
	let trimEnd = $state(0);
```

Add an `$effect` right after the `showCropBox` derived value to default `trimEnd` once the video's duration is known:

```typescript
	// Mirrors how `crop` gets derived from source dimensions once metadata
	// loads (see SourcePreview) — trim defaults to the full range the first
	// time sourceDuration becomes available for the current file.
	$effect(() => {
		if (sourceDuration > 0 && trimEnd === 0) {
			trimEnd = sourceDuration;
		}
	});
```

Update `handleFile` to reset trim for the newly-uploaded file:

```typescript
	function handleFile(file: File) {
		sourceFile = file;
		trimStart = 0;
		trimEnd = 0; // re-derived once metadata loads, via the $effect above
	}
```

- [ ] **Step 2: Extend `ActiveTool`, `toolTabs`, and `hasActiveTransform`**

```typescript
	type ActiveTool = 'trim' | 'reformat' | 'speed' | 'compression' | 'captions';
```

```typescript
	// Every option is independently optional (trim, reformat, speed,
	// compression, captions) — but exporting with literally nothing selected
	// would just re-encode the source unchanged for no reason, so require at
	// least one. There's no separate "enabled" flag for any tool — a real
	// selection (a narrowed trim range, a non-1x speed, a picked
	// reformat/compression mode, an actual transcript) is itself the signal.
	const hasActiveTransform = $derived(
		trimStart > 0 ||
			trimEnd < sourceDuration ||
			mode !== 'none' ||
			speed !== 1 ||
			compression.mode !== 'none' ||
			captionSegments.length > 0
	);
```

```typescript
	const exportSummary = $derived(
		buildExportSummary({
			mode,
			ratio,
			speed,
			compression,
			hasCaptionSegments: captionSegments.length > 0,
			trimStart,
			trimEnd,
			sourceDuration
		})
	);

	const toolTabs = $derived([
		{
			id: 'trim',
			label: 'Trim',
			icon: ScissorsIcon,
			enabled: trimStart > 0 || trimEnd < sourceDuration
		},
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
```

- [ ] **Step 3: Add the `TrimControl` panel and import**

```typescript
import TrimControl from '$lib/components/TrimControl.svelte';
```

In the tools `Card`, add the trim panel alongside the others:

```svelte
<div class={activeTool === 'trim' ? 'space-y-4' : 'hidden'}>
	<TrimControl bind:trimStart bind:trimEnd {sourceDuration} />
</div>
<div class={activeTool === 'reformat' ? 'space-y-4' : 'hidden'}>
```

(Insert immediately before the existing `reformat` panel `div`.)

- [ ] **Step 4: Pass trim into the export call**

In `run()`, add `trimStart, trimEnd` to the `buildExportArgs` options object:

```typescript
			await ffmpeg.exec(
				buildExportArgs(inputName, outputName, {
					mode,
					speed,
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

- [ ] **Step 5: Typecheck**

Run (from `www/`): `npm run check`
Expected: 0 errors.

- [ ] **Step 6: Manual verification**

Run (from `www/`): `npm run dev`, open the printed local URL, upload a short video.
- Confirm a "Trim" tab appears first in the tool tabs, with a scissors icon.
- Confirm its panel shows a dual-thumb slider and Start/End text inputs.
- Drag a handle; confirm the other input field updates. Type a new value (e.g. `0:02`) into a text field and press Tab/Enter; confirm the slider handle moves to match.
- Confirm the "active" dot appears on the Trim tab once the range is narrowed, and disappears if you drag it back to the full range.
- Confirm the Export button's summary line includes a `Trim m:ss–m:ss` entry once active, and that Export is enabled by trim alone (with every other tool left untouched).

- [ ] **Step 7: Commit**

```bash
git add www/src/routes/+page.svelte
git commit -m "feat: wire trim tool into the editor page"
```

---

### Task 7: Clamp `SourcePreview` playback to the trim range

**Files:**
- Modify: `www/src/lib/components/SourcePreview.svelte`
- Modify: `www/src/routes/+page.svelte`

**Interfaces:**
- Consumes: `trimStart`, `trimEnd` state from `+page.svelte` (Task 6).
- Produces: `SourcePreview` gains props `trimStart: number = 0`, `trimEnd: number = 0`, `clampToTrim: boolean = false`. When `clampToTrim` is true: entering it (or `trimStart` changing while it's true) seeks the video to `trimStart`; during playback, reaching `trimEnd` pauses and seeks back to `trimStart`.

Note: the `<video>` element currently has no `controls` attribute — there's no way to play it at all today (it's used purely as a still frame for crop positioning). This task adds `controls` so the clamp behavior is actually reachable; since `showCropBox` is only ever true while `activeTool === 'reformat'` and clamping only matters while `activeTool === 'trim'`, the two never need to be visible/interactive at the same time.

- [ ] **Step 1: Add props to `SourcePreview.svelte`**

```typescript
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
		clampToTrim = false
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
	} = $props();
```

- [ ] **Step 2: Add the seek-on-entry effect and the loop-at-end handler**

Add near the other `$effect` (the one deriving `crop`):

```typescript
	// Jumps the preview to the trim start when the Trim tab becomes active,
	// and again whenever the user drags the start handle while it's active
	// — trimEnd changing doesn't need its own seek, the loop-back in
	// onTimeUpdate below handles that once playback reaches it.
	$effect(() => {
		if (!videoEl || !clampToTrim) return;
		videoEl.currentTime = trimStart;
	});

	function onTimeUpdate() {
		if (!clampToTrim || !videoEl) return;
		if (videoEl.currentTime >= trimEnd) {
			videoEl.currentTime = trimStart;
			videoEl.pause();
		}
	}
```

- [ ] **Step 3: Wire `controls` and `ontimeupdate` onto the `<video>` element**

```svelte
	<video
		bind:this={videoEl}
		src={objectUrl}
		onloadedmetadata={onLoadedMetadata}
		ontimeupdate={onTimeUpdate}
		controls
		muted
		playsinline
		class="block w-full rounded-md"
	></video>
```

- [ ] **Step 4: Pass the new props from `+page.svelte`**

In the `SourcePreview` usage:

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
			/>
```

- [ ] **Step 5: Typecheck**

Run (from `www/`): `npm run check`
Expected: 0 errors.

- [ ] **Step 6: Manual verification**

Run (from `www/`): `npm run dev`, upload a video longer than ~10 seconds, narrow the trim range (e.g. to the middle third).
- On the Trim tab, click play (native controls): confirm playback starts at the trim start point, not the beginning of the video.
- Let it play through to the trim end: confirm it pauses and jumps back to the trim start rather than continuing into the untrimmed tail.
- Switch to another tool tab (e.g. Reformat) and confirm playback is no longer clamped (plays/seeks normally across the whole video).

- [ ] **Step 7: Commit**

```bash
git add www/src/lib/components/SourcePreview.svelte www/src/routes/+page.svelte
git commit -m "feat: clamp preview playback to the trim range"
```

---

### Task 8: Trim-scoped caption transcription

**Files:**
- Modify: `www/src/lib/components/CaptionsPanel.svelte`
- Modify: `www/src/routes/+page.svelte`

**Interfaces:**
- Consumes: memoized `loadFFmpeg` from `$lib/ffmpeg/client` (Task 4); `trimStart`, `trimEnd` state from `+page.svelte` (Task 6).
- Produces: `CaptionsPanel` gains props `trimStart: number`, `trimEnd: number`, `sourceDuration: number`. When trim is active, "Generate captions" transcribes a pre-extracted `[trimStart, trimEnd]` sub-clip instead of the full file, so segment timestamps come out already relative to `trimStart`. Changing the trim range after `segments` already exist clears them.

- [ ] **Step 1: Add props and the `trimActive` derived value**

```typescript
	let {
		file,
		segments = $bindable([]),
		style = $bindable({ ...DEFAULT_CAPTION_STYLE }),
		trimStart,
		trimEnd,
		sourceDuration
	}: {
		file: File;
		segments?: CaptionSegment[];
		style?: CaptionStyle;
		trimStart: number;
		trimEnd: number;
		sourceDuration: number;
	} = $props();

	const trimActive = $derived(trimStart > 0 || trimEnd < sourceDuration);
```

- [ ] **Step 2: Add the sub-clip extraction helper**

```typescript
	import { loadFFmpeg } from '$lib/ffmpeg/client';
	import { fetchFile } from '@ffmpeg/util';

	// Re-encodes (doesn't stream-copy) so the cut lands exactly at trimStart
	// — a copy-mode trim can only cut at keyframes, which could desync the
	// transcript from the frame-accurate trim the real export applies later.
	async function extractTrimmedClip(): Promise<File> {
		const ffmpeg = await loadFFmpeg();
		const inputName = 'caption-trim-input.mp4';
		const outputName = 'caption-trim-output.mp4';
		await ffmpeg.writeFile(inputName, await fetchFile(file));
		await ffmpeg.exec([
			'-ss',
			String(trimStart),
			'-i',
			inputName,
			'-t',
			String(trimEnd - trimStart),
			outputName
		]);
		const data = await ffmpeg.readFile(outputName);
		return new File([new Uint8Array(data as Uint8Array)], 'trimmed.mp4', { type: 'video/mp4' });
	}
```

- [ ] **Step 3: Use it from `generate()`**

```typescript
	async function generate() {
		status = 'transcribing';
		progress = 0;
		errorMessage = '';

		try {
			const transcribeTarget = trimActive ? await extractTrimmedClip() : file;
			segments = await transcribeFile(transcribeTarget, (p) => (progress = p));
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
```

- [ ] **Step 4: Clear stale captions when the trim range changes**

```typescript
	// If trim changes after a transcript already exists, its timestamps no
	// longer correspond to the new range — clear it rather than leaving it
	// silently stale, same philosophy as editSegmentText dropping word-level
	// timing on a manual edit.
	let prevTrimStart = trimStart;
	let prevTrimEnd = trimEnd;

	$effect(() => {
		if ((trimStart !== prevTrimStart || trimEnd !== prevTrimEnd) && segments.length > 0) {
			segments = [];
			status = 'idle';
		}
		prevTrimStart = trimStart;
		prevTrimEnd = trimEnd;
	});
```

- [ ] **Step 5: Surface the trim scope in the idle-state UI**

```typescript
	import { formatTimecode } from '$lib/timecode';
```

```svelte
{#if status === 'idle'}
	<Button onclick={generate}>Generate captions</Button>
	{#if trimActive}
		<p class="text-muted-foreground text-sm">
			Captions will be generated for the trimmed range ({formatTimecode(trimStart)}–{formatTimecode(
				trimEnd
			)}) only.
		</p>
	{/if}
{:else if status === 'transcribing'}
```

(This replaces just the `{#if status === 'idle'}` branch's contents — the rest of the template is unchanged.)

- [ ] **Step 6: Pass the new props from `+page.svelte`**

```svelte
				<CaptionsPanel
					file={sourceFile}
					bind:segments={captionSegments}
					bind:style={captionStyle}
					{trimStart}
					{trimEnd}
					{sourceDuration}
				/>
```

- [ ] **Step 7: Typecheck**

Run (from `www/`): `npm run check`
Expected: 0 errors.

- [ ] **Step 8: Manual verification**

Run (from `www/`): `npm run dev`, upload a video with clear, distinguishable speech in different sections (e.g. count numbers aloud through the clip).
- With trim left at the full range, generate captions: confirm transcript covers the whole clip as before (no regression).
- Narrow the trim range to a middle section, open Captions: confirm the "will be generated for the trimmed range" hint appears with the right times, then generate — confirm the transcript only covers speech from that section, and the first segment's timestamp starts near `0:00`, not the original in-video offset.
- With that transcript present, go back to Trim and move a handle: confirm the transcript is cleared and the panel returns to its "Generate captions" idle state.
- Export with both trim and captions active: confirm the burned-in captions are still positioned correctly in time against the trimmed output (not shifted).

- [ ] **Step 9: Commit**

```bash
git add www/src/lib/components/CaptionsPanel.svelte www/src/routes/+page.svelte
git commit -m "feat: scope caption transcription to the active trim range"
```
