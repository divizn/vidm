// ffmpeg and whisper.cpp are chatty enough to drown the messages that matter,
// so their output is retained in a ring buffer and printed only on failure.

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
		// Ignore: absence of a parseable location just means "not verbose".
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
	// Needed in a Web Worker, where `location` is the worker script's own URL
	// (no `?verbose`) and `localStorage` doesn't exist.
	setVerbose(on: boolean): void;
}

export function createEngineLog(namespace: string): EngineLog {
	const recent: string[] = [];
	const tag = `[vidm:${namespace}]`;
	let forced: boolean | null = null;

	const isVerbose = () => forced ?? verboseEnabled();

	return {
		setVerbose(on: boolean) {
			forced = on;
		},
		line(message: string) {
			if (isVerbose()) {
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
