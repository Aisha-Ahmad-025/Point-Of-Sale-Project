const { buildDataset, reconcile } = require('../../src/scripts/seedData');

describe('seed dataset', () => {
  let n = 0;
  const newId = () => `id${(n += 1)}`;
  const today = new Date(Date.UTC(2026, 9, 17));
  const data = buildDataset({ today, newId, passwordHashes: { admin: { _id: 'a', name: 'A' }, cashiers: [{ _id: 'c1', name: 'C1' }, { _id: 'c2', name: 'C2' }] } });

  test('has realistic volume', () => {
    expect(data.products.length).toBeGreaterThanOrEqual(30);
    expect(data.sales.length).toBeGreaterThan(500);
    expect(new Set(data.products.map((p) => p.barcode)).size).toBe(data.products.length);
  });
  test('movements reconcile with batch quantities and nothing is negative', () => {
    expect(reconcile(data).ok).toBe(true);
    expect(data.batches.every((b) => b.remainingQuantity >= 0)).toBe(true);
  });
  test('sale totals equal the sum of their lines and profit uses cost snapshots', () => {
    const s = data.sales.find((x) => x.status === 'completed');
    expect(Math.round(s.items.reduce((a, i) => a + i.lineTotal, 0) * 100)).toBe(Math.round(s.total * 100));
    expect(Math.round((s.netRevenue - s.cogs) * 100)).toBe(Math.round(s.grossProfit * 100));
  });
  test('includes expired and near-expiry stock, voided sales and wastage', () => {
    expect(data.batches.some((b) => b.expiryDate && b.expiryDate < today && b.remainingQuantity > 0)).toBe(true);
    expect(data.sales.some((s) => s.status === 'voided')).toBe(true);
    expect(data.movements.some((m) => m.type === 'wastage')).toBe(true);
  });
  test('no sold batch was expired on the day of sale', () => {
    const byId = new Map(data.batches.map((b) => [String(b._id), b]));
    const bad = data.sales.filter((s) => s.items.some((i) => i.allocations.some((a) => { const b = byId.get(String(a.batch)); const day = new Date(Date.UTC(s.createdAt.getUTCFullYear(), s.createdAt.getUTCMonth(), s.createdAt.getUTCDate())); return b.expiryDate && b.expiryDate < day; })));
    expect(bad.length).toBe(0);
  });

  test('khata: balances reconcile with the ledger, limits are respected and credit sales are explicit', () => {
    expect(data.customers.length).toBeGreaterThanOrEqual(10);
    expect(reconcile(data)).toMatchObject({ ledgerMismatches: 0, customerMismatches: 0 });
    const credit = data.sales.filter((x) => x.payment.creditAmount > 0);
    expect(credit.length).toBeGreaterThan(20);
    expect(credit.every((x) => x.customer && x.paymentStatus !== 'paid')).toBe(true);
    expect(credit.some((x) => x.payment.method === 'partial') && credit.some((x) => x.payment.method === 'credit')).toBe(true);
    expect(data.ledger.some((e) => e.type === 'payment') && data.ledger.some((e) => e.type === 'adjustment')).toBe(true);
    expect(data.customers.every((c) => c.balanceCents >= 0 && c.balanceCents <= c.creditLimitCents)).toBe(true);
    expect(data.sales.filter((x) => x.status === 'voided').every((x) => x.payment.creditAmount === 0)).toBe(true);
  });
});
