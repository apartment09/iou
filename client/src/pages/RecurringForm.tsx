import { useMemo, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { parseAmount, resolveSplit, type RecurringExpenseInput, type SplitInput } from '@splitt/shared';
import { useCategories, useCreateRecurring, useGroup, useMe } from '../api/hooks.js';
import { Shell } from '../components/Layout.js';
import { CategoryIcon } from '../components/CategoryIcon.js';
import { SplitEditor } from '../components/SplitEditor.js';
import { Button, Card, ErrorText, Field, Select, Spinner, TextInput } from '../components/ui.js';
import { todayIso } from '../lib/format.js';

export function RecurringFormPage() {
  const groupId = Number(useParams().groupId);
  const { data: group } = useGroup(groupId);
  const { data: me } = useMe();
  const { data: categories } = useCategories(groupId);
  const create = useCreateRecurring(groupId);
  const navigate = useNavigate();

  const [amountText, setAmountText] = useState('');
  const [title, setTitle] = useState('');
  const [frequency, setFrequency] = useState<'weekly' | 'monthly'>('monthly');
  const [startDate, setStartDate] = useState(todayIso());
  const [categoryId, setCategoryId] = useState<number | ''>('');
  const [paidBy, setPaidBy] = useState(0);
  const [split, setSplit] = useState<SplitInput | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  if (!group || !me) {
    return (
      <Shell title="Recurring expense" back="">
        <Spinner />
      </Shell>
    );
  }
  const members = group.members.filter((m) => m.leftAt === null);
  const effectiveSplit = split ?? { method: 'equal' as const, participants: members.map((m) => m.userId) };
  const amountCents = parseAmount(amountText);

  const splitValid = (() => {
    if (amountCents === null || amountCents <= 0) return false;
    try {
      resolveSplit(amountCents, effectiveSplit);
      return true;
    } catch {
      return false;
    }
  })();

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
    const input: RecurringExpenseInput = {
      title,
      amountCents,
      categoryId: categoryId === '' ? null : categoryId,
      paidBy: paidBy || me.id,
      split: effectiveSplit,
      frequency,
      startDate,
    };
    create.mutate(input, {
      onSuccess: () => navigate(`/groups/${groupId}/settings`, { replace: true }),
    });
  };

  return (
    <Shell title="New recurring expense" back={`/groups/${groupId}/settings`}>
      <form onSubmit={submit} className="space-y-4">
        <Card className="space-y-4">
          <Field label="Amount (€)">
            <input
              inputMode="decimal"
              placeholder="0,00"
              required
              autoFocus
              value={amountText}
              onChange={(e) => setAmountText(e.target.value)}
              className="w-full rounded-md border border-edge bg-surface px-3 py-3 text-center text-3xl font-bold tabular-nums outline-none focus:border-accent focus:ring-2 focus:ring-accent/25"
            />
          </Field>
          <Field label="Title">
            <TextInput
              required
              maxLength={120}
              placeholder="Rent, internet, streaming…"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Repeats">
              <Select value={frequency} onChange={(e) => setFrequency(e.target.value as 'weekly' | 'monthly')}>
                <option value="monthly">Monthly</option>
                <option value="weekly">Weekly</option>
              </Select>
            </Field>
            <Field label="First on">
              <TextInput
                type="date"
                required
                min={todayIso()}
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </Field>
          </div>
          <Field label="Paid by">
            <Select value={paidBy || me.id} onChange={(e) => setPaidBy(Number(e.target.value))}>
              {members.map((m) => (
                <option key={m.userId} value={m.userId}>
                  {m.name}
                  {m.userId === me.id ? ' (you)' : ''}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Category">
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setCategoryId('')}
                className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium ${
                  categoryId === '' ? 'bg-accent text-white' : 'bg-surface-2 text-muted hover:bg-surface-2'
                }`}
              >
                <CategoryIcon name={null} className="h-4 w-4" />
                Default
              </button>
              {categories?.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCategoryId(c.id)}
                  className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium ${
                    categoryId === c.id ? 'bg-accent text-white' : 'bg-surface-2 text-muted hover:bg-surface-2'
                  }`}
                >
                  <CategoryIcon name={c.icon} className="h-4 w-4" />
                  {c.name}
                </button>
              ))}
            </div>
          </Field>
        </Card>

        <Card>
          <h2 className="mb-3 text-sm font-semibold text-muted">Split between</h2>
          <SplitEditor
            members={members}
            totalCents={amountCents !== null && amountCents > 0 ? amountCents : null}
            value={effectiveSplit}
            onChange={setSplit}
          />
        </Card>

        <ErrorText>{formError ?? create.error?.message}</ErrorText>
        <Button type="submit" className="w-full" disabled={create.isPending || !splitValid || !title}>
          {create.isPending ? 'Saving…' : 'Create recurring expense'}
        </Button>
      </form>
    </Shell>
  );
}
