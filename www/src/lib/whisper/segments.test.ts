import { describe, expect, it } from 'vitest';
import { groupWordsIntoSegments, type WordChunk } from './segments';

const w = (text: string, from: number, to: number | null): WordChunk => ({
	text,
	timestamp: [from, to]
});

describe('groupWordsIntoSegments', () => {
	it('joins words into one segment and formats SRT timestamps', () => {
		const result = groupWordsIntoSegments([w(' Hello', 0, 0.5), w(' world', 0.5, 1)]);
		expect(result).toHaveLength(1);
		expect(result[0].text).toBe('Hello world');
		expect(result[0].from).toBe('00:00:00,000');
		expect(result[0].to).toBe('00:00:01,000');
	});

	it('preserves word-level timings for karaoke highlighting', () => {
		const result = groupWordsIntoSegments([w(' Hi', 0.25, 0.75)]);
		expect(result[0].words).toEqual([{ text: 'Hi', from: 0.25, to: 0.75 }]);
	});

	it('splits on sentence-ending punctuation', () => {
		const result = groupWordsIntoSegments([
			w(' Stop.', 0, 0.5),
			w(' Go', 0.6, 1),
			w(' now', 1, 1.4)
		]);
		expect(result).toHaveLength(2);
		expect(result[0].text).toBe('Stop.');
		expect(result[1].text).toBe('Go now');
	});

	it('splits when a segment would exceed the maximum duration', () => {
		const chunks = Array.from({ length: 8 }, (_, i) => w(` w${i}`, i, i + 1));
		const result = groupWordsIntoSegments(chunks);
		expect(result.length).toBeGreaterThan(1);
		for (const seg of result) {
			const span = seg.words![seg.words!.length - 1].to - seg.words![0].from;
			expect(span).toBeLessThanOrEqual(5);
		}
	});

	it('splits on a long silent gap', () => {
		const result = groupWordsIntoSegments([w(' one', 0, 0.4), w(' two', 3, 3.4)]);
		expect(result).toHaveLength(2);
		expect(result[0].text).toBe('one');
		expect(result[1].text).toBe('two');
	});

	it('gives a trailing null end timestamp the previous word end', () => {
		const result = groupWordsIntoSegments([w(' a', 0, 0.5), w(' b', 0.5, null)]);
		expect(result[0].words![1].to).toBe(0.5);
	});

	it('drops chunks with no usable start timestamp or blank text', () => {
		const result = groupWordsIntoSegments([
			w(' ok', 0, 0.5),
			{ text: ' bad', timestamp: [null as unknown as number, 1] },
			w('   ', 0.5, 0.9)
		]);
		expect(result).toHaveLength(1);
		expect(result[0].text).toBe('ok');
	});

	it('returns an empty array for no chunks', () => {
		expect(groupWordsIntoSegments([])).toEqual([]);
	});
});
