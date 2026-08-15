// This app disables SSR entirely (see +layout.ts), so SvelteKit's built-in
// kit.csp hash mode never runs — it only injects a <meta> CSP tag into
// server-rendered HTML, and there isn't any. Instead, hash the actual inline
// <script> tags SvelteKit and app.html emit into build/index.html (their
// content, and therefore their hash, changes every build since one embeds
// content-hashed asset filenames), and patch the placeholder in
// static/_headers's own Content-Security-Policy line with the result, so
// script-src stays free of 'unsafe-inline'.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(fileURLToPath(import.meta.url));
const htmlPath = path.join(root, '..', 'build', 'index.html');
const headersPath = path.join(root, '..', 'build', '_headers');

const html = readFileSync(htmlPath, 'utf8');
const inlineScripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(
	(m) => m[1]
);

if (inlineScripts.length === 0) {
	console.warn('[inject-csp-hashes] no inline <script> tags found in build/index.html, check the pattern still matches SvelteKit\'s output');
}

const hashes = inlineScripts.map(
	(script) => `'sha256-${createHash('sha256').update(script, 'utf8').digest('base64')}'`
);

// Replacing on the whole file with a plain string match would silently patch
// the first occurrence anywhere, including inside a comment describing this
// placeholder rather than the actual Content-Security-Policy value, so this
// targets that one line specifically and fails loudly instead of guessing.
const headers = readFileSync(headersPath, 'utf8');
const lines = headers.split('\n');
const cspLineIndexes = lines
	.map((line, i) => (line.includes('Content-Security-Policy:') ? i : -1))
	.filter((i) => i !== -1);
if (cspLineIndexes.length !== 1) {
	throw new Error(
		`[inject-csp-hashes] expected exactly one Content-Security-Policy line in build/_headers, found ${cspLineIndexes.length}`
	);
}
const cspLineIndex = cspLineIndexes[0];
if (!lines[cspLineIndex].includes('__INLINE_SCRIPT_HASHES__')) {
	throw new Error('[inject-csp-hashes] __INLINE_SCRIPT_HASHES__ placeholder not found on the Content-Security-Policy line');
}
lines[cspLineIndex] = lines[cspLineIndex].replace('__INLINE_SCRIPT_HASHES__', hashes.join(' '));
writeFileSync(headersPath, lines.join('\n'));

console.log(`[inject-csp-hashes] added ${hashes.length} inline-script hashes to build/_headers`);
