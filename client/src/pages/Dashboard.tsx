import { Link } from 'react-router-dom';
import { useGroups } from '../api/hooks.js';
import { Shell } from '../components/Layout.js';
import { Button, Card, EmptyState, Money, Spinner } from '../components/ui.js';

export function DashboardPage() {
  const { data: groups, isPending } = useGroups();
  const active = groups?.filter((g) => !g.archivedAt) ?? [];
  const archived = groups?.filter((g) => g.archivedAt) ?? [];
  const totalCents = active.reduce((s, g) => s + g.myBalanceCents, 0);

  return (
    <Shell
      title="Groups"
      actions={
        <Link to="/groups/new">
          <Button className="px-3 py-1.5">+ New group</Button>
        </Link>
      }
    >
      {isPending ? (
        <Spinner />
      ) : (
        <div className="space-y-4">
          <Card className="flex items-baseline justify-between">
            <span className="text-sm text-muted">Across all groups you are</span>
            <span className="text-xl">
              <Money cents={totalCents} signed />
            </span>
          </Card>

          {active.length === 0 ? (
            <EmptyState emoji="👋">
              No groups yet. Create one for your flat, your trip, or just for yourself.
            </EmptyState>
          ) : (
            <Card className="divide-y divide-edge !p-0">
              {active.map((group) => (
                <Link
                  key={group.id}
                  to={`/groups/${group.id}`}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-surface-2"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-accent-soft text-xs font-bold text-accent">
                    {group.name.slice(0, 2).toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{group.name}</p>
                    <p className="text-xs text-faint">
                      {group.memberCount === 1 ? 'Just you' : `${group.memberCount} people`}
                    </p>
                  </div>
                  <Money cents={group.myBalanceCents} signed />
                </Link>
              ))}
            </Card>
          )}

          {archived.length > 0 && (
            <details>
              <summary className="cursor-pointer px-1 text-sm text-faint">
                Archived ({archived.length})
              </summary>
              <Card className="mt-2 divide-y divide-edge !p-0 opacity-70">
                {archived.map((group) => (
                  <Link
                    key={group.id}
                    to={`/groups/${group.id}`}
                    className="flex items-center justify-between px-4 py-3 hover:bg-surface-2"
                  >
                    <p className="text-sm font-medium">{group.name}</p>
                    <Money cents={group.myBalanceCents} signed />
                  </Link>
                ))}
              </Card>
            </details>
          )}
        </div>
      )}
    </Shell>
  );
}
