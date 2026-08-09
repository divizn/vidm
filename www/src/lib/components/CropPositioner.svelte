<script lang="ts">
	import type { AspectRatio, CropRegion } from '$lib/ffmpeg/filters';

	let {
		file,
		ratio,
		crop = $bindable()
	}: { file: File; ratio: AspectRatio; crop: CropRegion } = $props();

	let videoEl: HTMLVideoElement | undefined = $state();
	let sourceWidth = $state(0);
	let sourceHeight = $state(0);
	let renderedWidth = $state(0);
	let renderedHeight = $state(0);

	// Fraction (0-1) of the way through the available drag range, per axis.
	let offsetXFrac = $state(0.5);
	let offsetYFrac = $state(0.5);

	const objectUrl = $derived(URL.createObjectURL(file));

	function onLoadedMetadata() {
		if (!videoEl) return;
		sourceWidth = videoEl.videoWidth;
		sourceHeight = videoEl.videoHeight;
		renderedWidth = videoEl.clientWidth;
		renderedHeight = videoEl.clientHeight;
		// Some browsers (notably Firefox) never paint a frame for a paused,
		// non-autoplaying <video> until something actually requests one — a
		// negligible forced seek triggers the decode+paint without visibly
		// scrubbing, so the preview shows real content instead of black.
		videoEl.currentTime = 0.001;
	}

	// Largest box with the target ratio that fits inside the source frame,
	// as a fraction of the source's own width/height.
	const boxFrac = $derived.by(() => {
		if (!sourceWidth || !sourceHeight) return { w: 1, h: 1 };
		const sourceRatio = sourceWidth / sourceHeight;
		const targetRatio = ratio.w / ratio.h;
		return targetRatio < sourceRatio
			? { w: (sourceRatio ? targetRatio / sourceRatio : 1), h: 1 }
			: { w: 1, h: sourceRatio / targetRatio };
	});

	// libx264 requires even width/height (yuv420p chroma subsampling) —
	// round down to the nearest even number, never up, so the crop region
	// never exceeds the source frame.
	function toEven(n: number): number {
		return Math.floor(n / 2) * 2;
	}

	$effect(() => {
		if (!sourceWidth || !sourceHeight) return;
		const boxW = toEven(boxFrac.w * sourceWidth);
		const boxH = toEven(boxFrac.h * sourceHeight);
		const slackX = sourceWidth - boxW;
		const slackY = sourceHeight - boxH;
		crop = {
			width: boxW,
			height: boxH,
			x: toEven(offsetXFrac * slackX),
			y: toEven(offsetYFrac * slackY)
		};
	});

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
		const slackXPx = (1 - boxFrac.w) * renderedWidth;
		const slackYPx = (1 - boxFrac.h) * renderedHeight;
		const dx = e.clientX - dragStartX;
		const dy = e.clientY - dragStartY;
		offsetXFrac = slackXPx > 0 ? clamp01(dragStartOffsetX + dx / slackXPx) : 0.5;
		offsetYFrac = slackYPx > 0 ? clamp01(dragStartOffsetY + dy / slackYPx) : 0.5;
	}

	function onPointerUp() {
		dragging = false;
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
	{#if sourceWidth}
		<div
			class="border-primary bg-primary/20 absolute cursor-grab touch-none border-2 active:cursor-grabbing"
			style:width={`${boxFrac.w * 100}%`}
			style:height={`${boxFrac.h * 100}%`}
			style:left={`${offsetXFrac * (1 - boxFrac.w) * 100}%`}
			style:top={`${offsetYFrac * (1 - boxFrac.h) * 100}%`}
			onpointerdown={onPointerDown}
			onpointermove={onPointerMove}
			onpointerup={onPointerUp}
		></div>
	{/if}
</div>
<p class="text-muted-foreground mt-1.5 text-center text-sm">
	Drag the box to choose what stays in frame.
</p>
