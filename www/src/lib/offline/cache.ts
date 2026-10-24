import { toBlobURL } from '@ffmpeg/util';
import {
	classifySet,
	setCacheName,
	staleCacheNames,
	verifyBytes,
	versionedUrl,
	type OfflineManifest,
	type SetId,
	type SetStatus
} from './sets';

const MANIFEST_CACHE = 'vidm-manifest';
const MANIFEST_URL = '/offline-manifest.json';

export class OfflineSetMissingError extends Error {
	constructor(set: SetId) {
		const what = set === 'editing' ? 'video engine' : 'speech model';
		super(`The ${what} isn't saved for offline use yet. Connect to the internet once to download it.`);
		this.name = 'OfflineSetMissingError';
	}
}

export function offlineSupported(): boolean {
	return 'caches' in window && 'serviceWorker' in navigator;
}

export async function loadManifest(): Promise<OfflineManifest | null> {
	const cache = await caches.open(MANIFEST_CACHE);
	if (navigator.onLine) {
		try {
			const res = await fetch(MANIFEST_URL, { cache: 'no-store' });
			if (res.ok) {
				await cache.put(MANIFEST_URL, res.clone());
				return (await res.json()) as OfflineManifest;
			}
		} catch {
			// fall through to the cached copy
		}
	}
	const cached = await cache.match(MANIFEST_URL);
	return cached ? ((await cached.json()) as OfflineManifest) : null;
}

export async function getSetStatus(manifest: OfflineManifest, set: SetId): Promise<SetStatus> {
	const { version, files } = manifest.sets[set];
	const names = await caches.keys();
	let complete = false;
	if (names.includes(setCacheName(set, version))) {
		const cache = await caches.open(setCacheName(set, version));
		complete = (await Promise.all(files.map((f) => cache.match(f.url)))).every(Boolean);
	}
	return classifySet(set, version, names, complete);
}

async function readWithProgress(
	res: Response,
	onChunk: (n: number) => void
): Promise<ArrayBuffer> {
	if (!res.body) {
		const buf = await res.arrayBuffer();
		onChunk(buf.byteLength);
		return buf;
	}
	const reader = res.body.getReader();
	const chunks: Uint8Array[] = [];
	let total = 0;
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		chunks.push(value);
		total += value.byteLength;
		onChunk(value.byteLength);
	}
	const out = new Uint8Array(total);
	let offset = 0;
	for (const c of chunks) {
		out.set(c, offset);
		offset += c.byteLength;
	}
	return out.buffer;
}

export async function downloadSet(
	manifest: OfflineManifest,
	set: SetId,
	onProgress?: (doneBytes: number, totalBytes: number) => void,
	signal?: AbortSignal
): Promise<void> {
	const { version, files, bytes: totalBytes } = manifest.sets[set];
	const cache = await caches.open(setCacheName(set, version));
	let done = 0;
	for (const file of files) {
		if (await cache.match(file.url)) {
			done += file.bytes;
			onProgress?.(done, totalBytes);
			continue;
		}
		const res = await fetch(versionedUrl(file), { cache: 'no-store', signal });
		if (!res.ok) throw new Error(`${file.url} failed to download (${res.status})`);
		const body = await readWithProgress(res, (n) => {
			done += n;
			onProgress?.(done, totalBytes);
		});
		if (!(await verifyBytes(body, file.sha256))) throw new Error(`${file.url} failed verification`);
		await cache.put(
			file.url,
			new Response(body, {
				headers: { 'content-type': res.headers.get('content-type') ?? 'application/octet-stream' }
			})
		);
	}
	for (const name of staleCacheNames(set, version, await caches.keys())) {
		await caches.delete(name);
	}
}

export async function ensureSet(set: SetId): Promise<void> {
	if (!offlineSupported()) return;
	const manifest = await loadManifest();
	if (!manifest) return;
	const status = await getSetStatus(manifest, set);
	if (status === 'saved') return;
	if (!navigator.onLine) {
		if (status === 'missing') throw new OfflineSetMissingError(set);
		return;
	}
	await downloadSet(manifest, set);
}

export async function cachedBlobURL(url: string, mimeType: string): Promise<string> {
	const res = await caches.match(url);
	if (!res) return toBlobURL(url, mimeType);
	return URL.createObjectURL(new Blob([await res.arrayBuffer()], { type: mimeType }));
}
