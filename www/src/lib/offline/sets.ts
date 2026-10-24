export type SetId = 'editing' | 'captions';

export interface ManifestFile {
	url: string;
	bytes: number;
	sha256: string;
}

export interface ManifestSet {
	version: string;
	bytes: number;
	files: ManifestFile[];
}

export interface OfflineManifest {
	sets: Record<SetId, ManifestSet>;
}

export type SetStatus = 'saved' | 'stale' | 'missing';

const SET_FILES: Record<string, SetId> = {
	'/ffmpeg/ffmpeg-core.js': 'editing',
	'/ffmpeg/ffmpeg-core.worker.js': 'editing',
	'/ffmpeg/ffmpeg-core.wasm': 'editing',
	'/whisper/shout.wasm.js': 'captions',
	'/whisper/ggml-tiny.en-q5_1.bin': 'captions'
};

export function setCacheName(set: SetId, version: string): string {
	return `vidm-${set}-${version}`;
}

export function staleCacheNames(set: SetId, version: string, cacheNames: string[]): string[] {
	const current = setCacheName(set, version);
	return cacheNames.filter((n) => n.startsWith(`vidm-${set}-`) && n !== current);
}

export function classifySet(
	set: SetId,
	version: string,
	cacheNames: string[],
	currentComplete: boolean
): SetStatus {
	if (currentComplete && cacheNames.includes(setCacheName(set, version))) return 'saved';
	return staleCacheNames(set, version, cacheNames).length > 0 ? 'stale' : 'missing';
}

export function setForUrl(pathname: string): SetId | null {
	return Object.hasOwn(SET_FILES, pathname) ? SET_FILES[pathname] : null;
}

export function versionedUrl(file: ManifestFile): string {
	return `${file.url}?v=${file.sha256.slice(0, 16)}`;
}

export function isMetered(connection?: { type?: string; saveData?: boolean }): boolean {
	return connection?.type === 'cellular' || connection?.saveData === true;
}

export function toMB(bytes: number): number {
	return Math.round(bytes / 1_000_000);
}
