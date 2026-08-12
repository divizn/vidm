// Rough ETA for a progress-driven task: assumes throughput has been roughly
// constant from start to now, so remaining time scales linearly with
// remaining percentage. Good enough for an "about Xs left" label, not a
// precise estimate — returns null before there's any progress to extrapolate
// from (division by zero).
export function estimateRemainingSeconds(startedAt: number, progressPercent: number): number | null {
	if (progressPercent <= 0) return null;
	const elapsedMs = Date.now() - startedAt;
	const remainingMs = (elapsedMs * (100 - progressPercent)) / progressPercent;
	return remainingMs / 1000;
}

// Formats a duration in whole seconds as "Xs" or "Xm Ys" for an ETA label.
export function formatEta(seconds: number): string {
	const total = Math.max(0, Math.round(seconds));
	const minutes = Math.floor(total / 60);
	const secs = total % 60;
	return minutes > 0 ? `${minutes}m ${secs}s` : `${secs}s`;
}
