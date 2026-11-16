const h = require('./helpers/setup');

let app; let admin; let cashier; let mk;
beforeAll(async () => { await h.startDb(); app = h.app(); });
afterAll(h.stopDb);
beforeEach(async () => { await h.clearDb(); admin = await h.login(app, 'admin'); cashier = await h.login(app, 'cashier'); mk = await h.makeCatalog(); });

const mkCustomer = async (over = {}) => (await admin.post('/api/v1/customers').send({ name: 'Ahmed Khan', phone: '0300 1234567', creditLimit: 1000, ...over })).body.data;
const sale = (who, p, qty, customerId, received = 0, extra = {}) => who.post('/api/v1/sales').send({ clientRequestId: h.rid(), items: [{ productId: String(p._id), quantity: qty }], amountReceived: received, ...(customerId ? { customerId } : {}), ...extra });
const ledgerSum = async (id) => (await h.models().LedgerEntry.find({ customer: id })).reduce((a, e) => a + Math.round(e.amount * 100), 0);

describe('customers', () => {
  test('create, normalise phone, reject duplicate phone, validate', async () => {
    const c = await mkCustomer();
    expect(c.phone).toBe('03001234567'); expect(c.balance).toBe(0); expect(c.creditLimit).toBe(1000); expect(c.available).toBe(1000);
    expect((await admin.post('/api/v1/customers').send({ name: 'Dup', phone: '03001234567' })).status).toBe(409);
    expect((await admin.post('/api/v1/customers').send({ name: 'X' })).status).toBe(400);
    expect((await admin.post('/api/v1/customers').send({ name: 'No Phone Ok' })).status).toBe(201);
    expect((await admin.post('/api/v1/customers').send({ name: 'Another No Phone' })).status).toBe(201);
  });
  test('cashier may add customers (default limit) but cannot set or change limits, adjust or deactivate', async () => {
    const own = await cashier.post('/api/v1/customers').send({ name: 'Walk Regular', phone: '03111111111' });
    expect(own.status).toBe(201); expect(own.body.data.creditLimit).toBe(5000); // store default
    expect((await cashier.post('/api/v1/customers').send({ name: 'Greedy', creditLimit: 99999 })).status).toBe(403);
    expect((await cashier.patch(`/api/v1/customers/${own.body.data._id}`).send({ creditLimit: 99999 })).status).toBe(403);
    expect((await cashier.patch(`/api/v1/customers/${own.body.data._id}`).send({ address: 'New street' })).status).toBe(200);
    expect((await cashier.post(`/api/v1/customers/${own.body.data._id}/adjustments`).send({ amount: -5, reason: 'nope nope', requestId: h.rid() })).status).toBe(403);
    expect((await cashier.patch(`/api/v1/customers/${own.body.data._id}/status`).send({ isActive: false })).status).toBe(403);
  });
});

