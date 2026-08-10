const STORAGE_KEY = 'vidm-theme';
const COLOR_THEME_STORAGE_KEY = 'vidm-color-theme';

type Theme = 'light' | 'dark';
export type ColorTheme = 'warm' | 'cool' | 'high-contrast';

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

export const colorThemeState = $state<{ current: ColorTheme }>({
	current: (localStorage.getItem(COLOR_THEME_STORAGE_KEY) as ColorTheme | null) ?? 'warm'
});

export async function setColorTheme(theme: ColorTheme) {
	if (theme !== 'warm') {
		await import(`./themes/${theme}.css`);
	}
	colorThemeState.current = theme;
	localStorage.setItem(COLOR_THEME_STORAGE_KEY, theme);
	if (theme === 'warm') {
		delete document.documentElement.dataset.theme;
	} else {
		document.documentElement.dataset.theme = theme;
	}
}

// Async, unlike apply() above — a returning visitor with a persisted
// non-warm theme sees a brief flash of the warm (default) palette until
// this dynamic import resolves. Accepted tradeoff: avoiding it would mean
// a render-blocking inline script in app.html, not worth it for a cosmetic
// flash that's gone from cache after the first visit.
if (colorThemeState.current !== 'warm') {
	setColorTheme(colorThemeState.current);
}
