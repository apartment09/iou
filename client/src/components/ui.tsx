import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react';
import { money } from '../lib/format.js';

const buttonStyles = {
  primary: 'bg-accent text-white hover:bg-accent-strong disabled:opacity-50',
  secondary: 'border border-edge bg-surface text-ink hover:bg-surface-2 disabled:opacity-50',
  danger: 'bg-neg text-white hover:opacity-90 disabled:opacity-50',
  ghost: 'text-muted hover:bg-surface-2 hover:text-ink',
} as const;

export function Button({
  variant = 'primary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof buttonStyles }) {
  return (
    <button
      className={`rounded-md px-3.5 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed ${buttonStyles[variant]} ${className}`}
      {...props}
    />
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-medium text-muted">{label}</span>
      {children}
    </label>
  );
}

// 16px on touch devices — anything smaller makes iOS zoom-jump on focus.
const inputClass =
  'w-full rounded-md border border-edge bg-surface px-3 py-2 text-base sm:text-sm text-ink outline-none placeholder:text-faint focus:border-accent focus:ring-2 focus:ring-accent/25';

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={inputClass} {...props} />;
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={inputClass} {...props} />;
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-lg border border-edge bg-surface p-4 ${className}`}>{children}</div>;
}

export function ErrorText({ children }: { children: ReactNode }) {
  if (!children) return null;
  return <p className="rounded-md bg-neg-soft px-3 py-2 text-sm text-neg">{children}</p>;
}

export function Spinner() {
  return (
    <div className="flex justify-center py-10">
      <div className="h-7 w-7 animate-spin rounded-full border-2 border-edge border-t-accent" />
    </div>
  );
}

const avatarColors = [
  'bg-emerald-500', 'bg-sky-500', 'bg-violet-500', 'bg-amber-500',
  'bg-rose-500', 'bg-teal-500', 'bg-indigo-500', 'bg-orange-500',
];

export function Avatar({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' }) {
  const initials = name
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) % avatarColors.length;
  const sizeClass = size === 'sm' ? 'h-6 w-6 text-[10px]' : 'h-8 w-8 text-xs';
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white ${sizeClass} ${avatarColors[hash]}`}
    >
      {initials}
    </span>
  );
}

/** Money amount colored by sign: green = gets money, red = owes, faint = zero. */
export function Money({ cents, signed = false }: { cents: number; signed?: boolean }) {
  const color = !signed ? 'text-ink' : cents > 0 ? 'text-pos' : cents < 0 ? 'text-neg' : 'text-faint';
  return <span className={`font-medium tabular-nums ${color}`}>{money(cents)}</span>;
}

export function EmptyState({ emoji, children }: { emoji: string; children: ReactNode }) {
  return (
    <div className="py-12 text-center text-muted">
      <div className="mb-2 text-3xl">{emoji}</div>
      <p className="text-sm">{children}</p>
    </div>
  );
}
