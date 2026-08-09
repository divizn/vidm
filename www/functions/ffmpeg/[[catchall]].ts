interface Env {
	ASSETS_BUCKET: R2Bucket;
}

// ffmpeg-core.wasm is too large for Cloudflare Pages' static-asset upload
// (25 MiB cap) — it's excluded from the deployed static output and served
// from R2 here instead. Same-origin, so no COEP/CORS concerns.
export const onRequestGet: PagesFunction<Env> = async (ctx) => {
	if (ctx.params.catchall?.join('/') !== 'ffmpeg-core.wasm') {
		return new Response('Not found', { status: 404 });
	}

	const object = await ctx.env.ASSETS_BUCKET.get('ffmpeg-core.wasm');
	if (!object) return new Response('Not found', { status: 404 });

	const headers = new Headers();
	object.writeHttpMetadata(headers);
	headers.set('etag', object.httpEtag);

	return new Response(object.body, { headers });
};
