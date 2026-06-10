import type { CategoryDto } from '@splitt/shared';
import type { Db } from '../db/connection.js';

export class CategoryRepository {
  constructor(private readonly db: Db) {}

  /** Built-in defaults (group_id NULL) plus the group's own categories. */
  listForGroup(groupId: number): CategoryDto[] {
    return this.db
      .prepare(
        `SELECT id, group_id AS groupId, name, icon FROM categories
         WHERE group_id IS NULL OR group_id = ?
         ORDER BY group_id IS NOT NULL, name COLLATE NOCASE`,
      )
      .all(groupId) as CategoryDto[];
  }

  findById(id: number): CategoryDto | undefined {
    return this.db
      .prepare('SELECT id, group_id AS groupId, name, icon FROM categories WHERE id = ?')
      .get(id) as CategoryDto | undefined;
  }

  create(groupId: number, name: string, icon: string): CategoryDto {
    const result = this.db
      .prepare('INSERT INTO categories (group_id, name, icon) VALUES (?, ?, ?)')
      .run(groupId, name, icon);
    return { id: Number(result.lastInsertRowid), groupId, name, icon };
  }
}
