// Assumes constant throughput — rough enough for an "about Xs left" label.
export function estimateRemainingSeconds(startedAt: number, progressPercent: number): number | null {
	if (progressPercent <= 0) return null;
	const elapsedMs = Date.now() - startedAt;
	const remainingMs = (elapsedMs * (100 - progressPercent)) / progressPercent;
	return remainingMs / 1000;
}

export function formatEta(seconds: number): string {
	const total = Math.max(0, Math.round(seconds));
	const minutes = Math.floor(total / 60);
	const secs = total % 60;
	return minutes > 0 ? `${minutes}m ${secs}s` : `${secs}s`;
}
