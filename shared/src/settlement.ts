/** Balance computation and debt simplification.
 * Balance convention: positive = the group owes this person money. */

import type { Share } from './split.js';

export interface TransactionLike {
  paidBy: number;
  amountCents: number;
  splits: Share[];
}

export interface Transfer {
  from: number;
  to: number;
  cents: number;
}

/** Net balance per user: everything they paid minus their share of every transaction. */
export function computeNetBalances(transactions: TransactionLike[]): Map<number, number> {
  const balances = new Map<number, number>();
  const add = (userId: number, cents: number) =>
    balances.set(userId, (balances.get(userId) ?? 0) + cents);
  for (const tx of transactions) {
    add(tx.paidBy, tx.amountCents);
    for (const split of tx.splits) add(split.userId, -split.cents);
  }
  return balances;
}

/** Greedy creditor/debtor matching. Produces at most n-1 transfers that settle
 * all balances. Deterministic: largest amounts first, ties by ascending userId. */
export function simplifyDebts(balances: Map<number, number>): Transfer[] {
  let sum = 0;
  for (const cents of balances.values()) sum += cents;
  if (sum !== 0) {
    throw new Error(`Balances must sum to zero, got ${sum}`);
  }
  const creditors: { userId: number; cents: number }[] = [];
  const debtors: { userId: number; cents: number }[] = [];
  for (const [userId, cents] of balances) {
    if (cents > 0) creditors.push({ userId, cents });
    else if (cents < 0) debtors.push({ userId, cents: -cents });
  }
  const byAmountDesc = (a: { userId: number; cents: number }, b: { userId: number; cents: number }) =>
    b.cents - a.cents || a.userId - b.userId;
  creditors.sort(byAmountDesc);
  debtors.sort(byAmountDesc);

  const transfers: Transfer[] = [];
  let ci = 0;
  let di = 0;
  while (ci < creditors.length && di < debtors.length) {
    const creditor = creditors[ci]!;
    const debtor = debtors[di]!;
    const cents = Math.min(creditor.cents, debtor.cents);
    transfers.push({ from: debtor.userId, to: creditor.userId, cents });
    creditor.cents -= cents;
    debtor.cents -= cents;
    if (creditor.cents === 0) ci += 1;
    if (debtor.cents === 0) di += 1;
  }
  return transfers;
}
