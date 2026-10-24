import { sveltekit } from '@sveltejs/kit/vite';
import { SvelteKitPWA } from '@vite-pwa/sveltekit';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';
import type { Plugin } from 'vite';

// Required for the multi-threaded ffmpeg-core (SharedArrayBuffer). The
// production build gets these same headers from static/_headers.
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
	plugins: [
		crossOriginIsolation(),
		tailwindcss(),
		sveltekit(),
		SvelteKitPWA({
			strategies: 'injectManifest',
			registerType: 'prompt',
			injectRegister: false,
			kit: {
				adapterFallback: 'index.html',
				spa: { fallbackMapping: '/' }
			},
			injectManifest: {
				globPatterns: ['client/**/*.{js,css,html,svg,png,ttf,webmanifest}'],
				globIgnores: ['**/ffmpeg/**', '**/whisper/**', '**/webgpu-worker-*']
			},
			manifest: {
				name: 'vidm',
				short_name: 'vidm',
				description: 'A browser-based, lightweight video editor',
				start_url: '/',
				display: 'standalone',
				background_color: '#fdfbfa',
				theme_color: '#db6465',
				icons: [
					{ src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
					{ src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
					{
						src: 'maskable-icon-512x512.png',
						sizes: '512x512',
						type: 'image/png',
						purpose: 'maskable'
					}
				]
			}
		})
	],
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
