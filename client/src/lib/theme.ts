import { useSyncExternalStore } from 'react';

export type ThemePref = 'system' | 'light' | 'dark';

const KEY = 'iou-theme';
const media = window.matchMedia('(prefers-color-scheme: dark)');
const listeners = new Set<() => void>();

export function getThemePref(): ThemePref {
  const stored = localStorage.getItem(KEY);
  return stored === 'light' || stored === 'dark' ? stored : 'system';
}

function apply(): void {
  const pref = getThemePref();
  const dark = pref === 'dark' || (pref === 'system' && media.matches);
  document.documentElement.classList.toggle('dark', dark);
}

export function setThemePref(pref: ThemePref): void {
  if (pref === 'system') localStorage.removeItem(KEY);
  else localStorage.setItem(KEY, pref);
  apply();
  listeners.forEach((fn) => fn());
}

/** Call once before render. */
export function initTheme(): void {
  apply();
  media.addEventListener('change', apply);
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
