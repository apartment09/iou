# Splitt — Shared Expense Tracker

Splitwise-style multi-user expense tracker. Users share groups (or keep solo
ones), split expenses four ways (equal / exact / percentage / shares), see
who-owes-whom with debt simplification, and settle up.

See `CONCEPT.md` (product decisions) and `PLAN.md` (architecture rationale).

## Stack

- **shared/** — pure TypeScript domain core: money parsing/formatting (integer
  cents only), split strategies with largest-remainder rounding, balance +
  debt-simplification math, zod schemas for all write endpoints. Used by both
  client (live preview) and server (authoritative writes). Must stay
  dependency-free except zod.
- **server/** — Express 5 + better-sqlite3. Layering is strict:
  `routes/` (HTTP only) → `services/` (rules only) → `repositories/` (SQL only),
  wired by hand in `src/app.ts`. Migrations are TS-embedded SQL strings in
  `src/db/migrations.ts` (append-only). Auth: username + password (no email
  anywhere), scrypt hashes, hashed session tokens in httpOnly cookies,
  `X-Requested-With` header required on all mutations. Accounts are
  admin-managed: the first user self-registers and becomes admin; the admin
  creates all other accounts via `/api/admin/users` (UI: "Users" page); users
  change their own password under "Account". Group invite links only let
  existing accounts join groups.
- **client/** — Vite + React 19 + Tailwind 4 + TanStack Query. Mobile-first.
  All server state via query hooks in `src/api/hooks.ts`; every group mutation
  invalidates the `['groups']` subtree.

## Commands (run from repo root)

```bash
npm run dev        # build shared, then server (:3001, tsx watch) + client (Vite :5173, proxies /api)
npm test           # shared unit tests (40) + server integration tests (14)
npm run build      # shared -> server -> client, full production build
npm run typecheck  # all workspaces
```

After editing `shared/`, rebuild it (`npm run build -w shared`) — server and
client consume `shared/dist`, not the source.

Dev login: first registered user needs no invite (setup mode). DB lives at
`server/data/splitt.db` (override with `DB_PATH`); delete it to reset.

## Domain invariants (tested — keep them true)

- All money is **integer cents**. Never floats, never strings in math.
- Resolved splits always sum exactly to the expense total.
- Group balances always sum to zero; settlements are `expenses` rows with
  `type='settlement'` (payer = debtor, single split = creditor).
- Expenses are soft-deleted (`deleted_at`); members who leave keep their rows
  (`left_at`) and can only leave with zero balance.
- Every `/groups/:id/*` route requires active membership; non-members get 404.

## Deploy (not yet performed — planned)

Target: Hetzner server (178.104.73.139), pm2 app `splitt` on port **3001**,
nginx vhost (suggested `expenses.kai-hagen.de`) serving `client/dist`
statically and proxying `/api` to :3001, TLS via Let's Encrypt — same pattern
as Recall. Server needs `NODE_ENV=production` (secure cookies). First deploy:

```bash
# server
cd /root && git clone <repo> expense-tracker && cd expense-tracker
npm install && npm run build
NODE_ENV=production pm2 start server/dist/index.js --name splitt
pm2 save
```

Subsequent deploys: `git pull && npm install && npm run build && pm2 restart splitt`.
Back up `server/data/splitt.db` (nightly `sqlite3 .backup` cron recommended,
ideally together with Recall's DB).
