// Decodes the mono 16-bit PCM WAV that ffmpeg produces for transcription
// (`-vn -ac 1 -ar 16000 -c:a pcm_s16le`) into the Float32Array the
// transformers.js ASR pipeline expects.
//
// Deliberately not AudioContext.decodeAudioData: the data is already mono at
// 16kHz, so decoding would only add a resampling step (and its rounding) on
// top of bytes that are already in the target format.
//
// The `data` chunk is located by walking the chunk list rather than assuming
// the canonical 44-byte header — ffmpeg writes a LIST/INFO chunk carrying its
// encoder tag, so a hardcoded offset would read metadata as audio and desync
// every timestamp downstream.

const RIFF = 0x52494646;
const WAVE = 0x57415645;
const FMT = 0x666d7420;
const DATA = 0x64617461;

// Whisper's feature extractor expects mono 16kHz, and the transformers.js
// pipeline does not resample a raw Float32Array — it trusts these to match.
const EXPECTED_SAMPLE_RATE = 16000;
const EXPECTED_CHANNELS = 1;

export function wavToFloat32(buffer: ArrayBuffer): Float32Array {
	const view = new DataView(buffer);
	if (view.byteLength < 12 || view.getUint32(0, false) !== RIFF) {
		throw new Error('Not a RIFF file');
	}
	if (view.getUint32(8, false) !== WAVE) {
		throw new Error('Not a WAVE file');
	}

	let offset = 12;
	let dataOffset = -1;
	let dataLength = 0;
	let channels = 0;
	let sampleRate = 0;
	while (offset + 8 <= view.byteLength) {
		const id = view.getUint32(offset, false);
		const size = view.getUint32(offset + 4, true);
		if (id === FMT) {
			channels = view.getUint16(offset + 10, true);
			sampleRate = view.getUint32(offset + 12, true);
		} else if (id === DATA) {
			dataOffset = offset + 8;
			dataLength = Math.min(size, view.byteLength - dataOffset);
			break;
		}
		// Chunks are word-aligned: an odd size is followed by a pad byte.
		offset += 8 + size + (size % 2);
	}

	// Checked before the data chunk so a misformatted file fails on the real
	// cause rather than on a downstream symptom.
	if (sampleRate && sampleRate !== EXPECTED_SAMPLE_RATE) {
		throw new Error(`Expected a ${EXPECTED_SAMPLE_RATE}Hz sample rate, got ${sampleRate}`);
	}
	if (channels && channels !== EXPECTED_CHANNELS) {
		throw new Error(`Expected mono audio, got ${channels} channels`);
	}

	if (dataOffset < 0) {
		throw new Error('WAV has no data chunk');
	}

	const sampleCount = Math.floor(dataLength / 2);
	const samples = new Float32Array(sampleCount);
	for (let i = 0; i < sampleCount; i++) {
		samples[i] = view.getInt16(dataOffset + i * 2, true) / 32768;
	}
	return samples;
}
