import { useState, useSyncExternalStore } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import type { ActivityDto, BalancesDto, CategoryDto, ExpenseDto, GroupDetailDto } from '@iou/shared';
import {
  useActivity,
  useBalances,
  useCategories,
  useExpenses,
  useGroup,
  useMe,
  useMonthlyStats,
} from '../api/hooks.js';
import { Shell } from '../components/Layout.js';
import { CategoryIcon } from '../components/CategoryIcon.js';
import { Avatar, Button, Card, EmptyState, Money, Spinner } from '../components/ui.js';
import { formatDay, formatTimestamp, memberName, money, myImpact } from '../lib/format.js';

const TABS = ['expenses', 'balances', 'stats', 'activity'] as const;
type Tab = (typeof TABS)[number];

/** On desktop, balances and stats live in a permanent right column. */
const desktopMedia = window.matchMedia('(min-width: 1024px)');
function useIsDesktop(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      desktopMedia.addEventListener('change', onChange);
      return () => desktopMedia.removeEventListener('change', onChange);
    },
    () => desktopMedia.matches,
  );
}

export function GroupPage() {
  const groupId = Number(useParams().groupId);
  const [params, setParams] = useSearchParams();
  const isDesktop = useIsDesktop();
  const urlTab = (TABS as readonly string[]).includes(params.get('tab') ?? '')
    ? (params.get('tab') as Tab)
    : 'expenses';
  const tab = isDesktop && (urlTab === 'balances' || urlTab === 'stats') ? 'expenses' : urlTab;
  const { data: group, isPending } = useGroup(groupId);
  const { data: me } = useMe();

  if (isPending || !group || !me) {
    return (
      <Shell title="…" back="/">
        <Spinner />
      </Shell>
    );
  }

  return (
    <Shell
      title={group.name}
      back="/"
      actions={
        <div className="flex items-center gap-1.5">
          <Link
            to={`/groups/${groupId}/settings`}
            aria-label="Group settings"
            className="rounded-md p-2 text-muted hover:bg-surface-2 hover:text-ink"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </Link>
          {!group.archivedAt && (
            <Link to={`/groups/${groupId}/expenses/new`}>
              <Button className="px-3 py-1.5">+ Expense</Button>
            </Link>
          )}
        </div>
      }
    >
      {group.archivedAt && (
        <p className="mb-3 rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn">
          This group is archived — it's read-only.
        </p>
      )}

      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start lg:gap-6">
        <div>
          <div className="mb-4 flex gap-4 border-b border-edge">
            {TABS.map((t) => (
              <button
                key={t}
                onClick={() => setParams(t === 'expenses' ? {} : { tab: t }, { replace: true })}
                className={`-mb-px border-b-2 pb-2 text-sm font-medium capitalize transition-colors ${
                  tab === t ? 'border-accent text-ink' : 'border-transparent text-muted hover:text-ink'
                } ${t === 'balances' || t === 'stats' ? 'lg:hidden' : ''}`}
              >
                {t}
              </button>
            ))}
          </div>

          {tab === 'expenses' && <ExpensesTab groupId={groupId} group={group} myId={me.id} />}
          {tab === 'balances' && <BalancesTab groupId={groupId} myId={me.id} archived={!!group.archivedAt} />}
          {tab === 'stats' && <StatsTab groupId={groupId} />}
          {tab === 'activity' && <ActivityTab groupId={groupId} />}
        </div>

        {isDesktop && (
          <aside className="space-y-4">
            <BalancesTab groupId={groupId} myId={me.id} archived={!!group.archivedAt} />
            <StatsTab groupId={groupId} />
          </aside>
        )}
      </div>
    </Shell>
  );
}

function ExpensesTab({ groupId, group, myId }: { groupId: number; group: GroupDetailDto; myId: number }) {
  const { data, isPending, hasNextPage, fetchNextPage, isFetchingNextPage } = useExpenses(groupId);
  const { data: categories } = useCategories(groupId);
  if (isPending) return <Spinner />;
  const expenses = data?.pages.flat() ?? [];
  if (!expenses.length) {
    return <EmptyState emoji="🧾">No expenses yet. Add the first one!</EmptyState>;
  }

  const byDay = new Map<string, ExpenseDto[]>();
  for (const expense of expenses) {
    const list = byDay.get(expense.date) ?? [];
    list.push(expense);
    byDay.set(expense.date, list);
  }

  return (
    <div className="space-y-4">
      {[...byDay.entries()].map(([date, dayExpenses]) => (
        <section key={date}>
          <h2 className="mb-1.5 px-1 text-xs font-semibold uppercase tracking-wide text-faint">
            {formatDay(date)}
          </h2>
          <Card className="divide-y divide-edge !p-0">
            {dayExpenses.map((expense) => (
              <ExpenseRow
                key={expense.id}
                expense={expense}
                group={group}
                myId={myId}
                categories={categories ?? []}
              />
            ))}
          </Card>
        </section>
      ))}
      {hasNextPage && (
        <button
          onClick={() => fetchNextPage()}
          disabled={isFetchingNextPage}
          className="mb-2 w-full rounded-md py-2.5 text-sm font-semibold text-accent hover:bg-accent-soft disabled:text-faint"
        >
          {isFetchingNextPage ? 'Loading…' : 'Load older expenses'}
        </button>
      )}
    </div>
  );
}

