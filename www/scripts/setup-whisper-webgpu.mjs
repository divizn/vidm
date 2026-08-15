// Self-hosts the transformers.js Whisper model and the onnxruntime-web WebGPU
// runtime, no CDN dependency, matching the ffmpeg-core and whisper.cpp
// self-hosting pattern in the sibling scripts.
//
// The model MUST be the `_timestamped` export: the plain
// onnx-community/whisper-base.en decoder has no `cross_attentions.*` graph
// outputs, so transformers.js cannot derive word-level timestamps from it and
// the karaoke burn-in would have nothing to highlight against.
import {
	existsSync,
	mkdirSync,
	copyFileSync,
	createWriteStream,
	readdirSync,
	renameSync,
	unlinkSync
} from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import https from 'node:https';

const root = path.dirname(fileURLToPath(import.meta.url));
// The local directory name deliberately does not mirror MODEL_ID: the
// upstream HF repo naming shouldn't leak into our tree. The `_timestamped`
// suffix on MODEL_ID is required, not cosmetic: the plain
// onnx-community/whisper-base.en export has no `cross_attentions.*` graph
// outputs, so transformers.js cannot derive word-level timestamps from it at
// all, and the karaoke burn-in would have nothing to highlight against.
// Two quality tiers, both `_timestamped` so word-level highlighting works in
// either. `base` is the default; `tiny` is roughly 2-3x less compute for users
// who would rather have the transcript sooner than more accurate.
//
// Revisions are pinned to commit SHAs, not 'main': 'main' is a moving target,
// so an upstream re-export would silently change the downloaded bytes with no
// edit to this file, which is exactly the signal the CI upload gate (see
// "Check if large R2 assets changed" in ci.yml) relies on to decide whether to
// re-upload to R2. It also keeps the CI model-assets cache key meaningful (see
// the `actions/cache` step in ci.yml, keyed by hashing this file). Bumping a
// model means bumping its SHA, deliberately, in the same commit.
const MODELS = [
	{
		id: 'onnx-community/whisper-base.en_timestamped',
		revision: 'fa239a41836c3305f6beec180e5940f3823ff5b8',
		// Local directory names deliberately do not mirror the upstream repo
		// ids (HF naming shouldn't leak into our tree) but they ARE the model
		// ids passed to transformers.js, so they must match webgpu-worker.ts.
		dir: 'whisper-webgpu',
		// int8, NOT q4f16. A 4-bit decoder produced badly degraded transcripts
		// (words repeating ten or more times) identically in Chrome and Firefox,
		// which is the classic symptom of an over-quantized Whisper decoder stuck
		// in a repetition loop. Browser-independence is what ruled out WebGPU
		// itself. The CPU path's whisper.cpp model uses the much gentler q5_1 and
		// is unaffected.
		//
		// int8 was chosen over fp16 on a mistaken belief that Cloudflare's upload
		// limit blocked fp16 (wrangler reported "fetch failed" while the object
		// had actually uploaded in full). fp16 is publishable, and int8 proved far
		// slower on WebGPU, so try fp16 first if this resumes.
		decoderDtype: 'int8'
	},
	{
		id: 'onnx-community/whisper-tiny.en_timestamped',
		revision: 'aeaa13760958b03fac5062f457d317d3319c3168',
		dir: 'whisper-webgpu-fast',
		// The fast tier keeps 4-bit weights deliberately: it trades accuracy for
		// speed by definition, and is opt-in. If it shows the same repetition,
		// raise it to int8 rather than shipping a tier that produces nonsense.
		decoderDtype: 'q4f16'
	}
];
const modelsRoot = path.join(root, '..', 'static', 'models');
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
	'onnx/encoder_model_fp16.onnx'
];

