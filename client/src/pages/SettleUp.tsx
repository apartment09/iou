import { useState, type FormEvent } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { parseAmount } from '@splitt/shared';
import { useCreateSettlement, useGroup, useMe } from '../api/hooks.js';
import { Shell } from '../components/Layout.js';
import { Button, Card, ErrorText, Field, Select, Spinner, TextInput } from '../components/ui.js';
import { centsToInput, todayIso } from '../lib/format.js';

export function SettleUpPage() {
  const groupId = Number(useParams().groupId);
  const [params] = useSearchParams();
  const { data: group } = useGroup(groupId);
  const { data: me } = useMe();
  const settle = useCreateSettlement(groupId);
  const navigate = useNavigate();

  const prefillAmount = Number(params.get('amount'));
  const [payerId, setPayerId] = useState(() => Number(params.get('from')) || 0);
  const [recipientId, setRecipientId] = useState(() => Number(params.get('to')) || 0);
  const [amountText, setAmountText] = useState(prefillAmount > 0 ? centsToInput(prefillAmount) : '');
  const [date, setDate] = useState(todayIso());
  const [formError, setFormError] = useState<string | null>(null);

  if (!group || !me) {
    return (
      <Shell title="Settle up" back="">
        <Spinner />
      </Shell>
    );
  }
  const members = group.members.filter((m) => m.leftAt === null);
  const payer = payerId || me.id;
  const recipient = recipientId || members.find((m) => m.userId !== payer)?.userId || 0;

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
    settle.mutate(
      { payerId: payer, recipientId: recipient, amountCents, date },
      { onSuccess: () => navigate(`/groups/${groupId}?tab=balances`, { replace: true }) },
    );
  };

  return (
    <Shell title="Settle up" back={`/groups/${groupId}?tab=balances`}>
      <Card>
        <p className="mb-4 text-sm text-slate-500">
          Record a payment made outside the app — cash, bank transfer, PayPal…
        </p>
        <form onSubmit={submit} className="space-y-4">
          <Field label="Who paid?">
            <Select value={payer} onChange={(e) => setPayerId(Number(e.target.value))}>
              {members.map((m) => (
                <option key={m.userId} value={m.userId}>
                  {m.name}
                  {m.userId === me.id ? ' (you)' : ''}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Who received it?">
            <Select value={recipient} onChange={(e) => setRecipientId(Number(e.target.value))}>
              {members.map((m) => (
                <option key={m.userId} value={m.userId}>
                  {m.name}
                  {m.userId === me.id ? ' (you)' : ''}
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
          <ErrorText>{formError ?? settle.error?.message}</ErrorText>
          <Button type="submit" className="w-full" disabled={settle.isPending}>
            {settle.isPending ? 'Recording…' : 'Record payment'}
          </Button>
        </form>
      </Card>
    </Shell>
  );
}
