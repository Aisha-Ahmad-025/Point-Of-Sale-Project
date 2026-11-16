const { allocateFefo, fefoSort, batchStatus } = require('../../src/utils/fefo');
const d = (s) => (s ? new Date(`${s}T00:00:00Z`) : null);
const mk = (id, rem, exp, recv = '2026-01-01') => ({ _id: id, lotNumber: id, remainingQuantity: rem, expiryDate: d(exp), receivedDate: d(recv), costPrice: 10 });

describe('FEFO', () => {
  test('earliest expiry first, non-expiring last', () => {
    const order = fefoSort([mk('none', 5, null), mk('late', 5, '2026-12-01'), mk('soon', 5, '2026-10-20')]).map((b) => b._id);
    expect(order).toEqual(['soon', 'late', 'none']);
  });
  test('allocates across batches and reports shortfall', () => {
    const r = allocateFefo([mk('a', 3, '2026-10-20'), mk('b', 4, '2026-11-01')], 8);
    expect(r.allocations.map((a) => [a.lotNumber, a.quantity])).toEqual([['a', 3], ['b', 4]]);
    expect(r.shortfall).toBe(1);
  });
  test('ties on expiry use the oldest received batch', () => {
    const r = allocateFefo([mk('new', 5, '2026-11-01', '2026-03-01'), mk('old', 5, '2026-11-01', '2026-01-01')], 2);
    expect(r.allocations[0].lotNumber).toBe('old');
  });
  test('batch status', () => {
    const today = d('2026-10-17');
    expect(batchStatus({ expiryDate: d('2026-10-16') }, today, 7).status).toBe('expired');
    expect(batchStatus({ expiryDate: d('2026-10-17') }, today, 7).status).toBe('near_expiry'); // expires end of that day
    expect(batchStatus({ expiryDate: d('2026-11-30') }, today, 7).status).toBe('ok');
    expect(batchStatus({ expiryDate: null }, today, 7).status).toBe('no_expiry');
  });
});
