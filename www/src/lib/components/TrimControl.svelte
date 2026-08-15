<script lang="ts">
	import { MIN_TRIM_DURATION_SECONDS } from '$lib/ffmpeg/filters';
	import { formatTimecode, parseTimecode } from '$lib/timecode';
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

	// Text inputs are one-way (value= not bind:value=) and commit on
	// change/blur rather than every keystroke: re-formatting the field on
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
	<p class="text-muted-foreground text-sm">
		Drag the handles directly on the video above, or type exact times below.
	</p>
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
