import type { GroupDetailDto, GroupSummaryDto, UserDto } from '@splitt/shared';
import type { Db } from '../db/connection.js';
import { conflict, forbidden, notFound } from '../errors.js';
import { nowIso } from '../util.js';
import type { GroupRepository, GroupRow } from '../repositories/groups.js';
import type { ExpenseRepository } from '../repositories/expenses.js';
import type { ActivityRepository } from '../repositories/activity.js';
import type { BalanceService } from './balances.js';

export class GroupService {
  constructor(
    private readonly db: Db,
    private readonly groups: GroupRepository,
    private readonly expenses: ExpenseRepository,
    private readonly activity: ActivityRepository,
    private readonly balances: BalanceService,
  ) {}

  listForUser(userId: number): GroupSummaryDto[] {
    const myBalances = this.expenses.balancesByGroupForUser(userId);
    return this.groups.listForUser(userId).map((g) => ({
      id: g.id,
      name: g.name,
      defaultCurrency: g.default_currency,
      memberCount: g.member_count,
      myBalanceCents: myBalances.get(g.id) ?? 0,
      archivedAt: g.archived_at,
    }));
  }

  create(actor: UserDto, name: string): GroupDetailDto {
    const now = nowIso();
    const id = this.db.transaction(() => {
      const groupId = this.groups.create(name, actor.id, now);
      this.groups.addMember(groupId, actor.id, 'owner', now);
      this.activity.add(groupId, actor.id, 'group_created', null, { name }, now);
      return groupId;
    })();
    return this.detail(this.groups.findById(id)!);
  }

  get(group: GroupRow): GroupDetailDto {
    return this.detail(group);
  }

  rename(actor: UserDto, group: GroupRow, name: string): GroupDetailDto {
    this.requireOwner(group.id, actor.id);
    this.groups.rename(group.id, name);
    this.activity.add(group.id, actor.id, 'group_renamed', null, { from: group.name, to: name }, nowIso());
    return this.detail(this.groups.findById(group.id)!);
  }

  archive(actor: UserDto, group: GroupRow): void {
    this.requireOwner(group.id, actor.id);
    if (group.archived_at) return;
    const now = nowIso();
    this.groups.archive(group.id, now);
    this.activity.add(group.id, actor.id, 'group_archived', null, { name: group.name }, now);
  }

  leave(actor: UserDto, group: GroupRow): void {
    const membership = this.groups.findMember(group.id, actor.id);
    if (!membership || membership.left_at) throw notFound('Group not found');
    if (membership.role === 'owner') {
      throw conflict('The owner cannot leave — archive the group instead');
    }
    this.requireSettled(group.id, actor.id, 'You still have an open balance — settle up first');
    const now = nowIso();
    this.groups.markLeft(group.id, actor.id, now);
    this.activity.add(group.id, actor.id, 'member_left', null, { userName: actor.name }, now);
  }

  removeMember(actor: UserDto, group: GroupRow, userId: number): void {
    this.requireOwner(group.id, actor.id);
    if (userId === actor.id) throw conflict('Use archive instead of removing yourself');
    const membership = this.groups.findMember(group.id, userId);
    if (!membership || membership.left_at) throw notFound('Member not found');
    this.requireSettled(group.id, userId, 'This member still has an open balance — settle up first');
    const now = nowIso();
    const name = this.groups.members(group.id).find((m) => m.userId === userId)?.name;
    this.groups.markLeft(group.id, userId, now);
    this.activity.add(group.id, actor.id, 'member_removed', null, { userName: name }, now);
  }

  private requireSettled(groupId: number, userId: number, message: string): void {
    if (this.balances.memberBalance(groupId, userId) !== 0) throw conflict(message);
  }

  private requireOwner(groupId: number, userId: number): void {
    const membership = this.groups.findMember(groupId, userId);
    if (membership?.role !== 'owner' || membership.left_at) {
      throw forbidden('Only the group owner can do this');
    }
  }

  private detail(group: GroupRow): GroupDetailDto {
    return {
      id: group.id,
      name: group.name,
      defaultCurrency: group.default_currency,
      createdBy: group.created_by,
      archivedAt: group.archived_at,
      members: this.groups.members(group.id),
    };
  }
}
