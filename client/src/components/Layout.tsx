import type { ReactNode } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useLogout, useMe } from '../api/hooks.js';
import { Spinner } from './ui.js';

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

export function Shell({
  title,
  back,
  actions,
  children,
}: {
  title: ReactNode;
  back?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const navigate = useNavigate();
  return (
    <div className="mx-auto min-h-dvh max-w-lg pb-24">
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-slate-200 bg-slate-100/90 px-4 py-3 backdrop-blur">
        {back !== undefined && (
          <button
            onClick={() => (back === '' ? navigate(-1) : navigate(back))}
            className="-ml-2 rounded-full p-2 text-slate-500 hover:bg-slate-200"
            aria-label="Back"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        )}
        <h1 className="min-w-0 flex-1 truncate text-lg font-bold">{title}</h1>
        {actions}
      </header>
      <main className="px-4 pt-4">{children}</main>
    </div>
  );
}

export function HomeHeaderActions() {
  const logout = useLogout();
  const navigate = useNavigate();
  const { data: user } = useMe();
  return (
    <div className="flex items-center gap-1">
      {user?.isAdmin && (
        <Link to="/admin/users" className="rounded-lg px-2 py-1 text-sm text-slate-500 hover:bg-slate-200">
          Users
        </Link>
      )}
      <Link to="/account" className="rounded-lg px-2 py-1 text-sm font-medium text-slate-600 hover:bg-slate-200">
        {user?.name}
      </Link>
      <button
        className="rounded-lg px-2 py-1 text-sm text-slate-500 hover:bg-slate-200"
        onClick={() => logout.mutate(undefined, { onSuccess: () => navigate('/login') })}
      >
        Sign out
      </button>
    </div>
  );
}

export function Fab({ to, label }: { to: string; label: string }) {
  return (
    <Link
      to={to}
      className="fixed bottom-6 left-1/2 z-20 -translate-x-1/2 rounded-full bg-emerald-600 px-6 py-3.5 text-sm font-bold text-white shadow-lg shadow-emerald-600/30 hover:bg-emerald-700"
    >
      {label}
    </Link>
  );
}
