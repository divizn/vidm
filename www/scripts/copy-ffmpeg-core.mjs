// ESM build, not UMD: the ffmpeg worker loads the core via dynamic import().
import { existsSync, mkdirSync, copyFileSync } from 'node:fs';
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

console.log(`[copy-ffmpeg-core] copied ffmpeg-core into ${path.relative(process.cwd(), destDir)}`);
