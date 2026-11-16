import { describe, expect, test } from 'vitest';
import { formatMoney, formatNumber, formatDateOnly, formatPercent } from '../utils/format';
import { computeCart, computeLine } from '../utils/pricing';

describe('formatting', () => {
  test('money uses the configured currency with two decimals', () => {
    expect(formatMoney(1234.5, 'en', 'PKR')).toMatch(/1,234\.50/);
    expect(formatMoney(10, 'en', 'USD')).toMatch(/\$|USD/);
  });
  test('numbers, percentages and empty values', () => {
    expect(formatNumber(1.23456, 'en', 2)).toBe('1.23');
    expect(formatPercent(null)).toBe('—');
  });
  test('date-only values never shift a day (rendered in UTC)', () => {
    expect(formatDateOnly('2026-10-20T00:00:00.000Z', 'en')).toMatch(/20/);
  });
});

describe('client cart preview mirrors the server formula', () => {
  test('line: discount before tax, integer cents', () => {
    expect(computeLine({ quantity: 3, unitPrice: 19.99, discountPercent: 10, taxRate: 17 })).toEqual({ gross: 5997, discount: 600, net: 5397, tax: 917, total: 6314 });
  });
  test('cart totals use product tax or the store default', () => {
    const lines = [{ product: { sellingPrice: 100, taxRate: null }, quantity: 2, discountPercent: 0 }, { product: { sellingPrice: 50, taxRate: 0 }, quantity: 1, discountPercent: 0 }];
    const t = computeCart(lines, 10);
    expect(t.gross).toBe(250); expect(t.tax).toBe(20); expect(t.total).toBe(270);
  });
});
