/** Split strategies. Every method resolves a total (in cents) into exact
 * per-participant cent shares that are guaranteed to sum to the total.
 * Used by the client for live preview and by the server as the
 * authoritative calculation — keep this module pure and dependency-free. */

import { assertCents } from './money.js';

export type SplitMethod = 'equal' | 'exact' | 'percentage' | 'shares';

export interface Share {
  userId: number;
  cents: number;
}

export type SplitInput =
  | { method: 'equal'; participants: number[] }
  | { method: 'exact'; amounts: { userId: number; cents: number }[] }
  | { method: 'percentage'; percents: { userId: number; percent: number }[] }
  | { method: 'shares'; shares: { userId: number; shares: number }[] };

export class SplitError extends Error {}

interface SplitStrategy<I extends SplitInput> {
  validate(totalCents: number, input: I): void;
  resolve(totalCents: number, input: I): Share[];
}

/** Largest-remainder apportionment with integer math only.
 * Deterministic: leftover cents go to the largest scaled remainders,
 * ties broken by ascending userId. */
function splitByWeights(totalCents: number, entries: { userId: number; weight: number }[]): Share[] {
  const weightSum = entries.reduce((s, e) => s + e.weight, 0);
  if (weightSum <= 0) throw new SplitError('Total weight must be positive');
  const shares = entries.map((e) => ({
    userId: e.userId,
    cents: Math.floor((totalCents * e.weight) / weightSum),
    remainder: (totalCents * e.weight) % weightSum,
  }));
  let leftover = totalCents - shares.reduce((s, e) => s + e.cents, 0);
  const byRemainder = [...shares].sort(
    (a, b) => b.remainder - a.remainder || a.userId - b.userId,
  );
  for (const share of byRemainder) {
    if (leftover === 0) break;
    share.cents += 1;
    leftover -= 1;
  }
  return shares.map(({ userId, cents }) => ({ userId, cents }));
}

function requireUniqueUsers(userIds: number[]): void {
  if (userIds.length === 0) throw new SplitError('At least one participant is required');
  if (new Set(userIds).size !== userIds.length) {
    throw new SplitError('Duplicate participant');
  }
}

const equal: SplitStrategy<Extract<SplitInput, { method: 'equal' }>> = {
  validate(_total, input) {
    requireUniqueUsers(input.participants);
  },
  resolve(total, input) {
    return splitByWeights(
      total,
      input.participants.map((userId) => ({ userId, weight: 1 })),
    );
  },
};

const exact: SplitStrategy<Extract<SplitInput, { method: 'exact' }>> = {
  validate(total, input) {
    requireUniqueUsers(input.amounts.map((a) => a.userId));
    for (const a of input.amounts) {
      assertCents(a.cents, 'exact share');
      if (a.cents < 0) throw new SplitError('Shares cannot be negative');
    }
    const sum = input.amounts.reduce((s, a) => s + a.cents, 0);
    if (sum !== total) {
      throw new SplitError(`Shares must add up to the total (got ${sum}, expected ${total})`);
    }
  },
  resolve(_total, input) {
    return input.amounts.map(({ userId, cents }) => ({ userId, cents }));
  },
};

/** Percentages support up to two decimal places, handled as integer basis points. */
function toBasisPoints(percent: number): number {
  const bp = Math.round(percent * 100);
  if (!Number.isFinite(percent) || percent < 0 || Math.abs(percent * 100 - bp) > 1e-6) {
    throw new SplitError('Percentages must have at most two decimal places');
  }
  return bp;
}

const percentage: SplitStrategy<Extract<SplitInput, { method: 'percentage' }>> = {
  validate(_total, input) {
    requireUniqueUsers(input.percents.map((p) => p.userId));
    const sum = input.percents.reduce((s, p) => s + toBasisPoints(p.percent), 0);
    if (sum !== 10_000) throw new SplitError('Percentages must add up to 100');
  },
  resolve(total, input) {
    return splitByWeights(
      total,
      input.percents.map((p) => ({ userId: p.userId, weight: toBasisPoints(p.percent) })),
    );
  },
};

const shares: SplitStrategy<Extract<SplitInput, { method: 'shares' }>> = {
  validate(_total, input) {
    requireUniqueUsers(input.shares.map((s) => s.userId));
    for (const s of input.shares) {
      if (!Number.isSafeInteger(s.shares) || s.shares < 0) {
        throw new SplitError('Shares must be non-negative integers');
      }
    }
    if (input.shares.reduce((sum, s) => sum + s.shares, 0) <= 0) {
      throw new SplitError('At least one share is required');
    }
  },
  resolve(total, input) {
    return splitByWeights(
      total,
      input.shares.map((s) => ({ userId: s.userId, weight: s.shares })),
    );
  },
};

const strategies = { equal, exact, percentage, shares };

export function participantsOf(input: SplitInput): number[] {
  switch (input.method) {
    case 'equal':
      return input.participants;
    case 'exact':
      return input.amounts.map((a) => a.userId);
    case 'percentage':
      return input.percents.map((p) => p.userId);
    case 'shares':
      return input.shares.map((s) => s.userId);
  }
}

/** Resolve a split input to exact per-user cents. Throws SplitError on invalid input.
 * Invariant: the returned shares always sum exactly to totalCents. */
export function resolveSplit(totalCents: number, input: SplitInput): Share[] {
  assertCents(totalCents, 'total');
  if (totalCents <= 0) throw new SplitError('Total must be positive');
  const strategy = strategies[input.method] as SplitStrategy<SplitInput>;
  if (!strategy) throw new SplitError(`Unknown split method: ${(input as SplitInput).method}`);
  strategy.validate(totalCents, input);
  const result = strategy.resolve(totalCents, input);
  const sum = result.reduce((s, r) => s + r.cents, 0);
  if (sum !== totalCents) {
    throw new SplitError(`Internal split error: shares sum to ${sum}, expected ${totalCents}`);
  }
  return result;
}
