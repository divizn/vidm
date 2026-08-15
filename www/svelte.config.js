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
		// kit.csp's hash mode only injects a <meta> CSP tag into
		// server-rendered HTML — this app disables SSR entirely (see
		// +layout.ts), so there's no rendered output for it to hash. The CSP
		// (including this build's inline-script hashes) is computed by
		// scripts/inject-csp-hashes.mjs instead, into build/_headers as a
		// real HTTP header. See static/_headers for the base policy.
	}
};

export default config;
