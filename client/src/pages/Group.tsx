import { Link, useParams, useSearchParams } from 'react-router-dom';
import type { ActivityDto, BalancesDto, CategoryDto, ExpenseDto, GroupDetailDto } from '@splitt/shared';
import {
  useActivity,
  useBalances,
  useCategories,
  useExpenses,
  useGroup,
  useMe,
} from '../api/hooks.js';
import { Fab, Shell } from '../components/Layout.js';
import { Avatar, Card, EmptyState, Money, Spinner } from '../components/ui.js';
import { formatDay, formatTimestamp, memberName, money, myImpact } from '../lib/format.js';

const TABS = ['expenses', 'balances', 'activity'] as const;
type Tab = (typeof TABS)[number];

export function GroupPage() {
  const groupId = Number(useParams().groupId);
  const [params, setParams] = useSearchParams();
  const tab = (TABS as readonly string[]).includes(params.get('tab') ?? '')
    ? (params.get('tab') as Tab)
    : 'expenses';
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
        <Link
          to={`/groups/${groupId}/settings`}
          aria-label="Group settings"
          className="rounded-full p-2 text-slate-500 hover:bg-slate-200"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </Link>
      }
    >
      {group.archivedAt && (
        <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">
          This group is archived — it's read-only.
        </p>
      )}

      <div className="mb-4 grid grid-cols-3 gap-1 rounded-xl bg-slate-200 p-1">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setParams(t === 'expenses' ? {} : { tab: t }, { replace: true })}
            className={`rounded-lg py-1.5 text-sm font-semibold capitalize transition-colors ${
              tab === t ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-500'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'expenses' && <ExpensesTab groupId={groupId} group={group} myId={me.id} />}
      {tab === 'balances' && <BalancesTab groupId={groupId} myId={me.id} archived={!!group.archivedAt} />}
      {tab === 'activity' && <ActivityTab groupId={groupId} />}

      {!group.archivedAt && tab !== 'balances' && (
        <Fab to={`/groups/${groupId}/expenses/new`} label="+ Expense" />
      )}
    </Shell>
  );
}

function ExpensesTab({ groupId, group, myId }: { groupId: number; group: GroupDetailDto; myId: number }) {
  const { data: expenses, isPending } = useExpenses(groupId);
  const { data: categories } = useCategories(groupId);
  if (isPending) return <Spinner />;
  if (!expenses?.length) {
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
          <h2 className="mb-1.5 px-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
            {formatDay(date)}
          </h2>
          <Card className="divide-y divide-slate-100 !p-0">
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
  const icon = isSettlement ? '🤝' : (categories.find((c) => c.id === expense.categoryId)?.icon ?? '🧾');
  const payer = memberName(group.members, expense.paidBy);

  const body = (
    <div className="flex items-center gap-3 px-4 py-3">
      <span className="text-2xl">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">
          {isSettlement
            ? `${payer} paid ${memberName(group.members, expense.splits[0]?.userId ?? 0)}`
            : expense.title}
        </p>
        <p className="text-xs text-slate-400">
          {isSettlement ? 'Settlement' : `${payer} paid ${money(expense.amountCents)}`}
        </p>
      </div>
      <div className="text-right">
        {isSettlement ? (
          <Money cents={expense.amountCents} />
        ) : expense.paidBy !== myId && !expense.splits.some((s) => s.userId === myId) ? (
          <span className="text-xs text-slate-300">not involved</span>
        ) : impact === 0 ? (
          <span className="text-xs text-slate-400">✓ even</span>
        ) : (
          <>
            <p className="text-[10px] uppercase tracking-wide text-slate-400">
              {impact > 0 ? 'you lent' : 'you borrowed'}
            </p>
            <Money cents={impact} signed />
          </>
        )}
      </div>
    </div>
  );

  if (isSettlement || group.archivedAt) return body;
  return (
    <Link to={`/groups/${group.id}/expenses/${expense.id}/edit`} className="block hover:bg-slate-50">
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
        <h2 className="mb-3 text-sm font-semibold text-slate-600">Balances</h2>
        <ul className="space-y-3">
          {data.members.map((member) => (
            <li key={member.userId} className="flex items-center gap-3">
              <Avatar name={member.name} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {member.name}
                  {member.userId === myId && <span className="text-slate-400"> (you)</span>}
                </p>
                <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                  <div
                    className={`h-full rounded-full ${member.balanceCents >= 0 ? 'bg-emerald-400' : 'bg-red-400'}`}
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
        <h2 className="mb-3 text-sm font-semibold text-slate-600">Suggested settlements</h2>
        {allSettled ? (
          <p className="py-2 text-center text-sm text-slate-400">Everyone is settled up 🎉</p>
        ) : (
          <SuggestedTransfers data={data} groupId={groupId} archived={archived} />
        )}
      </Card>
    </div>
  );
}

function SuggestedTransfers({ data, groupId, archived }: { data: BalancesDto; groupId: number; archived: boolean }) {
  return (
    <ul className="divide-y divide-slate-100">
      {data.transfers.map((transfer, i) => (
        <li key={i} className="flex items-center gap-2 py-2.5">
          <span className="min-w-0 flex-1 truncate text-sm">
            <strong>{memberName(data.members, transfer.from)}</strong>
            <span className="text-slate-400"> pays </span>
            <strong>{memberName(data.members, transfer.to)}</strong>
          </span>
          <Money cents={transfer.cents} />
          {!archived && (
            <Link
              to={`/groups/${groupId}/settle?from=${transfer.from}&to=${transfer.to}&amount=${transfer.cents}`}
              className="rounded-lg bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
            >
              Settle
            </Link>
          )}
        </li>
      ))}
    </ul>
  );
}

function ActivityTab({ groupId }: { groupId: number }) {
  const { data: activity, isPending } = useActivity(groupId);
  if (isPending) return <Spinner />;
  if (!activity?.length) return <EmptyState emoji="📜">Nothing has happened yet.</EmptyState>;

  return (
    <Card className="divide-y divide-slate-100 !p-0">
      {activity.map((entry) => (
        <div key={entry.id} className="px-4 py-3">
          <p className="text-sm">{activityText(entry)}</p>
          <p className="mt-0.5 text-xs text-slate-400">{formatTimestamp(entry.createdAt)}</p>
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
    case 'settlement_deleted':
      return `${entry.actorName} deleted a payment of ${amount}`;
    case 'member_joined':
      return `${p.userName} joined the group`;
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
