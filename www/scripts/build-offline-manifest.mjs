import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(fileURLToPath(import.meta.url));
const staticDir = path.join(root, '..', 'static');
const outPath = path.join(root, '..', 'build', 'offline-manifest.json');

const sets = {
	editing: ['/ffmpeg/ffmpeg-core.js', '/ffmpeg/ffmpeg-core.worker.js', '/ffmpeg/ffmpeg-core.wasm'],
	captions: ['/whisper/shout.wasm.js', '/whisper/ggml-tiny.en-q5_1.bin']
};

const manifest = { sets: {} };
for (const [id, urls] of Object.entries(sets)) {
	const files = urls.map((url) => {
		let data;
		try {
			data = readFileSync(path.join(staticDir, url));
		} catch (err) {
			throw new Error(`[build-offline-manifest] cannot read static${url}: ${err.message}`);
		}
		return { url, bytes: data.length, sha256: createHash('sha256').update(data).digest('hex') };
	});
	const version = createHash('sha256')
		.update(files.map((f) => f.sha256).join('\n'))
		.digest('hex')
		.slice(0, 16);
	manifest.sets[id] = { version, bytes: files.reduce((n, f) => n + f.bytes, 0), files };
}

writeFileSync(outPath, JSON.stringify(manifest, null, '\t') + '\n');
console.log(`[build-offline-manifest] wrote build/offline-manifest.json (${Object.keys(sets).join(', ')})`);
