import type { GroupRole, MemberDto } from '@splitt/shared';
import type { Db } from '../db/connection.js';

export interface GroupRow {
  id: number;
  name: string;
  default_currency: string;
  created_by: number;
  archived_at: string | null;
}

export interface MemberRow {
  group_id: number;
  user_id: number;
  role: GroupRole;
  joined_at: string;
  left_at: string | null;
}

export interface GroupSummaryRow extends GroupRow {
  role: GroupRole;
  member_count: number;
}

export class GroupRepository {
  constructor(private readonly db: Db) {}

  create(name: string, createdBy: number, now: string): number {
    const result = this.db
      .prepare('INSERT INTO expense_groups (name, created_by, created_at) VALUES (?, ?, ?)')
      .run(name, createdBy, now);
    return Number(result.lastInsertRowid);
  }

  findById(id: number): GroupRow | undefined {
    return this.db
      .prepare('SELECT id, name, default_currency, created_by, archived_at FROM expense_groups WHERE id = ?')
      .get(id) as GroupRow | undefined;
  }

  rename(id: number, name: string): void {
    this.db.prepare('UPDATE expense_groups SET name = ? WHERE id = ?').run(name, id);
  }

  archive(id: number, now: string): void {
    this.db.prepare('UPDATE expense_groups SET archived_at = ? WHERE id = ?').run(now, id);
  }

  /** Groups where the user is an active member, with active member counts. */
  listForUser(userId: number): GroupSummaryRow[] {
    return this.db
      .prepare(
        `SELECT g.id, g.name, g.default_currency, g.created_by, g.archived_at, gm.role,
                (SELECT COUNT(*) FROM group_members m
                 WHERE m.group_id = g.id AND m.left_at IS NULL) AS member_count
         FROM expense_groups g
         JOIN group_members gm ON gm.group_id = g.id
         WHERE gm.user_id = ? AND gm.left_at IS NULL
         ORDER BY g.archived_at IS NOT NULL, g.name COLLATE NOCASE`,
      )
      .all(userId) as GroupSummaryRow[];
  }

  /** All members ever (incl. those who left) — history needs their names. */
  members(groupId: number): MemberDto[] {
    return (
      this.db
        .prepare(
          `SELECT gm.user_id AS userId, u.name, gm.role, gm.joined_at AS joinedAt, gm.left_at AS leftAt
           FROM group_members gm JOIN users u ON u.id = gm.user_id
           WHERE gm.group_id = ?
           ORDER BY gm.joined_at, gm.user_id`,
        )
        .all(groupId) as MemberDto[]
    );
  }

  findMember(groupId: number, userId: number): MemberRow | undefined {
    return this.db
      .prepare('SELECT group_id, user_id, role, joined_at, left_at FROM group_members WHERE group_id = ? AND user_id = ?')
      .get(groupId, userId) as MemberRow | undefined;
  }

  addMember(groupId: number, userId: number, role: GroupRole, now: string): void {
    this.db
      .prepare('INSERT INTO group_members (group_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)')
      .run(groupId, userId, role, now);
  }

  reactivateMember(groupId: number, userId: number, now: string): void {
    this.db
      .prepare('UPDATE group_members SET left_at = NULL, joined_at = ? WHERE group_id = ? AND user_id = ?')
      .run(now, groupId, userId);
  }

  markLeft(groupId: number, userId: number, now: string): void {
    this.db
      .prepare('UPDATE group_members SET left_at = ? WHERE group_id = ? AND user_id = ?')
      .run(now, groupId, userId);
  }
}
