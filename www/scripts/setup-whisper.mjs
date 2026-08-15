// Self-hosts whisper.cpp's WASM build (@transcribe/shout) and the GGML
// model, no CDN dependency, matches the ffmpeg-core self-hosting pattern.
import {
	existsSync,
	mkdirSync,
	copyFileSync,
	createWriteStream,
	createReadStream,
	renameSync,
	unlinkSync
} from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import https from 'node:https';
import { createHash } from 'node:crypto';

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

// English-specific quantized tiny model: smaller, faster, and more
// accurate for English than the multilingual tiny model at the same size.
const MODEL_NAME = 'ggml-tiny.en-q5_1.bin';
const MODEL_URL = `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/${MODEL_NAME}`;
// Computed from a known-good local copy of this exact file. Guards against a
// compromised upstream or a MITM'd download, not against this hash itself
// being wrong: re-derive with `sha256sum` against a trusted copy if this
// model is ever intentionally updated to a new revision.
const MODEL_SHA256 = 'c77c5766f1cef09b6b7d47f21b546cbddd4157886b3b5d6d4f709e91e66c7c2b';
const modelDest = path.join(destDir, MODEL_NAME);

function sha256(filePath) {
	return new Promise((resolve, reject) => {
		const hash = createHash('sha256');
		const stream = createReadStream(filePath);
		stream.on('error', reject);
		stream.on('data', (chunk) => hash.update(chunk));
		stream.on('end', () => resolve(hash.digest('hex')));
	});
}

if (existsSync(modelDest)) {
	console.log(`[setup-whisper] ${MODEL_NAME} already present, skipping download`);
	process.exit(0);
}

console.log(`[setup-whisper] downloading ${MODEL_NAME} (~32MB) from Hugging Face...`);

function download(url, dest, expectedSha256) {
	return new Promise((resolve, reject) => {
		https
			.get(url, (res) => {
				if (res.statusCode === 302 || res.statusCode === 301) {
					res.resume();
					download(res.headers.location, dest, expectedSha256).then(resolve, reject);
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
				// at `dest`, exactly the path the idempotency check
				// (existsSync(dest)) tests, so the next run would treat the
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
					file.close(async () => {
						if (expectedSha256) {
							const actual = await sha256(tempDest);
							if (actual !== expectedSha256) {
								cleanupTemp();
								reject(
									new Error(
										`checksum mismatch for ${dest}: expected ${expectedSha256}, got ${actual}`
									)
								);
								return;
							}
						}
						renameSync(tempDest, dest);
						resolve();
					});
				});
			})
			.on('error', reject);
	});
}

try {
	await download(MODEL_URL, modelDest, MODEL_SHA256);
	console.log(`[setup-whisper] downloaded ${MODEL_NAME}`);
} catch (err) {
	console.warn(`[setup-whisper] model download failed, continuing without it: ${err.message}`);
	console.warn('[setup-whisper] auto-captions will not work until this is retried.');
}
