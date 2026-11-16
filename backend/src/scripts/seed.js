/**
 * Development seed. SAFE BY DEFAULT:
 *   npm run seed                 -> only seeds an EMPTY database (otherwise prints a notice and exits)
 *   npm run seed:reset           -> wipes this app's collections, then reseeds (needs --reset --yes)
 * Refuses to run when NODE_ENV=production or when the database name does not look like a dev/demo database.
 */
const mongoose = require('mongoose');
const { config } = require('../config/env');
const { connectDB, disconnectDB } = require('../config/db');
const { storeToday } = require('../utils/date');
const { hashPassword } = require('../services/authService');
const { buildDataset, reconcile, SIM_DAYS } = require('./seedData');
const User = require('../models/User');
const Category = require('../models/Category');
const Product = require('../models/Product');
const Batch = require('../models/InventoryBatch');
const Sale = require('../models/Sale');
const Movement = require('../models/StockMovement');
const AuditLog = require('../models/AuditLog');
const Settings = require('../models/Settings');
const Counter = require('../models/Counter');
const Customer = require('../models/Customer');
const LedgerEntry = require('../models/LedgerEntry');

const DEMO = { admin: { name: 'Hamza Admin', email: 'admin@swiftshelf.test', password: 'Admin@12345' }, cashiers: [{ name: 'Ali Raza', email: 'ali@swiftshelf.test', password: 'Cashier@12345' }, { name: 'Sara Khan', email: 'sara@swiftshelf.test', password: 'Cashier@12345' }] };
const ALL = [User, Category, Product, Batch, Sale, Movement, AuditLog, Settings, Counter, Customer, LedgerEntry];
const bulk = (Model, docs) => Model.collection.insertMany(docs, { ordered: false });

async function main() {
  const args = process.argv.slice(2);
  const reset = args.includes('--reset'); const yes = args.includes('--yes');
  if (config.isProd) { console.error('Refusing to seed: NODE_ENV=production.'); process.exit(1); }
  if (reset && !yes) { console.error('Refusing to reset without explicit confirmation. Run: npm run seed:reset  (or add --reset --yes).'); process.exit(1); }

  await connectDB(config.mongoUri);
  const dbName = mongoose.connection.name;
  if (!/swiftshelf|dev|demo|test/i.test(dbName)) { console.error(`Refusing to seed database "${dbName}": name must contain swiftshelf, dev, demo or test.`); await disconnectDB(); process.exit(1); }

  const existing = (await Product.estimatedDocumentCount()) + (await Sale.estimatedDocumentCount());
  if (existing > 0 && !reset) { console.log(`Database "${dbName}" already contains data. Nothing changed. Use "npm run seed:reset" to wipe and reseed this development database.`); await disconnectDB(); return; }
  if (reset) {
    console.log(`Resetting development database "${dbName}"...`);
    for (const M of ALL) await M.collection.deleteMany({});
  }
  await Promise.all(ALL.map((M) => M.init()));

  const admin = await User.create({ name: DEMO.admin.name, email: DEMO.admin.email, role: 'admin', passwordHash: await hashPassword(DEMO.admin.password) });
  const cashiers = [];
  for (const c of DEMO.cashiers) cashiers.push(await User.create({ name: c.name, email: c.email, role: 'cashier', passwordHash: await hashPassword(c.password) }));
  const settings = await Settings.get();
  settings.taxRate = 5; settings.whatsappCountryCode = '92'; await settings.save();

  const today = storeToday(settings.timezone);
  const data = buildDataset({ today, newId: () => new mongoose.Types.ObjectId(), passwordHashes: { admin: { _id: admin._id, name: admin.name }, cashiers: cashiers.map((c) => ({ _id: c._id, name: c.name })) }, taxRate: settings.taxRate });
  const rec = reconcile(data);
  if (!rec.ok) throw new Error('Seed data failed stock reconciliation; aborting before writing.');

  await Category.insertMany(data.categories);
  await bulk(Product, data.products);
  await bulk(Batch, data.batches);
  await bulk(Movement, data.movements);
  await bulk(Sale, data.sales);
  await bulk(Customer, data.customers);
  await bulk(LedgerEntry, data.ledger);
  await AuditLog.collection.insertOne({ actor: admin._id, actorName: admin.name, actorRole: 'admin', action: 'seed.complete', resource: 'system', summary: `Development seed: ${data.products.length} products, ${data.sales.length} sales over ${SIM_DAYS} days`, createdAt: new Date() });

  console.log(`\nSeeded "${dbName}": ${data.categories.length} categories, ${data.products.length} products, ${data.batches.length} batches, ${data.movements.length} stock movements, ${data.sales.length} sales (${SIM_DAYS} days), ${data.customers.length} khata customers with ${data.ledger.length} ledger entries. Stock reconciliation: OK.`);
  console.log('\nDEVELOPMENT-ONLY demo accounts:');
  console.log(`  admin    ${DEMO.admin.email}  /  ${DEMO.admin.password}`);
  DEMO.cashiers.forEach((c) => console.log(`  cashier  ${c.email}  /  ${c.password}`));
  console.log('\nNever use these credentials outside local development.');
  await disconnectDB();
}
main().catch(async (e) => { console.error(e); try { await disconnectDB(); } catch (_) { /* ignore */ } process.exit(1); });
