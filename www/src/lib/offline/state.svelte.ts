import { downloadSet, getSetStatus, loadManifest, offlineSupported } from './cache';
import { isMetered, type OfflineManifest, type SetId, type SetStatus } from './sets';

const SETS: SetId[] = ['editing', 'captions'];

export const offline = $state<{
	supported: boolean;
	manifest: OfflineManifest | null;
	status: Record<SetId, SetStatus>;
	progress: { done: number; total: number } | null;
	error: string;
}>({
	supported: false,
	manifest: null,
	status: { editing: 'missing', captions: 'missing' },
	progress: null,
	error: ''
});

let updating = false;

export async function refreshOffline(): Promise<void> {
	if (!offlineSupported()) {
		offline.supported = false;
		return;
	}
	try {
		const manifest = await loadManifest();
		if (manifest) {
			for (const set of SETS) offline.status[set] = await getSetStatus(manifest, set);
		}
		offline.manifest = manifest;
		offline.supported = manifest !== null;
	} catch (err) {
		// private browsing can refuse caches.open outright
		console.error('offline status check failed', err);
		offline.supported = false;
	}
}

export async function saveForOffline(sets: SetId[]): Promise<void> {
	const manifest = offline.manifest;
	if (!manifest || offline.progress) return;
	offline.error = '';
	const todo = sets.filter((s) => offline.status[s] !== 'saved');
	const total = todo.reduce((sum, s) => sum + manifest.sets[s].bytes, 0);
	offline.progress = { done: 0, total };
	let error = '';
	try {
		await navigator.storage?.persist?.();
		let before = 0;
		for (const set of todo) {
			await downloadSet(manifest, set, (done) => {
				offline.progress = { done: before + done, total };
			});
			before += manifest.sets[set].bytes;
			offline.progress = { done: before, total };
		}
	} catch (err) {
		error = `Couldn't save for offline: ${err instanceof Error ? err.message : String(err)}`;
	}
	await refreshOffline();
	offline.progress = null;
	offline.error = error;
}

export async function autoUpdate(): Promise<void> {
	const manifest = offline.manifest;
	const connection = (navigator as Navigator & { connection?: { type?: string; saveData?: boolean } })
		.connection;
	const stale = SETS.filter((s) => offline.status[s] === 'stale');
	if (!manifest || !stale.length || !navigator.onLine || isMetered(connection)) return;
	if (updating || offline.progress) return;
	updating = true;
	for (const set of stale) {
		try {
			await downloadSet(manifest, set);
		} catch (err) {
			console.error(`offline update of ${set} failed`, err);
		}
	}
	updating = false;
	await refreshOffline();
}
