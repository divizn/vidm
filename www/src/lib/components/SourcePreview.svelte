<script lang="ts">
	import {
		computeOutputDimensions,
		MIN_TRIM_DURATION_SECONDS,
		type AspectRatio,
		type CropRegion
	} from '$lib/ffmpeg/filters';
	import PlayIcon from '@lucide/svelte/icons/play';
	import PauseIcon from '@lucide/svelte/icons/pause';

	let {
		file,
		ratio,
		crop = $bindable(),
		showCropBox,
		sourceWidth = $bindable(0),
		sourceHeight = $bindable(0),
		sourceDuration = $bindable(0),
		trimStart = $bindable(0),
		trimEnd = $bindable(0),
		clampToTrim = false,
		speed = 1,
		volume = 1,
		onLoadError
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
		// Fired when the browser can't decode `file` as a video at all (e.g. a
		// GIF or some other non-video file dropped in): the <video> element's
		// own `error` event, code 4 (MEDIA_ERR_SRC_NOT_SUPPORTED), fires
		// reliably for this rather than hanging forever waiting for metadata
		// that will never arrive.
		onLoadError: () => void;
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

	// Jumps the preview to the trim start when the Trim tab becomes active,
	// and again whenever the user drags the start handle while it's active
	// — trimEnd changing doesn't need its own seek, the loop-back in
	// onTimeUpdate below handles that once playback reaches it.
	$effect(() => {
		if (!videoEl || !clampToTrim) return;
		videoEl.currentTime = trimStart;
	});

	// Mirrors the Speed tool's value onto the preview element itself, so
	// scrubbing/playing the source preview approximates the exported
	// pacing — the export's own audio pitch-correction (atempo) isn't
	// replicated here, this is just the native playbackRate the browser
	// already knows how to apply.
	$effect(() => {
		if (!videoEl) return;
		videoEl.playbackRate = speed;
	});

	// Mirrors the Volume tool's value onto the preview element, same pattern
	// as the playbackRate mirror above. HTMLMediaElement.volume caps at 1.0
	// in the browser — values above 1 (a boosted export) clamp to the
	// loudest the native element can actually play; see VolumeControl's own
	// note about this limitation.
	$effect(() => {
		if (!videoEl) return;
		videoEl.volume = Math.min(1, volume);
	});

	function onTimeUpdate() {
		if (!clampToTrim || !videoEl) return;
		if (videoEl.currentTime >= trimEnd) {
			videoEl.currentTime = trimStart;
			videoEl.pause();
		}
	}

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

	// Custom play/pause overlay replaces the native <video controls> bar —
	// this app only needs start/stop, not a scrubber or volume UI (volume
	// has its own dedicated tool tab; scrubbing precision comes from the
	// trim handles/mm:ss inputs instead).
	let isPaused = $state(true);

	function togglePlay() {
		if (!videoEl) return;
		if (videoEl.paused) videoEl.play();
		else videoEl.pause();
	}

	// Trim handles, dragged directly on the video frame — mirrors the crop
	// box's own onPointerDown/Move/Up + setPointerCapture pattern above, so
	// dragging tracks the pointer even once it leaves the thin handle.
	let trimStripEl: HTMLDivElement | undefined = $state();
	let draggingTrimHandle: 'start' | 'end' | null = null;
	let trimStripRect: DOMRect | undefined;

	function onTrimHandlePointerDown(handle: 'start' | 'end', e: PointerEvent) {
		if (!trimStripEl) return;
		draggingTrimHandle = handle;
		trimStripRect = trimStripEl.getBoundingClientRect();
		(e.target as HTMLElement).setPointerCapture(e.pointerId);
	}

	function onTrimHandlePointerMove(e: PointerEvent) {
		if (!draggingTrimHandle || !trimStripRect || !sourceDuration) return;
		const frac = clamp01((e.clientX - trimStripRect.left) / trimStripRect.width);
		const time = frac * sourceDuration;
		if (draggingTrimHandle === 'start') {
			trimStart = Math.max(0, Math.min(time, trimEnd - MIN_TRIM_DURATION_SECONDS));
		} else {
			trimEnd = Math.min(sourceDuration, Math.max(time, trimStart + MIN_TRIM_DURATION_SECONDS));
		}
	}

	function onTrimHandlePointerUp() {
		draggingTrimHandle = null;
	}
</script>

<div class="group relative mx-auto max-w-[480px]">
	<video
		bind:this={videoEl}
		src={objectUrl}
		onloadedmetadata={onLoadedMetadata}
		onerror={onLoadError}
		ontimeupdate={onTimeUpdate}
		onplay={() => (isPaused = false)}
		onpause={() => (isPaused = true)}
		playsinline
		class="block w-full rounded-md"
	></video>
	<button
		type="button"
		onclick={togglePlay}
		class={`absolute inset-0 m-auto flex size-14 items-center justify-center rounded-full bg-black/50 text-white transition-opacity focus-visible:opacity-100 focus-visible:outline-hidden ${isPaused ? 'opacity-90' : 'opacity-0 group-hover:opacity-90'}`}
		aria-label={isPaused ? 'Play' : 'Pause'}
	>
		{#if isPaused}
			<PlayIcon class="size-6" />
		{:else}
			<PauseIcon class="size-6" />
		{/if}
	</button>
	{#if clampToTrim && sourceDuration}
		<div
			bind:this={trimStripEl}
			class="absolute inset-x-0 bottom-0 h-8 touch-none"
		>
			<div class="absolute inset-0 bg-black/35"></div>
			<div
				class="absolute inset-y-0 left-0 bg-black/55"
				style:width={`${(trimStart / sourceDuration) * 100}%`}
			></div>
			<div
				class="absolute inset-y-0 right-0 bg-black/55"
				style:left={`${(trimEnd / sourceDuration) * 100}%`}
			></div>
			<div
				class="border-primary bg-primary/20 absolute inset-y-0 border-t-2"
				style:left={`${(trimStart / sourceDuration) * 100}%`}
				style:width={`${((trimEnd - trimStart) / sourceDuration) * 100}%`}
			></div>
			<div
				class="bg-primary absolute -top-1.5 -bottom-1.5 w-1.5 touch-none rounded-full shadow-[0_0_6px_rgba(0,0,0,0.6)] cursor-ew-resize"
				style:left={`${(trimStart / sourceDuration) * 100}%`}
				onpointerdown={(e) => onTrimHandlePointerDown('start', e)}
				onpointermove={onTrimHandlePointerMove}
				onpointerup={onTrimHandlePointerUp}
			></div>
			<div
				class="bg-primary absolute -top-1.5 -bottom-1.5 w-1.5 touch-none rounded-full shadow-[0_0_6px_rgba(0,0,0,0.6)] cursor-ew-resize"
				style:left={`${(trimEnd / sourceDuration) * 100}%`}
				onpointerdown={(e) => onTrimHandlePointerDown('end', e)}
				onpointermove={onTrimHandlePointerMove}
				onpointerup={onTrimHandlePointerUp}
			></div>
		</div>
	{/if}
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
