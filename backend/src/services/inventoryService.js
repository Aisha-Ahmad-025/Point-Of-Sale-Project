const Product = require('../models/Product');
const Batch = require('../models/InventoryBatch');
const Movement = require('../models/StockMovement');
const ApiError = require('../utils/ApiError');
const { escapeRegex } = require('../utils/pagination');
const { stockMap, emptyStock, batchStatus } = require('./stockService');
const { runAtomic } = require('./txService');
const { storeToday, parseDateOnly, addDays } = require('../utils/date');
const { round2, round3 } = require('../utils/money');
const { config } = require('../config/env');
const settingsService = require('./settingsService');
const audit = require('./auditService');

const sess = (ctx) => (ctx.session ? { session: ctx.session } : {});

async function findDuplicate(requestId) {
  if (!requestId) return null;
  return Movement.findOne({ requestId });
}

/** Restock: always creates a NEW batch (lot) with its own expiry and cost. */
async function receiveStock(req, d) {
  const dup = await findDuplicate(d.requestId);
  if (dup) return { movement: dup, duplicate: true };
  const product = await Product.findById(d.productId);
  if (!product) throw ApiError.notFound('Product not found');
  const today = storeToday(config.timezone);
  let expiryDate = null;
  if (product.trackExpiry) {
    expiryDate = parseDateOnly(d.expiryDate);
    if (!expiryDate) throw ApiError.badRequest('Expiry date is required for this product', 'EXPIRY_REQUIRED');
    if (expiryDate < today) throw ApiError.badRequest('Cannot receive stock that is already expired', 'EXPIRED_STOCK');
  } else if (d.expiryDate) {
    throw ApiError.badRequest('This product does not track expiry. Enable expiry tracking on the product first.', 'EXPIRY_NOT_TRACKED');
  }
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const lotNumber = d.lotNumber || `LOT-${stamp}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  const costPrice = d.costPrice ?? product.costPrice;

  try {
    const result = await runAtomic(async (ctx) => {
      const [batch] = await Batch.create([{ product: product._id, lotNumber, receivedDate: parseDateOnly(d.receivedDate) || new Date(), expiryDate, quantityReceived: d.quantity, remainingQuantity: d.quantity, costPrice }], sess(ctx));
      ctx.onUndo(() => Batch.deleteOne({ _id: batch._id }));
      const [movement] = await Movement.create([{ product: product._id, batch: batch._id, lotNumber, type: 'receipt', quantity: d.quantity, unitCost: costPrice, reason: d.note || 'Stock received', user: req.user._id, userName: req.user.name, requestId: d.requestId }], sess(ctx));
      ctx.onUndo(() => Movement.deleteOne({ _id: movement._id }));
      return { batch, movement };
    });
    await audit.record(req, { action: 'inventory.receipt', resource: 'batch', resourceId: result.batch._id, summary: `${product.sku} +${d.quantity} (${lotNumber})`, after: result.batch });
    return { ...result, duplicate: false };
  } catch (e) {
    if (e.code === 11000 && d.requestId) { const again = await findDuplicate(d.requestId); if (again) return { movement: again, duplicate: true }; }
    throw e;
  }
}

/** Manual correction of one batch, by delta or to an absolute counted quantity. Never allows negative stock. */
async function adjustStock(req, d) {
  const dup = await findDuplicate(d.requestId);
  if (dup) return { movement: dup, duplicate: true };
  const batch = await Batch.findById(d.batchId);
  if (!batch) throw ApiError.notFound('Batch not found');
  const delta = round3(d.mode === 'set' ? d.quantity - batch.remainingQuantity : d.quantity);
  if (delta === 0) throw ApiError.badRequest('Adjustment would not change the stock', 'NO_CHANGE');
  if (batch.remainingQuantity + delta < 0) throw ApiError.conflict('Adjustment would make stock negative', 'NEGATIVE_STOCK');

  // Conditional filter makes the update safe against concurrent sales / adjustments.
  const filter = d.mode === 'set' ? { _id: batch._id, remainingQuantity: batch.remainingQuantity } : { _id: batch._id, ...(delta < 0 ? { remainingQuantity: { $gte: -delta } } : {}) };
  try {
    const movement = await runAtomic(async (ctx) => {
      const r = await Batch.updateOne(filter, { $inc: { remainingQuantity: delta } }, sess(ctx));
      if (r.modifiedCount !== 1) throw ApiError.conflict('Stock changed while adjusting. Reload and try again.', 'STOCK_CHANGED');
      ctx.onUndo(() => Batch.updateOne({ _id: batch._id }, { $inc: { remainingQuantity: -delta } }));
      const [m] = await Movement.create([{ product: batch.product, batch: batch._id, lotNumber: batch.lotNumber, type: delta > 0 ? 'adjustment_in' : 'adjustment_out', quantity: delta, unitCost: batch.costPrice, reason: d.reason, user: req.user._id, userName: req.user.name, requestId: d.requestId }], sess(ctx));
      ctx.onUndo(() => Movement.deleteOne({ _id: m._id }));
      return m;
    });
    await audit.record(req, { action: 'inventory.adjustment', resource: 'batch', resourceId: batch._id, summary: `${batch.lotNumber} ${delta > 0 ? '+' : ''}${delta}: ${d.reason}`, before: { remainingQuantity: batch.remainingQuantity }, after: { remainingQuantity: round3(batch.remainingQuantity + delta) } });
    return { movement, duplicate: false };
  } catch (e) {
    if (e.code === 11000 && d.requestId) { const again = await findDuplicate(d.requestId); if (again) return { movement: again, duplicate: true }; }
    throw e;
  }
}

/** Wastage (expired / damaged / spoiled / other). Cost impact = quantity x batch cost, reported separately from COGS. */
async function recordWastage(req, d) {
  const dup = await findDuplicate(d.requestId);
  if (dup) return { movement: dup, duplicate: true };
  const batch = await Batch.findById(d.batchId);
  if (!batch) throw ApiError.notFound('Batch not found');
  if (d.quantity > batch.remainingQuantity) throw ApiError.conflict('Wastage exceeds remaining batch quantity', 'EXCEEDS_STOCK', { remaining: batch.remainingQuantity });
  try {
    const movement = await runAtomic(async (ctx) => {
      const r = await Batch.updateOne({ _id: batch._id, remainingQuantity: { $gte: d.quantity } }, { $inc: { remainingQuantity: -d.quantity } }, sess(ctx));
      if (r.modifiedCount !== 1) throw ApiError.conflict('Stock changed. Reload and try again.', 'STOCK_CHANGED');
      ctx.onUndo(() => Batch.updateOne({ _id: batch._id }, { $inc: { remainingQuantity: d.quantity } }));
      const [m] = await Movement.create([{ product: batch.product, batch: batch._id, lotNumber: batch.lotNumber, type: 'wastage', quantity: -d.quantity, unitCost: batch.costPrice, wastageReason: d.reason, reason: d.note || d.reason, user: req.user._id, userName: req.user.name, requestId: d.requestId }], sess(ctx));
      ctx.onUndo(() => Movement.deleteOne({ _id: m._id }));
      return m;
    });
    await audit.record(req, { action: 'inventory.wastage', resource: 'batch', resourceId: batch._id, summary: `${batch.lotNumber} -${d.quantity} (${d.reason})`, after: { quantity: d.quantity, reason: d.reason, cost: round2(d.quantity * batch.costPrice) } });
    return { movement, duplicate: false, cost: round2(d.quantity * batch.costPrice) };
  } catch (e) {
    if (e.code === 11000 && d.requestId) { const again = await findDuplicate(d.requestId); if (again) return { movement: again, duplicate: true }; }
    throw e;
  }
}

async function listStock(q) {
  const settings = await settingsService.get();
  const filter = { isActive: q.includeInactive ? { $in: [true, false] } : true };
  if (q.category) filter.category = q.category;
  if (q.q) { const rx = new RegExp(escapeRegex(q.q), 'i'); filter.$or = [{ name: rx }, { sku: rx }, { barcode: rx }]; }
  const products = await Product.find(filter).sort({ name: 1 }).populate('category', 'name').lean();
  const today = storeToday(config.timezone);
  const sm = await stockMap(products.map((p) => p._id), { today });
  let rows = products.map((p) => {
    const s = sm.get(String(p._id)) || emptyStock;
    const nearLimit = addDays(today, settings.nearExpiryDays);
    const status = s.sellable <= 0 ? 'out' : s.sellable <= p.reorderThreshold ? 'low' : 'ok';
    return { ...p, stock: s, stockStatus: status, nearExpiry: Boolean(s.nextExpiry && s.nextExpiry <= nearLimit), retailValue: round2(s.onHand * p.sellingPrice) };
  });
  if (q.status === 'low') rows = rows.filter((r) => r.stockStatus === 'low');
  else if (q.status === 'out') rows = rows.filter((r) => r.stockStatus === 'out');
  else if (q.status === 'expired') rows = rows.filter((r) => r.stock.expired > 0);
  else if (q.status === 'near') rows = rows.filter((r) => r.nearExpiry);
  const summary = {
    products: rows.length,
    units: round3(rows.reduce((a, r) => a + r.stock.onHand, 0)),
    costValue: round2(rows.reduce((a, r) => a + r.stock.value, 0)),
    retailValue: round2(rows.reduce((a, r) => a + r.retailValue, 0)),
    low: rows.filter((r) => r.stockStatus === 'low').length,
    out: rows.filter((r) => r.stockStatus === 'out').length,
  };
  const total = rows.length;
  return { rows: rows.slice((q.page - 1) * q.limit, q.page * q.limit), total, summary };
}

async function listMovements(q) {
  const filter = {};
  if (q.product) filter.product = q.product;
  if (q.type) filter.type = q.type;
  if (q.from || q.to) {
    filter.createdAt = {};
    if (q.from) filter.createdAt.$gte = q.fromDate;
    if (q.to) filter.createdAt.$lt = q.toDate;
  }
  const [rows, total] = await Promise.all([
    Movement.find(filter).sort({ createdAt: -1 }).skip((q.page - 1) * q.limit).limit(q.limit).populate('product', 'name sku unit').lean(),
    Movement.countDocuments(filter),
  ]);
  return { rows, total };
}

async function listBatches(q) {
  const settings = await settingsService.get();
  const today = storeToday(config.timezone);
  const filter = {};
  if (!q.includeEmpty) filter.remainingQuantity = { $gt: 0 };
  if (q.product) filter.product = q.product;
  if (q.status === 'expired') filter.expiryDate = { $lt: today };
  else if (q.status === 'near') filter.expiryDate = { $gte: today, $lte: addDays(today, settings.nearExpiryDays) };
  else if (q.status === 'ok') filter.$or = [{ expiryDate: null }, { expiryDate: { $gt: addDays(today, settings.nearExpiryDays) } }];
  if (q.q) {
    const rx = new RegExp(escapeRegex(q.q), 'i');
    const ids = await Product.find({ $or: [{ name: rx }, { sku: rx }] }).distinct('_id');
    filter.$and = [{ $or: [{ lotNumber: rx }, { product: { $in: ids } }] }];
  }
  const [docs, total] = await Promise.all([
    Batch.find(filter).sort({ expiryDate: 1, receivedDate: 1 }).skip((q.page - 1) * q.limit).limit(q.limit).populate('product', 'name sku unit trackExpiry').lean(),
    Batch.countDocuments(filter),
  ]);
  const rows = docs.map((b) => ({ ...b, ...batchStatus(b, today, settings.nearExpiryDays), value: round2(b.remainingQuantity * b.costPrice) }));
  return { rows, total };
}

async function expiryAlerts() {
  const settings = await settingsService.get();
  const today = storeToday(config.timezone);
  const base = { remainingQuantity: { $gt: 0 } };
  const [expired, near] = await Promise.all([
    Batch.find({ ...base, expiryDate: { $lt: today } }).sort({ expiryDate: 1 }).populate('product', 'name sku unit').lean(),
    Batch.find({ ...base, expiryDate: { $gte: today, $lte: addDays(today, settings.nearExpiryDays) } }).sort({ expiryDate: 1 }).populate('product', 'name sku unit').lean(),
  ]);
  const decorate = (b) => ({ ...b, ...batchStatus(b, today, settings.nearExpiryDays), value: round2(b.remainingQuantity * b.costPrice) });
  return {
    nearExpiryDays: settings.nearExpiryDays,
    expired: expired.map(decorate), near: near.map(decorate),
    expiredValue: round2(expired.reduce((a, b) => a + b.remainingQuantity * b.costPrice, 0)),
    nearValue: round2(near.reduce((a, b) => a + b.remainingQuantity * b.costPrice, 0)),
  };
}

module.exports = { receiveStock, adjustStock, recordWastage, listStock, listMovements, listBatches, expiryAlerts };
