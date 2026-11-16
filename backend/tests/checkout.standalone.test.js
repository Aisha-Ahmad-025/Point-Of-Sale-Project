// Same guarantees on a STANDALONE mongod (no transactions): conditional atomic updates + compensating rollback.
const h = require('./helpers/setup');

let app; let cashier; let mk;
beforeAll(async () => { await h.startDb({ standalone: true }); app = h.app(); });
afterAll(h.stopDb);
beforeEach(async () => { await h.clearDb(); cashier = await h.login(app, 'cashier'); mk = await h.makeCatalog(); });
const cart = (items) => ({ clientRequestId: h.rid(), items, amountReceived: 100000 });
const remaining = async (pid) => (await h.models().Batch.find({ product: pid })).reduce((a, b) => a + b.remainingQuantity, 0);

describe('checkout without transactions (fallback)', () => {
  test('transactions are reported OFF for standalone', async () => {
    expect(require('../src/config/db').dbState.transactions).toBe(false);
    expect((await cashier.get('/api/v1/health')).body.data.transactions).toBe(false);
  });
  test('successful sale deducts stock and records movements', async () => {
    const p = await mk.product({}, [{ qty: 10 }]);
    const res = await cashier.post('/api/v1/sales').send(cart([{ productId: String(p._id), quantity: 4 }]));
    expect(res.status).toBe(201); expect(await remaining(p._id)).toBe(6);
  });
  test('failure in the second line compensates the first line (no partial sale, no lost stock)', async () => {
    const a = await mk.product({}, [{ qty: 5 }]); const b = await mk.product({}, [{ qty: 1 }]);
    const res = await cashier.post('/api/v1/sales').send(cart([{ productId: String(a._id), quantity: 3 }, { productId: String(b._id), quantity: 2 }]));
    expect(res.status).toBe(409);
    expect(await remaining(a._id)).toBe(5); expect(await remaining(b._id)).toBe(1);
    expect(await h.models().Sale.countDocuments()).toBe(0); expect(await h.models().Movement.countDocuments()).toBe(0);
  });
  test('concurrent checkouts cannot oversell', async () => {
    const p = await mk.product({}, [{ qty: 5 }]);
    const send = () => cashier.post('/api/v1/sales').send(cart([{ productId: String(p._id), quantity: 3 }]));
    const results = await Promise.all([send(), send(), send()]);
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(await remaining(p._id)).toBe(2);
  });
  test('duplicate request id returns the original sale', async () => {
    const p = await mk.product({}, [{ qty: 10 }]);
    const body = cart([{ productId: String(p._id), quantity: 1 }]);
    const r1 = await cashier.post('/api/v1/sales').send(body); const r2 = await cashier.post('/api/v1/sales').send(body);
    expect(r1.body.data.sale._id).toBe(r2.body.data.sale._id); expect(await remaining(p._id)).toBe(9);
  });
});