function download(url, dest) {
	return new Promise((resolve, reject) => {
		https
			.get(url, (res) => {
				if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
					// Drain the redirect body: leaving it unread stalls the socket
					// and the install hangs (same bug fixed for the whisper model).
					// HF's small-file resolver returns 307s with a Location that's
					// relative (e.g. "/api/resolve-cache/..."), unlike the 302s to
					// an absolute CDN URL that large LFS/xet files get, resolve
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
					file.close(() => {
						renameSync(tempDest, dest);
						resolve();
					});
				});
			})
			.on('error', reject);
	});
}

for (const model of MODELS) {
	const modelDir = path.join(modelsRoot, model.dir);
	mkdirSync(path.join(modelDir, 'onnx'), { recursive: true });

	// Each tier pulls only the decoder dtype it actually loads.
	const files = [...MODEL_FILES, `onnx/decoder_model_merged_${model.decoderDtype}.onnx`];
	for (const file of files) {
		const dest = path.join(modelDir, file);
		if (existsSync(dest)) {
			console.log(`[setup-whisper-webgpu] ${model.dir}/${file} already present, skipping`);
			continue;
		}
		const url = `https://huggingface.co/${model.id}/resolve/${model.revision}/${file}`;
		console.log(`[setup-whisper-webgpu] downloading ${model.dir}/${file}...`);
		try {
			await download(url, dest);
		} catch (err) {
			console.warn(`[setup-whisper-webgpu] failed on ${model.dir}/${file}: ${err.message}`);
			console.warn('[setup-whisper-webgpu] GPU transcription will fall back to CPU.');
			process.exit(0);
		}
	}
}

// transformers.js is pointed at this directory via
// env.backends.onnx.wasm.wasmPaths so onnxruntime never reaches for a CDN at
// runtime.
//
// onnxruntime-web is declared as a direct dependency purely so pnpm hoists it
// to node_modules/onnxruntime-web. As a transitive dependency of
// @huggingface/transformers it would stay in the .pnpm store under a
// version-stamped directory, and this copy would silently skip, leaving the
// runtime to fall back to a CDN, which breaks offline use.
const ortSrcDir = path.join(root, '..', 'node_modules', 'onnxruntime-web', 'dist');
if (!existsSync(ortSrcDir)) {
	// Fail loudly: a missing runtime is not a degraded GPU path, it is a
	// silent CDN dependency in production.
	console.error(`[setup-whisper-webgpu] onnxruntime-web not found at ${ortSrcDir}`);
	console.error('[setup-whisper-webgpu] is onnxruntime-web a direct dependency?');
	process.exit(1);
}

// Copy EVERY ort-wasm-simd-threaded.* variant, not a hand-picked subset.
// onnxruntime ships four builds (plain, .jsep, .jspi and .asyncify) and
// chooses between them at runtime from the browser's capabilities. Copying only
// .jsep shipped a runtime that worked in Chrome and broke in Firefox, which
// lacks JSPI and so requests the .asyncify build; the missing file 404'd, the
// SPA fallback answered with HTML, and onnxruntime reported the misleading
// "no available backend found / error loading dynamically imported module".
//
// Globbing the family also means a future onnxruntime release that adds or
// renames a variant is picked up automatically instead of failing the same way.
// Only the variant a given browser selects is ever downloaded by a user, so
// this costs deploy size, not load time.
const ORT_PREFIX = 'ort-wasm-simd-threaded';
const ortFiles = readdirSync(ortSrcDir).filter(
	(name) => name.startsWith(`${ORT_PREFIX}.`) && (name.endsWith('.wasm') || name.endsWith('.mjs'))
);
if (ortFiles.length === 0) {
	console.error(`[setup-whisper-webgpu] no ${ORT_PREFIX}.* files found in ${ortSrcDir}`);
	process.exit(1);
}
mkdirSync(ortDir, { recursive: true });
for (const file of ortFiles) {
	copyFileSync(path.join(ortSrcDir, file), path.join(ortDir, file));
}
console.log(
	`[setup-whisper-webgpu] copied ${ortFiles.length} onnxruntime runtime files: ${ortFiles.join(', ')}`
);
