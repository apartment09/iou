# Expense Tracker — Technical Plan

Companion to `CONCEPT.md`. Stack: **React + Vite + TypeScript** frontend,
**Node/Express + SQLite** backend, deployed on the Hetzner server behind nginx
with pm2 (same patterns as Recall and one·dot).

---

## 1. Repository layout (monorepo, npm workspaces)

```
expense-tracker/
├── shared/            # pure TypeScript, zero dependencies
│   └── src/
│       ├── types.ts           # domain types + API DTOs (one source of truth)
│       ├── money.ts           # cents arithmetic, formatting
│       ├── split.ts           # split strategies (equal/exact/percent/shares)
│       └── settlement.ts      # balance + debt-simplification algorithms
├── server/
│   └── src/
│       ├── index.ts           # bootstrap: config, db, routes, listen
│       ├── db/                # schema.sql, migrations, connection
│       ├── repositories/      # SQL lives here, nowhere else
│       ├── services/          # business logic, no SQL, no Express
│       ├── routes/            # thin HTTP layer: validate → service → respond
│       └── middleware/        # auth, error handler, validation
├── client/
│   └── src/
│       ├── api/               # typed fetch wrappers per resource
│       ├── pages/             # route-level components
│       ├── components/        # shared UI
│       └── hooks/             # TanStack Query hooks per resource
└── package.json               # workspaces: shared, server, client
```

**Why `shared/` exists (DRY, the load-bearing kind):** split calculation and
balance math run on the client (live preview while typing an expense) *and*
on the server (the authoritative write). Two implementations would drift —
the preview would show a different split than what gets stored. One pure,
dependency-free module, imported by both, unit-tested once.

---

## 2. Engineering principles → concrete decisions

Principles are only useful where they map to a real decision. Where they're
applied here:

### SOLID

- **S — Single Responsibility:** strict backend layering. Routes parse/
  validate HTTP and nothing else. Services hold business rules and never see
  `req`/`res`. Repositories hold SQL and never hold rules. A change to "how
  balances work" touches one service; a change to "what the endpoint returns"
  touches one route.
- **O — Open/Closed:** split methods use the **strategy pattern**. Each
  method (`equal`, `exact`, `percentage`, `shares`) implements
  `SplitStrategy { validate(input): void; resolve(input): Cents[] }`.
  Adding "split by adjustment" later = one new file, zero edits to existing
  strategies or the expense service. Same shape later for currency providers.
- **L — Liskov Substitution:** all strategies are interchangeable behind the
  interface and obey the same contract, verified by one shared test suite run
  against every strategy: *resolved shares always sum exactly to the total*.
- **I — Interface Segregation:** services depend on narrow repository
  interfaces (`ExpenseRepository`, `GroupRepository`…), not one god
  `Database` object. No service can quietly grow a dependency on tables it
  shouldn't touch.
- **D — Dependency Inversion:** services receive repositories via constructor
  injection (plain manual wiring in `index.ts` — no DI framework, that would
  violate KISS). Tests inject in-memory fakes; no SQLite needed to test
  business rules.

### KISS — where we deliberately choose the boring option

- SQLite via `better-sqlite3` (synchronous, transactional, zero ops) — not
  Postgres. One server, < 100 users; SQLite is the correct tool, proven by
  Recall.
- Cookie sessions (httpOnly, SameSite=Lax) — not JWT/OAuth. Sessions in a
  SQLite table; logout = delete row. No token-refresh machinery.
- Refetch-on-focus + refetch-after-mutation — not websockets. "Real-time
  enough" for expense splitting.
- Manual dependency wiring — no DI container.
- REST + JSON — no GraphQL/tRPC.

### DRY — and where we deliberately repeat ourselves

- Domain math and types live once in `shared/` (see above).
- Validation schemas (zod) defined once in `shared/`, used by server
  middleware *and* client forms — one definition of "what a valid expense is".
- **Not** DRYed: server-side route handlers may look structurally similar.
  Premature abstraction over "things that look alike but change for different
  reasons" is how generic unreadable helpers are born. Rule of three applies.

