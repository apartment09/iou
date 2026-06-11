import { useMemo, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { parseAmount, resolveSplit, type ExpenseInput, type SplitInput } from '@splitt/shared';
import {
  useCategories,
  useCreateExpense,
  useDeleteExpense,
  useExpense,
  useGroup,
  useMe,
  useUpdateExpense,
} from '../api/hooks.js';
import { Shell } from '../components/Layout.js';
import { SplitEditor } from '../components/SplitEditor.js';
import { Button, Card, ErrorText, Field, Select, Spinner, TextInput } from '../components/ui.js';
import { centsToInput, todayIso } from '../lib/format.js';

export function ExpenseFormPage({ mode }: { mode: 'new' | 'edit' }) {
  const groupId = Number(useParams().groupId);
  const expenseId = Number(useParams().expenseId);
  const { data: group } = useGroup(groupId);
  const { data: me } = useMe();
  const existing = useExpense(groupId, expenseId, mode === 'edit');
  const loadingExisting = mode === 'edit' && existing.isPending;

  if (!group || !me || loadingExisting) {
    return (
      <Shell title="…" back="">
        <Spinner />
      </Shell>
    );
  }
  if (mode === 'edit' && !existing.data) {
    return (
      <Shell title="Expense" back={`/groups/${groupId}`}>
        <ErrorText>Expense not found.</ErrorText>
      </Shell>
    );
  }

  const activeMembers = group.members.filter((m) => m.leftAt === null);
  return (
    <ExpenseForm
      key={mode === 'edit' ? `edit-${expenseId}` : 'new'}
      groupId={groupId}
      mode={mode}
      myId={me.id}
      members={activeMembers}
      existing={mode === 'edit' ? existing.data : undefined}
    />
  );
}

function ExpenseForm({
  groupId,
  mode,
  myId,
  members,
  existing,
}: {
  groupId: number;
  mode: 'new' | 'edit';
  myId: number;
  members: { userId: number; name: string; role: 'owner' | 'member'; joinedAt: string; leftAt: string | null }[];
  existing?: ReturnType<typeof useExpense>['data'];
}) {
  const navigate = useNavigate();
  const { data: categories } = useCategories(groupId);
  const create = useCreateExpense(groupId);
  const update = useUpdateExpense(groupId, existing?.id ?? 0);
  const remove = useDeleteExpense(groupId);

  const [amountText, setAmountText] = useState(existing ? centsToInput(existing.amountCents) : '');
  const [title, setTitle] = useState(existing?.title ?? '');
  const [date, setDate] = useState(existing?.date ?? todayIso());
  const [categoryId, setCategoryId] = useState<number | ''>(existing?.categoryId ?? '');
  const [paidBy, setPaidBy] = useState(existing?.paidBy ?? myId);
  const [split, setSplit] = useState<SplitInput>(
    existing?.splitInput ?? { method: 'equal', participants: members.map((m) => m.userId) },
  );
  const [formError, setFormError] = useState<string | null>(null);

  const amountCents = parseAmount(amountText);
  const splitValid = useMemo(() => {
    if (amountCents === null || amountCents <= 0) return false;
    try {
      resolveSplit(amountCents, split);
      return true;
    } catch {
      return false;
    }
  }, [amountCents, split]);

  const mutation = mode === 'new' ? create : update;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (amountCents === null || amountCents <= 0) {
      setFormError('Please enter a valid amount, e.g. 12,40');
      return;
    }
    if (!splitValid) {
      setFormError('The split does not add up — check the amounts below.');
      return;
    }
    setFormError(null);
    const input: ExpenseInput = {
      title,
      amountCents,
      date,
      categoryId: categoryId === '' ? null : categoryId,
      paidBy,
      split,
    };
    mutation.mutate(input, { onSuccess: () => navigate(`/groups/${groupId}`, { replace: true }) });
  };

  const deleteExpense = () => {
    if (!existing) return;
    if (!window.confirm(`Delete "${existing.title}"?`)) return;
    remove.mutate(existing.id, {
      onSuccess: () => navigate(`/groups/${groupId}`, { replace: true }),
    });
  };

  return (
    <Shell title={mode === 'new' ? 'New expense' : 'Edit expense'} back={`/groups/${groupId}`}>
      <form onSubmit={submit} className="space-y-4">
        <Card className="space-y-4">
          <Field label="Amount (€)">
            <input
              inputMode="decimal"
              placeholder="0,00"
              required
              autoFocus={mode === 'new'}
              value={amountText}
              onChange={(e) => setAmountText(e.target.value)}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-center text-3xl font-bold tabular-nums outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
            />
          </Field>
          <Field label="Title">
            <TextInput
              required
              maxLength={120}
              placeholder="Dinner, taxi, groceries…"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Date">
              <TextInput type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
            <Field label="Category">
              <Select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value === '' ? '' : Number(e.target.value))}
              >
                <option value="">No category</option>
                {categories?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.icon} {c.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Paid by">
            <Select value={paidBy} onChange={(e) => setPaidBy(Number(e.target.value))}>
              {members.map((m) => (
                <option key={m.userId} value={m.userId}>
                  {m.name}
                  {m.userId === myId ? ' (you)' : ''}
                </option>
              ))}
            </Select>
          </Field>
        </Card>

        <Card>
          <h2 className="mb-3 text-sm font-semibold text-slate-600">Split between</h2>
          <SplitEditor
            members={members}
            totalCents={amountCents !== null && amountCents > 0 ? amountCents : null}
            value={split}
            onChange={setSplit}
          />
        </Card>

        <ErrorText>{formError ?? mutation.error?.message ?? remove.error?.message}</ErrorText>

        <Button type="submit" className="w-full" disabled={mutation.isPending || !splitValid || !title}>
          {mutation.isPending ? 'Saving…' : mode === 'new' ? 'Add expense' : 'Save changes'}
        </Button>
        {mode === 'edit' && (
          <Button type="button" variant="danger" className="w-full" onClick={deleteExpense} disabled={remove.isPending}>
            Delete expense
          </Button>
        )}
      </form>
    </Shell>
  );
}
