import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	// Consult https://svelte.dev/docs/kit/integrations
	// for more information about preprocessors
	preprocess: vitePreprocess(),

	kit: {
		// Static SPA build: SSR is disabled app-wide (see +layout.ts) and the
		// end state is a fully offline-capable PWA with no server runtime.
		adapter: adapter({
			fallback: 'index.html'
		})
	}
};

export default config;
