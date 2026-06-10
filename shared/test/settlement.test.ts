import { describe, expect, it } from 'vitest';
import { computeNetBalances, simplifyDebts, type TransactionLike } from '../src/settlement.js';

describe('computeNetBalances', () => {
  it('credits the payer and debits the participants', () => {
    const txs: TransactionLike[] = [
      {
        paidBy: 1,
        amountCents: 3000,
        splits: [
          { userId: 1, cents: 1000 },
          { userId: 2, cents: 1000 },
          { userId: 3, cents: 1000 },
        ],
      },
    ];
    const balances = computeNetBalances(txs);
    expect(balances.get(1)).toBe(2000);
    expect(balances.get(2)).toBe(-1000);
    expect(balances.get(3)).toBe(-1000);
  });

  it('a settlement zeroes out a simple debt', () => {
    const txs: TransactionLike[] = [
      {
        paidBy: 1,
        amountCents: 1000,
        splits: [
          { userId: 1, cents: 500 },
          { userId: 2, cents: 500 },
        ],
      },
      // user 2 pays user 1 back 500 (settlement: payer=debtor, sole split=creditor)
      { paidBy: 2, amountCents: 500, splits: [{ userId: 1, cents: 500 }] },
    ];
    const balances = computeNetBalances(txs);
    expect(balances.get(1)).toBe(0);
    expect(balances.get(2)).toBe(0);
  });

  it('always sums to zero', () => {
    const txs: TransactionLike[] = [
      {
        paidBy: 2,
        amountCents: 999,
        splits: [
          { userId: 1, cents: 333 },
          { userId: 2, cents: 333 },
          { userId: 3, cents: 333 },
        ],
      },
      { paidBy: 3, amountCents: 250, splits: [{ userId: 2, cents: 250 }] },
    ];
    let total = 0;
    for (const cents of computeNetBalances(txs).values()) total += cents;
    expect(total).toBe(0);
  });
});

describe('simplifyDebts', () => {
  it('settles a two-person debt with one transfer', () => {
    const transfers = simplifyDebts(new Map([[1, 1000], [2, -1000]]));
    expect(transfers).toEqual([{ from: 2, to: 1, cents: 1000 }]);
  });

  it('collapses chains (A owes B, B owes C => A pays C)', () => {
    // A(-10) B(0) C(+10) — B paid out exactly what they owe
    const transfers = simplifyDebts(new Map([[1, -1000], [2, 0], [3, 1000]]));
    expect(transfers).toEqual([{ from: 1, to: 3, cents: 1000 }]);
  });

  it('produces at most n-1 transfers that settle everyone', () => {
    let seed = 7;
    const rand = (max: number) => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed % max;
    };
    for (let round = 0; round < 200; round++) {
      const n = rand(8) + 2;
      const balances = new Map<number, number>();
      let running = 0;
      for (let u = 1; u < n; u++) {
        const cents = rand(20000) - 10000;
        balances.set(u, cents);
        running += cents;
      }
      balances.set(n, -running); // last member absorbs the remainder => sums to zero

      const transfers = simplifyDebts(balances);
      expect(transfers.length).toBeLessThanOrEqual(n - 1);

      // Applying the transfers must zero every balance.
      const after = new Map(balances);
      for (const t of transfers) {
        after.set(t.from, (after.get(t.from) ?? 0) + t.cents);
        after.set(t.to, (after.get(t.to) ?? 0) - t.cents);
        expect(t.cents).toBeGreaterThan(0);
      }
      for (const cents of after.values()) expect(cents).toBe(0);
    }
  });

  it('rejects balances that do not sum to zero', () => {
    expect(() => simplifyDebts(new Map([[1, 100]]))).toThrow();
  });

  it('returns no transfers when everyone is settled', () => {
    expect(simplifyDebts(new Map([[1, 0], [2, 0]]))).toEqual([]);
  });
});
