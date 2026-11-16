import { describe, expect, test } from 'vitest';
import { buildBadges } from '../hooks/useNavBadges';

const t = (k, v) => `${k}:${JSON.stringify(v)}`;
const f = { money: (v) => `Rs ${v}` };

describe('live navigation badges', () => {
  test('no stats -> no badges', () => { expect(buildBadges(null, t, f)).toEqual({}); });
  test('zero counts are hidden', () => {
    expect(buildBadges({ lowStock: 0, outOfStock: 0, expired: 0, nearExpiry: 0, owing: 0, outstanding: 0, todaySales: 0 }, t, f)).toEqual({});
  });
  test('stock and expiry badges become red when something is out of stock / expired, amber otherwise', () => {
    const b = buildBadges({ lowStock: 3, outOfStock: 1, expired: 0, nearExpiry: 4, owing: 0, outstanding: 0 }, t, f);
    expect(b.inventory).toMatchObject({ n: 4, tone: 'danger' });
    expect(b.expiry).toMatchObject({ n: 4, tone: 'warn' });
    expect(buildBadges({ lowStock: 2, outOfStock: 0 }, t, f).inventory.tone).toBe('warn');
  });
  test('customers owing and sales today', () => {
    const b = buildBadges({ owing: 5, outstanding: 12000, todaySales: 17 }, t, f);
    expect(b.customers).toMatchObject({ n: 5, tone: 'warn' }); expect(b.customers.hint).toContain('Rs 12000');
    expect(b.sales).toMatchObject({ n: 17, tone: 'info' });
  });
});
