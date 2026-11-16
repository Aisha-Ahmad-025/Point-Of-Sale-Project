const request = require('supertest');
const h = require('./helpers/setup');

let app;
beforeAll(async () => { await h.startDb(); app = h.app(); });
afterAll(h.stopDb);
beforeEach(h.clearDb);

describe('authentication', () => {
  test('login sets an HttpOnly cookie and never returns hashes', async () => {
    const { user, password } = await h.makeUser('admin');
    const res = await request(app).post('/api/v1/auth/login').send({ email: user.email, password });
    expect(res.status).toBe(200);
    expect(res.headers['set-cookie'][0]).toMatch(/ss_token=.*HttpOnly/i);
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|\$2[aby]\$/);
    expect(res.body.data.csrfToken).toBeTruthy();
  });
  test('wrong password and unknown email give the same 401', async () => {
    const { user } = await h.makeUser('cashier');
    const a = await request(app).post('/api/v1/auth/login').send({ email: user.email, password: 'nope-nope-1' });
    const b = await request(app).post('/api/v1/auth/login').send({ email: 'nobody@t.test', password: 'nope-nope-1' });
    expect(a.status).toBe(401); expect(b.status).toBe(401);
    expect(a.body.error.message).toBe(b.body.error.message);
  });
  test('account locks after repeated failures', async () => {
    const { user, password } = await h.makeUser('cashier');
    for (let i = 0; i < 5; i += 1) await request(app).post('/api/v1/auth/login').send({ email: user.email, password: 'wrong-wrong-1' });
    const res = await request(app).post('/api/v1/auth/login').send({ email: user.email, password });
    expect(res.status).toBe(423);
  });
  test('deactivated users cannot log in or keep using a session', async () => {
    const c = await h.login(app, 'cashier');
    await h.models().User.updateOne({ _id: c.user._id }, { isActive: false });
    expect((await c.get('/api/v1/auth/me')).status).toBe(401);
  });
  test('protected routes need a session; unsafe methods need the CSRF token', async () => {
    expect((await request(app).get('/api/v1/products')).status).toBe(401);
    const admin = await h.login(app, 'admin');
    const noCsrf = await admin.agent.post('/api/v1/categories').send({ name: 'X' });
    expect(noCsrf.status).toBe(403); expect(noCsrf.body.error.code).toBe('CSRF_INVALID');
    expect((await admin.post('/api/v1/categories').send({ name: 'X' })).status).toBe(201);
  });
  test('logout clears the cookie', async () => {
    const c = await h.login(app, 'cashier');
    await c.post('/api/v1/auth/logout').send();
    expect((await c.get('/api/v1/auth/me')).status).toBe(401);
  });
  test('errors never leak stack traces', async () => {
    const res = await request(app).get('/api/v1/does-not-exist');
    expect(res.status).toBe(404);
    expect(JSON.stringify(res.body)).not.toMatch(/at .*\.js/);
  });
});

describe('role based access control (enforced on the server)', () => {
  const adminOnly = [
    ['post', '/api/v1/products'], ['post', '/api/v1/categories'], ['get', '/api/v1/inventory/stock'], ['post', '/api/v1/inventory/adjustments'], ['post', '/api/v1/inventory/wastage'],
    ['get', '/api/v1/reports/dashboard'], ['get', '/api/v1/reports/profit'], ['get', '/api/v1/forecasting/reorder'], ['get', '/api/v1/employees'], ['post', '/api/v1/employees'],
    ['get', '/api/v1/audit-logs'], ['put', '/api/v1/settings'], ['get', '/api/v1/expiry/alerts'],
  ];
  test.each(adminOnly)('cashier cannot %s %s', async (method, url) => {
    const c = await h.login(app, 'cashier');
    const res = await (method === 'get' ? c.get(url) : c[method === 'put' ? 'put' : 'post'](url).send({}));
    expect(res.status).toBe(403);
  });
  test('cashier sees only public settings and no cost price', async () => {
    const c = await h.login(app, 'cashier');
    const { product } = await h.makeCatalog();
    const p = await product({}, [{ qty: 5 }]);
    const list = await c.get('/api/v1/products');
    expect(list.status).toBe(200);
    expect(list.body.data[0].costPrice).toBeUndefined();
    expect(list.body.data.find((x) => x._id === String(p._id)).stock.sellable).toBe(5);
    const s = await c.get('/api/v1/settings');
    expect(s.body.data.forecastWindowDays).toBeUndefined();
    expect(s.body.data.storeName).toBeTruthy();
  });
  test('audit logs are immutable', async () => {
    const { AuditLog } = h.models();
    const a = await AuditLog.create({ action: 'test.x', resource: 'test' });
    await expect(AuditLog.updateOne({ _id: a._id }, { action: 'hacked' })).rejects.toThrow(/immutable/);
    await expect(AuditLog.deleteMany({})).rejects.toThrow(/immutable/);
    await expect(AuditLog.findByIdAndDelete(a._id)).rejects.toThrow(/immutable/);
  });
  test('employee management protects the last admin and self-lockout', async () => {
    const admin = await h.login(app, 'admin');
    expect((await admin.patch(`/api/v1/employees/${admin.user._id}/status`).send({ isActive: false })).status).toBe(409);
    expect((await admin.patch(`/api/v1/employees/${admin.user._id}`).send({ role: 'cashier' })).status).toBe(409);
    const created = await admin.post('/api/v1/employees').send({ name: 'New Cashier', email: 'new@t.test', role: 'cashier', password: 'Secret123' });
    expect(created.status).toBe(201);
    expect(JSON.stringify(created.body)).not.toMatch(/passwordHash|Secret123/);
    expect((await admin.post('/api/v1/employees').send({ name: 'Weak', email: 'w@t.test', password: 'short' })).status).toBe(400);
  });
});
