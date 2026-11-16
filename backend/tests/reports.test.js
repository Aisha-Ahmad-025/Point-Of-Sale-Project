const h = require('./helpers/setup');

let app; let admin; let mk;
beforeAll(async () => { await h.startDb(); app = h.app(); });
afterAll(h.stopDb);
beforeEach(async () => { await h.clearDb(); admin = await h.login(app, 'admin'); mk = await h.makeCatalog(); });
const sell = (p, qty, extra = {}) => admin.post('/api/v1/sales').send({ clientRequestId: h.rid(), items: [{ productId: String(p._id), quantity: qty, ...extra }], amountReceived: 1000000 });

describe('reports and analytics', () => {
  test('dashboard figures come from real transactions and match them', async () => {
    const p = await mk.product({ sellingPrice: 100, costPrice: 60, taxRate: 10 }, [{ qty: 50, cost: 60 }]);
    await sell(p, 3); await sell(p, 2, { discountPercent: 10 });
    const d = (await admin.get('/api/v1/reports/dashboard')).body.data;
    expect(d.today.transactions).toBe(2); expect(d.today.units).toBe(5);
    expect(d.today.netRevenue).toBe(300 + 180); // second sale: 200 - 10%
    expect(d.today.total).toBe(330 + 198);
    expect(d.today.grossProfit).toBe(480 - 300); // revenue excl. tax - cogs (5 x 60)
    expect(d.payments[0]).toMatchObject({ method: 'cash', count: 2 });
    expect(d.bestSellers[0].units).toBe(5);
  });
  test('dashboard compares the range with the previous period (null when there is nothing to compare)', async () => {
    const p = await mk.product({ sellingPrice: 100 }, [{ qty: 50 }]);
    await sell(p, 2);
    const d = (await admin.get('/api/v1/reports/dashboard')).body.data;
    expect(d.previous).toMatchObject({ transactions: 0, total: 0 });
    expect(d.change).toEqual({ revenuePct: null, profitPct: null, transactionsPct: null });
    expect(d.trend).toHaveLength(1);
  });
  test('profit report: tax excluded, wastage reported separately and not part of gross profit', async () => {
    const p = await mk.product({ sellingPrice: 100, costPrice: 60, taxRate: 17 }, [{ lot: 'A', qty: 50, cost: 60 }]);
    await sell(p, 4);
    const b = await h.models().Batch.findOne({ product: p._id });
    await admin.post('/api/v1/inventory/wastage').send({ batchId: String(b._id), quantity: 5, reason: 'damaged', requestId: h.rid() });
    const r = (await admin.get('/api/v1/reports/profit')).body.data;
    expect(r.totals.netRevenue).toBe(400); expect(r.totals.cogs).toBe(240); expect(r.totals.grossProfit).toBe(160);
    expect(r.totals.marginPct).toBe(40);
    expect(r.wastage.cost).toBe(300);
    expect(r.grossProfitAfterWastage).toBe(160 - 300);
    expect(r.definitions.wastageIncluded).toBe(false);
  });
  test('profit uses historical cost snapshots: changing product cost does not rewrite past profit', async () => {
    const p = await mk.product({ sellingPrice: 100, costPrice: 60 }, [{ qty: 50, cost: 60 }]);
    await sell(p, 1);
    await admin.patch(`/api/v1/products/${p._id}`).send({ costPrice: 95 });
    const r = (await admin.get('/api/v1/reports/profit')).body.data;
    expect(r.totals.grossProfit).toBe(40);
  });
  test('sales report groups by day and compares with previous period', async () => {
    const p = await mk.product({ sellingPrice: 10 }, [{ qty: 50 }]);
    await sell(p, 2);
    const r = (await admin.get('/api/v1/reports/sales?groupBy=day')).body.data;
    expect(r.rows).toHaveLength(1); expect(r.rows[0].transactions).toBe(1);
    expect(r.change).toHaveProperty('revenuePct');
  });
  test('date range validation', async () => {
    expect((await admin.get('/api/v1/reports/sales?from=2026-02-01&to=2026-01-01')).status).toBe(400);
    expect((await admin.get('/api/v1/reports/sales?from=nonsense')).status).toBe(400);
  });
  test('product performance flags dead stock and never flags brand new products', async () => {
    const old = await mk.product({}, [{ qty: 5 }]);
    await h.models().Product.collection.updateOne({ _id: old._id }, { $set: { createdAt: h.dayOffset(-120) } });
    const fresh = await mk.product({}, [{ qty: 5 }]);
    const rows = (await admin.get('/api/v1/reports/products')).body.data.rows;
    expect(rows.find((r) => r.productId === String(old._id)).class).toBe('dead');
    expect(rows.find((r) => r.productId === String(fresh._id)).class).toBe('new');
  });
  test('stock report valuation', async () => {
    await mk.product({ sellingPrice: 30 }, [{ qty: 10, cost: 20 }]);
    const r = (await admin.get('/api/v1/reports/stock')).body.data;
    expect(r.summary.costValue).toBe(200); expect(r.summary.retailValue).toBe(300);
  });
});

describe('forecasting', () => {
  test('returns labelled estimates with formulas and handles history/zero demand', async () => {
    const sold = await mk.product({ leadTimeDays: 2, safetyStock: 3 }, [{ qty: 100 }]);
    await h.models().Product.collection.updateOne({ _id: sold._id }, { $set: { createdAt: h.dayOffset(-60) } });
    const idle = await mk.product({}, [{ qty: 5 }]);
    await sell(sold, 10);
    const r = (await admin.get('/api/v1/forecasting/reorder')).body.data;
    expect(r.disclaimer).toMatch(/not machine learning/i);
    expect(r.formulas.reorderPoint).toMatch(/lead/i);
    const a = r.rows.find((x) => x.productId === String(sold._id));
    expect(a.estimated).toBe(true); expect(a.avgDailyDemand).toBeGreaterThan(0); expect(a.basis.leadTimeDays).toBe(2);
    expect(a.reorderPoint).toBeCloseTo(a.avgDailyDemand * 2 + 3, 1);
    const b = r.rows.find((x) => x.productId === String(idle._id));
    expect(b.insufficientHistory).toBe(true); expect(b.daysRemaining).toBeNull();
  });
  test('voided sales are excluded from demand', async () => {
    const p = await mk.product({}, [{ qty: 100 }]);
    await h.models().Product.collection.updateOne({ _id: p._id }, { $set: { createdAt: h.dayOffset(-60) } });
    const sale = (await sell(p, 20)).body.data.sale;
    await admin.post(`/api/v1/sales/${sale._id}/void`).send({ reason: 'Customer returned' });
    const r = (await admin.get('/api/v1/forecasting/reorder')).body.data;
    expect(r.rows.find((x) => x.productId === String(p._id)).avgDailyDemand).toBe(0);
  });
});

describe('settings', () => {
  test('admin can update and the change is audited; invalid values are rejected', async () => {
    const res = await admin.put('/api/v1/settings').send({ taxRate: 8, nearExpiryDays: 10 });
    expect(res.status).toBe(200); expect(res.body.data.taxRate).toBe(8);
    expect(await h.models().AuditLog.countDocuments({ action: 'settings.update' })).toBe(1);
    expect((await admin.put('/api/v1/settings').send({ taxRate: 500 })).status).toBe(400);
    expect((await admin.put('/api/v1/settings').send({ timezone: 'Mars/Base' })).status).toBe(400);
    expect((await admin.put('/api/v1/settings').send({ hacker: true })).status).toBe(400);
  });
});
