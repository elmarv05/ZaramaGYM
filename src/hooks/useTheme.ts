import { useCallback, useEffect, useState } from 'react';

export type ThemeMode = 'light' | 'dark';

const THEME_STORAGE_KEY = 'zaramagym-theme';

function getSystemTheme(): ThemeMode {
  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return 'light';
}

function getInitialTheme(): ThemeMode {
  if (typeof window !== 'undefined') {
    try {
      const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
      if (stored === 'light' || stored === 'dark') {
        return stored;
      }
    } catch {
      // Ignorar si localStorage está bloqueado en el entorno actual
    }
    if (document.documentElement.classList.contains('dark')) {
      return 'dark';
    }
  }
  return getSystemTheme();
}

function applyThemeToDocument(theme: ThemeMode, persist: boolean) {
  if (typeof document === 'undefined') return;

  document.documentElement.classList.toggle('dark', theme === 'dark');

  const metaColorScheme = document.querySelector('meta[name="color-scheme"]');
  if (metaColorScheme) {
    metaColorScheme.setAttribute('content', theme);
  }

  if (persist && typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // Ignorar si localStorage no está disponible
    }
  }
}

export interface UseThemeResult {
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
  toggleTheme: () => void;
}

export function useTheme(): UseThemeResult {
  const [theme, setThemeState] = useState<ThemeMode>(getInitialTheme);

  const setTheme = useCallback((nextTheme: ThemeMode) => {
    setThemeState(nextTheme);
    applyThemeToDocument(nextTheme, true);
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((prev) => {
      const next: ThemeMode = prev === 'dark' ? 'light' : 'dark';
      applyThemeToDocument(next, true);
      return next;
    });
  }, []);

  // Sincroniza la clase `.dark` inicial al montar
  useEffect(() => {
    let hasStored = false;
    try {
      const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
      hasStored = stored === 'light' || stored === 'dark';
    } catch {
      hasStored = false;
    }
    applyThemeToDocument(theme, hasStored);
  }, [theme]);

  // Escucha cambios en otra pestaña y cambios de preferencia del sistema si no hay override guardado
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleStorage = (event: StorageEvent) => {
      if (event.key !== THEME_STORAGE_KEY) return;
      if (event.newValue === 'light' || event.newValue === 'dark') {
        setThemeState(event.newValue);
        applyThemeToDocument(event.newValue, false);
      } else if (event.newValue === null) {
        const sys = getSystemTheme();
        setThemeState(sys);
        applyThemeToDocument(sys, false);
      }
    };

    window.addEventListener('storage', handleStorage);

    const mediaQuery =
      typeof window.matchMedia === 'function'
        ? window.matchMedia('(prefers-color-scheme: dark)')
        : null;

    const handleMediaChange = (event: MediaQueryListEvent) => {
      try {
        const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
        if (stored === 'light' || stored === 'dark') return;
      } catch {
        // Seguir preferencia del sistema si storage falla
      }
      const next: ThemeMode = event.matches ? 'dark' : 'light';
      setThemeState(next);
      applyThemeToDocument(next, false);
    };

    mediaQuery?.addEventListener?.('change', handleMediaChange);

    return () => {
      window.removeEventListener('storage', handleStorage);
      mediaQuery?.removeEventListener?.('change', handleMediaChange);
    };
  }, []);

  return { theme, setTheme, toggleTheme };
}
