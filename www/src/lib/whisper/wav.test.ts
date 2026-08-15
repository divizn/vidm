import { describe, expect, it } from 'vitest';
import { wavToFloat32 } from './wav';

// Builds a minimal RIFF/WAVE file. `extraChunks` lets a test insert chunks
// (like ffmpeg's LIST/INFO) between `fmt ` and `data`; `sampleRate` and
// `channels` let a test build a file the decoder must reject.
function buildWav(
	samples: number[],
	extraChunks: { id: string; body: Uint8Array }[] = [],
	{ sampleRate = 16000, channels = 1 }: { sampleRate?: number; channels?: number } = {}
) {
	const ascii = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0));
	const chunks: Uint8Array[] = [];

	const fmt = new Uint8Array(24);
	const fmtView = new DataView(fmt.buffer);
	fmt.set(ascii('fmt '), 0);
	fmtView.setUint32(4, 16, true); // chunk size
	fmtView.setUint16(8, 1, true); // PCM
	fmtView.setUint16(10, channels, true);
	fmtView.setUint32(12, sampleRate, true);
	fmtView.setUint32(16, sampleRate * channels * 2, true); // byte rate
	fmtView.setUint16(20, channels * 2, true); // block align
	fmtView.setUint16(22, 16, true); // bits per sample
	chunks.push(fmt);

	for (const c of extraChunks) {
		const header = new Uint8Array(8);
		header.set(ascii(c.id), 0);
		new DataView(header.buffer).setUint32(4, c.body.length, true);
		chunks.push(header, c.body);
		if (c.body.length % 2 === 1) chunks.push(new Uint8Array(1)); // word alignment
	}

	const data = new Uint8Array(8 + samples.length * 2);
	const dataView = new DataView(data.buffer);
	data.set(ascii('data'), 0);
	dataView.setUint32(4, samples.length * 2, true);
	samples.forEach((s, i) => dataView.setInt16(8 + i * 2, s, true));
	chunks.push(data);

	const bodyLength = chunks.reduce((n, c) => n + c.length, 0);
	const out = new Uint8Array(12 + bodyLength);
	const outView = new DataView(out.buffer);
	out.set(ascii('RIFF'), 0);
	outView.setUint32(4, 4 + bodyLength, true);
	out.set(ascii('WAVE'), 8);
	let offset = 12;
	for (const c of chunks) {
		out.set(c, offset);
		offset += c.length;
	}
	return out.buffer;
}

describe('wavToFloat32', () => {
	it('decodes 16-bit samples to normalized floats', () => {
		const result = wavToFloat32(buildWav([0, 16384, -16384, 32767]));
		expect(result.length).toBe(4);
		expect(result[0]).toBeCloseTo(0, 5);
		expect(result[1]).toBeCloseTo(0.5, 5);
		expect(result[2]).toBeCloseTo(-0.5, 5);
		expect(result[3]).toBeCloseTo(1, 4);
	});

	it('skips a LIST chunk between fmt and data, as ffmpeg writes', () => {
		const list = Uint8Array.from('INFOISFTLavf'.split(''), (c) => c.charCodeAt(0));
		const result = wavToFloat32(buildWav([16384, -16384], [{ id: 'LIST', body: list }]));
		expect(result.length).toBe(2);
		expect(result[0]).toBeCloseTo(0.5, 5);
		expect(result[1]).toBeCloseTo(-0.5, 5);
	});

	it('handles an odd-length chunk with its word-alignment pad byte', () => {
		const odd = Uint8Array.from([1, 2, 3]);
		const result = wavToFloat32(buildWav([8192], [{ id: 'LIST', body: odd }]));
		expect(result.length).toBe(1);
		expect(result[0]).toBeCloseTo(0.25, 5);
	});

	it('returns an empty array for a data chunk with no samples', () => {
		expect(wavToFloat32(buildWav([])).length).toBe(0);
	});

	it('throws when the data chunk is missing', () => {
		const noData = new Uint8Array(12);
		noData.set(Uint8Array.from('RIFF'.split(''), (c) => c.charCodeAt(0)), 0);
		noData.set(Uint8Array.from('WAVE'.split(''), (c) => c.charCodeAt(0)), 8);
		expect(() => wavToFloat32(noData.buffer)).toThrow(/data chunk/i);
	});

	it('throws when the file is not RIFF/WAVE', () => {
		expect(() => wavToFloat32(new ArrayBuffer(64))).toThrow(/RIFF|WAVE/i);
	});

	// The ASR pipeline does not resample: a wrong rate silently garbles the
	// transcript instead of failing, so reject it here where it is visible.
	it('throws on a sample rate other than 16kHz', () => {
		expect(() => wavToFloat32(buildWav([0, 1], [], { sampleRate: 44100 }))).toThrow(/16000|sample rate/i);
	});

	it('throws on more than one channel', () => {
		expect(() => wavToFloat32(buildWav([0, 1], [], { channels: 2 }))).toThrow(/mono|channel/i);
	});
});
