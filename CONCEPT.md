# Expense Tracker — Concept (v2)

A self-hosted, Splitwise-style shared expense tracker for small private circles
(friends, couples, flatmates, travel groups). Multi-user: every user has an
account, expenses live in groups, and any user can belong to many groups —
shared or solo.

Hosted on the existing Hetzner server alongside Recall and one·dot.

---

## What changed from the basic concept

The original MUST/SHOULD list was good. These are the refinements:

1. **"Partner connections" are just 2-person groups.** No separate concept in
   the data model (KISS). The UI can *display* a 2-person group differently
   ("You and Anna"), but underneath it's one mechanism.
2. **Custom splits move from SHOULD to MUST.** The split method shapes the core
   data model (per-participant share rows). Building "equal only" first and
   retrofitting exact/percentage/shares later means a painful migration.
   Building the general model and shipping equal-split UI first costs nothing.
3. **Settle-up is just a special transaction type.** A settlement is a
   transfer from debtor to creditor — same table as expenses, `type =
   'settlement'`. One balance algorithm handles both (DRY).
4. **Money is integer cents, always.** Floating-point currency math is the
   classic correctness bug in this app category. Splits that don't divide
   evenly (10 € / 3 people) are resolved deterministically with the largest-
   remainder method so every split sums exactly to the total.
5. **Edit/delete with history is a MUST, not an afterthought.** People
   mistype amounts constantly. Expenses are soft-deleted and edits are
   possible; the activity feed shows who changed what, so shared balances
   stay trustworthy.
6. **Solo groups are first-class.** The requirement "users can have their own
   groups" is just a group with one member — personal expense tracking falls
   out of the same model for free.
7. **Activity feed replaces push notifications for v1.** Web push is real
   work (service workers, VAPID keys, permission UX) for modest value on a
   private app. A per-group activity feed ("Anna added 'Pizza' 12,40 €")
   covers most of the need; refetch-on-focus keeps balances current. Push can
   come later.
8. **Admin-managed accounts.** The server is on the public internet; open
   registration means spam and abuse surface. The first registered user
   becomes the admin and creates all other accounts (username + password —
   no email collected at all). Group membership works via shareable invite
   links for existing accounts.
9. **Multi-currency-ready, EUR-only.** Every amount row stores a currency
   code; every group has a default currency. v1 hardcodes EUR everywhere in
   the UI. Adding currencies later is a feature, not a migration.
10. **Guest members (placeholder people without accounts) explicitly cut from
    v1.** Splitwise has them; they complicate identity, merging, and balance
    semantics. Everyone in a group has a real account (invites make that
    cheap). Revisit if it actually hurts.

---

## Feature list (MoSCoW, revised)

### MUST — v1.0

- **Accounts & auth** — admin-created accounts, login with username + password
  (scrypt hashing), httpOnly session cookies, self-service password change.
- **Groups** — create, rename, archive; member management; invite links to
  join; solo groups (1 member) and couple groups (2 members) are just sizes.
- **Expense entry** — amount, title, date, category, who paid, who's involved,
  split method. Optimized for "phone at the restaurant table": ≤ 10 seconds
  for the common case (defaults: today, equal split among all members, payer =
  me).
- **Split methods** — equal, exact amounts, percentages, shares. All resolve
  to per-person cents at entry time; raw inputs stored too so edits reopen
  the same method.
- **Balances** — per group: net balance per member and "who pays whom"
  via debt simplification (greedy creditor/debtor matching, ≤ n−1
  transfers). Cross-group dashboard: your total per group at a glance.
- **Settle up** — record a payment (cash / bank transfer made outside the
  app); balances update; appears in history.
- **Edit / delete expenses** — soft delete, full edit, visible in activity.
- **Categories** — sensible default set (Groceries, Dining, Transport, Home,
  Travel, Entertainment, Other) + custom per group.
- **Activity feed** — per group: chronological expense/settlement/member
  events.
- **Sync** — server is the single source of truth; client refetches on focus
  and after mutations. (No websockets in v1 — YAGNI.)

### SHOULD — v1.x

- **Recurring expenses** — rent, internet, subscriptions; server-side
  scheduler materializes them.
- **Spending insight** — per-group monthly totals and per-category breakdown
  (simple chart).
- **CSV export** — per group, for spreadsheets/taxes.
- **Search & filter** — by text, category, member, date range.
- **Email notifications** — optional digest ("you were added to…", weekly
  balance summary).

### COULD — later

- Multi-currency with automatic FX conversion (model is ready).
- Web push notifications.
- Receipt photo attachments.
- Comments on expenses.
- PWA install / offline entry queue.

### WON'T — explicitly out of scope

- Real payment processing (PayPal/SEPA integration) — the app records
  settlements, it doesn't move money.
- Native mobile apps — responsive web app instead.
- Guest/placeholder members without accounts (v1).
- OCR receipt scanning.

---

## Core domain rules

- **Balance definition:** for each member, `balance = Σ(amount they paid) −
  Σ(their share of each expense)`. Positive = the group owes them.
  Settlements are transactions where payer = debtor, sole participant =
  creditor. The invariant `Σ all balances in a group = 0` holds always and is
  asserted in tests.
- **Rounding:** shares are computed in cents via largest-remainder; remainder
  cents are assigned deterministically (stable order by member id) so the
  same input always yields the same split.
- **Leaving a group:** a member can only leave with a zero balance; otherwise
  the app prompts to settle up first. Members who left stay visible in
  history (`left_at` timestamp, no row deletion).
- **Permissions:** any group member can add/edit/delete expenses (trust-based,
  like Splitwise — the activity feed is the accountability mechanism). Any
  member can add users to the group and remove members — but removal is only
  possible while no expense involves that person; once they have expense
  history they can only leave themselves (after settling up). Only the owner
  can rename/archive the group, and the owner cannot be removed.
