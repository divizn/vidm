/// <reference path="./worker-configuration.d.ts" />

// ffmpeg-core.wasm, the whisper model, and the two WebGPU whisper ONNX
// weights all exceed Workers static assets' 25 MiB individual file-size cap
// (same limit Pages had), all four are excluded from the deployed static
// asset directory (stripped post-build, see deploy.yml) and served from R2
// here instead. Same-origin, so no COEP/CORS concerns.
//
// ort-wasm-simd-threaded.jsep.wasm (the onnxruntime WebGPU runtime) is 24.9
// MiB, under the cap, but with almost no margin; a routine onnxruntime
// version bump could push it over (see the CI size-assertion step in
// ci.yml).
//
// None of these paths match a file in the static assets directory, so
// Workers' default asset-first routing already falls through to this
// Worker for them without any extra routing config (the Pages-era
// _routes.json scoping is gone for the same reason, nothing left to
// scope).
const R2_ROUTES: Record<string, { key: string; contentType: string }> = {
	'/ffmpeg/ffmpeg-core.wasm': { key: 'ffmpeg-core.wasm', contentType: 'application/wasm' },
	'/whisper/ggml-tiny.en-q5_1.bin': {
		key: 'ggml-tiny.en-q5_1.bin',
		contentType: 'application/octet-stream'
	},
	// GPU (WebGPU) transcription is shelved, see GPU_TRANSCRIPTION_ENABLED in
	// src/lib/whisper/backend.ts. Its ONNX weights have been deleted from the
	// bucket, so no routes for them here; restore both together if it resumes.
};

async function serveFromR2(
	request: Request,
	env: Env,
	ctx: ExecutionContext,
	route: { key: string; contentType: string }
) {
	const cache = caches.default;
	const cached = await cache.match(request);
	if (cached) return cached;

	const object = await env.ASSETS_BUCKET.get(route.key);
	if (!object) return new Response('Not found', { status: 404 });

	const headers = new Headers();
	headers.set('content-type', route.contentType);
	headers.set('cache-control', 'public, max-age=31536000, immutable');
	headers.set('etag', object.httpEtag);

	const response = new Response(object.body, { headers });
	ctx.waitUntil(cache.put(request, response.clone()));
	return response;
}

export default {
	async fetch(request, env, ctx) {
		const url = new URL(request.url);
		const route = R2_ROUTES[url.pathname];

		if (route) {
			if (request.method !== 'GET') return new Response('Method not allowed', { status: 405 });
			return serveFromR2(request, env, ctx, route);
		}

		return env.ASSETS.fetch(request);
	}
} satisfies ExportedHandler<Env>;
