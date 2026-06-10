import type { ActivityDto } from '@splitt/shared';
import type { Db } from '../db/connection.js';

export class ActivityRepository {
  constructor(private readonly db: Db) {}

  add(
    groupId: number,
    actorId: number,
    kind: string,
    refId: number | null,
    payload: Record<string, unknown>,
    now: string,
  ): void {
    this.db
      .prepare(
        'INSERT INTO activity (group_id, actor_id, kind, ref_id, payload, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .run(groupId, actorId, kind, refId, JSON.stringify(payload), now);
  }

  listByGroup(groupId: number, limit: number): ActivityDto[] {
    const rows = this.db
      .prepare(
        `SELECT a.id, a.kind, a.actor_id AS actorId, u.name AS actorName,
                a.ref_id AS refId, a.payload, a.created_at AS createdAt
         FROM activity a JOIN users u ON u.id = a.actor_id
         WHERE a.group_id = ?
         ORDER BY a.id DESC LIMIT ?`,
      )
      .all(groupId, limit) as (Omit<ActivityDto, 'payload'> & { payload: string })[];
    return rows.map((r) => ({ ...r, payload: JSON.parse(r.payload) as Record<string, unknown> }));
  }
}
