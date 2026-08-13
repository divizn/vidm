// Assumes constant throughput — rough enough for an "about Xs left" label.
export function estimateRemainingSeconds(startedAt: number, progressPercent: number): number | null {
	if (progressPercent <= 0) return null;
	const elapsedMs = Date.now() - startedAt;
	const remainingMs = (elapsedMs * (100 - progressPercent)) / progressPercent;
	return remainingMs / 1000;
}

// Exponential moving average of seconds-per-chunk. A cumulative mean weights a
// slow first chunk equally with everything after it and adapts to a real change
// in throughput (throttling, a busy machine) only very slowly.
export function emaNext(previous: number | null, sample: number, smoothing = 0.3): number {
	return previous === null ? sample : smoothing * sample + (1 - smoothing) * previous;
}

// Chunks are uniform, so remaining work is measured in chunks rather than
// percentage points. `chunksRemaining` may be fractional for a part-done chunk.
export function remainingFromChunks(secondsPerChunk: number, chunksRemaining: number): number {
	return Math.max(0, secondsPerChunk * Math.max(0, chunksRemaining));
}

// Progress arrives in coarse steps (one per audio chunk), and the longer the
// video the less each step is worth, so a label recomputed only on progress can
// sit unchanged for 10+ seconds and read as frozen. Counting the last estimate
// down against the clock keeps it moving between steps.
export function countdownSeconds(estimateSeconds: number, estimatedAt: number, now: number): number {
	return Math.max(0, estimateSeconds - (now - estimatedAt) / 1000);
}

export function formatEta(seconds: number): string {
	const total = Math.max(0, Math.round(seconds));
	const minutes = Math.floor(total / 60);
	const secs = total % 60;
	return minutes > 0 ? `${minutes}m ${secs}s` : `${secs}s`;
}