### YAGNI — explicitly not building

No microservices, no Redis, no websockets, no DI framework, no ORM (hand-
written SQL in repositories is clearer at this size), no admin panel (the
DB file + sqlite3 CLI is the admin panel), no multi-currency UI (but the
schema is ready — that's the one place we pay a tiny cost now to dodge a
migration later).

### Other

- **Fail loudly:** server validates every write with zod; invariant checks
  (splits sum to total, group balances sum to zero) throw, never "fix up"
  silently.
- **12-factor-lite:** config via `.env` (port, session secret, DB path);
  nothing environment-specific in code.

---

## 3. Data model (SQLite)

All money columns are **INTEGER cents**. All timestamps ISO-8601 TEXT (UTC).

```sql
users            id, email UNIQUE, name, password_hash, created_at
sessions         id (token), user_id, created_at, expires_at
invites          id, token UNIQUE, kind ('account'|'group'), group_id NULL,
                 created_by, expires_at, used_by NULL, used_at NULL

groups           id, name, default_currency ('EUR'), created_by, created_at,
                 archived_at NULL
group_members    group_id, user_id, role ('owner'|'member'), joined_at,
                 left_at NULL,            PRIMARY KEY (group_id, user_id)

categories       id, group_id NULL,       -- NULL = built-in default set
                 name, icon

expenses         id, group_id, type ('expense'|'settlement'),
                 title, amount_cents, currency ('EUR'),
                 category_id NULL, date, paid_by,
                 split_method ('equal'|'exact'|'percentage'|'shares'),
                 split_input TEXT,        -- raw JSON input, for re-editing
                 notes NULL,
                 created_by, created_at, updated_at, deleted_at NULL

expense_splits   expense_id, user_id, share_cents,
                 PRIMARY KEY (expense_id, user_id)

activity         id, group_id, actor_id, kind, ref_id, payload TEXT, created_at
```

Key points:

- **`expense_splits` is the heart of the model.** Whatever the split method,
  it resolves to one row per participant with exact cents. Balance queries
  are simple aggregations; they never re-run split logic.
- **Settlements reuse `expenses`** (`type='settlement'`, payer = debtor, one
  split row for the creditor). One table, one balance query, one history.
- **Soft deletes** (`deleted_at`) keep the activity feed honest.
- **Migrations:** numbered SQL files in `server/src/db/migrations/`, applied
  at boot inside a transaction, tracked in a `schema_migrations` table —
  same lightweight pattern as Recall.

Balance per member (the whole core, one query):

```sql
SELECT paid.cents - owed.cents  -- paid: Σ amount_cents where paid_by = user
                                -- owed: Σ share_cents from expense_splits
-- over non-deleted expenses+settlements of the group
```

Debt simplification (in `shared/settlement.ts`): compute net balances, then
greedily match the largest debtor against the largest creditor until all are
zero. Guarantees ≤ n−1 transfers, deterministic, O(n log n).

---

## 4. API design (REST)

All under `/api`, JSON, session cookie auth, zod-validated bodies.

```
POST   /auth/login | /auth/logout        GET /auth/me
POST   /auth/register                    (requires valid account-invite token)

POST   /invites                          (account or group invite)
GET    /invites/:token                   (preview: what am I joining?)
POST   /invites/:token/accept

GET    /groups                           (mine, with my balance per group)
POST   /groups
GET    /groups/:id                       (detail incl. members)
PATCH  /groups/:id                       DELETE → archive
POST   /groups/:id/leave                 (rejected if balance ≠ 0)
DELETE /groups/:id/members/:userId       (owner only, balance must be 0)

GET    /groups/:id/expenses              (paginated, filterable)
POST   /groups/:id/expenses              (expense or settlement)
PATCH  /groups/:id/expenses/:expId       DELETE → soft delete
GET    /groups/:id/balances              (net per member + simplified transfers)
GET    /groups/:id/activity
GET    /groups/:id/categories            POST /groups/:id/categories
```

