import { describe, expect, it } from 'vitest';
import { isOfflineManifest, verifyBytes } from './sets';

describe('verifyBytes', () => {
	it('accepts matching bytes and rejects anything else', async () => {
		const bytes = new TextEncoder().encode('vidm').buffer;
		const good = 'e64f44e9568e7c751efd6a7e77d076851f946966c5eec913109fa014d2d9d0ac';
		expect(await verifyBytes(bytes, good)).toBe(true);
		expect(await verifyBytes(bytes, good.replace(/^./, '0'))).toBe(false);
	});
});

describe('isOfflineManifest', () => {
	const set = { version: 'abc', bytes: 1, files: [] };
	it('accepts a real-shaped manifest', () => {
		expect(isOfflineManifest({ sets: { editing: set, captions: set } })).toBe(true);
	});
	it('rejects junk, null and a manifest missing a set', () => {
		expect(isOfflineManifest(null)).toBe(false);
		expect(isOfflineManifest('<!doctype html>')).toBe(false);
		expect(isOfflineManifest({ sets: { editing: set } })).toBe(false);
		expect(isOfflineManifest({ sets: { editing: set, captions: { version: 1, files: [] } } })).toBe(false);
	});
});
