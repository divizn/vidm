import { beforeEach, describe, expect, it, vi } from 'vitest';

const loadMock = vi.fn().mockResolvedValue(undefined);
let constructCount = 0;

vi.mock('@ffmpeg/ffmpeg', () => ({
	FFmpeg: class {
		on = vi.fn();
		load = loadMock;
		constructor() {
			constructCount++;
		}
	}
}));

vi.mock('@ffmpeg/util', () => ({
	toBlobURL: vi.fn().mockResolvedValue('blob:mock')
}));

beforeEach(() => {
	vi.resetModules();
	constructCount = 0;
	loadMock.mockClear();
});

describe('loadFFmpeg', () => {
	it('constructs and loads only one FFmpeg instance, shared across concurrent and later calls', async () => {
		const { loadFFmpeg } = await import('./client');

		const [a, b] = await Promise.all([loadFFmpeg(), loadFFmpeg()]);
		const c = await loadFFmpeg();

		expect(a).toBe(b);
		expect(b).toBe(c);
		expect(constructCount).toBe(1);
		expect(loadMock).toHaveBeenCalledTimes(1);
	});
});
