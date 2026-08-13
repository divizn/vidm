// Logging for the WASM/GPU engines (ffmpeg, whisper.cpp, transformers.js).
//
// These engines are chatty: ffmpeg emits a line per muxer/filter decision and
// whisper.cpp prints its whole model/threading banner plus per-segment output.
// Dumping all of that to the console drowns the few messages that matter — most
// importantly which backend actually ran — which is what made a real GPU test
// unreadable.
//
// So verbose engine output is off by default but retained in a small ring
// buffer, and dumped only when something fails. Quiet when things work,
// complete when they don't.

const VERBOSE_KEY = 'vidm:verbose';
const RING_SIZE = 200;

// Opt in with `localStorage.setItem('vidm:verbose', '1')` or by adding
// `?verbose` to the URL. Both are wrapped because neither localStorage nor
// location exists inside a Web Worker.
export function verboseEnabled(): boolean {
	try {
		if (typeof localStorage !== 'undefined' && localStorage.getItem(VERBOSE_KEY) === '1') {
			return true;
		}
	} catch {
		// localStorage can throw outright when cookies/storage are blocked.
	}
	try {
		if (typeof location !== 'undefined' && new URLSearchParams(location.search).has('verbose')) {
			return true;
		}
	} catch {
		// Ignore — absence of a parseable location just means "not verbose".
	}
	return false;
}

export interface EngineLog {
	/** Record one line of engine output. */
	line(message: string): void;
	/** Print the retained lines. Called when a run fails. */
	dumpRecent(context: string): void;
	/** Drop retained lines, so one run's output can't be blamed on the next. */
	clear(): void;
}

export function createEngineLog(namespace: string): EngineLog {
	const recent: string[] = [];
	const tag = `[vidm:${namespace}]`;

	return {
		line(message: string) {
			if (verboseEnabled()) {
				console.debug(tag, message);
				return;
			}
			recent.push(message);
			if (recent.length > RING_SIZE) recent.shift();
		},
		dumpRecent(context: string) {
			if (recent.length === 0) return;
			console.groupCollapsed(`${tag} last ${recent.length} lines before ${context}`);
			for (const message of recent) console.debug(tag, message);
			console.groupEnd();
		},
		clear() {
			recent.length = 0;
		}
	};
}
