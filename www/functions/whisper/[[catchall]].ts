interface Env {
	ASSETS_BUCKET: R2Bucket;
}

// The whisper model is too large for Cloudflare Pages' static-asset upload
// (25 MiB cap) — it's excluded from the deployed static output and served
// from R2 here instead. Same-origin, so no COEP/CORS concerns.
export const onRequestGet: PagesFunction<Env> = async (ctx) => {
	if (ctx.params.catchall?.join('/') !== 'ggml-tiny.en-q5_1.bin') {
		return new Response('Not found', { status: 404 });
	}

	const object = await ctx.env.ASSETS_BUCKET.get('ggml-tiny.en-q5_1.bin');
	if (!object) return new Response('Not found', { status: 404 });

	const headers = new Headers();
	object.writeHttpMetadata(headers);
	headers.set('etag', object.httpEtag);

	return new Response(object.body, { headers });
};
