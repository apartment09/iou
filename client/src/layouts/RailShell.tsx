import { CircleUserRound, House, LogOut, Monitor, Moon, Plus, Sun, Users } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useGroups, useLogout, useMe } from '../api/hooks.js';
import { Money } from '../components/ui.js';
import { useTheme, type ThemePref } from '../lib/theme.js';
import type { ShellProps } from './types.js';

/** "The Rail": persistent left rail (desktop), icon rail (tablet), bottom
 * tab bar (mobile). Content column with a sticky top bar. */
export function RailShell({ title, back, actions, children }: ShellProps) {
  const navigate = useNavigate();
  return (
    <div className="min-h-dvh md:pl-16 lg:pl-60">
      <Rail />

      <header className="sticky top-0 z-10 border-b border-edge bg-app/90 backdrop-blur">
        <div className="mx-auto flex h-13 max-w-5xl items-center gap-2 px-4 py-2.5">
          {back !== undefined && (
            <button
              onClick={() => (back === '' ? navigate(-1) : navigate(back))}
              className="-ml-2 rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-ink"
              aria-label="Back"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          )}
          <h1 className="min-w-0 flex-1 truncate text-[15px] font-semibold">{title}</h1>
          {actions}
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-5 pb-24 md:pb-10">{children}</main>

      <MobileTabBar />
    </div>
  );
}

function Rail() {
  const { data: me } = useMe();
  const { data: groups } = useGroups();
  const logout = useLogout();
  const navigate = useNavigate();
  const active = groups?.filter((g) => !g.archivedAt) ?? [];

  return (
    <nav className="fixed inset-y-0 left-0 z-20 hidden w-16 flex-col border-r border-edge bg-surface md:flex lg:w-60">
      <Link to="/" className="flex h-13 items-center gap-2 border-b border-edge px-4">
        <span className="text-lg" aria-hidden>💸</span>
        <span className="hidden text-[15px] font-bold tracking-tight lg:block">Splitt</span>
      </Link>

      <div className="flex-1 overflow-y-auto p-2">
        <p className="hidden px-2 pb-1.5 pt-2 text-[11px] font-semibold uppercase tracking-wider text-faint lg:block">
          Groups
        </p>
        <ul className="space-y-0.5">
          {active.map((group) => (
            <li key={group.id}>
              <NavLink
                to={`/groups/${group.id}`}
                title={group.name}
                className={({ isActive }) =>
                  `flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm ${
                    isActive ? 'bg-surface-2 font-medium text-ink' : 'text-muted hover:bg-surface-2 hover:text-ink'
                  }`
                }
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-accent-soft text-[10px] font-bold text-accent">
                  {group.name.slice(0, 2).toUpperCase()}
                </span>
                <span className="hidden min-w-0 flex-1 truncate lg:block">{group.name}</span>
                <span className="hidden text-xs lg:block">
                  {group.myBalanceCents !== 0 && <Money cents={group.myBalanceCents} signed />}
                </span>
              </NavLink>
            </li>
          ))}
        </ul>
        <Link
          to="/groups/new"
          className="mt-1 flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm text-muted hover:bg-surface-2 hover:text-ink"
        >
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-dashed border-edge">
            <Plus className="h-3.5 w-3.5" aria-hidden />
          </span>
          <span className="hidden lg:block">New group</span>
        </Link>
      </div>

      <div className="space-y-0.5 border-t border-edge p-2">
        {me?.isAdmin && (
          <RailItem to="/admin/users" icon={<Users className="h-4 w-4" aria-hidden />} label="Users" />
        )}
        <RailItem
          to="/account"
          icon={<CircleUserRound className="h-4 w-4" aria-hidden />}
          label={me?.name ?? 'Account'}
        />
        <ThemeToggle variant="rail" />
        <button
          onClick={() => logout.mutate(undefined, { onSuccess: () => navigate('/login') })}
          title="Sign out"
          className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-sm text-muted hover:bg-surface-2 hover:text-ink"
        >
          <span className="flex h-6 w-6 shrink-0 items-center justify-center">
            <LogOut className="h-4 w-4" aria-hidden />
          </span>
          <span className="hidden lg:block">Sign out</span>
        </button>
      </div>
    </nav>
  );
}

function RailItem({ to, icon, label }: { to: string; icon: ReactNode; label: string }) {
  return (
    <NavLink
      to={to}
      title={label}
      className={({ isActive }) =>
        `flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm ${
          isActive ? 'bg-surface-2 font-medium text-ink' : 'text-muted hover:bg-surface-2 hover:text-ink'
        }`
      }
    >
      <span className="flex h-6 w-6 shrink-0 items-center justify-center">{icon}</span>
      <span className="hidden min-w-0 truncate lg:block">{label}</span>
    </NavLink>
  );
}

function MobileTabBar() {
  const { data: me } = useMe();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 flex border-t border-edge bg-surface pb-[env(safe-area-inset-bottom)] md:hidden">
      <MobileTab to="/" icon={<House className="h-5 w-5" aria-hidden />} label="Groups" end />
      {me?.isAdmin && (
        <MobileTab to="/admin/users" icon={<Users className="h-5 w-5" aria-hidden />} label="Users" />
      )}
      <MobileTab to="/account" icon={<CircleUserRound className="h-5 w-5" aria-hidden />} label="Account" />
    </nav>
  );
}

function MobileTab({ to, icon, label, end }: { to: string; icon: ReactNode; label: string; end?: boolean }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-medium ${
          isActive ? 'text-accent' : 'text-muted'
        }`
      }
    >
      {icon}
      {label}
    </NavLink>
  );
}

const THEME_CYCLE: ThemePref[] = ['system', 'light', 'dark'];
const THEME_META = {
  system: { icon: Monitor, label: 'System theme' },
  light: { icon: Sun, label: 'Light theme' },
  dark: { icon: Moon, label: 'Dark theme' },
} as const;

export function ThemeToggle({ variant = 'rail' }: { variant?: 'rail' | 'row' }) {
  const [pref, setPref] = useTheme();
  const next = THEME_CYCLE[(THEME_CYCLE.indexOf(pref) + 1) % THEME_CYCLE.length]!;
  const { icon: Icon, label } = THEME_META[pref];

  if (variant === 'row') {
    return (
      <button
        onClick={() => setPref(next)}
        className="flex w-full items-center gap-2 rounded-md border border-edge bg-surface px-3 py-2 text-sm text-ink hover:bg-surface-2"
      >
        <Icon className="h-4 w-4 text-muted" aria-hidden />
        {label}
        <span className="ml-auto text-xs text-faint">tap to change</span>
      </button>
    );
  }
  return (
    <button
      onClick={() => setPref(next)}
      title={label}
      className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-sm text-muted hover:bg-surface-2 hover:text-ink"
    >
      <span className="flex h-6 w-6 shrink-0 items-center justify-center">
        <Icon className="h-4 w-4" aria-hidden />
      </span>
      <span className="hidden lg:block">{label}</span>
    </button>
  );
}
