import { computeNetBalances, simplifyDebts, type BalancesDto } from '@iou/shared';
import type { ExpenseRepository } from '../repositories/expenses.js';
import type { GroupRepository } from '../repositories/groups.js';

export class BalanceService {
  constructor(
    private readonly expenses: ExpenseRepository,
    private readonly groups: GroupRepository,
  ) {}

  getBalances(groupId: number): BalancesDto {
    const net = computeNetBalances(this.expenses.listTransactions(groupId));
    const members = this.groups.members(groupId);
    // Active members always appear (with 0 if they have no transactions);
    // former members only appear while something is still unsettled.
    const visible = members.filter((m) => m.leftAt === null || (net.get(m.userId) ?? 0) !== 0);
    const full = new Map<number, number>();
    for (const m of visible) full.set(m.userId, net.get(m.userId) ?? 0);
    return {
      members: visible.map((m) => ({
        userId: m.userId,
        name: m.name,
        balanceCents: full.get(m.userId) ?? 0,
      })),
      transfers: simplifyDebts(full),
    };
  }

  memberBalance(groupId: number, userId: number): number {
    return computeNetBalances(this.expenses.listTransactions(groupId)).get(userId) ?? 0;
  }
}
