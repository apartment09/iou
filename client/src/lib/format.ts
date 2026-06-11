import { formatCents, type ExpenseDto } from '@iou/shared';

export const money = (cents: number) => formatCents(cents);

/** "12,40" for an input field, from cents. */
export const centsToInput = (cents: number) => (cents / 100).toFixed(2).replace('.', ',');

export const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export function formatDay(isoDate: string): string {
  if (isoDate === todayIso()) return 'Today';
  return new Date(`${isoDate}T00:00:00`).toLocaleDateString('de-DE', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
  });
}

export function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString('de-DE', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Positive: this expense earns me money (I paid more than my share). */
export function myImpact(expense: ExpenseDto, myUserId: number): number {
  const myShare = expense.splits.find((s) => s.userId === myUserId)?.cents ?? 0;
  const paid = expense.paidBy === myUserId ? expense.amountCents : 0;
  return paid - myShare;
}

export function memberName(members: { userId: number; name: string }[], userId: number): string {
  return members.find((m) => m.userId === userId)?.name ?? 'Unknown';
}
