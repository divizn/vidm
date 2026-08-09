const STORAGE_KEY = 'vidm-theme';

type Theme = 'light' | 'dark';

function systemPrefersDark(): boolean {
	return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function apply(theme: Theme) {
	document.documentElement.classList.toggle('dark', theme === 'dark');
}

// SSR is disabled app-wide, so this only ever runs in the browser — no
// window/document guards needed at the call site.
export const themeState = $state<{ current: Theme }>({
	current: (localStorage.getItem(STORAGE_KEY) as Theme | null) ?? (systemPrefersDark() ? 'dark' : 'light')
});

apply(themeState.current);

export function toggleTheme() {
	themeState.current = themeState.current === 'dark' ? 'light' : 'dark';
	localStorage.setItem(STORAGE_KEY, themeState.current);
	apply(themeState.current);
}
