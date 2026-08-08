import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, type Plugin } from 'vite';

// Required for the multi-threaded ffmpeg-core (SharedArrayBuffer). The
// static-hosted production build will need these same headers set at the
// host — not solved yet, tracked for the phase 4 offline/hosting work.
//
// `server.headers` alone doesn't reach the document response — SvelteKit's
// dev middleware serves that before Vite's header option applies to it —
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
	plugins: [crossOriginIsolation(), sveltekit()],
	optimizeDeps: {
		// Pre-bundling breaks @ffmpeg/ffmpeg's internal Web Worker loading.
		exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util']
	}
});
