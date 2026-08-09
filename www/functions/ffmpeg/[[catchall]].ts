interface Env {
	ASSETS_BUCKET: R2Bucket;
}

const KEY = 'ffmpeg-core.wasm';

// ffmpeg-core.wasm is too large for Cloudflare Pages' static-asset upload
// (25 MiB cap) — it's excluded from the deployed static output and served
// from R2 here instead. Same-origin, so no COEP/CORS concerns.
//
// Explicitly uses the Cache API (edge cache, shared across visitors, cuts
// R2 reads) rather than relying on response headers alone — Cloudflare
// Pages doesn't reliably forward Cache-Control/ETag set on a plain
// Function-returned Response to the client (confirmed live: came back as
// max-age=0, must-revalidate regardless of what's set here). The
// long-lived Cache-Control browser sees for this path actually comes from
// static/_headers, which is proven to survive; this is a second layer
// (edge-side) on top of that.
export const onRequestGet: PagesFunction<Env> = async (ctx) => {
	if (ctx.params.catchall?.join('/') !== KEY) {
		return new Response('Not found', { status: 404 });
	}

	const cache = caches.default;
	const cached = await cache.match(ctx.request);
	if (cached) return cached;

	const object = await ctx.env.ASSETS_BUCKET.get(KEY);
	if (!object) return new Response('Not found', { status: 404 });

	const headers = new Headers();
	headers.set('content-type', 'application/wasm');
	headers.set('cache-control', 'public, max-age=31536000, immutable');
	headers.set('etag', object.httpEtag);

	const response = new Response(object.body, { headers });
	ctx.waitUntil(cache.put(ctx.request, response.clone()));
	return response;
};
