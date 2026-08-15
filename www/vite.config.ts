import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';
import type { Plugin } from 'vite';

// Required for the multi-threaded ffmpeg-core (SharedArrayBuffer). The
// static-hosted production build will need these same headers set at the
// host, not solved yet, tracked for the phase 4 offline/hosting work.
//
// `server.headers` alone doesn't reach the document response: SvelteKit's
// dev middleware serves that before Vite's header option applies to it,
// so we set headers via an explicit middleware instead.
function crossOriginIsolation(): Plugin {
	return {
		name: 'cross-origin-isolation',
		configureServer(server) {
			server.middlewares.use((_req, res, next) => {
				res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
				res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
				next();
			});
		},
		configurePreviewServer(server) {
			server.middlewares.use((_req, res, next) => {
				res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
				res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
				next();
			});
		}
	};
}

export default defineConfig({
	plugins: [crossOriginIsolation(), tailwindcss(), sveltekit()],
	optimizeDeps: {
		// Pre-bundling breaks @ffmpeg/ffmpeg's internal Web Worker loading, and
		// rewrites the onnxruntime wasm/worker resolution that transformers.js
		// depends on.
		exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util', '@huggingface/transformers']
	},
	test: {
		// Unit tests only cover pure logic (filters.ts, srt.ts), no DOM,
		// no browser/WASM needed, so the default node environment is enough.
		include: ['src/**/*.test.ts']
	}
});
