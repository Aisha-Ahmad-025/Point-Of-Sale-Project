process.env.NODE_ENV = 'test';
const mongoose = require('mongoose');
const request = require('supertest');
const bcrypt = require('bcryptjs');
const { MongoMemoryReplSet, MongoMemoryServer } = require('mongodb-memory-server');

let server;

/** standalone=true starts a plain mongod (no transactions) to exercise the compensating fallback. */
async function startDb({ standalone = false } = {}) {
  const { connectDB } = require('../../src/config/db');
  server = standalone ? await MongoMemoryServer.create() : await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  const base = server.getUri();
  const uri = base.includes('?') ? base.replace('/?', '/swiftshelf_test?') : `${base.replace(/\/$/, '')}/swiftshelf_test`;
  await connectDB(uri);
  await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
}
async function stopDb() { await mongoose.disconnect(); if (server) await server.stop(); }
async function clearDb() { await Promise.all(Object.values(mongoose.models).map((m) => m.collection.deleteMany({}))); }

const models = () => ({
  User: require('../../src/models/User'),
  Category: require('../../src/models/Category'),
  Product: require('../../src/models/Product'),
  Batch: require('../../src/models/InventoryBatch'),
  Sale: require('../../src/models/Sale'),
  Movement: require('../../src/models/StockMovement'),
  AuditLog: require('../../src/models/AuditLog'),
  Customer: require('../../src/models/Customer'),
  LedgerEntry: require('../../src/models/LedgerEntry'),
  Settings: require('../../src/models/Settings'),
  Counter: require('../../src/models/Counter'),
});
const app = () => require('../../src/app').createApp();

let seq = 0;
async function makeUser(role = 'cashier', overrides = {}) {
  const { User } = models(); seq += 1;
  const password = 'Passw0rd!x';
  const user = await User.create({ name: `${role} ${seq}`, email: `${role}${seq}@t.test`, role, passwordHash: await bcrypt.hash(password, 4), ...overrides });
  return { user, password };
}

/** Logged-in supertest agent that automatically sends the CSRF token on unsafe requests. */
async function login(application, role = 'cashier') {
  const { user, password } = await makeUser(role);
  const agent = request.agent(application);
  const res = await agent.post('/api/v1/auth/login').send({ email: user.email, password });
  const csrf = res.body.data.csrfToken;
  const wrap = (m) => (url) => agent[m](url).set('X-CSRF-Token', csrf);
  return { agent, user, csrf, get: (u) => agent.get(u), post: wrap('post'), patch: wrap('patch'), put: wrap('put'), del: wrap('delete') };
}

async function makeCatalog() {
  const { Category, Product, Batch } = models();
  const category = await Category.create({ name: `Cat ${(seq += 1)}` });
  let n = 0;
  const product = async (over = {}, stock = []) => {
    n += 1; seq += 1;
    const p = await Product.create({ name: `Item ${seq}`, sku: `SKU-${seq}`, barcode: `BC${seq}${n}`, category: category._id, sellingPrice: 100, costPrice: 60, unit: 'pcs', ...over });
    for (const [i, s] of stock.entries()) {
      await Batch.create({ product: p._id, lotNumber: s.lot || `L${i + 1}`, receivedDate: s.received || new Date(Date.now() - 86400000 * 5), expiryDate: s.expiry || null, quantityReceived: s.qty, remainingQuantity: s.qty, costPrice: s.cost ?? p.costPrice });
    }
    return p;
  };
  return { category, product };
}

const dayOffset = (n) => { const d = new Date(); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + n)); };
const ymd = (d) => d.toISOString().slice(0, 10);
let rq = 0;
const rid = () => `req-${Date.now()}-${(rq += 1)}`;

module.exports = { startDb, stopDb, clearDb, models, app, makeUser, login, makeCatalog, dayOffset, ymd, rid };
