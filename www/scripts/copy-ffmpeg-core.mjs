// ESM build, not UMD: the ffmpeg worker loads the core via dynamic import().
import { existsSync, mkdirSync, copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(fileURLToPath(import.meta.url));
const srcDir = path.join(root, '..', 'node_modules', '@ffmpeg', 'core-mt', 'dist', 'esm');
const destDir = path.join(root, '..', 'static', 'ffmpeg');

if (!existsSync(srcDir)) {
	console.warn(`[copy-ffmpeg-core] skipping: ${srcDir} not found (run "pnpm install" first)`);
	process.exit(0);
}

mkdirSync(destDir, { recursive: true });

// core-mt's worker.js runs the pthread pool; requires COOP/COEP headers
// (see vite.config.ts) since it needs SharedArrayBuffer.
for (const file of ['ffmpeg-core.js', 'ffmpeg-core.wasm', 'ffmpeg-core.worker.js']) {
	copyFileSync(path.join(srcDir, file), path.join(destDir, file));
}

// core-mt's exec()/ffprobe() wrappers swallow non-"Aborted()" native
// exceptions by re-throwing them, but they check that via
// `e.message.startsWith("Aborted")` with no guard for `e.message` being
// undefined, which it is for some exceptions the wasm module throws
// (e.g. plain exit-status objects). That turns a real ffmpeg failure into
// an opaque "can't access property 'startsWith', e.message is undefined"
// TypeError, hiding what actually went wrong. Patch the copied file (the
// npm package itself can't be patched without patch-package infra) so the
// original exception surfaces instead.
const ffmpegCoreJsPath = path.join(destDir, 'ffmpeg-core.js');
const original = readFileSync(ffmpegCoreJsPath, 'utf8');
const patched = original.replaceAll(
	'if(!e.message.startsWith("Aborted")){throw e}',
	'if(!(e&&e.message&&e.message.startsWith("Aborted"))){throw e}'
);
if (patched === original) {
	console.warn(
		'[copy-ffmpeg-core] expected e.message.startsWith("Aborted") guard not found, @ffmpeg/core-mt may have changed, check whether this patch is still needed'
	);
} else {
	writeFileSync(ffmpegCoreJsPath, patched);
}

console.log(`[copy-ffmpeg-core] copied ffmpeg-core into ${path.relative(process.cwd(), destDir)}`);
