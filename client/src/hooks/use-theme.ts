import { useEffect, useState } from 'react';

type Theme = 'light' | 'dark' | 'system';

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => {
    // SSR safety check
    if (typeof window === 'undefined') return 'system';
    
    // Check localStorage first with error handling
    try {
      const stored = localStorage.getItem('theme') as Theme | null;
      if (stored && (stored === 'light' || stored === 'dark' || stored === 'system')) {
        return stored;
      }
    } catch (error) {
      console.warn('Failed to read theme from localStorage:', error);
    }
    
    // Default to system preference
    return 'system';
  });

  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window === 'undefined') return 'light';
    
    if (theme === 'system') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return theme;
  });

  useEffect(() => {
    // Update resolved theme when theme changes
    if (theme === 'system') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const handler = (e: MediaQueryListEvent) => {
        setResolvedTheme(e.matches ? 'dark' : 'light');
      };
      
      setResolvedTheme(mediaQuery.matches ? 'dark' : 'light');
      mediaQuery.addEventListener('change', handler);
      
      return () => mediaQuery.removeEventListener('change', handler);
    } else {
      setResolvedTheme(theme);
    }
  }, [theme]);

  useEffect(() => {
    // Apply theme to document
    const root = document.documentElement;
    if (resolvedTheme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [resolvedTheme]);

  const setThemeWithStorage = (newTheme: Theme) => {
    setTheme(newTheme);
    try {
      localStorage.setItem('theme', newTheme);
    } catch (error) {
      console.warn('Failed to save theme preference:', error);
    }
  };

  return {
    theme,
    resolvedTheme,
    setTheme: setThemeWithStorage,
  };
}

