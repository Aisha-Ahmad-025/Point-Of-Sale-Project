const Product = require('../models/Product');
const Category = require('../models/Category');
const Batch = require('../models/InventoryBatch');
const Movement = require('../models/StockMovement');
const ApiError = require('../utils/ApiError');
const { escapeRegex } = require('../utils/pagination');
const { stockMap, emptyStock } = require('./stockService');
const { runAtomic } = require('./txService');
const { storeToday, parseDateOnly } = require('../utils/date');
const { config } = require('../config/env');
const audit = require('./auditService');

const toView = (p, stock, role) => {
  const o = p.toObject ? p.toObject() : { ...p };
  if (role === 'cashier') delete o.costPrice;
  return { ...o, stock: stock || emptyStock };
};

async function list(q, role) {
  const filter = {};
  if (q.status === 'active') filter.isActive = true;
  else if (q.status === 'inactive') filter.isActive = false;
  if (q.category) filter.category = q.category;
  if (q.q) {
    const rx = new RegExp(escapeRegex(q.q), 'i');
    filter.$or = [{ name: rx }, { sku: rx }, { barcode: rx }];
  }
  const sortMap = { name: { name: 1 }, '-name': { name: -1 }, price: { sellingPrice: 1 }, '-price': { sellingPrice: -1 }, newest: { createdAt: -1 }, sku: { sku: 1 } };
  const sort = sortMap[q.sort] || { name: 1 };
  const populate = { path: 'category', select: 'name' };

  if (q.stock) {
    const all = await Product.find(filter).sort(sort).populate(populate);
    const sm = await stockMap(all.map((p) => p._id));
    const filtered = all.filter((p) => {
      const s = sm.get(String(p._id)) || emptyStock;
      if (q.stock === 'out') return s.sellable <= 0;
      if (q.stock === 'low') return s.sellable > 0 && s.sellable <= p.reorderThreshold;
      return s.sellable > 0;
    });
    const total = filtered.length;
    const rows = filtered.slice((q.page - 1) * q.limit, q.page * q.limit).map((p) => toView(p, sm.get(String(p._id)), role));
    return { rows, total };
  }
  const [docs, total] = await Promise.all([
    Product.find(filter).sort(sort).skip((q.page - 1) * q.limit).limit(q.limit).populate(populate),
    Product.countDocuments(filter),
  ]);
  const sm = await stockMap(docs.map((p) => p._id));
  return { rows: docs.map((p) => toView(p, sm.get(String(p._id)), role)), total };
}

async function getById(id, role) {
  const p = await Product.findById(id).populate('category', 'name');
  if (!p) throw ApiError.notFound('Product not found');
  const sm = await stockMap([p._id]);
  return toView(p, sm.get(String(p._id)), role);
}

async function byBarcode(code, role) {
  const p = await Product.findOne({ $or: [{ barcode: code }, { sku: String(code).toUpperCase() }], isActive: true }).populate('category', 'name');
  if (!p) throw ApiError.notFound('No active product matches this barcode', 'BARCODE_NOT_FOUND');
  const sm = await stockMap([p._id]);
  return toView(p, sm.get(String(p._id)), role);
}

async function assertCategory(id) {
  const c = await Category.findById(id);
  if (!c) throw ApiError.badRequest('Category does not exist', 'CATEGORY_NOT_FOUND');
  return c;
}

async function create(req, data) {
  await assertCategory(data.category);
  const { openingStock, ...fields } = data;
  const product = await runAtomic(async (ctx) => {
    const [p] = await Product.create([fields], { session: ctx.session });
    ctx.onUndo(() => Product.deleteOne({ _id: p._id }));
    if (openingStock && openingStock.quantity > 0) {
      const today = storeToday(config.timezone);
      let expiryDate = null;
      if (p.trackExpiry) {
        expiryDate = parseDateOnly(openingStock.expiryDate);
        if (!expiryDate) throw ApiError.badRequest('Expiry date is required for products that track expiry', 'EXPIRY_REQUIRED');
        if (expiryDate < today) throw ApiError.badRequest('Cannot add already expired stock', 'EXPIRED_STOCK');
      }
      const [b] = await Batch.create([{ product: p._id, lotNumber: openingStock.lotNumber || 'OPENING', receivedDate: new Date(), expiryDate, quantityReceived: openingStock.quantity, remainingQuantity: openingStock.quantity, costPrice: p.costPrice }], { session: ctx.session });
      ctx.onUndo(() => Batch.deleteOne({ _id: b._id }));
      const [m] = await Movement.create([{ product: p._id, batch: b._id, lotNumber: b.lotNumber, type: 'opening', quantity: openingStock.quantity, unitCost: p.costPrice, reason: 'Opening stock', user: req.user._id, userName: req.user.name }], { session: ctx.session });
      ctx.onUndo(() => Movement.deleteOne({ _id: m._id }));
    }
    return p;
  });
  await audit.record(req, { action: 'product.create', resource: 'product', resourceId: product._id, summary: `${product.sku} ${product.name}`, after: product });
  return getById(product._id, 'admin');
}

async function update(req, id, data) {
  const p = await Product.findById(id);
  if (!p) throw ApiError.notFound('Product not found');
  if (data.category) await assertCategory(data.category);
  const before = p.toObject();
  Object.assign(p, data);
  await p.save();
  const priceChanged = before.sellingPrice !== p.sellingPrice || before.costPrice !== p.costPrice;
  await audit.record(req, {
    action: priceChanged ? 'product.price_change' : 'product.update', resource: 'product', resourceId: p._id, summary: `${p.sku} ${p.name}`,
    before: priceChanged ? { sellingPrice: before.sellingPrice, costPrice: before.costPrice } : before,
    after: priceChanged ? { sellingPrice: p.sellingPrice, costPrice: p.costPrice } : p,
  });
  return getById(p._id, 'admin');
}

async function setStatus(req, id, isActive) {
  const p = await Product.findById(id);
  if (!p) throw ApiError.notFound('Product not found');
  const before = { isActive: p.isActive };
  p.isActive = isActive;
  await p.save();
  await audit.record(req, { action: isActive ? 'product.activate' : 'product.deactivate', resource: 'product', resourceId: p._id, summary: `${p.sku} ${p.name}`, before, after: { isActive } });
  return getById(p._id, 'admin');
}

module.exports = { list, getById, byBarcode, create, update, setStatus };
