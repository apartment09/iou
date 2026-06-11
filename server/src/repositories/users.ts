import type { UserDto } from '@iou/shared';
import type { Db } from '../db/connection.js';

export interface UserRow {
  id: number;
  username: string;
  name: string;
  password_hash: string;
  is_admin: 0 | 1;
}

const COLUMNS = 'id, username, name, password_hash, is_admin';

const toDto = (row: UserRow): UserDto => ({
  id: row.id,
  username: row.username,
  name: row.name,
  isAdmin: Boolean(row.is_admin),
});

export class UserRepository {
  constructor(private readonly db: Db) {}

  count(): number {
    return (this.db.prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number }).n;
  }

  list(): UserDto[] {
    const rows = this.db
      .prepare(`SELECT ${COLUMNS} FROM users ORDER BY name COLLATE NOCASE`)
      .all() as UserRow[];
    return rows.map(toDto);
  }

  create(username: string, name: string, passwordHash: string, isAdmin: boolean, now: string): UserDto {
    const result = this.db
      .prepare(
        'INSERT INTO users (username, name, password_hash, is_admin, created_at) VALUES (?, ?, ?, ?, ?)',
      )
      .run(username, name, passwordHash, isAdmin ? 1 : 0, now);
    return { id: Number(result.lastInsertRowid), username, name, isAdmin };
  }

  findByUsername(username: string): UserRow | undefined {
    return this.db
      .prepare(`SELECT ${COLUMNS} FROM users WHERE username = ?`)
      .get(username) as UserRow | undefined;
  }

  findById(id: number): UserRow | undefined {
    return this.db.prepare(`SELECT ${COLUMNS} FROM users WHERE id = ?`).get(id) as
      | UserRow
      | undefined;
  }

  updatePassword(id: number, passwordHash: string): void {
    this.db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(passwordHash, id);
  }

  toDto = toDto;
}
