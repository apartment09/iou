import type { CategoryDto } from '@iou/shared';
import type { Db } from '../db/connection.js';

/** Every new group starts with these (Lucide icon names). Fully editable
 * afterwards — categories are owned by their group. */
export const DEFAULT_CATEGORIES: { name: string; icon: string }[] = [
  { name: 'Groceries', icon: 'shopping-cart' },
  { name: 'Dining', icon: 'utensils' },
  { name: 'Transport', icon: 'bus' },
  { name: 'Home', icon: 'house' },
  { name: 'Travel', icon: 'plane' },
  { name: 'Entertainment', icon: 'clapperboard' },
  { name: 'Other', icon: 'package' },
];

export class CategoryRepository {
  constructor(private readonly db: Db) {}

  listForGroup(groupId: number): CategoryDto[] {
    return this.db
      .prepare(
        `SELECT id, group_id AS groupId, name, icon FROM categories
         WHERE group_id = ? ORDER BY name COLLATE NOCASE`,
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

  update(id: number, name: string, icon: string): void {
    this.db.prepare('UPDATE categories SET name = ?, icon = ? WHERE id = ?').run(name, icon, id);
  }

  /** Expenses keep their rows — the FK sets their category to NULL ("Default"). */
  delete(id: number): void {
    this.db.prepare('DELETE FROM categories WHERE id = ?').run(id);
  }

  seedDefaults(groupId: number): void {
    const insert = this.db.prepare('INSERT INTO categories (group_id, name, icon) VALUES (?, ?, ?)');
    for (const category of DEFAULT_CATEGORIES) insert.run(groupId, category.name, category.icon);
  }
}
