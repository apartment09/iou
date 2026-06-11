# IOU — Shared Expense Tracker

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
- **client/** — Vite + React 19 + Tailwind 4 + TanStack Query.
  All server state via query hooks in `src/api/hooks.ts`; every group mutation
  invalidates the `['groups']` subtree.

## Design system ("The Rail")

- **Tokens, not palette classes.** All colors are CSS variables in
  `client/src/index.css`, exposed as semantic utilities: `bg-app`,
  `bg-surface`, `bg-surface-2`, `border-edge`, `text-ink`, `text-muted`,
  `text-faint`, `accent`/`accent-strong`/`accent-soft`, `pos`/`neg`/`warn`
  (+ `-soft`). Never use raw Tailwind palette colors in components (the
  avatar palette is the one exception). Light/dark is a variable swap on
  `.dark` (class on `<html>`, managed by `src/lib/theme.ts` — light/dark/
  system, persisted in localStorage).
- **Layout shells.** Pages render through `Shell` (`src/components/
  Layout.tsx`), which resolves the active layout from a registry. The Rail
  (`src/layouts/RailShell.tsx`): full rail ≥1024px, icon rail ≥768px,
  bottom tab bar below; sticky top bar carries title + page actions; the
  group page shows balances/stats in a permanent right column on desktop.
  To offer another layout later: implement `ShellProps`
  (`src/layouts/types.ts`), register it in `LAYOUTS`, extend `LayoutId`.

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
`server/data/iou.db` (override with `DB_PATH`); delete it to reset.

## Domain invariants (tested — keep them true)

- All money is **integer cents**. Never floats, never strings in math.
- Resolved splits always sum exactly to the expense total.
- Group balances always sum to zero; settlements are `expenses` rows with
  `type='settlement'` (payer = debtor, single split = creditor).
- Expenses are soft-deleted (`deleted_at`); members who leave keep their rows
  (`left_at`) and can only leave with zero balance.
- Every `/groups/:id/*` route requires active membership; non-members get 404.
- Recurring templates (`recurring_expenses`) are materialized into ordinary
  expenses by `RecurringService.tick(today)` — run at boot and hourly from
  `index.ts`. Catch-up is capped (24/tick), short months clamp to the anchor
  day, failures log `recurring_skipped` activity instead of stalling.

## Deploy (live)

- **URL:** https://iou.kai-hagen.de (Let's Encrypt, HTTP→HTTPS redirect)
- **Server:** Hetzner 178.104.73.139, repo at `/root/iou`
  (github.com/apartment09/iou)
- **Process:** pm2 app `iou`, **port 3004** with `NODE_ENV=production`
  (ports 3000–3003 are taken by recall, one-dot-server, utm-maestro,
  unopcom — the CLAUDE.md in the parent folder understates what runs there)
- **nginx:** `/etc/nginx/sites-enabled/iou` — serves `client/dist`
  statically, proxies `/api` → 127.0.0.1:3004
- **DB:** `/root/iou/server/data/iou.db`
- **Backups:** `/root/backup-dbs.sh` via `/etc/cron.d/db-backups`, nightly
  03:15 — snapshots IOU's and Recall's DBs to `/root/backups/` with 7-day
  weekday rotation

Deploy an update:

```bash
ssh root@178.104.73.139
cd /root/iou && git pull && npm install && npm run build && pm2 restart iou
```
