const h = require('./helpers/setup');

let app; let cashier; let admin; let mk;
beforeAll(async () => { await h.startDb(); app = h.app(); });
afterAll(h.stopDb);
beforeEach(async () => {
  await h.clearDb();
  cashier = await h.login(app, 'cashier'); admin = await h.login(app, 'admin');
  mk = await h.makeCatalog();
});
const cart = (items, extra = {}) => ({ clientRequestId: h.rid(), items, amountReceived: 100000, ...extra });
const remaining = async (pid) => (await h.models().Batch.find({ product: pid })).reduce((a, b) => a + b.remainingQuantity, 0);

describe('checkout', () => {
  test('successful cash sale: server-calculated totals, snapshots, movements, stock deducted', async () => {
    const p = await mk.product({ sellingPrice: 100, costPrice: 60, taxRate: 10 }, [{ qty: 10, cost: 60 }]);
    const res = await cashier.post('/api/v1/sales').send(cart([{ productId: String(p._id), quantity: 3 }], { amountReceived: 400 }));
    expect(res.status).toBe(201);
    const s = res.body.data.sale;
    expect(s.subtotal).toBe(300); expect(s.taxTotal).toBe(30); expect(s.total).toBe(330);
    expect(s.payment.change).toBe(70);
    expect(s.cogs).toBe(180); expect(s.netRevenue).toBe(300); expect(s.grossProfit).toBe(120);
    expect(s.receiptNumber).toMatch(/^SS-\d{8}-\d{5}$/);
    expect(s.items[0]).toMatchObject({ name: p.name, sku: p.sku, unitPrice: 100, unitCost: 60 });
    expect(await remaining(p._id)).toBe(7);
    expect(await h.models().Movement.countDocuments({ type: 'sale', sale: s._id })).toBe(1);
  });
  test('never trusts client supplied totals or prices', async () => {
    const p = await mk.product({ sellingPrice: 100 }, [{ qty: 10 }]);
    const res = await cashier.post('/api/v1/sales').send({ ...cart([{ productId: String(p._id), quantity: 2, unitPrice: 1, total: 1 }]), total: 1, subtotal: 1 });
    expect(res.body.data.sale.total).toBe(200);
  });
  test('insufficient cash is rejected without touching stock', async () => {
    const p = await mk.product({}, [{ qty: 10 }]);
    const res = await cashier.post('/api/v1/sales').send(cart([{ productId: String(p._id), quantity: 2 }], { amountReceived: 50 }));
    expect(res.status).toBe(400); expect(res.body.error.code).toBe('PAYMENT_INSUFFICIENT');
    expect(await remaining(p._id)).toBe(10);
  });
  test('insufficient stock: 409 and a multi-line cart is rolled back atomically', async () => {
    const a = await mk.product({}, [{ qty: 5 }]); const b = await mk.product({}, [{ qty: 1 }]);
    const res = await cashier.post('/api/v1/sales').send(cart([{ productId: String(a._id), quantity: 2 }, { productId: String(b._id), quantity: 3 }]));
    expect(res.status).toBe(409); expect(res.body.error.code).toBe('INSUFFICIENT_STOCK');
    expect(await remaining(a._id)).toBe(5); expect(await remaining(b._id)).toBe(1);
    expect(await h.models().Sale.countDocuments()).toBe(0);
    expect(await h.models().Movement.countDocuments({ type: 'sale' })).toBe(0);
  });
  test('duplicate submission with the same request id creates ONE sale', async () => {
    const p = await mk.product({}, [{ qty: 10 }]);
    const body = cart([{ productId: String(p._id), quantity: 2 }]);
    const [r1, r2] = await Promise.all([cashier.post('/api/v1/sales').send(body), cashier.post('/api/v1/sales').send(body)]);
    expect([r1.status, r2.status].every((s) => s === 200 || s === 201)).toBe(true);
    expect(r1.body.data.sale._id).toBe(r2.body.data.sale._id);
    expect(await h.models().Sale.countDocuments()).toBe(1);
    expect(await remaining(p._id)).toBe(8);
    const again = await cashier.post('/api/v1/sales').send(body);
    expect(again.body.data.duplicate).toBe(true);
  });
  test('concurrent checkouts can never oversell', async () => {
    const p = await mk.product({}, [{ qty: 5 }]);
    const send = () => cashier.post('/api/v1/sales').send(cart([{ productId: String(p._id), quantity: 3 }]));
    const results = await Promise.all([send(), send()]);
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(results.filter((r) => r.status === 409)).toHaveLength(1);
    expect(await remaining(p._id)).toBe(2);
  });
  test('FEFO: earliest expiry is consumed first and expired batches are never sold', async () => {
    const p = await mk.product({ trackExpiry: true }, [
      { lot: 'EXPIRED', qty: 10, expiry: h.dayOffset(-1) }, { lot: 'LATE', qty: 10, expiry: h.dayOffset(30) }, { lot: 'SOON', qty: 10, expiry: h.dayOffset(3) },
    ]);
    const res = await cashier.post('/api/v1/sales').send(cart([{ productId: String(p._id), quantity: 12 }]));
    expect(res.status).toBe(201);
    const allocs = res.body.data.sale.items[0].allocations.map((a) => [a.lotNumber, a.quantity]);
    expect(allocs).toEqual([['SOON', 10], ['LATE', 2]]);
    const expired = await h.models().Batch.findOne({ lotNumber: 'EXPIRED' });
    expect(expired.remainingQuantity).toBe(10);
    // only 8 sellable units remain, the 10 expired units must not count
    const again = await cashier.post('/api/v1/sales').send(cart([{ productId: String(p._id), quantity: 9 }]));
    expect(again.status).toBe(409);
  });
  test('stock expiring today is still sellable (valid through end of expiry day)', async () => {
    const p = await mk.product({ trackExpiry: true }, [{ lot: 'TODAY', qty: 4, expiry: h.dayOffset(0) }]);
    expect((await cashier.post('/api/v1/sales').send(cart([{ productId: String(p._id), quantity: 1 }]))).status).toBe(201);
  });
  test('inactive products cannot be sold', async () => {
    const p = await mk.product({ isActive: false }, [{ qty: 5 }]);
    expect((await cashier.post('/api/v1/sales').send(cart([{ productId: String(p._id), quantity: 1 }]))).status).toBe(409);
  });
  test('discount authorisation: cashier limited, admin allowed', async () => {
    const p = await mk.product({ sellingPrice: 100 }, [{ qty: 10 }]);
    const item = (d) => [{ productId: String(p._id), quantity: 1, discountPercent: d }];
    expect((await cashier.post('/api/v1/sales').send(cart(item(5)))).status).toBe(201);
    const denied = await cashier.post('/api/v1/sales').send(cart(item(20)));
    expect(denied.status).toBe(403); expect(denied.body.error.code).toBe('DISCOUNT_NOT_ALLOWED');
    const ok = await admin.post('/api/v1/sales').send(cart(item(20)));
    expect(ok.status).toBe(201); expect(ok.body.data.sale.total).toBe(80);
  });
  test('whole-unit products reject fractional quantities; weighed products accept them', async () => {
    const pcs = await mk.product({ unit: 'pcs' }, [{ qty: 10 }]); const kg = await mk.product({ unit: 'kg' }, [{ qty: 10 }]);
    expect((await cashier.post('/api/v1/sales').send(cart([{ productId: String(pcs._id), quantity: 1.5 }]))).status).toBe(400);
    expect((await cashier.post('/api/v1/sales').send(cart([{ productId: String(kg._id), quantity: 1.5 }]))).status).toBe(201);
  });
  test('validation: empty cart, bad ids, non-positive quantity', async () => {
    expect((await cashier.post('/api/v1/sales').send(cart([]))).status).toBe(400);
    expect((await cashier.post('/api/v1/sales').send(cart([{ productId: 'abc', quantity: 1 }]))).status).toBe(400);
    const p = await mk.product({}, [{ qty: 1 }]);
    expect((await cashier.post('/api/v1/sales').send(cart([{ productId: String(p._id), quantity: 0 }]))).status).toBe(400);
  });
  test('cashiers see only their own sales and no cost data; admins see everything', async () => {
    const p = await mk.product({}, [{ qty: 10 }]);
    const mine = (await cashier.post('/api/v1/sales').send(cart([{ productId: String(p._id), quantity: 1 }]))).body.data.sale;
    const theirs = (await admin.post('/api/v1/sales').send(cart([{ productId: String(p._id), quantity: 1 }]))).body.data.sale;
    const list = await cashier.get('/api/v1/sales');
    expect(list.body.data.map((s) => s._id)).toEqual([mine._id]);
    expect((await cashier.get(`/api/v1/sales/${theirs._id}`)).status).toBe(403);
    const detail = await cashier.get(`/api/v1/sales/${mine._id}`);
    expect(detail.body.data.cogs).toBeUndefined(); expect(detail.body.data.items[0].unitCost).toBeUndefined();
    expect((await admin.get('/api/v1/sales')).body.meta.total).toBe(2);
  });
  test('receipt contains store, cashier, items, payment', async () => {
    const p = await mk.product({}, [{ qty: 3 }]);
    const sale = (await cashier.post('/api/v1/sales').send(cart([{ productId: String(p._id), quantity: 1 }], { amountReceived: 500 }))).body.data.sale;
    const r = await cashier.get(`/api/v1/sales/${sale._id}/receipt`);
    expect(r.body.data.store.storeName).toBeTruthy();
    expect(r.body.data.sale).toMatchObject({ receiptNumber: sale.receiptNumber, cashierName: cashier.user.name });
    expect(r.body.data.sale.payment.change).toBe(400);
  });
  test('void: admin only, restores the exact batches, writes movements, cannot repeat, excluded from reports', async () => {
    const p = await mk.product({}, [{ lot: 'A', qty: 10 }]);
    const sale = (await cashier.post('/api/v1/sales').send(cart([{ productId: String(p._id), quantity: 4 }]))).body.data.sale;
    expect((await cashier.post(`/api/v1/sales/${sale._id}/void`).send({ reason: 'mistake' })).status).toBe(403);
    expect((await admin.post(`/api/v1/sales/${sale._id}/void`).send({ reason: 'x' })).status).toBe(400);
    const v = await admin.post(`/api/v1/sales/${sale._id}/void`).send({ reason: 'Customer returned' });
    expect(v.status).toBe(200); expect(v.body.data.status).toBe('voided');
    expect(await remaining(p._id)).toBe(10);
    expect(await h.models().Movement.countDocuments({ type: 'void_return', quantity: 4 })).toBe(1);
    expect((await admin.post(`/api/v1/sales/${sale._id}/void`).send({ reason: 'again again' })).status).toBe(409);
    const dash = await admin.get('/api/v1/reports/dashboard');
    expect(dash.body.data.today.transactions).toBe(0);
  });
  test('inventory reconciles: sum of movements equals remaining stock after sales, void and adjustments', async () => {
    const p = await mk.product({}, [{ lot: 'A', qty: 20 }]);
    const { Movement, Batch } = h.models();
    await Movement.create({ product: p._id, batch: (await Batch.findOne({ product: p._id }))._id, type: 'opening', quantity: 20 });
    const s1 = (await cashier.post('/api/v1/sales').send(cart([{ productId: String(p._id), quantity: 5 }]))).body.data.sale;
    await cashier.post('/api/v1/sales').send(cart([{ productId: String(p._id), quantity: 2 }]));
    await admin.post(`/api/v1/sales/${s1._id}/void`).send({ reason: 'Customer returned' });
    const batch = await Batch.findOne({ product: p._id });
    await admin.post('/api/v1/inventory/adjustments').send({ batchId: String(batch._id), mode: 'delta', quantity: -3, reason: 'Damaged on shelf', requestId: h.rid() });
    const sum = (await Movement.find({ product: p._id })).reduce((a, m) => a + m.quantity, 0);
    expect(sum).toBe((await Batch.findOne({ product: p._id })).remainingQuantity);
  });
});
