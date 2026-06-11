import type { ExpenseDto, ExpenseType, Share, SplitInput, SplitMethod, TransactionLike } from '@splitt/shared';
import type { Db } from '../db/connection.js';

interface ExpenseRowRaw {
  id: number;
  group_id: number;
  type: ExpenseType;
  title: string;
  amount_cents: number;
  currency: string;
  category_id: number | null;
  date: string;
  paid_by: number;
  split_method: SplitMethod;
  split_input: string;
  notes: string | null;
  created_by: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface ExpenseWrite {
  groupId: number;
  type: ExpenseType;
  title: string;
  amountCents: number;
  currency: string;
  categoryId: number | null;
  date: string;
  paidBy: number;
  splitMethod: SplitMethod;
  splitInput: SplitInput;
  notes: string | null;
}

const EXPENSE_COLUMNS = `id, group_id, type, title, amount_cents, currency, category_id, date,
  paid_by, split_method, split_input, notes, created_by, created_at, updated_at, deleted_at`;

function toDto(row: ExpenseRowRaw, splits: Share[]): ExpenseDto {
  return {
    id: row.id,
    groupId: row.group_id,
    type: row.type,
    title: row.title,
    amountCents: row.amount_cents,
    currency: row.currency,
    categoryId: row.category_id,
    date: row.date,
    paidBy: row.paid_by,
    splitMethod: row.split_method,
    splitInput: JSON.parse(row.split_input) as SplitInput,
    notes: row.notes,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    splits,
  };
}

export class ExpenseRepository {
  constructor(private readonly db: Db) {}

