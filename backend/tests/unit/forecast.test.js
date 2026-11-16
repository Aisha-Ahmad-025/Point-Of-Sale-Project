const { forecastProduct, classifyMovement, countInStockDays } = require('../../src/utils/forecast');

const base = { windowDays: 30, inStockDays: 30, productAgeDays: 90, leadTimeDays: 3, safetyStock: 4, coverageDays: 14 };

describe('forecastProduct', () => {
  test('applies the documented formulas', () => {
    const f = forecastProduct({ ...base, unitsSold: 60, availableStock: 10 });
    expect(f.avgDailyDemand).toBe(2);
    expect(f.reorderPoint).toBe(10); // 2*3+4
    expect(f.targetStock).toBe(32); // 2*14+4
    expect(f.suggestedQty).toBe(22); // 32-10
    expect(f.daysRemaining).toBe(5);
    expect(f.risk).toBe('medium');
    expect(f.estimated).toBe(true);
  });
  test('suggested quantity never negative', () => {
    expect(forecastProduct({ ...base, unitsSold: 30, availableStock: 500 }).suggestedQty).toBe(0);
  });
  test('zero demand: no division by zero, only safety stock is targeted', () => {
    const f = forecastProduct({ ...base, unitsSold: 0, availableStock: 2 });
    expect(f.avgDailyDemand).toBe(0);
    expect(f.daysRemaining).toBeNull();
    expect(f.suggestedQty).toBe(2);
    expect(f.reasonKey).toBe('belowReorderPoint');
  });
  test('out of stock is flagged', () => {
    expect(forecastProduct({ ...base, unitsSold: 30, availableStock: 0 }).risk).toBe('out');
  });
  test('stockout before delivery is high risk', () => {
    expect(forecastProduct({ ...base, unitsSold: 150, availableStock: 10 }).risk).toBe('high'); // 5/day, 2 days left < 3 lead
  });
  test('new product: history is capped by product age and flagged as insufficient', () => {
    const f = forecastProduct({ ...base, unitsSold: 10, productAgeDays: 5, inStockDays: 5, availableStock: 3 });
    expect(f.insufficientHistory).toBe(true);
    expect(f.avgDailyDemand).toBe(2); // 10 units / 5 days, not / 30
  });
  test('stock-out days are excluded from the demand denominator', () => {
    const f = forecastProduct({ ...base, unitsSold: 30, inStockDays: 15, availableStock: 10 });
    expect(f.avgDailyDemand).toBe(2);
  });
});

describe('countInStockDays', () => {
  const days = ['d1', 'd2', 'd3', 'd4'];
  test('days that closed at zero with no sales are excluded', () => {
    // today's stock 4; d4 received +4 (delta 4); before that stock was 0 on d1..d3 with no sales
    expect(countInStockDays(4, { d4: { delta: 4, sold: 0 } }, days)).toBe(1);
  });
  test('selling days count even if they closed at zero', () => {
    expect(countInStockDays(0, { d4: { delta: -3, sold: 3 } }, days)).toBe(4); // had 3 before, sold all on d4
  });
});

describe('classifyMovement', () => {
  const p = { windowDays: 30, graceDays: 14, minDaysSinceSale: 21, slowVelocity: 0.2, availableStock: 10 };
  test('new products are never flagged', () => {
    expect(classifyMovement({ ...p, productAgeDays: 5, unitsSold: 0, daysSinceLastSale: null }).class).toBe('new');
  });
  test('no stock gives no slow-moving verdict', () => {
    expect(classifyMovement({ ...p, availableStock: 0, productAgeDays: 90, unitsSold: 0, daysSinceLastSale: 40 }).class).toBe('no_stock');
  });
  test('dead: no sales and idle long enough', () => {
    const c = classifyMovement({ ...p, productAgeDays: 90, unitsSold: 0, daysSinceLastSale: 35 });
    expect(c.class).toBe('dead'); expect(c.reasonKey).toBe('noSalesInWindow');
  });
  test('slow: low velocity', () => {
    expect(classifyMovement({ ...p, productAgeDays: 90, unitsSold: 3, daysSinceLastSale: 4 }).class).toBe('slow');
  });
  test('normal', () => {
    expect(classifyMovement({ ...p, productAgeDays: 90, unitsSold: 60, daysSinceLastSale: 0 }).class).toBe('normal');
  });
});
