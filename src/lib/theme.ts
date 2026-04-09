export type ThemeMode = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'ravenpos-theme';

function isThemeMode(value: unknown): value is ThemeMode {
    return value === 'light' || value === 'dark';
}

export function getStoredTheme(): ThemeMode | null {
    if (typeof window === 'undefined') return null;
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isThemeMode(stored) ? stored : null;
}

export function getSystemTheme(): ThemeMode {
    if (typeof window === 'undefined') return 'light';
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function getActiveTheme(): ThemeMode {
    if (typeof document === 'undefined') return 'light';
    const attr = document.documentElement.getAttribute('data-theme');
    return isThemeMode(attr) ? attr : getStoredTheme() || getSystemTheme();
}

export function setTheme(theme: ThemeMode, persist = true) {
    if (typeof document !== 'undefined') {
        document.documentElement.setAttribute('data-theme', theme);
    }
    if (persist && typeof window !== 'undefined') {
        window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    }
}

export function initializeTheme() {
    const theme = getStoredTheme() || getSystemTheme();
    setTheme(theme, false);
}
