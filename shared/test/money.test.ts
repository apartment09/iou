import { describe, expect, it } from 'vitest';
import { formatCents, parseAmount } from '../src/money.js';

describe('parseAmount', () => {
  it.each([
    ['12', 1200],
    ['12,40', 1240],
    ['12.40', 1240],
    ['12,4', 1240],
    ['0,99', 99],
    ['0', 0],
    [' 7,50 € ', 750],
    ['1234567', 123456700],
  ])('parses %s to %d cents', (input, cents) => {
    expect(parseAmount(input)).toBe(cents);
  });

  it.each(['', 'abc', '12,345', '1.234,56', '-5', '12,', ',50', '1e3'])(
    'rejects %s',
    (input) => {
      expect(parseAmount(input)).toBeNull();
    },
  );
});

describe('formatCents', () => {
  it('formats EUR in English notation', () => {
    expect(formatCents(1240)).toContain('12.40');
    expect(formatCents(1240)).toContain('€');
    expect(formatCents(123456)).toContain('1,234.56');
  });
});
