import { useState, type FormEvent } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { parseAmount, type ExpenseDto, type MemberDto } from '@iou/shared';
import {
  useCreateSettlement,
  useDeleteExpense,
  useExpense,
  useGroup,
  useMe,
  useUpdateSettlement,
} from '../api/hooks.js';
import { Shell } from '../components/Layout.js';
import { Button, Card, ErrorText, Field, Select, Spinner, TextInput } from '../components/ui.js';
import { centsToInput, todayIso } from '../lib/format.js';

export function SettleUpPage({ mode }: { mode: 'new' | 'edit' }) {
  const groupId = Number(useParams().groupId);
  const expenseId = Number(useParams().expenseId);
  const { data: group } = useGroup(groupId);
  const { data: me } = useMe();
  const existing = useExpense(groupId, expenseId, mode === 'edit');

  if (!group || !me || (mode === 'edit' && existing.isPending)) {
    return (
      <Shell title="Settle up" back="">
        <Spinner />
      </Shell>
    );
  }
  if (mode === 'edit' && (!existing.data || existing.data.type !== 'settlement')) {
    return (
      <Shell title="Settle up" back={`/groups/${groupId}`}>
        <ErrorText>Settlement not found.</ErrorText>
      </Shell>
    );
  }

  return (
    <SettleForm
      key={mode === 'edit' ? `edit-${expenseId}` : 'new'}
      groupId={groupId}
      mode={mode}
      myId={me.id}
      members={group.members.filter((m) => m.leftAt === null)}
      existing={mode === 'edit' ? existing.data : undefined}
    />
  );
}

function SettleForm({
  groupId,
  mode,
  myId,
  members,
  existing,
}: {
  groupId: number;
  mode: 'new' | 'edit';
  myId: number;
  members: MemberDto[];
  existing?: ExpenseDto;
}) {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const create = useCreateSettlement(groupId);
  const update = useUpdateSettlement(groupId, existing?.id ?? 0);
  const remove = useDeleteExpense(groupId);

  const prefillAmount = existing?.amountCents ?? Number(params.get('amount'));
  const [payerId, setPayerId] = useState(() => existing?.paidBy || Number(params.get('from')) || 0);
  const [recipientId, setRecipientId] = useState(
    () => existing?.splits[0]?.userId || Number(params.get('to')) || 0,
  );
  const [amountText, setAmountText] = useState(prefillAmount > 0 ? centsToInput(prefillAmount) : '');
  const [date, setDate] = useState(existing?.date ?? todayIso());
  const [formError, setFormError] = useState<string | null>(null);

  const payer = payerId || myId;
  const recipient = recipientId || members.find((m) => m.userId !== payer)?.userId || 0;
  const mutation = mode === 'new' ? create : update;
  const backTo = `/groups/${groupId}?tab=balances`;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const amountCents = parseAmount(amountText);
    if (amountCents === null || amountCents <= 0) {
      setFormError('Please enter a valid amount, e.g. 12,40');
      return;
    }
    if (payer === recipient) {
      setFormError('Payer and recipient must be different people');
      return;
    }
    setFormError(null);
    mutation.mutate(
      { payerId: payer, recipientId: recipient, amountCents, date },
      { onSuccess: () => navigate(backTo, { replace: true }) },
    );
  };

  const deleteSettlement = () => {
    if (!existing) return;
    if (!window.confirm('Delete this payment?')) return;
    remove.mutate(existing.id, { onSuccess: () => navigate(backTo, { replace: true }) });
  };

  return (
    <Shell title={mode === 'new' ? 'Settle up' : 'Edit payment'} back={backTo}>
      <Card>
        <p className="mb-4 text-sm text-muted">
          {mode === 'new'
            ? 'Record a payment made outside the app — cash, bank transfer, PayPal…'
            : 'Fix the details of this recorded payment.'}
        </p>
        <form onSubmit={submit} className="space-y-4">
          <Field label="Who paid?">
            <Select value={payer} onChange={(e) => setPayerId(Number(e.target.value))}>
              {members.map((m) => (
                <option key={m.userId} value={m.userId}>
                  {m.name}
                  {m.userId === myId ? ' (you)' : ''}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Who received it?">
            <Select value={recipient} onChange={(e) => setRecipientId(Number(e.target.value))}>
              {members.map((m) => (
                <option key={m.userId} value={m.userId}>
                  {m.name}
                  {m.userId === myId ? ' (you)' : ''}
                </option>
              ))}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Amount (€)">
              <TextInput
                inputMode="decimal"
                placeholder="0,00"
                required
                value={amountText}
                onChange={(e) => setAmountText(e.target.value)}
              />
            </Field>
            <Field label="Date">
              <TextInput type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
          </div>
          <ErrorText>{formError ?? mutation.error?.message ?? remove.error?.message}</ErrorText>
          <Button type="submit" className="w-full" disabled={mutation.isPending}>
            {mutation.isPending ? 'Saving…' : mode === 'new' ? 'Record payment' : 'Save changes'}
          </Button>
          {mode === 'edit' && (
            <Button
              type="button"
              variant="danger"
              className="w-full"
              onClick={deleteSettlement}
              disabled={remove.isPending}
            >
              Delete payment
            </Button>
          )}
        </form>
      </Card>
    </Shell>
  );
}
