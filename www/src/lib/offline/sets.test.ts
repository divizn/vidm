import { describe, it, expect } from 'vitest';
import {
	classifySet,
	staleCacheNames,
	setForUrl,
	isMetered,
	setCacheName,
	versionedUrl,
	toMB
} from './sets';

describe('offline sets', () => {
	it('saved only when the current version is complete', () => {
		expect(classifySet('editing', 'abc', ['vidm-editing-abc'], true)).toBe('saved');
		expect(classifySet('editing', 'abc', ['vidm-editing-abc'], false)).toBe('missing');
	});

	it('stale when an older version of the same set exists', () => {
		expect(classifySet('editing', 'new', ['vidm-editing-old'], false)).toBe('stale');
		expect(classifySet('editing', 'new', ['vidm-captions-old'], false)).toBe('missing');
	});

	it('lists every other version of the set for deletion, never other sets', () => {
		expect(
			staleCacheNames('editing', 'new', [
				'vidm-editing-old',
				'vidm-editing-new',
				'vidm-captions-x',
				'workbox-precache-v2'
			])
		).toEqual(['vidm-editing-old']);
	});

	it('maps only the exact set files', () => {
		expect(setForUrl('/whisper/shout.wasm.js')).toBe('captions');
		expect(setForUrl('/whisper/shout.wasm_no-simd.js')).toBeNull();
		expect(setForUrl('/ffmpeg/ffmpeg-core.wasm')).toBe('editing');
	});

	it('treats cellular and data saver as metered, unknown as not', () => {
		expect(isMetered({ type: 'cellular' })).toBe(true);
		expect(isMetered({ saveData: true })).toBe(true);
		expect(isMetered({ type: 'wifi' })).toBe(false);
		expect(isMetered(undefined)).toBe(false);
	});

	it('builds cache names, versioned urls and rounded sizes', () => {
		expect(setCacheName('captions', 'v1')).toBe('vidm-captions-v1');
		expect(versionedUrl({ url: '/a.js', bytes: 1, sha256: '0123456789abcdef0123' })).toBe(
			'/a.js?v=0123456789abcdef'
		);
		expect(toMB(34_600_000)).toBe(35);
	});
});
