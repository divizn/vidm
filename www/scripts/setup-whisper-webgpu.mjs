// Self-hosts the transformers.js Whisper model and the onnxruntime-web WebGPU
// runtime — no CDN dependency, matching the ffmpeg-core and whisper.cpp
// self-hosting pattern in the sibling scripts.
//
// The model MUST be the `_timestamped` export: the plain
// onnx-community/whisper-base.en decoder has no `cross_attentions.*` graph
// outputs, so transformers.js cannot derive word-level timestamps from it and
// the karaoke burn-in would have nothing to highlight against.
import { existsSync, mkdirSync, copyFileSync, createWriteStream, renameSync, unlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import https from 'node:https';

const root = path.dirname(fileURLToPath(import.meta.url));
// The local directory name deliberately does not mirror MODEL_ID — the
// upstream HF repo naming shouldn't leak into our tree. The `_timestamped`
// suffix on MODEL_ID is required, not cosmetic: the plain
// onnx-community/whisper-base.en export has no `cross_attentions.*` graph
// outputs, so transformers.js cannot derive word-level timestamps from it at
// all, and the karaoke burn-in would have nothing to highlight against.
const MODEL_ID = 'onnx-community/whisper-base.en_timestamped';
// Pinned to a commit SHA, not 'main' — 'main' is a moving target, so an
// upstream re-export would silently change the downloaded bytes with no
// edit to this file, which is exactly the signal the CI upload gate (see
// "Check if large R2 assets changed" in ci.yml) relies on to decide whether
// to re-upload to R2. It also keeps the CI model-assets cache key meaningful
// (see the `actions/cache` step in ci.yml, keyed by hashing this file).
// Bumping the model means bumping this SHA, deliberately, in the same commit.
const MODEL_REVISION = 'fa239a41836c3305f6beec180e5940f3823ff5b8';
const modelDir = path.join(root, '..', 'static', 'models', 'whisper-webgpu');
const ortDir = path.join(root, '..', 'static', 'ort');

// Only the two dtype variants actually loaded, not the whole onnx/ directory.
const MODEL_FILES = [
	'config.json',
	'generation_config.json',
	'preprocessor_config.json',
	'tokenizer.json',
	'tokenizer_config.json',
	'vocab.json',
	'merges.txt',
	'added_tokens.json',
	'special_tokens_map.json',
	'onnx/encoder_model_fp16.onnx',
	'onnx/decoder_model_merged_q4f16.onnx'
];

function download(url, dest) {
	return new Promise((resolve, reject) => {
		https
			.get(url, (res) => {
				if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
					// Drain the redirect body — leaving it unread stalls the socket
					// and the install hangs (same bug fixed for the whisper model).
					// HF's small-file resolver returns 307s with a Location that's
					// relative (e.g. "/api/resolve-cache/..."), unlike the 302s to
					// an absolute CDN URL that large LFS/xet files get — resolve
					// against the current URL so both cases work.
					res.resume();
					const next = new URL(res.headers.location, url).toString();
					download(next, dest).then(resolve, reject);
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

mkdirSync(path.join(modelDir, 'onnx'), { recursive: true });

for (const file of MODEL_FILES) {
	const dest = path.join(modelDir, file);
	if (existsSync(dest)) {
		console.log(`[setup-whisper-webgpu] ${file} already present, skipping`);
		continue;
	}
	const url = `https://huggingface.co/${MODEL_ID}/resolve/${MODEL_REVISION}/${file}`;
	console.log(`[setup-whisper-webgpu] downloading ${file}...`);
	try {
		await download(url, dest);
	} catch (err) {
		console.warn(`[setup-whisper-webgpu] failed on ${file}: ${err.message}`);
		console.warn('[setup-whisper-webgpu] GPU transcription will fall back to CPU.');
		process.exit(0);
	}
}

// onnxruntime-web ships the WebGPU (JSEP) build; transformers.js is pointed at
// this directory via env.backends.onnx.wasm.wasmPaths so it never reaches for
// a CDN at runtime.
//
// onnxruntime-web is declared as a direct dependency purely so pnpm hoists it
// to node_modules/onnxruntime-web. As a transitive dependency of
// @huggingface/transformers it would stay in the .pnpm store under a
// version-stamped directory, and this copy would silently skip — leaving the
// runtime to fall back to a CDN, which breaks offline use. Declaring it also
// makes the version visible, which matters because the .jsep.wasm sits just
// under the 25 MiB Workers asset cap (CI asserts this, see ci.yml).
const ortSrcDir = path.join(root, '..', 'node_modules', 'onnxruntime-web', 'dist');
if (!existsSync(ortSrcDir)) {
	// Fail loudly: a missing runtime is not a degraded GPU path, it is a
	// silent CDN dependency in production.
	console.error(`[setup-whisper-webgpu] onnxruntime-web not found at ${ortSrcDir}`);
	console.error('[setup-whisper-webgpu] is onnxruntime-web a direct dependency?');
	process.exit(1);
}
mkdirSync(ortDir, { recursive: true });
for (const file of ['ort-wasm-simd-threaded.jsep.wasm', 'ort-wasm-simd-threaded.jsep.mjs']) {
	copyFileSync(path.join(ortSrcDir, file), path.join(ortDir, file));
}
console.log('[setup-whisper-webgpu] copied onnxruntime jsep runtime');