Error contract: consistent `{ error: { code, message } }`, HTTP status codes
meaningful, central error-handling middleware (SRP: routes don't try/catch).

Authorization rule, enforced in one middleware: **every `/groups/:id/*` route
checks active membership first.** No data crosses group boundaries, ever.

---

## 5. Frontend plan

- **React 18 + Vite + TypeScript**, React Router.
- **TanStack Query** for all server state — caching, refetch-on-focus (the
  "sync" story), optimistic updates on expense creation. No Redux; the only
  client state is form state and UI state.
- **Forms:** react-hook-form + the shared zod schemas.
- **Styling:** Tailwind CSS, **mobile-first** — the primary scenario is a
  phone at a restaurant table. Desktop is the adaptation, not the baseline.
- **Pages:** Login / Register-via-invite · Dashboard (groups + balances) ·
  Group view (tabs: expenses, balances, activity) · Expense form (the
  make-or-break screen: defaults pre-filled, live split preview via
  `shared/split.ts`, one-tap save) · Settle-up dialog (pre-filled from
  simplified debts) · Group settings.
- German locale formatting (`12,40 €`) via `Intl.NumberFormat('de-DE')` in
  one `money-format` helper — used everywhere, defined once.

## 6. Testing strategy

Effort goes where bugs are expensive — the money math:

1. **`shared/` unit tests (Vitest), the priority:** split strategies
   (including property-style tests: random amounts/participants → shares
   always sum to total), largest-remainder determinism, debt simplification
   (balances sum to zero in, transfers settle everything out).
2. **Server integration tests** (Vitest + supertest, in-memory SQLite):
   auth flow, membership authorization (the security-critical paths:
   non-member gets 404, ex-member gets 404), expense CRUD → balance
   correctness end-to-end.
3. **Client:** type-checking + a few component tests for the expense form.
   No e2e suite in v1 (YAGNI; revisit if regressions actually occur).

## 7. Security checklist

- argon2id password hashing; constant-time session token comparison.
- httpOnly + Secure + SameSite=Lax cookies; CSRF covered by SameSite plus
  custom-header check on mutations.
- zod validation on every input; parameterized SQL only (better-sqlite3
  prepared statements).
- Rate limiting on `/auth/*` (express-rate-limit, in-memory).
- Invite tokens: 128-bit random, single-use, expiring.
- Helmet for headers; nginx handles TLS as with the other apps.

## 8. Build phases

Each phase ends deployable and tested.

| Phase | Deliverable |
|-------|-------------|
| **0 — Scaffold** | Monorepo workspaces, TS configs, lint/format, empty Express app + Vite app running locally, migration runner, CI script (`npm test` runs all workspaces) |
| **1 — Money core** | `shared/`: money, all four split strategies, balances, debt simplification — fully unit-tested *before any UI exists* |
| **2 — Auth** | Users, sessions, account invites, login/register pages |
| **3 — Groups** | Group CRUD, membership, group invite links, dashboard page |
| **4 — Expenses** | Expense entry with all split methods + live preview, list, edit/soft-delete, categories |
| **5 — Balances & settle up** | Balance views, simplified transfers, settlement recording, activity feed |
| **6 — Deploy** | Server: `/root/expense-tracker`, pm2 app on port **3001**, nginx vhost (e.g. `expenses.kai-hagen.de`) + Let's Encrypt, deploy docs in CLAUDE.md |
| **7 — v1.x** | Recurring expenses (node-cron), category charts, CSV export, search/filter |

Phase 1 before any feature work is deliberate: the domain math is the riskiest
correctness surface and the cheapest thing to test in isolation. Everything
after builds on a verified core.

## 9. Deployment (mirrors Recall)

```bash
# Local
git add <files> && git commit && git push

# Server
cd /root/expense-tracker && git pull && npm install
npm run build            # builds shared + client; nginx serves client/dist
pm2 restart expenses     # Express API on :3001
```

nginx: static `client/dist` + `location /api { proxy_pass http://localhost:3001; }`.
SQLite DB at `/root/expense-tracker/data/expenses.db` — included in whatever
backup routine covers Recall's DB (worth setting up a nightly `sqlite3
.backup` cron for both).
