const h = require('./helpers/setup');

let app; let admin; let cat;
beforeAll(async () => { await h.startDb(); app = h.app(); });
afterAll(h.stopDb);
beforeEach(async () => {
  await h.clearDb();
  admin = await h.login(app, 'admin');
  cat = (await admin.post('/api/v1/categories').send({ name: 'Drinks' })).body.data;
});
const body = (o = {}) => ({ name: 'Water', sku: 'wat-1', barcode: '111', category: cat._id, sellingPrice: 90, costPrice: 60, ...o });

describe('products', () => {
  test('create normalises SKU and rounds decimals', async () => {
    const res = await admin.post('/api/v1/products').send(body({ sellingPrice: 89.996 }));
    expect(res.status).toBe(201);
    expect(res.body.data.sku).toBe('WAT-1');
    expect(res.body.data.sellingPrice).toBe(90);
  });
  test('rejects duplicate SKU and duplicate barcode', async () => {
    await admin.post('/api/v1/products').send(body());
    expect((await admin.post('/api/v1/products').send(body({ barcode: '222' }))).status).toBe(409);
    expect((await admin.post('/api/v1/products').send(body({ sku: 'OTHER' }))).status).toBe(409);
  });
  test('barcode is optional and many products may have none', async () => {
    expect((await admin.post('/api/v1/products').send(body({ sku: 'A1', barcode: '' }))).status).toBe(201);
    expect((await admin.post('/api/v1/products').send(body({ sku: 'A2', barcode: '' }))).status).toBe(201);
    expect((await admin.post('/api/v1/products').send(body({ sku: 'A3', barcode: undefined }))).status).toBe(201);
  });
  test('rejects negative prices and quantities', async () => {
    expect((await admin.post('/api/v1/products').send(body({ sellingPrice: -1 }))).status).toBe(400);
    expect((await admin.post('/api/v1/products').send(body({ costPrice: -5 }))).status).toBe(400);
    expect((await admin.post('/api/v1/products').send(body({ reorderThreshold: -2 }))).status).toBe(400);
    expect((await admin.post('/api/v1/products').send(body({ openingStock: { quantity: -4 } }))).status).toBe(400);
  });
  test('opening stock creates a batch and an opening movement', async () => {
    const res = await admin.post('/api/v1/products').send(body({ openingStock: { quantity: 12 } }));
    expect(res.body.data.stock.onHand).toBe(12);
    const { Movement } = h.models();
    expect(await Movement.countDocuments({ type: 'opening', quantity: 12 })).toBe(1);
  });
  test('perishable products require an expiry date on opening stock', async () => {
    const res = await admin.post('/api/v1/products').send(body({ trackExpiry: true, openingStock: { quantity: 5 } }));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('EXPIRY_REQUIRED');
  });
  test('price changes are audited with before/after', async () => {
    const p = (await admin.post('/api/v1/products').send(body())).body.data;
    await admin.patch(`/api/v1/products/${p._id}`).send({ sellingPrice: 120 });
    const log = await h.models().AuditLog.findOne({ action: 'product.price_change' });
    expect(log.before.sellingPrice).toBe(90); expect(log.after.sellingPrice).toBe(120);
  });
  test('deactivation keeps history and hides the product from barcode lookup', async () => {
    const p = (await admin.post('/api/v1/products').send(body())).body.data;
    expect((await admin.get('/api/v1/products/barcode/111')).status).toBe(200);
    await admin.patch(`/api/v1/products/${p._id}/status`).send({ isActive: false });
    expect((await admin.get('/api/v1/products/barcode/111')).status).toBe(404);
    expect((await admin.get(`/api/v1/products/${p._id}`)).body.data.isActive).toBe(false);
  });
  test('search, filter and pagination', async () => {
    for (let i = 1; i <= 5; i += 1) await admin.post('/api/v1/products').send(body({ name: `Cola ${i}`, sku: `C${i}`, barcode: `9${i}` }));
    const res = await admin.get('/api/v1/products?q=cola&limit=2&page=2');
    expect(res.body.data).toHaveLength(2); expect(res.body.meta.total).toBe(5);
  });
  test('categories: safe deletion', async () => {
    await admin.post('/api/v1/products').send(body());
    const blocked = await admin.del(`/api/v1/categories/${cat._id}`).send();
    expect(blocked.status).toBe(409); expect(blocked.body.error.code).toBe('CATEGORY_IN_USE');
    const empty = (await admin.post('/api/v1/categories').send({ name: 'Empty' })).body.data;
    expect((await admin.del(`/api/v1/categories/${empty._id}`).send()).status).toBe(200);
  });
});
