// Self-hosts the transformers.js Whisper model and the onnxruntime-web WebGPU
// runtime — no CDN dependency, matching the ffmpeg-core and whisper.cpp
// self-hosting pattern in the sibling scripts.
//
// The model MUST be the `_timestamped` export: the plain
// onnx-community/whisper-base.en decoder has no `cross_attentions.*` graph
// outputs, so transformers.js cannot derive word-level timestamps from it and
// the karaoke burn-in would have nothing to highlight against.
import { existsSync, mkdirSync, copyFileSync, createWriteStream } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import https from 'node:https';

const root = path.dirname(fileURLToPath(import.meta.url));
const MODEL_ID = 'onnx-community/whisper-base.en_timestamped';
const MODEL_REVISION = 'main';
const modelDir = path.join(root, '..', 'static', 'models', 'whisper-base.en_timestamped');
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
				const file = createWriteStream(dest);
				res.pipe(file);
				file.on('finish', () => file.close(resolve));
			})
			.on('error', reject);
	});
}

mkdirSync(path.join(modelDir, 'onnx'), { recursive: true });

for (const file of MODEL_FILES) {
	const dest = path.join(modelDir, file);
	if (existsSync(dest)) {
		console.log(`[setup-transformers-whisper] ${file} already present, skipping`);
		continue;
	}
	const url = `https://huggingface.co/${MODEL_ID}/resolve/${MODEL_REVISION}/${file}`;
	console.log(`[setup-transformers-whisper] downloading ${file}...`);
	try {
		await download(url, dest);
	} catch (err) {
		console.warn(`[setup-transformers-whisper] failed on ${file}: ${err.message}`);
		console.warn('[setup-transformers-whisper] GPU transcription will fall back to CPU.');
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
	console.error(`[setup-transformers-whisper] onnxruntime-web not found at ${ortSrcDir}`);
	console.error('[setup-transformers-whisper] is onnxruntime-web a direct dependency?');
	process.exit(1);
}
mkdirSync(ortDir, { recursive: true });
for (const file of ['ort-wasm-simd-threaded.jsep.wasm', 'ort-wasm-simd-threaded.jsep.mjs']) {
	copyFileSync(path.join(ortSrcDir, file), path.join(ortDir, file));
}
console.log('[setup-transformers-whisper] copied onnxruntime jsep runtime');
