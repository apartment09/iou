import type { ComponentType, ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useMe } from '../api/hooks.js';
import { Spinner } from './ui.js';
import { RailShell } from '../layouts/RailShell.js';
import type { LayoutId, ShellProps } from '../layouts/types.js';

export { ThemeToggle } from '../layouts/RailShell.js';

/** Layout registry. To offer another layout later: build a shell that
 * implements ShellProps, register it here, and let the user pick — the
 * preference is read per render, pages never change. */
const LAYOUTS: Record<LayoutId, ComponentType<ShellProps>> = {
  rail: RailShell,
};

const LAYOUT_KEY = 'splitt-layout';

export function getLayoutPref(): LayoutId {
  const stored = localStorage.getItem(LAYOUT_KEY);
  return stored && stored in LAYOUTS ? (stored as LayoutId) : 'rail';
}

export function Shell(props: ShellProps) {
  const Active = LAYOUTS[getLayoutPref()];
  return <Active {...props} />;
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const { data: user, isPending } = useMe();
  const location = useLocation();
  if (isPending) return <Spinner />;
  if (!user) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?next=${next}`} replace />;
  }
  return <>{children}</>;
}
