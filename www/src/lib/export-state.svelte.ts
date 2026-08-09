// Bridges the finished export from the editor page to /export. A client-side
// SvelteKit navigation (not a full page load) keeps the same document, so
// the blob URL created by the editor stays valid — a plain module-level
// $state is enough, no persistence needed. Same pattern as theme.svelte.ts.
export const exportResult = $state<{ url: string | null; downloadName: string | null }>({
	url: null,
	downloadName: null
});