function ExpenseRow({
  expense,
  group,
  myId,
  categories,
}: {
  expense: ExpenseDto;
  group: GroupDetailDto;
  myId: number;
  categories: CategoryDto[];
}) {
  const impact = myImpact(expense, myId);
  const isSettlement = expense.type === 'settlement';
  const iconName = isSettlement
    ? 'handshake'
    : (categories.find((c) => c.id === expense.categoryId)?.icon ?? null);
  const payer = memberName(group.members, expense.paidBy);

  const body = (
    <div className="flex items-center gap-3 px-4 py-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-2 text-muted">
        <CategoryIcon name={iconName} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">
          {isSettlement
            ? `${payer} paid ${memberName(group.members, expense.splits[0]?.userId ?? 0)}`
            : expense.title}
        </p>
        <p className="text-xs text-faint">
          {isSettlement ? 'Settlement' : `${payer} paid ${money(expense.amountCents)}`}
        </p>
      </div>
      <div className="text-right">
        {isSettlement ? (
          <Money cents={expense.amountCents} />
        ) : expense.paidBy !== myId && !expense.splits.some((s) => s.userId === myId) ? (
          <span className="text-xs text-faint">not involved</span>
        ) : impact === 0 ? (
          <span className="text-xs text-faint">✓ even</span>
        ) : (
          <>
            <p className="text-[10px] uppercase tracking-wide text-faint">
              {impact > 0 ? 'you lent' : 'you borrowed'}
            </p>
            <Money cents={impact} signed />
          </>
        )}
      </div>
    </div>
  );

  if (group.archivedAt) return body;
  const editUrl = isSettlement
    ? `/groups/${group.id}/settle/${expense.id}/edit`
    : `/groups/${group.id}/expenses/${expense.id}/edit`;
  return (
    <Link to={editUrl} className="block hover:bg-surface-2">
      {body}
    </Link>
  );
}

