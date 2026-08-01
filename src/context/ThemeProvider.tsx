import { createContext, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { applyVizTheme } from '@/config/viz';

/* ───────────────────────────────────────────────────────────────────────────
 * Theme system.
 *
 * Two independently designed themes. Switching sets one attribute on the root
 * element; every surface, border, shadow and ink token is a CSS custom property
 * scoped to that attribute, so the whole application retints in place with no
 * reload and no component knowing a theme exists.
 *
 * Chart colour cannot ride the CSS variable layer — Recharts writes SVG
 * presentation attributes, where `var()` does not resolve — so the palette swap
 * happens in JavaScript, and it happens BEFORE the attribute flips so no chart
 * paints a frame with the outgoing palette.
 * ─────────────────────────────────────────────────────────────────────────── */

export type Theme = 'dark' | 'light';

export interface ThemeContextValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggle: () => void;
}

export const ThemeContext = createContext<ThemeContextValue | null>(null);

const STORAGE_KEY = 'intelora.theme';

/** Read the persisted choice. Falls back to the OS preference, then dark. */
const readStoredTheme = (): Theme => {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
  } catch {
    /* Private mode or blocked storage — fall through to the OS preference. */
  }
  return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
};

/**
 * Applied synchronously, before React commits, so the first paint is already in
 * the right theme. A `useEffect` would let one dark frame through on a light
 * reload, which reads as a flash.
 */
const commitTheme = (theme: Theme): void => {
  applyVizTheme(theme);
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;

  // Keeps the browser chrome (mobile address bar, window frame) in step.
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', theme === 'light' ? '#FFFFFF' : '#05070C');
};

/* Run once at module load — this executes before the first render. */
const initialTheme = readStoredTheme();
commitTheme(initialTheme);

export const ThemeProvider = ({ children }: { children: ReactNode }) => {
  const [theme, setThemeState] = useState<Theme>(initialTheme);

  const setTheme = useCallback((next: Theme) => {
    commitTheme(next);
    setThemeState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* Preference is still applied for this session. */
    }
  }, []);

  const toggle = useCallback(() => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  }, [theme, setTheme]);

  /* Colour transitions are enabled one frame after mount. Without this the
   * initial paint animates every surface from the browser default, which looks
   * like the application loading twice. */
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      document.documentElement.setAttribute('data-theme-ready', '');
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  /* Follow the OS only while the user has made no explicit choice. */
  useEffect(() => {
    const query = window.matchMedia?.('(prefers-color-scheme: light)');
    if (!query) return;

    const onChange = (event: MediaQueryListEvent) => {
      try {
        if (window.localStorage.getItem(STORAGE_KEY)) return;
      } catch {
        /* Unreadable storage means no stored preference to respect. */
      }
      const next: Theme = event.matches ? 'light' : 'dark';
      commitTheme(next);
      setThemeState(next);
    };

    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  const value = useMemo<ThemeContextValue>(() => ({ theme, setTheme, toggle }), [theme, setTheme, toggle]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};
