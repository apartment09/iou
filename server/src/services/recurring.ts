import {
  participantsOf,
  resolveSplit,
  SplitError,
  type RecurringExpenseDto,
  type RecurringExpenseInput,
  type UserDto,
} from '@iou/shared';
import { badRequest, conflict, notFound } from '../errors.js';
import { nowIso } from '../util.js';
import type { RecurringRepository, RecurringRow } from '../repositories/recurring.js';
import { toRecurringDto } from '../repositories/recurring.js';
import type { GroupRepository, GroupRow } from '../repositories/groups.js';
import type { UserRepository } from '../repositories/users.js';
import type { CategoryRepository } from '../repositories/categories.js';
import type { ActivityRepository } from '../repositories/activity.js';
import type { ExpenseService } from './expenses.js';

/** "2026-01-31" + monthly with anchorDay 31 → 2026-02-28 → 2026-03-31:
 * short months clamp, but the anchor day is never forgotten. */
export function advanceDate(date: string, frequency: 'weekly' | 'monthly', anchorDay: number): string {
  const [y = 0, m = 1, d = 1] = date.split('-').map(Number);
  if (frequency === 'weekly') {
    const next = new Date(Date.UTC(y, m - 1, d + 7));
    return next.toISOString().slice(0, 10);
  }
  const nextMonth = m === 12 ? { year: y + 1, month: 1 } : { year: y, month: m + 1 };
  const daysInMonth = new Date(Date.UTC(nextMonth.year, nextMonth.month, 0)).getUTCDate();
  const day = Math.min(anchorDay, daysInMonth);
  return `${nextMonth.year}-${String(nextMonth.month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// A typo'd start date far in the past must not flood the group on the next
// tick — catch-up is capped per template per tick.
const MAX_CATCHUP = 24;

export class RecurringService {
  constructor(
    private readonly recurring: RecurringRepository,
    private readonly groups: GroupRepository,
    private readonly users: UserRepository,
    private readonly categories: CategoryRepository,
    private readonly activity: ActivityRepository,
    private readonly expenses: ExpenseService,
  ) {}

  list(groupId: number): RecurringExpenseDto[] {
    return this.recurring.listByGroup(groupId).map(toRecurringDto);
  }

  create(actor: UserDto, group: GroupRow, input: RecurringExpenseInput): RecurringExpenseDto {
    if (group.archived_at) throw conflict('This group is archived');
    if (Number.isNaN(Date.parse(input.startDate))) throw badRequest('Invalid date');
    const categoryId = input.categoryId ?? null;
    if (categoryId !== null) {
      const category = this.categories.findById(categoryId);
      if (!category || category.groupId !== group.id) throw badRequest('Unknown category');
    }
    this.requireActiveMembers(group.id, [input.paidBy, ...participantsOf(input.split)]);
    try {
      resolveSplit(input.amountCents, input.split);
    } catch (err) {
      if (err instanceof SplitError) throw badRequest(err.message);
      throw err;
    }
    const anchorDay = Number(input.startDate.slice(8, 10));
    const id = this.recurring.create({
      groupId: group.id,
      title: input.title,
      amountCents: input.amountCents,
      currency: group.default_currency,
      categoryId,
      paidBy: input.paidBy,
      splitInput: input.split,
      notes: input.notes ?? null,
      frequency: input.frequency,
      nextDate: input.startDate,
      anchorDay,
      createdBy: actor.id,
      now: nowIso(),
    });
    return toRecurringDto(this.recurring.findById(id)!);
  }

  remove(group: GroupRow, id: number): void {
    const row = this.recurring.findById(id);
    if (!row || row.group_id !== group.id) throw notFound('Recurring expense not found');
    this.recurring.delete(id);
  }

  /** Generate all due expenses up to (and including) `today`. Idempotent:
   * next_date always moves past today, so re-ticking creates nothing new. */
  tick(today: string): void {
    for (const template of this.recurring.listDue(today)) {
      try {
        this.generate(template, today);
      } catch (err) {
        // One broken template must not stall the others.
        console.error(`recurring template ${template.id} failed:`, err);
      }
    }
  }

  private generate(template: RecurringRow, today: string): void {
    const group = this.groups.findById(template.group_id);
    if (!group || group.archived_at) return; // dormant while archived
    const creator = this.users.findById(template.created_by);
    if (!creator) return;
    const actor = this.users.toDto(creator);

    // A deleted category must not stop the rent — fall back to Default.
    let categoryId = template.category_id;
    if (categoryId !== null) {
      const category = this.categories.findById(categoryId);
      if (!category || category.groupId !== group.id) categoryId = null;
    }

    let nextDate = template.next_date;
    let generated = 0;
    while (nextDate <= today && generated < MAX_CATCHUP) {
      try {
        this.expenses.createExpense(actor, group, {
          title: template.title,
          amountCents: template.amount_cents,
          date: nextDate,
          categoryId,
          paidBy: template.paid_by,
          split: toRecurringDto(template).splitInput,
          notes: template.notes ?? undefined,
        });
      } catch (err) {
        // e.g. a participant left the group — keep the schedule moving and
        // leave a trace instead of silently dropping the rent.
        this.activity.add(
          group.id, actor.id, 'recurring_skipped', template.id,
          { title: template.title, reason: err instanceof Error ? err.message : String(err) },
          nowIso(),
        );
      }
      nextDate = advanceDate(nextDate, template.frequency, template.anchor_day);
      generated += 1;
    }
    // Anything beyond the cap is skipped for good, not deferred — otherwise a
    // typo'd year would keep flooding the group tick after tick.
    while (nextDate <= today) {
      nextDate = advanceDate(nextDate, template.frequency, template.anchor_day);
    }
    this.recurring.setNextDate(template.id, nextDate);
  }

  private requireActiveMembers(groupId: number, userIds: number[]): void {
    for (const userId of new Set(userIds)) {
      const membership = this.groups.findMember(groupId, userId);
      if (!membership || membership.left_at) {
        throw badRequest('All involved people must be active group members');
      }
    }
  }
}