  /** Insert expense + splits atomically. */
  create(data: ExpenseWrite, splits: Share[], createdBy: number, now: string): number {
    return this.db.transaction(() => {
      const result = this.db
        .prepare(
          `INSERT INTO expenses (group_id, type, title, amount_cents, currency, category_id, date,
             paid_by, split_method, split_input, notes, created_by, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          data.groupId, data.type, data.title, data.amountCents, data.currency, data.categoryId,
          data.date, data.paidBy, data.splitMethod, JSON.stringify(data.splitInput), data.notes,
          createdBy, now, now,
        );
      const id = Number(result.lastInsertRowid);
      this.insertSplits(id, splits);
      return id;
    })();
  }

  update(id: number, data: ExpenseWrite, splits: Share[], now: string): void {
    this.db.transaction(() => {
      this.db
        .prepare(
          `UPDATE expenses SET title = ?, amount_cents = ?, category_id = ?, date = ?,
             paid_by = ?, split_method = ?, split_input = ?, notes = ?, updated_at = ?
           WHERE id = ?`,
        )
        .run(
          data.title, data.amountCents, data.categoryId, data.date, data.paidBy,
          data.splitMethod, JSON.stringify(data.splitInput), data.notes, now, id,
        );
      this.db.prepare('DELETE FROM expense_splits WHERE expense_id = ?').run(id);
      this.insertSplits(id, splits);
    })();
  }

  private insertSplits(expenseId: number, splits: Share[]): void {
    const insert = this.db.prepare(
      'INSERT INTO expense_splits (expense_id, user_id, share_cents) VALUES (?, ?, ?)',
    );
    for (const split of splits) insert.run(expenseId, split.userId, split.cents);
  }

  softDelete(id: number, now: string): void {
    this.db.prepare('UPDATE expenses SET deleted_at = ?, updated_at = ? WHERE id = ?').run(now, now, id);
  }

  findById(id: number): ExpenseDto | undefined {
    const row = this.db
      .prepare(`SELECT ${EXPENSE_COLUMNS} FROM expenses WHERE id = ? AND deleted_at IS NULL`)
      .get(id) as ExpenseRowRaw | undefined;
    if (!row) return undefined;
    return toDto(row, this.splitsFor([row.id]).get(row.id) ?? []);
  }

  listByGroup(groupId: number, limit: number, offset: number): ExpenseDto[] {
    const rows = this.db
      .prepare(
        `SELECT ${EXPENSE_COLUMNS} FROM expenses
         WHERE group_id = ? AND deleted_at IS NULL
         ORDER BY date DESC, id DESC LIMIT ? OFFSET ?`,
      )
      .all(groupId, limit, offset) as ExpenseRowRaw[];
    const splits = this.splitsFor(rows.map((r) => r.id));
    return rows.map((row) => toDto(row, splits.get(row.id) ?? []));
  }

  /** Minimal data for balance computation over a whole group. */
  listTransactions(groupId: number): TransactionLike[] {
    const rows = this.db
      .prepare(
        `SELECT id, paid_by, amount_cents FROM expenses
         WHERE group_id = ? AND deleted_at IS NULL`,
      )
      .all(groupId) as { id: number; paid_by: number; amount_cents: number }[];
    const splits = this.splitsFor(rows.map((r) => r.id));
    return rows.map((r) => ({
      paidBy: r.paid_by,
      amountCents: r.amount_cents,
      splits: splits.get(r.id) ?? [],
    }));
  }

  private splitsFor(expenseIds: number[]): Map<number, Share[]> {
    const result = new Map<number, Share[]>();
    if (expenseIds.length === 0) return result;
    const placeholders = expenseIds.map(() => '?').join(',');
    const rows = this.db
      .prepare(
        `SELECT expense_id, user_id AS userId, share_cents AS cents
         FROM expense_splits WHERE expense_id IN (${placeholders})
         ORDER BY user_id`,
      )
      .all(...expenseIds) as { expense_id: number; userId: number; cents: number }[];
    for (const row of rows) {
      const list = result.get(row.expense_id) ?? [];
      list.push({ userId: row.userId, cents: row.cents });
      result.set(row.expense_id, list);
    }
    return result;
  }

  /** True if any non-deleted expense in the group involves this user,
   * as payer or split participant. */
  hasInvolvement(groupId: number, userId: number): boolean {
    const row = this.db
      .prepare(
        `SELECT EXISTS(
           SELECT 1 FROM expenses e
           WHERE e.group_id = ? AND e.deleted_at IS NULL AND e.paid_by = ?
         ) OR EXISTS(
           SELECT 1 FROM expense_splits s
           JOIN expenses e ON e.id = s.expense_id
           WHERE e.group_id = ? AND e.deleted_at IS NULL AND s.user_id = ?
         ) AS involved`,
      )
      .get(groupId, userId, groupId, userId) as { involved: 0 | 1 };
    return Boolean(row.involved);
  }

  /** Spending per category for one month ("YYYY-MM"). Settlements are money
   * moving, not money spent — they're excluded. */
  monthlyStats(groupId: number, month: string): { categoryId: number | null; cents: number; count: number }[] {
    return this.db
      .prepare(
        `SELECT category_id AS categoryId, SUM(amount_cents) AS cents, COUNT(*) AS count
         FROM expenses
         WHERE group_id = ? AND type = 'expense' AND deleted_at IS NULL AND date LIKE ? || '-%'
         GROUP BY category_id
         ORDER BY cents DESC`,
      )
      .all(groupId, month) as { categoryId: number | null; cents: number; count: number }[];
  }

  /** The current user's net balance in every group they touch (dashboard). */
  balancesByGroupForUser(userId: number): Map<number, number> {
    const balances = new Map<number, number>();
    const paid = this.db
      .prepare(
        `SELECT group_id, SUM(amount_cents) AS cents FROM expenses
         WHERE paid_by = ? AND deleted_at IS NULL GROUP BY group_id`,
      )
      .all(userId) as { group_id: number; cents: number }[];
    for (const row of paid) balances.set(row.group_id, row.cents);
    const owed = this.db
      .prepare(
        `SELECT e.group_id, SUM(s.share_cents) AS cents
         FROM expense_splits s JOIN expenses e ON e.id = s.expense_id
         WHERE s.user_id = ? AND e.deleted_at IS NULL GROUP BY e.group_id`,
      )
      .all(userId) as { group_id: number; cents: number }[];
    for (const row of owed) balances.set(row.group_id, (balances.get(row.group_id) ?? 0) - row.cents);
    return balances;
  }
}
