// Self-hosts whisper.cpp's WASM build (@transcribe/shout) and the GGML
// model — no CDN dependency, matches the ffmpeg-core self-hosting pattern.
import { existsSync, mkdirSync, copyFileSync, createWriteStream, renameSync, unlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import https from 'node:https';

const root = path.dirname(fileURLToPath(import.meta.url));
const shoutSrcDir = path.join(root, '..', 'node_modules', '@transcribe', 'shout', 'src', 'shout');
const destDir = path.join(root, '..', 'static', 'whisper');

if (!existsSync(shoutSrcDir)) {
	console.warn(`[setup-whisper] skipping: ${shoutSrcDir} not found (run "pnpm install" first)`);
	process.exit(0);
}

mkdirSync(destDir, { recursive: true });

for (const file of ['shout.wasm.js', 'shout.wasm_no-simd.js']) {
	copyFileSync(path.join(shoutSrcDir, file), path.join(destDir, file));
}
console.log(`[setup-whisper] copied shout wasm build into ${path.relative(process.cwd(), destDir)}`);

// English-specific quantized tiny model — smaller, faster, and more
// accurate for English than the multilingual tiny model at the same size.
const MODEL_NAME = 'ggml-tiny.en-q5_1.bin';
const MODEL_URL = `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/${MODEL_NAME}`;
const modelDest = path.join(destDir, MODEL_NAME);

if (existsSync(modelDest)) {
	console.log(`[setup-whisper] ${MODEL_NAME} already present, skipping download`);
	process.exit(0);
}

console.log(`[setup-whisper] downloading ${MODEL_NAME} (~32MB) from Hugging Face...`);

function download(url, dest) {
	return new Promise((resolve, reject) => {
		https
			.get(url, (res) => {
				if (res.statusCode === 302 || res.statusCode === 301) {
					res.resume();
					download(res.headers.location, dest).then(resolve, reject);
					return;
				}
				if (res.statusCode !== 200) {
					res.resume();
					reject(new Error(`HTTP ${res.statusCode} downloading ${url}`));
					return;
				}
				// Write to a temp path in the same directory, then rename into
				// place only once the transfer has fully succeeded. A same-dir
				// rename is atomic; without this, a connection drop, process
				// kill, or full disk mid-write leaves a truncated file sitting
				// at `dest` — exactly the path the idempotency check
				// (existsSync(dest)) tests — so the next run would treat the
				// corrupt file as "already present" and never retry it.
				const tempDest = `${dest}.tmp-${process.pid}`;
				const cleanupTemp = () => {
					if (existsSync(tempDest)) unlinkSync(tempDest);
				};
				const file = createWriteStream(tempDest);
				res.on('error', (err) => {
					file.destroy();
					cleanupTemp();
					reject(err);
				});
				file.on('error', (err) => {
					res.destroy();
					cleanupTemp();
					reject(err);
				});
				res.pipe(file);
				file.on('finish', () => {
					file.close(() => {
						renameSync(tempDest, dest);
						resolve();
					});
				});
			})
			.on('error', reject);
	});
}

try {
	await download(MODEL_URL, modelDest);
	console.log(`[setup-whisper] downloaded ${MODEL_NAME}`);
} catch (err) {
	console.warn(`[setup-whisper] model download failed, continuing without it: ${err.message}`);
	console.warn('[setup-whisper] auto-captions will not work until this is retried.');
}
