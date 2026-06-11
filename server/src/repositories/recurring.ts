import type { RecurringExpenseDto, SplitInput, SplitMethod } from '@iou/shared';
import type { Db } from '../db/connection.js';

export interface RecurringRow {
  id: number;
  group_id: number;
  title: string;
  amount_cents: number;
  currency: string;
  category_id: number | null;
  paid_by: number;
  split_method: SplitMethod;
  split_input: string;
  notes: string | null;
  frequency: 'weekly' | 'monthly';
  next_date: string;
  anchor_day: number;
  created_by: number;
}

const COLUMNS = `id, group_id, title, amount_cents, currency, category_id, paid_by,
  split_method, split_input, notes, frequency, next_date, anchor_day, created_by`;

export function toRecurringDto(row: RecurringRow): RecurringExpenseDto {
  return {
    id: row.id,
    groupId: row.group_id,
    title: row.title,
    amountCents: row.amount_cents,
    currency: row.currency,
    categoryId: row.category_id,
    paidBy: row.paid_by,
    splitMethod: row.split_method,
    splitInput: JSON.parse(row.split_input) as SplitInput,
    notes: row.notes,
    frequency: row.frequency,
    nextDate: row.next_date,
    createdBy: row.created_by,
  };
}

export class RecurringRepository {
  constructor(private readonly db: Db) {}

  create(input: {
    groupId: number;
    title: string;
    amountCents: number;
    currency: string;
    categoryId: number | null;
    paidBy: number;
    splitInput: SplitInput;
    notes: string | null;
    frequency: 'weekly' | 'monthly';
    nextDate: string;
    anchorDay: number;
    createdBy: number;
    now: string;
  }): number {
    const result = this.db
      .prepare(
        `INSERT INTO recurring_expenses (group_id, title, amount_cents, currency, category_id,
           paid_by, split_method, split_input, notes, frequency, next_date, anchor_day,
           created_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.groupId, input.title, input.amountCents, input.currency, input.categoryId,
        input.paidBy, input.splitInput.method, JSON.stringify(input.splitInput), input.notes,
        input.frequency, input.nextDate, input.anchorDay, input.createdBy, input.now,
      );
    return Number(result.lastInsertRowid);
  }

  findById(id: number): RecurringRow | undefined {
    return this.db
      .prepare(`SELECT ${COLUMNS} FROM recurring_expenses WHERE id = ?`)
      .get(id) as RecurringRow | undefined;
  }

  listByGroup(groupId: number): RecurringRow[] {
    return this.db
      .prepare(`SELECT ${COLUMNS} FROM recurring_expenses WHERE group_id = ? ORDER BY next_date, id`)
      .all(groupId) as RecurringRow[];
  }

  listDue(today: string): RecurringRow[] {
    return this.db
      .prepare(`SELECT ${COLUMNS} FROM recurring_expenses WHERE next_date <= ? ORDER BY id`)
      .all(today) as RecurringRow[];
  }

  setNextDate(id: number, nextDate: string): void {
    this.db.prepare('UPDATE recurring_expenses SET next_date = ? WHERE id = ?').run(nextDate, id);
  }

  delete(id: number): void {
    this.db.prepare('DELETE FROM recurring_expenses WHERE id = ?').run(id);
  }
}
