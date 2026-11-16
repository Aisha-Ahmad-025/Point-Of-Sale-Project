const h = require('./helpers/setup');

let app; let admin; let mk;
beforeAll(async () => { await h.startDb(); app = h.app(); });
afterAll(h.stopDb);
beforeEach(async () => { await h.clearDb(); admin = await h.login(app, 'admin'); mk = await h.makeCatalog(); });
const models = () => h.models();

describe('inventory', () => {
  test('receiving stock creates a separate batch with its own expiry and a receipt movement', async () => {
    const p = await mk.product({ trackExpiry: true }, [{ qty: 5, expiry: h.dayOffset(5) }]);
    const res = await admin.post('/api/v1/inventory/receipts').send({ productId: String(p._id), quantity: 20, costPrice: 55, expiryDate: h.ymd(h.dayOffset(40)), lotNumber: 'NEW1', requestId: h.rid() });
    expect(res.status).toBe(201);
    expect(await models().Batch.countDocuments({ product: p._id })).toBe(2);
    expect(await models().Movement.countDocuments({ type: 'receipt', quantity: 20 })).toBe(1);
  });
  test('receiving rules: expiry required for perishables, no expired stock, no duplicate lot', async () => {
    const p = await mk.product({ trackExpiry: true });
    const post = (o) => admin.post('/api/v1/inventory/receipts').send({ productId: String(p._id), quantity: 5, requestId: h.rid(), ...o });
    expect((await post({})).body.error.code).toBe('EXPIRY_REQUIRED');
    expect((await post({ expiryDate: h.ymd(h.dayOffset(-1)) })).body.error.code).toBe('EXPIRED_STOCK');
    expect((await post({ expiryDate: h.ymd(h.dayOffset(9)), lotNumber: 'L9' })).status).toBe(201);
    expect((await post({ expiryDate: h.ymd(h.dayOffset(9)), lotNumber: 'L9' })).status).toBe(409);
  });
  test('adjustments cannot make stock negative', async () => {
    const p = await mk.product({}, [{ qty: 4 }]); const b = await models().Batch.findOne({ product: p._id });
    const res = await admin.post('/api/v1/inventory/adjustments').send({ batchId: String(b._id), mode: 'delta', quantity: -5, reason: 'Count', requestId: h.rid() });
    expect(res.status).toBe(409); expect(res.body.error.code).toBe('NEGATIVE_STOCK');
    expect((await models().Batch.findById(b._id)).remainingQuantity).toBe(4);
  });
  test('adjust to a counted quantity (set mode) records the difference', async () => {
    const p = await mk.product({}, [{ qty: 10 }]); const b = await models().Batch.findOne({ product: p._id });
    await admin.post('/api/v1/inventory/adjustments').send({ batchId: String(b._id), mode: 'set', quantity: 7, reason: 'Stock count', requestId: h.rid() });
    expect((await models().Batch.findById(b._id)).remainingQuantity).toBe(7);
    const m = await models().Movement.findOne({ type: 'adjustment_out' });
    expect(m.quantity).toBe(-3); expect(m.reason).toBe('Stock count'); expect(String(m.user)).toBe(String(admin.user._id));
  });
  test('duplicate adjustment submissions are applied once', async () => {
    const p = await mk.product({}, [{ qty: 10 }]); const b = await models().Batch.findOne({ product: p._id });
    const body = { batchId: String(b._id), mode: 'delta', quantity: -2, reason: 'Damaged', requestId: h.rid() };
    const [r1, r2] = await Promise.all([admin.post('/api/v1/inventory/adjustments').send(body), admin.post('/api/v1/inventory/adjustments').send(body)]);
    expect([r1.status, r2.status].sort()).toEqual([200, 201]);
    expect((await models().Batch.findById(b._id)).remainingQuantity).toBe(8);
    expect(await models().Movement.countDocuments({ type: 'adjustment_out' })).toBe(1);
  });
  test('wastage deducts stock, records reason/employee and reports its cost', async () => {
    const p = await mk.product({ trackExpiry: true }, [{ qty: 10, expiry: h.dayOffset(-2), cost: 40 }]); const b = await models().Batch.findOne({ product: p._id });
    const res = await admin.post('/api/v1/inventory/wastage').send({ batchId: String(b._id), quantity: 6, reason: 'expired', requestId: h.rid() });
    expect(res.status).toBe(201); expect(res.body.data.cost).toBe(240);
    expect((await models().Batch.findById(b._id)).remainingQuantity).toBe(4);
    const m = await models().Movement.findOne({ type: 'wastage' });
    expect(m).toMatchObject({ quantity: -6, wastageReason: 'expired', unitCost: 40 });
    const over = await admin.post('/api/v1/inventory/wastage').send({ batchId: String(b._id), quantity: 50, reason: 'damaged', requestId: h.rid() });
    expect(over.status).toBe(409);
  });
  test('expiry alerts separate expired from near-expiry batches', async () => {
    await mk.product({ trackExpiry: true }, [{ lot: 'E', qty: 3, expiry: h.dayOffset(-3) }, { lot: 'N', qty: 3, expiry: h.dayOffset(2) }, { lot: 'OK', qty: 3, expiry: h.dayOffset(60) }]);
    const a = (await admin.get('/api/v1/expiry/alerts')).body.data;
    expect(a.expired.map((b) => b.lotNumber)).toEqual(['E']); expect(a.near.map((b) => b.lotNumber)).toEqual(['N']);
    expect(a.expired[0].status).toBe('expired');
  });
  test('stock list: status filters, valuation and low-stock', async () => {
    await mk.product({ reorderThreshold: 10 }, [{ qty: 4, cost: 50 }]); await mk.product({ reorderThreshold: 2 }, [{ qty: 20, cost: 10 }]); await mk.product({}, []);
    const low = (await admin.get('/api/v1/inventory/stock?status=low')).body;
    expect(low.data).toHaveLength(1); expect(low.data[0].stock.value).toBe(200);
    const out = (await admin.get('/api/v1/inventory/stock?status=out')).body;
    expect(out.data).toHaveLength(1);
    expect((await admin.get('/api/v1/inventory/stock')).body.meta.summary.costValue).toBe(400);
  });
});
