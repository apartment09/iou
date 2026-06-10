import type { Db } from '../db/connection.js';

export interface InviteRow {
  id: number;
  token: string;
  kind: 'account' | 'group';
  group_id: number | null;
  created_by: number;
  expires_at: string;
  used_by: number | null;
  used_at: string | null;
}

export class InviteRepository {
  constructor(private readonly db: Db) {}

  create(input: {
    token: string;
    kind: 'account' | 'group';
    groupId: number | null;
    createdBy: number;
    now: string;
    expiresAt: string;
  }): number {
    const result = this.db
      .prepare(
        `INSERT INTO invites (token, kind, group_id, created_by, created_at, expires_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(input.token, input.kind, input.groupId, input.createdBy, input.now, input.expiresAt);
    return Number(result.lastInsertRowid);
  }

  findByToken(token: string): InviteRow | undefined {
    return this.db
      .prepare(
        `SELECT id, token, kind, group_id, created_by, expires_at, used_by, used_at
         FROM invites WHERE token = ?`,
      )
      .get(token) as InviteRow | undefined;
  }

  markUsed(id: number, userId: number, now: string): void {
    this.db.prepare('UPDATE invites SET used_by = ?, used_at = ? WHERE id = ?').run(userId, now, id);
  }
}
