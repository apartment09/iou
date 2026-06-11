import type { Db } from '../db/connection.js';

export interface InviteRow {
  id: number;
  token: string;
  group_id: number;
  created_by: number;
  expires_at: string;
}

export class InviteRepository {
  constructor(private readonly db: Db) {}

  create(input: {
    token: string;
    groupId: number;
    createdBy: number;
    now: string;
    expiresAt: string;
  }): number {
    const result = this.db
      .prepare(
        `INSERT INTO invites (token, kind, group_id, created_by, created_at, expires_at)
         VALUES (?, 'group', ?, ?, ?, ?)`,
      )
      .run(input.token, input.groupId, input.createdBy, input.now, input.expiresAt);
    return Number(result.lastInsertRowid);
  }

  findByToken(token: string): InviteRow | undefined {
    return this.db
      .prepare(
        `SELECT id, token, group_id, created_by, expires_at
         FROM invites WHERE token = ? AND kind = 'group'`,
      )
      .get(token) as InviteRow | undefined;
  }
}
