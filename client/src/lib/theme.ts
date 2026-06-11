import { useSyncExternalStore } from 'react';

export type ThemePref = 'light' | 'dark';

const KEY = 'iou-theme';
const listeners = new Set<() => void>();

/** Stored choice, or the OS preference as the first-visit default. */
export function getThemePref(): ThemePref {
  const stored = localStorage.getItem(KEY);
  if (stored === 'light' || stored === 'dark') return stored;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function apply(): void {
  document.documentElement.classList.toggle('dark', getThemePref() === 'dark');
}

export function setThemePref(pref: ThemePref): void {
  localStorage.setItem(KEY, pref);
  apply();
  listeners.forEach((fn) => fn());
}

/** Call once before render. */
export function initTheme(): void {
  apply();
}

export function useTheme(): [ThemePref, (pref: ThemePref) => void] {
  const pref = useSyncExternalStore(
    (onChange) => {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
    getThemePref,
  );
  return [pref, setThemePref];
}
