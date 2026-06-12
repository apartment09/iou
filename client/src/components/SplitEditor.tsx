import { useMemo, useState } from 'react';
import {
  parseAmount,
  resolveSplit,
  SplitError,
  type MemberDto,
  type Share,
  type SplitInput,
  type SplitMethod,
} from '@iou/shared';
import { Avatar, Money } from './ui.js';
import { centsToInput, money } from '../lib/format.js';

const METHOD_LABELS: Record<SplitMethod, string> = {
  equal: '= Equal',
  exact: '1,23 Exact',
  percentage: '% Percent',
  shares: '⚖ Shares',
};

interface Props {
  members: MemberDto[];
  totalCents: number | null;
  value: SplitInput;
  onChange: (input: SplitInput) => void;
}

/** Per-method editor state, initialized once from `value` (remount with a key
 * to re-initialize, e.g. when an expense loads for editing). */
export function SplitEditor({ members, totalCents, value, onChange }: Props) {
  const [method, setMethod] = useState<SplitMethod>(value.method);
  const [participants, setParticipants] = useState<Set<number>>(
    () => new Set(value.method === 'equal' ? value.participants : members.map((m) => m.userId)),
  );
  const [exact, setExact] = useState<Record<number, string>>(() => {
    if (value.method !== 'exact') return {};
    return Object.fromEntries(value.amounts.map((a) => [a.userId, centsToInput(a.cents)]));
  });
  const [percents, setPercents] = useState<Record<number, string>>(() => {
    if (value.method !== 'percentage') return {};
    return Object.fromEntries(value.percents.map((p) => [p.userId, String(p.percent)]));
  });
  const [shareCounts, setShareCounts] = useState<Record<number, number>>(() => {
    if (value.method !== 'shares') {
      return Object.fromEntries(members.map((m) => [m.userId, 1]));
    }
    return Object.fromEntries(value.shares.map((s) => [s.userId, s.shares]));
  });

  function buildInput(
    nextMethod: SplitMethod,
    state: {
      participants?: Set<number>;
      exact?: Record<number, string>;
      percents?: Record<number, string>;
      shareCounts?: Record<number, number>;
    } = {},
  ): SplitInput {
    const p = state.participants ?? participants;
    const e = state.exact ?? exact;
    const pc = state.percents ?? percents;
    const sc = state.shareCounts ?? shareCounts;
    switch (nextMethod) {
      case 'equal':
        return { method: 'equal', participants: [...p] };
      case 'exact':
        return {
          method: 'exact',
          amounts: members.map((m) => ({
            userId: m.userId,
            cents: parseAmount(e[m.userId] || '0') ?? 0,
          })),
        };
      case 'percentage':
        return {
          method: 'percentage',
          percents: members.map((m) => ({
            userId: m.userId,
            percent: Number((pc[m.userId] ?? '0').replace(',', '.')) || 0,
          })),
        };
      case 'shares':
        return {
          method: 'shares',
          shares: members.map((m) => ({ userId: m.userId, shares: sc[m.userId] ?? 0 })),
        };
    }
  }

  const preview = useMemo((): { shares: Map<number, number>; error: string | null } => {
    if (totalCents === null || totalCents <= 0) {
      return { shares: new Map(), error: null };
    }
    try {
      const shares = resolveSplit(totalCents, value);
      return { shares: new Map(shares.map((s: Share) => [s.userId, s.cents])), error: null };
    } catch (err) {
      return { shares: new Map(), error: err instanceof SplitError ? err.message : 'Invalid split' };
    }
  }, [totalCents, value]);

  const switchMethod = (next: SplitMethod) => {
    setMethod(next);
    onChange(buildInput(next));
  };

  const toggleParticipant = (userId: number) => {
    const next = new Set(participants);
    if (next.has(userId)) next.delete(userId);
    else next.add(userId);
    setParticipants(next);
    onChange(buildInput('equal', { participants: next }));
  };

  const setExactFor = (userId: number, text: string) => {
    const next = { ...exact, [userId]: text };
    setExact(next);
    onChange(buildInput('exact', { exact: next }));
  };

  const setPercentFor = (userId: number, text: string) => {
    const next = { ...percents, [userId]: text };
    setPercents(next);
    onChange(buildInput('percentage', { percents: next }));
  };

  const bumpShares = (userId: number, delta: number) => {
    const next = { ...shareCounts, [userId]: Math.max(0, (shareCounts[userId] ?? 0) + delta) };
    setShareCounts(next);
    onChange(buildInput('shares', { shareCounts: next }));
  };

  const exactSum = members.reduce((s, m) => s + (parseAmount(exact[m.userId] || '0') ?? 0), 0);
  const percentSum = members.reduce(
    (s, m) => s + (Number((percents[m.userId] ?? '0').replace(',', '.')) || 0),
    0,
  );

  return (
    <div>
      <div className="mb-3 grid grid-cols-4 gap-1 rounded-md bg-surface-2 p-1">
        {(Object.keys(METHOD_LABELS) as SplitMethod[]).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => switchMethod(m)}
            className={`rounded-lg px-1 py-1.5 text-xs font-semibold transition-colors ${
              method === m ? 'bg-surface text-accent shadow-sm' : 'text-muted'
            }`}
          >
            {METHOD_LABELS[m]}
          </button>
        ))}
      </div>

      <ul className="divide-y divide-edge rounded-md border border-edge bg-surface">
        {members.map((member) => {
          const previewCents = preview.shares.get(member.userId);
          return (
            <li key={member.userId} className="flex items-center gap-3 px-3 py-2.5">
              {method === 'equal' && (
                <input
                  type="checkbox"
                  checked={participants.has(member.userId)}
                  onChange={() => toggleParticipant(member.userId)}
                  className="h-5 w-5 accent-accent"
                />
              )}
              <Avatar name={member.name} size="sm" />
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{member.name}</span>

              {method === 'exact' && (
                <input
                  inputMode="decimal"
                  placeholder="0.00"
                  value={exact[member.userId] ?? ''}
                  onChange={(e) => setExactFor(member.userId, e.target.value)}
                  className="w-24 rounded-lg border border-edge px-2 py-1.5 text-right text-base sm:text-sm outline-none focus:border-accent"
                />
              )}
              {method === 'percentage' && (
                <span className="flex items-center gap-1">
                  <input
                    inputMode="decimal"
                    placeholder="0"
                    value={percents[member.userId] ?? ''}
                    onChange={(e) => setPercentFor(member.userId, e.target.value)}
                    className="w-16 rounded-lg border border-edge px-2 py-1.5 text-right text-base sm:text-sm outline-none focus:border-accent"
                  />
                  <span className="text-sm text-faint">%</span>
                </span>
              )}
              {method === 'shares' && (
                <span className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => bumpShares(member.userId, -1)}
                    className="h-7 w-7 rounded-full bg-surface-2 font-bold text-muted hover:bg-surface-2"
                  >
                    −
                  </button>
                  <span className="w-5 text-center text-sm font-semibold">
                    {shareCounts[member.userId] ?? 0}
                  </span>
                  <button
                    type="button"
                    onClick={() => bumpShares(member.userId, 1)}
                    className="h-7 w-7 rounded-full bg-surface-2 font-bold text-muted hover:bg-surface-2"
                  >
                    +
                  </button>
                </span>
              )}

              <span className="w-20 text-right text-sm text-muted">
                {previewCents !== undefined ? <Money cents={previewCents} /> : '—'}
              </span>
            </li>
          );
        })}
      </ul>

      {method === 'exact' && totalCents !== null && exactSum !== totalCents && (
        <p className="mt-2 text-sm text-warn">
          {money(exactSum)} of {money(totalCents)} assigned — {money(totalCents - exactSum)} left
        </p>
      )}
      {method === 'percentage' && Math.abs(percentSum - 100) > 0.001 && (
        <p className="mt-2 text-sm text-warn">{percentSum.toLocaleString('en-GB')}% of 100% assigned</p>
      )}
      {preview.error && method !== 'exact' && method !== 'percentage' && (
        <p className="mt-2 text-sm text-warn">{preview.error}</p>
      )}
    </div>
  );
}
