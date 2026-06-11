import {
  participantsOf,
  resolveSplit,
  SplitError,
  type ExpenseDto,
  type ExpenseInput,
  type SettlementInput,
  type UserDto,
} from '@splitt/shared';
import type { Db } from '../db/connection.js';
import { badRequest, conflict, notFound } from '../errors.js';
import { nowIso } from '../util.js';
import type { ExpenseRepository, ExpenseWrite } from '../repositories/expenses.js';
import type { GroupRepository, GroupRow } from '../repositories/groups.js';
import type { CategoryRepository } from '../repositories/categories.js';
import type { ActivityRepository } from '../repositories/activity.js';

export class ExpenseService {
  constructor(
    private readonly db: Db,
    private readonly expenses: ExpenseRepository,
    private readonly groups: GroupRepository,
    private readonly categories: CategoryRepository,
    private readonly activity: ActivityRepository,
  ) {}

  list(groupId: number, limit: number, offset: number): ExpenseDto[] {
    return this.expenses.listByGroup(groupId, limit, offset);
  }

  get(groupId: number, expenseId: number): ExpenseDto {
    const expense = this.expenses.findById(expenseId);
    if (!expense || expense.groupId !== groupId) throw notFound('Expense not found');
    return expense;
  }

  createExpense(actor: UserDto, group: GroupRow, input: ExpenseInput): ExpenseDto {
    const { write, splits } = this.prepare(group, input);
    const id = this.db.transaction(() => {
      const expenseId = this.expenses.create(write, splits, actor.id, nowIso());
      this.logActivity(group.id, actor.id, 'expense_added', expenseId, write);
      return expenseId;
    })();
    return this.expenses.findById(id)!;
  }

  updateExpense(actor: UserDto, group: GroupRow, expenseId: number, input: ExpenseInput): ExpenseDto {
    const existing = this.get(group.id, expenseId);
    if (existing.type !== 'expense') {
      throw conflict('This is a settlement — edit it via the settle-up form');
    }
    const { write, splits } = this.prepare(group, input);
    this.db.transaction(() => {
      this.expenses.update(expenseId, write, splits, nowIso());
      this.logActivity(group.id, actor.id, 'expense_updated', expenseId, write);
    })();
    return this.expenses.findById(expenseId)!;
  }

  createSettlement(actor: UserDto, group: GroupRow, input: SettlementInput): ExpenseDto {
    const { write, splits } = this.prepareSettlement(group, input);
    const id = this.db.transaction(() => {
      const expenseId = this.expenses.create(write, splits, actor.id, nowIso());
      this.activity.add(
        group.id, actor.id, 'settlement_added', expenseId,
        { amountCents: input.amountCents, from: input.payerId, to: input.recipientId }, nowIso(),
      );
      return expenseId;
    })();
    return this.expenses.findById(id)!;
  }

  updateSettlement(actor: UserDto, group: GroupRow, expenseId: number, input: SettlementInput): ExpenseDto {
    const existing = this.get(group.id, expenseId);
    if (existing.type !== 'settlement') {
      throw conflict('This is an expense — edit it via the expense form');
    }
    const { write, splits } = this.prepareSettlement(group, input);
    this.db.transaction(() => {
      this.expenses.update(expenseId, write, splits, nowIso());
      this.activity.add(
        group.id, actor.id, 'settlement_updated', expenseId,
        { amountCents: input.amountCents, from: input.payerId, to: input.recipientId }, nowIso(),
      );
    })();
    return this.expenses.findById(expenseId)!;
  }

  private prepareSettlement(group: GroupRow, input: SettlementInput) {
    this.requireNotArchived(group);
    this.requireActiveMembers(group.id, [input.payerId, input.recipientId]);
    this.requireRealDate(input.date);
    const write: ExpenseWrite = {
      groupId: group.id,
      type: 'settlement',
      title: 'Settled up',
      amountCents: input.amountCents,
      currency: group.default_currency,
      categoryId: null,
      date: input.date,
      paidBy: input.payerId,
      splitMethod: 'exact',
      splitInput: { method: 'exact', amounts: [{ userId: input.recipientId, cents: input.amountCents }] },
      notes: input.notes ?? null,
    };
    const splits = [{ userId: input.recipientId, cents: input.amountCents }];
    return { write, splits };
  }

  remove(actor: UserDto, group: GroupRow, expenseId: number): void {
    const existing = this.get(group.id, expenseId);
    this.db.transaction(() => {
      this.expenses.softDelete(expenseId, nowIso());
      this.activity.add(
        group.id, actor.id,
        existing.type === 'settlement' ? 'settlement_deleted' : 'expense_deleted',
        expenseId, { title: existing.title, amountCents: existing.amountCents }, nowIso(),
      );
    })();
  }

  /** Shared validation + split resolution for create and update. */
  private prepare(group: GroupRow, input: ExpenseInput) {
    this.requireNotArchived(group);
    this.requireRealDate(input.date);
    const categoryId = input.categoryId ?? null;
    if (categoryId !== null) {
      const category = this.categories.findById(categoryId);
      if (!category || category.groupId !== group.id) {
        throw badRequest('Unknown category');
      }
    }
    const involved = [input.paidBy, ...participantsOf(input.split)];
    this.requireActiveMembers(group.id, involved);
    let splits;
    try {
      splits = resolveSplit(input.amountCents, input.split);
    } catch (err) {
      if (err instanceof SplitError) throw badRequest(err.message);
      throw err;
    }
    const write: ExpenseWrite = {
      groupId: group.id,
      type: 'expense',
      title: input.title,
      amountCents: input.amountCents,
      currency: group.default_currency,
      categoryId,
      date: input.date,
      paidBy: input.paidBy,
      splitMethod: input.split.method,
      splitInput: input.split,
      notes: input.notes ?? null,
    };
    return { write, splits };
  }

  private requireActiveMembers(groupId: number, userIds: number[]): void {
    for (const userId of new Set(userIds)) {
      const membership = this.groups.findMember(groupId, userId);
      if (!membership || membership.left_at) {
        throw badRequest('All involved people must be active group members');
      }
    }
  }

  private requireNotArchived(group: GroupRow): void {
    if (group.archived_at) throw conflict('This group is archived');
  }

  private requireRealDate(date: string): void {
    if (Number.isNaN(Date.parse(date))) throw badRequest('Invalid date');
  }

  private logActivity(groupId: number, actorId: number, kind: string, refId: number, write: ExpenseWrite): void {
    this.activity.add(groupId, actorId, kind, refId, { title: write.title, amountCents: write.amountCents }, nowIso());
  }
}
