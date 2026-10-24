interface InstallPromptEvent extends Event {
	prompt(): Promise<void>;
}

let deferred: InstallPromptEvent | null = null;

export const install = $state<{ mode: 'prompt' | 'ios' | 'none' }>({ mode: 'none' });

function standalone(): boolean {
	return (
		matchMedia('(display-mode: standalone)').matches ||
		(navigator as Navigator & { standalone?: boolean }).standalone === true
	);
}

function iosSafari(): boolean {
	const ua = navigator.userAgent;
	const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
	return ios && /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
}

function updateMode() {
	if (standalone()) install.mode = 'none';
	else if (deferred) install.mode = 'prompt';
	else install.mode = iosSafari() ? 'ios' : 'none';
}

export function initInstall(): () => void {
	const onPrompt = (e: Event) => {
		e.preventDefault();
		deferred = e as InstallPromptEvent;
		updateMode();
	};
	const onInstalled = () => {
		deferred = null;
		install.mode = 'none';
	};
	window.addEventListener('beforeinstallprompt', onPrompt);
	window.addEventListener('appinstalled', onInstalled);
	updateMode();
	return () => {
		window.removeEventListener('beforeinstallprompt', onPrompt);
		window.removeEventListener('appinstalled', onInstalled);
	};
}

export async function promptInstall(): Promise<void> {
	if (!deferred) return;
	const event = deferred;
	deferred = null;
	await event.prompt();
	updateMode();
}
