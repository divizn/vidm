<script lang="ts">
	import { computeOutputDimensions, type AspectRatio, type CropRegion } from '$lib/ffmpeg/filters';

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
</script>

<div class="relative mx-auto max-w-[480px]">
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
