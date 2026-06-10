import type { UserDto } from '@splitt/shared';
import type { Db } from '../db/connection.js';

export interface UserRow {
  id: number;
  email: string;
  name: string;
  password_hash: string;
}

export class UserRepository {
  constructor(private readonly db: Db) {}

  count(): number {
    return (this.db.prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number }).n;
  }

  create(email: string, name: string, passwordHash: string, now: string): UserDto {
    const result = this.db
      .prepare('INSERT INTO users (email, name, password_hash, created_at) VALUES (?, ?, ?, ?)')
      .run(email, name, passwordHash, now);
    return { id: Number(result.lastInsertRowid), email, name };
  }

  findByEmail(email: string): UserRow | undefined {
    return this.db
      .prepare('SELECT id, email, name, password_hash FROM users WHERE email = ?')
      .get(email) as UserRow | undefined;
  }

  findById(id: number): UserRow | undefined {
    return this.db
      .prepare('SELECT id, email, name, password_hash FROM users WHERE id = ?')
      .get(id) as UserRow | undefined;
  }
}