describe('credit sales', () => {
  test('full credit sale puts the total on the khata, writes a ledger entry and a receipt snapshot', async () => {
    const c = await mkCustomer(); const p = await mk.product({ sellingPrice: 100 }, [{ qty: 20 }]);
    const res = await sale(cashier, p, 3, c._id, 0);
    expect(res.status).toBe(201);
    const s = res.body.data.sale;
    expect(s.payment).toMatchObject({ method: 'credit', amountReceived: 0, change: 0, creditAmount: 300 });
    expect(s.paymentStatus).toBe('unpaid'); expect(s.customerName).toBe('Ahmed Khan'); expect(s.customerBalanceAfter).toBe(300);
    const after = (await cashier.get(`/api/v1/customers/${c._id}`)).body.data;
    expect(after.balance).toBe(300); expect(after.available).toBe(700);
    const entries = await h.models().LedgerEntry.find({ customer: c._id });
    expect(entries).toHaveLength(1); expect(entries[0]).toMatchObject({ type: 'charge', amount: 300, balanceAfter: 300, receiptNumber: s.receiptNumber });
  });
  test('partial payment: cash now, the rest on credit', async () => {
    const c = await mkCustomer(); const p = await mk.product({ sellingPrice: 100 }, [{ qty: 20 }]);
    const s = (await sale(cashier, p, 4, c._id, 150)).body.data.sale;
    expect(s.payment).toMatchObject({ method: 'partial', amountReceived: 150, creditAmount: 250 }); expect(s.paymentStatus).toBe('partial');
    expect((await admin.get(`/api/v1/customers/${c._id}`)).body.data.balance).toBe(250);
  });
  test('customer attached to a fully paid cash sale creates no debt', async () => {
    const c = await mkCustomer(); const p = await mk.product({ sellingPrice: 100 }, [{ qty: 20 }]);
    const s = (await sale(cashier, p, 2, c._id, 500)).body.data.sale;
    expect(s.payment).toMatchObject({ method: 'cash', change: 300, creditAmount: 0 }); expect(s.customerName).toBe('Ahmed Khan');
    expect((await admin.get(`/api/v1/customers/${c._id}`)).body.data.balance).toBe(0);
    expect(await h.models().LedgerEntry.countDocuments()).toBe(0);
  });
  test('without a customer, short cash is still rejected', async () => {
    const p = await mk.product({ sellingPrice: 100 }, [{ qty: 20 }]);
    const r = await sale(cashier, p, 2, null, 50);
    expect(r.status).toBe(400); expect(r.body.error.code).toBe('PAYMENT_INSUFFICIENT');
  });
  test('credit limit is enforced atomically and the whole sale is rolled back', async () => {
    const c = await mkCustomer({ creditLimit: 250 }); const p = await mk.product({ sellingPrice: 100 }, [{ qty: 20 }]);
    const r = await sale(cashier, p, 3, c._id, 0);
    expect(r.status).toBe(409); expect(r.body.error.code).toBe('CREDIT_LIMIT_EXCEEDED');
    expect(r.body.error.details).toMatchObject({ limit: 250, balance: 0, available: 250, requested: 300 });
    expect((await h.models().Batch.findOne({ product: p._id })).remainingQuantity).toBe(20);
    expect(await h.models().Sale.countDocuments()).toBe(0); expect(await h.models().LedgerEntry.countDocuments()).toBe(0);
    expect((await admin.get(`/api/v1/customers/${c._id}`)).body.data.balance).toBe(0);
  });
  test('concurrent credit sales cannot exceed the limit', async () => {
    const c = await mkCustomer({ creditLimit: 500 }); const p = await mk.product({ sellingPrice: 100 }, [{ qty: 50 }]);
    const results = await Promise.all([1, 2, 3, 4].map(() => sale(cashier, p, 2, c._id, 0))); // 200 each, only 2 fit
    expect(results.filter((r) => r.status === 201)).toHaveLength(2);
    const bal = (await admin.get(`/api/v1/customers/${c._id}`)).body.data.balance;
    expect(bal).toBe(400); expect(await ledgerSum(c._id)).toBe(40000);
  });
  test('inactive customers cannot buy on credit; unknown customers are rejected', async () => {
    const c = await mkCustomer(); const p = await mk.product({ sellingPrice: 100 }, [{ qty: 20 }]);
    await admin.patch(`/api/v1/customers/${c._id}/status`).send({ isActive: false });
    expect((await sale(cashier, p, 1, c._id, 0)).body.error.code).toBe('CUSTOMER_INACTIVE');
    expect((await sale(cashier, p, 1, '64b7f0f0f0f0f0f0f0f0f0f0', 0)).body.error.code).toBe('CUSTOMER_NOT_FOUND');
  });
  test('duplicate submission of a credit sale charges once', async () => {
    const c = await mkCustomer(); const p = await mk.product({ sellingPrice: 100 }, [{ qty: 20 }]);
    const body = { clientRequestId: h.rid(), items: [{ productId: String(p._id), quantity: 2 }], amountReceived: 0, customerId: c._id };
    await cashier.post('/api/v1/sales').send(body); const again = await cashier.post('/api/v1/sales').send(body);
    expect(again.body.data.duplicate).toBe(true);
    expect((await admin.get(`/api/v1/customers/${c._id}`)).body.data.balance).toBe(200);
  });
  test('voiding a credit sale reverses the charge', async () => {
    const c = await mkCustomer(); const p = await mk.product({ sellingPrice: 100 }, [{ qty: 20 }]);
    const s = (await sale(cashier, p, 3, c._id, 100)).body.data.sale; // 200 on credit
    expect((await admin.get(`/api/v1/customers/${c._id}`)).body.data.balance).toBe(200);
    expect((await admin.post(`/api/v1/sales/${s._id}/void`).send({ reason: 'Customer returned' })).status).toBe(200);
    expect((await admin.get(`/api/v1/customers/${c._id}`)).body.data.balance).toBe(0);
    const types = (await h.models().LedgerEntry.find({ customer: c._id }).sort({ createdAt: 1 })).map((e) => e.type);
    expect(types).toEqual(['charge', 'void_reversal']); expect(await ledgerSum(c._id)).toBe(0);
  });
});

