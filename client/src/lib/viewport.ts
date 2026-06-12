import { useSyncExternalStore } from 'react';

/** True while the on-screen keyboard (or anything else) shrinks the visual
 * viewport substantially. Used to get fixed chrome (the mobile tab bar) out
 * of the way while typing. */
const THRESHOLD_PX = 150;

function keyboardOpen(): boolean {
  const vv = window.visualViewport;
  if (!vv) return false;
  return window.innerHeight - vv.height * vv.scale > THRESHOLD_PX;
}

function subscribe(onChange: () => void): () => void {
  const vv = window.visualViewport;
  if (!vv) return () => {};
  vv.addEventListener('resize', onChange);
  window.addEventListener('resize', onChange);
  return () => {
    vv.removeEventListener('resize', onChange);
    window.removeEventListener('resize', onChange);
  };
}

export function useKeyboardOpen(): boolean {
  return useSyncExternalStore(subscribe, keyboardOpen);
}
