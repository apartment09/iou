import { describe, expect, it } from 'vitest';
import { resolveSplit, participantsOf, SplitError, type SplitInput } from '../src/split.js';

const sum = (shares: { cents: number }[]) => shares.reduce((s, x) => s + x.cents, 0);

describe('equal split', () => {
  it('splits evenly when divisible', () => {
    expect(resolveSplit(1000, { method: 'equal', participants: [1, 2, 3, 4] })).toEqual([
      { userId: 1, cents: 250 },
      { userId: 2, cents: 250 },
      { userId: 3, cents: 250 },
      { userId: 4, cents: 250 },
    ]);
  });

  it('assigns leftover cents deterministically (lowest userId first on ties)', () => {
    expect(resolveSplit(1000, { method: 'equal', participants: [3, 1, 2] })).toEqual([
      { userId: 3, cents: 333 },
      { userId: 1, cents: 334 },
      { userId: 2, cents: 333 },
    ]);
  });

  it('rejects empty and duplicate participants', () => {
    expect(() => resolveSplit(100, { method: 'equal', participants: [] })).toThrow(SplitError);
    expect(() => resolveSplit(100, { method: 'equal', participants: [1, 1] })).toThrow(SplitError);
  });

  it('rejects non-positive totals', () => {
    expect(() => resolveSplit(0, { method: 'equal', participants: [1] })).toThrow(SplitError);
    expect(() => resolveSplit(-100, { method: 'equal', participants: [1] })).toThrow(SplitError);
  });
});

describe('exact split', () => {
  it('passes through amounts that sum to the total', () => {
    const shares = resolveSplit(1000, {
      method: 'exact',
      amounts: [
        { userId: 1, cents: 700 },
        { userId: 2, cents: 300 },
      ],
    });
    expect(sum(shares)).toBe(1000);
  });

  it('rejects mismatched sums and negative shares', () => {
    expect(() =>
      resolveSplit(1000, { method: 'exact', amounts: [{ userId: 1, cents: 999 }] }),
    ).toThrow(SplitError);
    expect(() =>
      resolveSplit(100, {
        method: 'exact',
        amounts: [
          { userId: 1, cents: -50 },
          { userId: 2, cents: 150 },
        ],
      }),
    ).toThrow(SplitError);
  });
});

describe('percentage split', () => {
  it('splits 50/25/25', () => {
    expect(
      resolveSplit(1000, {
        method: 'percentage',
        percents: [
          { userId: 1, percent: 50 },
          { userId: 2, percent: 25 },
          { userId: 3, percent: 25 },
        ],
      }),
    ).toEqual([
      { userId: 1, cents: 500 },
      { userId: 2, cents: 250 },
      { userId: 3, cents: 250 },
    ]);
  });

  it('handles two-decimal percentages exactly', () => {
    const shares = resolveSplit(999, {
      method: 'percentage',
      percents: [
        { userId: 1, percent: 33.33 },
        { userId: 2, percent: 33.33 },
        { userId: 3, percent: 33.34 },
      ],
    });
    expect(sum(shares)).toBe(999);
  });

  it('rejects percentages not summing to 100', () => {
    expect(() =>
      resolveSplit(1000, {
        method: 'percentage',
        percents: [
          { userId: 1, percent: 50 },
          { userId: 2, percent: 49 },
        ],
      }),
    ).toThrow(SplitError);
  });

  it('rejects more than two decimal places', () => {
    expect(() =>
      resolveSplit(1000, {
        method: 'percentage',
        percents: [
          { userId: 1, percent: 33.333 },
          { userId: 2, percent: 66.667 },
        ],
      }),
    ).toThrow(SplitError);
  });
});

describe('shares split', () => {
  it('splits 2:1', () => {
    expect(
      resolveSplit(900, {
        method: 'shares',
        shares: [
          { userId: 1, shares: 2 },
          { userId: 2, shares: 1 },
        ],
      }),
    ).toEqual([
      { userId: 1, cents: 600 },
      { userId: 2, cents: 300 },
    ]);
  });

  it('allows zero shares for excluded members but not all-zero', () => {
    const shares = resolveSplit(900, {
      method: 'shares',
      shares: [
        { userId: 1, shares: 3 },
        { userId: 2, shares: 0 },
      ],
    });
    expect(shares).toEqual([
      { userId: 1, cents: 900 },
      { userId: 2, cents: 0 },
    ]);
    expect(() =>
      resolveSplit(900, { method: 'shares', shares: [{ userId: 1, shares: 0 }] }),
    ).toThrow(SplitError);
  });
});

describe('split invariants (property-style)', () => {
  // Deterministic pseudo-random sequence — no Math.random so failures reproduce.
  let seed = 42;
  const rand = (max: number) => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed % max;
  };

  it('every method always sums exactly to the total', () => {
    for (let i = 0; i < 500; i++) {
      const total = rand(1_000_000) + 1;
      const n = rand(8) + 1;
      const users = Array.from({ length: n }, (_, k) => k + 1);

      const inputs: SplitInput[] = [
        { method: 'equal', participants: users },
        { method: 'shares', shares: users.map((u) => ({ userId: u, shares: rand(5) + 1 })) },
      ];
      for (const input of inputs) {
        const shares = resolveSplit(total, input);
        expect(sum(shares)).toBe(total);
        expect(shares.map((s) => s.userId).sort((a, b) => a - b)).toEqual(users);
      }

      // Equal splits never differ by more than one cent.
      const equalShares = resolveSplit(total, { method: 'equal', participants: users });
      const amounts = equalShares.map((s) => s.cents);
      expect(Math.max(...amounts) - Math.min(...amounts)).toBeLessThanOrEqual(1);
    }
  });

  it('is deterministic for identical input', () => {
    const input: SplitInput = { method: 'equal', participants: [5, 2, 9] };
    expect(resolveSplit(1001, input)).toEqual(resolveSplit(1001, input));
  });
});

describe('participantsOf', () => {
  it('extracts user ids for every method', () => {
    expect(participantsOf({ method: 'equal', participants: [1, 2] })).toEqual([1, 2]);
    expect(participantsOf({ method: 'exact', amounts: [{ userId: 3, cents: 1 }] })).toEqual([3]);
    expect(participantsOf({ method: 'percentage', percents: [{ userId: 4, percent: 100 }] })).toEqual([4]);
    expect(participantsOf({ method: 'shares', shares: [{ userId: 5, shares: 1 }] })).toEqual([5]);
  });
});