describe('payments, adjustments and statements', () => {
  const owe = async (amount = 300) => { const c = await mkCustomer(); const p = await mk.product({ sellingPrice: 100 }, [{ qty: 50 }]); await sale(cashier, p, amount / 100, c._id, 0); return c; };
  test('payment reduces the balance and records who collected it', async () => {
    const c = await owe(300);
    const r = await cashier.post(`/api/v1/customers/${c._id}/payments`).send({ amount: 120, note: 'Cash at counter', requestId: h.rid() });
    expect(r.status).toBe(201); expect(r.body.data.customer.balance).toBe(180);
    expect(r.body.data.entry).toMatchObject({ type: 'payment', amount: -120, balanceAfter: 180, userName: cashier.user.name });
    expect(await ledgerSum(c._id)).toBe(18000);
  });
  test('cannot pay more than is owed, zero or negative amounts are invalid', async () => {
    const c = await owe(300);
    const over = await cashier.post(`/api/v1/customers/${c._id}/payments`).send({ amount: 301, requestId: h.rid() });
    expect(over.status).toBe(409); expect(over.body.error.code).toBe('OVERPAYMENT'); expect(over.body.error.details.balance).toBe(300);
    expect((await cashier.post(`/api/v1/customers/${c._id}/payments`).send({ amount: 0, requestId: h.rid() })).status).toBe(400);
    expect((await cashier.post(`/api/v1/customers/${c._id}/payments`).send({ amount: -5, requestId: h.rid() })).status).toBe(400);
    expect((await admin.get(`/api/v1/customers/${c._id}`)).body.data.balance).toBe(300);
  });
  test('duplicate payment submissions apply once (also in parallel)', async () => {
    const c = await owe(300); const body = { amount: 100, requestId: h.rid() };
    const rs = await Promise.all([cashier.post(`/api/v1/customers/${c._id}/payments`).send(body), cashier.post(`/api/v1/customers/${c._id}/payments`).send(body)]);
    expect(rs.map((r) => r.status).sort()).toEqual([200, 201]);
    expect((await admin.get(`/api/v1/customers/${c._id}`)).body.data.balance).toBe(200);
    expect(await h.models().LedgerEntry.countDocuments({ type: 'payment' })).toBe(1);
  });
  test('admin adjustment/write-off needs a reason and never makes the balance negative', async () => {
    const c = await owe(300);
    expect((await admin.post(`/api/v1/customers/${c._id}/adjustments`).send({ amount: -50, reason: 'ok', requestId: h.rid() })).status).toBe(400);
    const w = await admin.post(`/api/v1/customers/${c._id}/adjustments`).send({ amount: -50, reason: 'Goodwill write-off', requestId: h.rid() });
    expect(w.status).toBe(201); expect(w.body.data.customer.balance).toBe(250);
    const bad = await admin.post(`/api/v1/customers/${c._id}/adjustments`).send({ amount: -1000, reason: 'Too much', requestId: h.rid() });
    expect(bad.status).toBe(409); expect(bad.body.error.code).toBe('NEGATIVE_BALANCE');
    expect((await h.models().AuditLog.countDocuments({ action: 'credit.adjustment' }))).toBe(1);
  });
  test('ledger and statement: opening/closing balance, totals, newest-first ledger', async () => {
    const c = await owe(300);
    await cashier.post(`/api/v1/customers/${c._id}/payments`).send({ amount: 100, requestId: h.rid() });
    const ledger = (await cashier.get(`/api/v1/customers/${c._id}/ledger`)).body;
    expect(ledger.data.map((e) => e.type)).toEqual(['payment', 'charge']); expect(ledger.meta.total).toBe(2);
    const st = (await cashier.get(`/api/v1/customers/${c._id}/statement`)).body.data;
    expect(st.openingBalance).toBe(0); expect(st.closingBalance).toBe(200);
    expect(st.totals).toMatchObject({ charges: 300, payments: 100 }); expect(st.entries.map((e) => e.type)).toEqual(['charge', 'payment']);
    expect(st.store.storeName).toBeTruthy();
  });
  test('list: search, owing filter and outstanding summary; audit trail written', async () => {
    const c = await owe(300); await mkCustomer({ name: 'Zero Balance', phone: '03999999999' });
    const owing = (await cashier.get('/api/v1/customers?owing=true')).body;
    expect(owing.data).toHaveLength(1); expect(owing.meta.summary).toMatchObject({ outstanding: 300, customersOwing: 1 });
    expect((await cashier.get('/api/v1/customers?q=0300123')).body.data).toHaveLength(1);
    expect((await cashier.get('/api/v1/customers')).body.meta.total).toBe(2);
    expect(await h.models().AuditLog.countDocuments({ action: 'customer.create' })).toBe(2);
    expect(c._id).toBeTruthy();
  });
  test('dashboard separates cash collected from credit extended and shows outstanding khata', async () => {
    const c = await mkCustomer(); const p = await mk.product({ sellingPrice: 100 }, [{ qty: 50 }]);
    await sale(cashier, p, 2, null, 500); // 200 cash
    await sale(cashier, p, 3, c._id, 0); // 300 credit
    await cashier.post(`/api/v1/customers/${c._id}/payments`).send({ amount: 50, requestId: h.rid() });
    const d = (await admin.get('/api/v1/reports/dashboard')).body.data;
    expect(d.payments).toEqual([{ method: 'cash', total: 200, count: 1 }, { method: 'credit', total: 300, count: 1 }]);
    expect(d.credit).toMatchObject({ outstanding: 250, customersOwing: 1, collected: 50, collections: 1 });
    expect(d.today.total).toBe(500);
  });
});
