import { Link } from 'react-router-dom';
import { useGroups } from '../api/hooks.js';
import { Fab, HomeHeaderActions, Shell } from '../components/Layout.js';
import { Card, EmptyState, Money, Spinner } from '../components/ui.js';

export function DashboardPage() {
  const { data: groups, isPending } = useGroups();
  const active = groups?.filter((g) => !g.archivedAt) ?? [];
  const archived = groups?.filter((g) => g.archivedAt) ?? [];
  const totalCents = active.reduce((s, g) => s + g.myBalanceCents, 0);

  return (
    <Shell title="Splitt" actions={<HomeHeaderActions />}>
      {isPending ? (
        <Spinner />
      ) : (
        <>
          <Card className="mb-4 text-center">
            <p className="text-sm text-slate-500">Across all groups you are</p>
            <p className="mt-1 text-3xl">
              <Money cents={totalCents} signed />
            </p>
            <p className="mt-1 text-xs text-slate-400">
              {totalCents > 0 ? 'owed in total' : totalCents < 0 ? 'owing in total' : 'all settled up 🎉'}
            </p>
          </Card>

          {active.length === 0 && (
            <EmptyState emoji="👋">
              No groups yet. Create one for your flat, your trip, or just for yourself.
            </EmptyState>
          )}

          <ul className="space-y-3">
            {active.map((group) => (
              <li key={group.id}>
                <Link to={`/groups/${group.id}`}>
                  <Card className="flex items-center justify-between transition-shadow hover:shadow-md">
                    <div>
                      <p className="font-semibold">{group.name}</p>
                      <p className="text-xs text-slate-400">
                        {group.memberCount === 1 ? 'Just you' : `${group.memberCount} people`}
                      </p>
                    </div>
                    <Money cents={group.myBalanceCents} signed />
                  </Card>
                </Link>
              </li>
            ))}
          </ul>

          {archived.length > 0 && (
            <details className="mt-6">
              <summary className="cursor-pointer text-sm text-slate-400">
                Archived ({archived.length})
              </summary>
              <ul className="mt-2 space-y-2 opacity-60">
                {archived.map((group) => (
                  <li key={group.id}>
                    <Link to={`/groups/${group.id}`}>
                      <Card className="flex items-center justify-between">
                        <p className="font-medium">{group.name}</p>
                        <Money cents={group.myBalanceCents} signed />
                      </Card>
                    </Link>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
      <Fab to="/groups/new" label="+ New group" />
    </Shell>
  );
}