function BalancesTab({ groupId, myId, archived }: { groupId: number; myId: number; archived: boolean }) {
  const { data, isPending } = useBalances(groupId);
  if (isPending || !data) return <Spinner />;
  const maxAbs = Math.max(1, ...data.members.map((m) => Math.abs(m.balanceCents)));
  const allSettled = data.members.every((m) => m.balanceCents === 0);

  return (
    <div className="space-y-4">
      <Card>
        <h2 className="mb-3 text-sm font-semibold text-muted">Balances</h2>
        <ul className="space-y-3">
          {data.members.map((member) => (
            <li key={member.userId} className="flex items-center gap-3">
              <Avatar name={member.name} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {member.name}
                  {member.userId === myId && <span className="text-faint"> (you)</span>}
                </p>
                <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
                  <div
                    className={`h-full rounded-full ${member.balanceCents >= 0 ? 'bg-pos' : 'bg-neg'}`}
                    style={{ width: `${(Math.abs(member.balanceCents) / maxAbs) * 100}%` }}
                  />
                </div>
              </div>
              <Money cents={member.balanceCents} signed />
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <h2 className="mb-3 text-sm font-semibold text-muted">Suggested settlements</h2>
        {allSettled ? (
          <p className="py-2 text-center text-sm text-faint">Everyone is settled up 🎉</p>
        ) : (
          <SuggestedTransfers data={data} groupId={groupId} archived={archived} />
        )}
      </Card>
    </div>
  );
}

function SuggestedTransfers({ data, groupId, archived }: { data: BalancesDto; groupId: number; archived: boolean }) {
  return (
    <ul className="divide-y divide-edge">
      {data.transfers.map((transfer, i) => (
        <li key={i} className="flex items-center gap-2 py-2.5">
          <span className="min-w-0 flex-1 truncate text-sm">
            <strong>{memberName(data.members, transfer.from)}</strong>
            <span className="text-faint"> pays </span>
            <strong>{memberName(data.members, transfer.to)}</strong>
          </span>
          <Money cents={transfer.cents} />
          {!archived && (
            <Link
              to={`/groups/${groupId}/settle?from=${transfer.from}&to=${transfer.to}&amount=${transfer.cents}`}
              className="rounded-lg bg-accent-soft px-3 py-1.5 text-xs font-semibold text-accent hover:bg-accent-soft"
            >
              Settle
            </Link>
          )}
        </li>
      ))}
    </ul>
  );
}

const currentMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

const shiftMonth = (month: string, delta: number) => {
  const [y = 0, m = 1] = month.split('-').map(Number);
  const total = y * 12 + (m - 1) + delta;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
};

const monthLabel = (month: string) =>
  new Date(`${month}-01T00:00:00`).toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });

function StatsTab({ groupId }: { groupId: number }) {
  const [month, setMonth] = useState(currentMonth);
  const { data: stats, isPending } = useMonthlyStats(groupId, month);
  const { data: categories } = useCategories(groupId);

  const categoryOf = (id: number | null) =>
    id === null ? { name: 'Default', icon: null } : (categories?.find((c) => c.id === id) ?? { name: 'Deleted category', icon: null });
  const maxCents = Math.max(1, ...(stats?.byCategory.map((c) => c.cents) ?? []));

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex items-center justify-between">
          <button
            onClick={() => setMonth(shiftMonth(month, -1))}
            aria-label="Previous month"
            className="rounded-full p-2 text-muted hover:bg-surface-2"
          >
            ‹
          </button>
          <h2 className="text-sm font-semibold">{monthLabel(month)}</h2>
          <button
            onClick={() => setMonth(shiftMonth(month, 1))}
            disabled={month >= currentMonth()}
            aria-label="Next month"
            className="rounded-full p-2 text-muted hover:bg-surface-2 disabled:opacity-30"
          >
            ›
          </button>
        </div>
        {isPending || !stats ? (
          <Spinner />
        ) : (
          <>
            <p className="mt-2 text-center text-3xl font-bold tabular-nums">{money(stats.totalCents)}</p>
            <p className="mt-1 text-center text-xs text-faint">
              {stats.expenseCount === 1 ? '1 expense' : `${stats.expenseCount} expenses`} (settlements not counted)
            </p>
          </>
        )}
      </Card>

      {stats && stats.byCategory.length > 0 && (
        <Card>
          <h2 className="mb-3 text-sm font-semibold text-muted">By category</h2>
          <ul className="space-y-3">
            {stats.byCategory.map((entry) => {
              const category = categoryOf(entry.categoryId);
              const percent = stats.totalCents > 0 ? Math.round((entry.cents / stats.totalCents) * 100) : 0;
              return (
                <li key={entry.categoryId ?? 'default'} className="flex items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-2 text-muted">
                    <CategoryIcon name={category.icon} className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="truncate text-sm font-medium">{category.name}</p>
                      <p className="text-xs text-faint">{percent} %</p>
                    </div>
                    <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
                      <div
                        className="h-full rounded-full bg-pos"
                        style={{ width: `${(entry.cents / maxCents) * 100}%` }}
                      />
                    </div>
                  </div>
                  <Money cents={entry.cents} />
                </li>
              );
            })}
          </ul>
        </Card>
      )}
      {stats && stats.byCategory.length === 0 && (
        <EmptyState emoji="📊">No expenses in this month.</EmptyState>
      )}
    </div>
  );
}

function ActivityTab({ groupId }: { groupId: number }) {
  const { data: activity, isPending } = useActivity(groupId);
  if (isPending) return <Spinner />;
  if (!activity?.length) return <EmptyState emoji="📜">Nothing has happened yet.</EmptyState>;

  return (
    <Card className="divide-y divide-edge !p-0">
      {activity.map((entry) => (
        <div key={entry.id} className="px-4 py-3">
          <p className="text-sm">{activityText(entry)}</p>
          <p className="mt-0.5 text-xs text-faint">{formatTimestamp(entry.createdAt)}</p>
        </div>
      ))}
    </Card>
  );
}

function activityText(entry: ActivityDto): string {
  const p = entry.payload as { title?: string; amountCents?: number; userName?: string; name?: string; to?: string };
  const amount = typeof p.amountCents === 'number' ? money(p.amountCents) : '';
  switch (entry.kind) {
    case 'expense_added':
      return `${entry.actorName} added "${p.title}" (${amount})`;
    case 'expense_updated':
      return `${entry.actorName} edited "${p.title}" (${amount})`;
    case 'expense_deleted':
      return `${entry.actorName} deleted "${p.title}" (${amount})`;
    case 'settlement_added':
      return `${entry.actorName} recorded a payment of ${amount}`;
    case 'settlement_updated':
      return `${entry.actorName} edited a payment (${amount})`;
    case 'recurring_skipped':
      return `Recurring expense "${p.title}" was skipped (${(entry.payload as { reason?: string }).reason ?? 'error'})`;
    case 'settlement_deleted':
      return `${entry.actorName} deleted a payment of ${amount}`;
    case 'member_joined':
      return `${p.userName} joined the group`;
    case 'member_added':
      return `${entry.actorName} added ${p.userName}`;
    case 'member_left':
      return `${p.userName} left the group`;
    case 'member_removed':
      return `${entry.actorName} removed ${p.userName}`;
    case 'group_created':
      return `${entry.actorName} created the group "${p.name}"`;
    case 'group_renamed':
      return `${entry.actorName} renamed the group to "${p.to}"`;
    case 'group_archived':
      return `${entry.actorName} archived the group`;
    default:
      return `${entry.actorName}: ${entry.kind}`;
  }
}
