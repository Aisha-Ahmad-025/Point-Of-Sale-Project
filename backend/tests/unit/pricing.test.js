const { computeLine, computeTotals, profitMetrics } = require('../../src/utils/pricing');

describe('pricing', () => {
  test('line without discount or tax', () => {
    expect(computeLine({ quantity: 3, unitPrice: 19.99 })).toEqual({ gross: 5997, discount: 0, net: 5997, tax: 0, total: 5997 });
  });
  test('discount applies before tax', () => {
    const l = computeLine({ quantity: 3, unitPrice: 19.99, discountPercent: 10, taxRate: 17 });
    expect(l).toEqual({ gross: 5997, discount: 600, net: 5397, tax: 917, total: 6314 });
  });
  test('fractional quantities (weighed goods)', () => {
    expect(computeLine({ quantity: 1.5, unitPrice: 390 }).gross).toBe(58500);
  });
  test('totals are the sum of lines in integer cents', () => {
    const a = computeLine({ quantity: 1, unitPrice: 0.1, taxRate: 5 });
    const b = computeLine({ quantity: 1, unitPrice: 0.2, taxRate: 5 });
    const t = computeTotals([a, b]);
    expect(t.gross).toBe(30);
    expect(t.total).toBe(a.total + b.total);
  });
  test('gross profit excludes sales tax and margin handles zero revenue', () => {
    const l = computeLine({ quantity: 2, unitPrice: 100, discountPercent: 10, taxRate: 10 }); // net 18000, tax 1800
    const pm = profitMetrics(l.net, 12000);
    expect(pm.grossProfit).toBe(6000);
    expect(pm.marginPct).toBeCloseTo(33.33, 2);
    expect(profitMetrics(0, 0).marginPct).toBeNull();
  });
});
