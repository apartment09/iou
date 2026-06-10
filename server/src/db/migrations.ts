/** Migrations are TS modules (not .sql files) so they ship inside dist/ with
 * no copy step. Append new entries — never edit applied ones. */

export const migrations: { id: string; sql: string }[] = [
  {
    id: '001_init',
    sql: `
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
) WITHOUT ROWID;
CREATE INDEX idx_sessions_user ON sessions(user_id);

CREATE TABLE expense_groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  default_currency TEXT NOT NULL DEFAULT 'EUR',
  created_by INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  archived_at TEXT
);

CREATE TABLE group_members (
  group_id INTEGER NOT NULL REFERENCES expense_groups(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
  joined_at TEXT NOT NULL,
  left_at TEXT,
  PRIMARY KEY (group_id, user_id)
);

CREATE TABLE invites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL CHECK (kind IN ('account', 'group')),
  group_id INTEGER REFERENCES expense_groups(id) ON DELETE CASCADE,
  created_by INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_by INTEGER REFERENCES users(id),
  used_at TEXT
);

CREATE TABLE categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  group_id INTEGER REFERENCES expense_groups(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  icon TEXT NOT NULL
);

CREATE TABLE expenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  group_id INTEGER NOT NULL REFERENCES expense_groups(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('expense', 'settlement')),
  title TEXT NOT NULL,
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  currency TEXT NOT NULL DEFAULT 'EUR',
  category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  date TEXT NOT NULL,
  paid_by INTEGER NOT NULL REFERENCES users(id),
  split_method TEXT NOT NULL,
  split_input TEXT NOT NULL,
  notes TEXT,
  created_by INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE INDEX idx_expenses_group ON expenses(group_id, date DESC, id DESC);

CREATE TABLE expense_splits (
  expense_id INTEGER NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id),
  share_cents INTEGER NOT NULL CHECK (share_cents >= 0),
  PRIMARY KEY (expense_id, user_id)
);
CREATE INDEX idx_splits_user ON expense_splits(user_id);

CREATE TABLE activity (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  group_id INTEGER NOT NULL REFERENCES expense_groups(id) ON DELETE CASCADE,
  actor_id INTEGER NOT NULL REFERENCES users(id),
  kind TEXT NOT NULL,
  ref_id INTEGER,
  payload TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);
CREATE INDEX idx_activity_group ON activity(group_id, id DESC);

INSERT INTO categories (group_id, name, icon) VALUES
  (NULL, 'Groceries', '🛒'),
  (NULL, 'Dining', '🍽️'),
  (NULL, 'Transport', '🚌'),
  (NULL, 'Home', '🏠'),
  (NULL, 'Travel', '✈️'),
  (NULL, 'Entertainment', '🎬'),
  (NULL, 'Other', '📦');
`,
  },
];
