// transformers.js's automatic-speech-recognition pipeline splits audio
// longer than `chunkLengthS` into overlapping windows and calls the model's
// generate() once per window (see AutomaticSpeechRecognitionPipeline
// .[_call_whisper] in
// node_modules/@huggingface/transformers/src/pipelines/automatic-speech-recognition.js):
// each window covers `chunkLengthS` seconds, and each subsequent window
// starts `jump = chunkLengthS - 2*strideLengthS` seconds after the previous
// one's start: windows overlap by `strideLengthS` on each side so the
// pipeline can merge text across a hard cut instead of mangling it.
//
// WhisperTextStreamer's on_chunk_start/on_chunk_end callbacks (see
// webgpu-worker.ts) report timestamps *local* to whichever window is
// currently generating: they reset back down near 0 every time a new
// window's generate() call begins, since each window's audio is fed to the
// model as its own independent span starting at time 0. The helpers below
// turn that stream of local timestamps into one 0-1 progress fraction for
// the whole clip.

// Mirrors the pipeline's own windowing loop (which runs in sample counts;
// this runs in seconds, which is all a progress estimate needs) closely
// enough to get the same window count for any real clip length.
export function countWindows(durationSeconds: number, chunkLengthS: number, strideLengthS: number): number {
	if (durationSeconds <= chunkLengthS) return 1;
	const jump = chunkLengthS - 2 * strideLengthS;
	let offset = 0;
	let count = 0;
	while (true) {
		count++;
		const offsetEnd = offset + chunkLengthS;
		if (offsetEnd >= durationSeconds) break;
		offset += jump;
	}
	return count;
}

// Because windows overlap, the next window's local time-since-0 restarts
// *before* the previous window's last reported global position (they share
// `strideLengthS` seconds of audio on each side), a naive
// windowIndex*jump + localTime computation would occasionally report a
// smaller fraction than it just reported a moment ago. A progress bar that
// visibly rewinds reads as more broken than one that briefly plateaus, so
// this tracks the high-water mark and never reports below it.
export class WindowProgressTracker {
	private windowIndex = 0;
	private lastLocalTime = -Infinity;
	private maxFraction = 0;

	constructor(
		private readonly totalWindows: number,
		private readonly jumpSeconds: number,
		private readonly durationSeconds: number
	) {}

	// Called when a window's generate() finishes (WhisperTextStreamer fires
	// on_finalize once per window). This is the reliable coarse signal:
	// timestamp tokens are emitted only at segment boundaries, so a window
	// containing one long unbroken utterance reports nothing at all and the bar
	// appears frozen. Completing a window always advances progress by one
	// window's worth of audio, independent of what the model chose to emit.
	completeWindow(): number {
		if (this.windowIndex < this.totalWindows - 1) {
			this.windowIndex++;
			this.lastLocalTime = -Infinity;
		}
		if (this.durationSeconds > 0) {
			const globalTime = this.windowIndex * this.jumpSeconds;
			const fraction = Math.max(0, Math.min(1, globalTime / this.durationSeconds));
			this.maxFraction = Math.max(this.maxFraction, fraction);
		}
		return this.maxFraction;
	}

	// Feed every local (window-relative) timestamp the streamer reports, in
	// the order they're reported. Returns the current best-effort progress
	// fraction in [0, 1], guaranteed non-decreasing across calls.
	observe(localTimeSeconds: number): number {
		// A reported time lower than the last one seen is the signal that
		// generation has moved on to the next window (its local clock reset).
		if (localTimeSeconds < this.lastLocalTime && this.windowIndex < this.totalWindows - 1) {
			this.windowIndex++;
		}
		this.lastLocalTime = localTimeSeconds;

		if (this.durationSeconds > 0) {
			const globalTime = this.windowIndex * this.jumpSeconds + localTimeSeconds;
			const fraction = Math.max(0, Math.min(1, globalTime / this.durationSeconds));
			this.maxFraction = Math.max(this.maxFraction, fraction);
		}
		return this.maxFraction;
	}
}
