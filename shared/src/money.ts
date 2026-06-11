/** All money in IOU is integer cents. This module is the only place that
 * converts between cents and human-readable representations. */

export function assertCents(value: number, what = 'amount'): void {
  if (!Number.isSafeInteger(value)) {
    throw new Error(`${what} must be an integer cent value, got ${value}`);
  }
}

export function formatCents(cents: number, currency = 'EUR', locale = 'de-DE'): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(cents / 100);
}

const AMOUNT_RE = /^\d{1,7}([.,]\d{1,2})?$/;

/** Parse user input like "12", "12,40", "12.4" into cents. Returns null on invalid input. */
export function parseAmount(input: string): number | null {
  const cleaned = input.trim().replace(/[\s€]/g, '');
  if (!AMOUNT_RE.test(cleaned)) return null;
  const [whole = '0', frac = ''] = cleaned.replace(',', '.').split('.');
  return Number(whole) * 100 + Number((frac + '00').slice(0, 2));
}
