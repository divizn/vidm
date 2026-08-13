import { describe, expect, it } from 'vitest';
import { countWindows, WindowProgressTracker } from './chunk-progress';

describe('countWindows', () => {
	it('returns 1 window for audio no longer than the chunk length', () => {
		expect(countWindows(20, 30, 5)).toBe(1);
		expect(countWindows(30, 30, 5)).toBe(1);
	});

	it('matches the pipeline windowing formula for audio spanning multiple windows', () => {
		// chunkLength=30, stride=5 -> jump=20: windows start at 0, 20, 40.
		// [0,30), [20,50), [40,70) covers a 70s clip in 3 windows.
		expect(countWindows(70, 30, 5)).toBe(3);
	});

	it('counts a partially-filled final window', () => {
		// window at 0 covers [0,30); 31s of audio needs a second window.
		expect(countWindows(31, 30, 5)).toBe(2);
	});
});

describe('WindowProgressTracker', () => {
	it('reports increasing progress within a single window', () => {
		const tracker = new WindowProgressTracker(1, 20, 30);
		expect(tracker.observe(0)).toBe(0);
		expect(tracker.observe(15)).toBeCloseTo(0.5);
		expect(tracker.observe(30)).toBeCloseTo(1);
	});

	it('advances the window index when the local time resets, without rewinding', () => {
		const tracker = new WindowProgressTracker(3, 20, 70);
		tracker.observe(0);
		tracker.observe(10);
		const beforeReset = tracker.observe(29); // near the end of window 0
		expect(beforeReset).toBeCloseTo(29 / 70);

		// window 1 begins (local time resets); its raw global position
		// (20 + 2 = 22) is *behind* window 0's last reported position (29)
		// because windows overlap — the tracker must not report a smaller
		// fraction than it already reported.
		const afterReset = tracker.observe(2);
		expect(afterReset).toBeGreaterThanOrEqual(beforeReset);
		expect(afterReset).toBeCloseTo(beforeReset);
	});

	it('reaches 1 once the final window completes', () => {
		const tracker = new WindowProgressTracker(3, 20, 70);
		tracker.observe(0);
		tracker.observe(29);
		tracker.observe(2); // window 1 starts
		tracker.observe(29);
		tracker.observe(1); // window 2 (the last one) starts
		expect(tracker.observe(30)).toBeCloseTo(1);
	});

	it('never advances past the final window even if more resets are observed', () => {
		const tracker = new WindowProgressTracker(2, 20, 40);
		tracker.observe(0);
		tracker.observe(29);
		tracker.observe(1); // enters window 1, the last window
		tracker.observe(0); // a spurious further "reset" must not overflow it
		expect(tracker.observe(20)).toBeCloseTo(1);
	});
});

describe('WindowProgressTracker.completeWindow', () => {
	// The failure this exists to prevent: a window whose audio is one long
	// unbroken utterance emits no timestamp tokens, so observe() is never
	// called and the bar sits at 0 for the whole window.
	it('advances progress even when no timestamps were observed', () => {
		const tracker = new WindowProgressTracker(10, 20, 200);
		expect(tracker.completeWindow()).toBeCloseTo(0.1, 5);
		expect(tracker.completeWindow()).toBeCloseTo(0.2, 5);
	});

	it('never reports below what observe already reported', () => {
		const tracker = new WindowProgressTracker(10, 20, 200);
		const observed = tracker.observe(15);
		expect(tracker.completeWindow()).toBeGreaterThanOrEqual(observed);
	});

	it('stays within [0,1] once every window is complete', () => {
		const tracker = new WindowProgressTracker(3, 20, 60);
		let last = 0;
		for (let i = 0; i < 10; i++) last = tracker.completeWindow();
		expect(last).toBeLessThanOrEqual(1);
		expect(last).toBeGreaterThan(0);
	});
});
