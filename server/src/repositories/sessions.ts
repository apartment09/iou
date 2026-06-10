import type { UserDto } from '@splitt/shared';
import type { Db } from '../db/connection.js';

export class SessionRepository {
  constructor(private readonly db: Db) {}

  create(tokenHash: string, userId: number, now: string, expiresAt: string): void {
    this.db
      .prepare('INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
      .run(tokenHash, userId, now, expiresAt);
  }

  findUser(tokenHash: string, now: string): UserDto | undefined {
    return this.db
      .prepare(
        `SELECT u.id, u.email, u.name FROM sessions s
         JOIN users u ON u.id = s.user_id
         WHERE s.token_hash = ? AND s.expires_at > ?`,
      )
      .get(tokenHash, now) as UserDto | undefined;
  }

  delete(tokenHash: string): void {
    this.db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash);
  }

  deleteExpired(now: string): void {
    this.db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(now);
  }
}
