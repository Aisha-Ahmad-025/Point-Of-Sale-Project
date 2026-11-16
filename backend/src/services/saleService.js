const mongoose = require('mongoose');
const Sale = require('../models/Sale');
const Product = require('../models/Product');
const Batch = require('../models/InventoryBatch');
const Movement = require('../models/StockMovement');
const Counter = require('../models/Counter');
const Customer = require('../models/Customer');
const customerService = require('./customerService');
const ApiError = require('../utils/ApiError');
const { computeLine, computeTotals } = require('../utils/pricing');
const { toCents, fromCents, round3 } = require('../utils/money');
const { allocateFefo } = require('../utils/fefo');
const { storeToday, partsInTz } = require('../utils/date');
const { escapeRegex } = require('../utils/pagination');
const { runAtomic } = require('./txService');
const settingsService = require('./settingsService');
const audit = require('./auditService');
const { config } = require('../config/env');

const sess = (ctx) => (ctx.session ? { session: ctx.session } : {});

/** Create today's counter document up-front so concurrent transactions never race on the first upsert. */
async function ensureReceiptCounter(tz) {
  const { y, m, d } = partsInTz(new Date(), tz);
  const key = `receipt-${y}${String(m).padStart(2, '0')}${String(d).padStart(2, '0')}`;
  try { await Counter.updateOne({ _id: key }, { $setOnInsert: { seq: 0 } }, { upsert: true }); } catch (e) { if (e.code !== 11000) throw e; }
}

async function nextReceiptNumber(tz, ctx) {
  const { y, m, d } = partsInTz(new Date(), tz);
  const day = `${y}${String(m).padStart(2, '0')}${String(d).padStart(2, '0')}`;
  const seq = await Counter.next(`receipt-${day}`, sess(ctx));
  return `SS-${day}-${String(seq).padStart(5, '0')}`;
}

/**
 * Checkout. The client sends ONLY product ids, quantities, optional discount percents and the cash received.
 * Prices, discounts, taxes, totals, costs and batches are all decided here on the server.
 */
async function checkout(req, payload) {
  const user = req.user;
  const settings = await settingsService.get();
  const tz = settings.timezone || config.timezone;

  // Idempotency: a repeated submission with the same key returns the original sale, never a second one.
  const existing = await Sale.findOne({ clientRequestId: payload.clientRequestId });
  if (existing) {
    if (String(existing.cashier) !== String(user._id)) throw ApiError.conflict('Request id already used', 'DUPLICATE_REQUEST');
    return { sale: existing, duplicate: true };
  }

  await ensureReceiptCounter(tz);
  try {
    const sale = await runAtomic(async (ctx) => {
      const today = storeToday(tz);
      const lines = [];
      // Phase 1: read + price every line (no writes yet).
      for (const item of payload.items) {
        const product = await Product.findById(item.productId).session(ctx.session);
        if (!product) throw ApiError.badRequest('A product in the cart no longer exists', 'PRODUCT_NOT_FOUND', { productId: item.productId });
        if (!product.isActive) throw ApiError.conflict(`${product.name} is inactive and cannot be sold`, 'PRODUCT_INACTIVE', { productId: product._id });
        if (['pcs', 'pack', 'box', 'dozen'].includes(product.unit) && !Number.isInteger(item.quantity)) {
          throw ApiError.badRequest(`${product.name} is sold in whole units`, 'WHOLE_UNITS_ONLY', { productId: product._id });
        }
        const discountPercent = item.discountPercent || 0;
        if (user.role !== 'admin' && discountPercent > settings.cashierMaxDiscountPercent) {
          throw ApiError.forbidden(`Discount above ${settings.cashierMaxDiscountPercent}% requires an admin`, 'DISCOUNT_NOT_ALLOWED');
        }
        const taxRate = product.taxRate ?? settings.taxRate;
        const calc = computeLine({ quantity: item.quantity, unitPrice: product.sellingPrice, discountPercent, taxRate });
        lines.push({ product, quantity: item.quantity, discountPercent, taxRate, calc });
      }
      const totals = computeTotals(lines.map((l) => l.calc));
      const received = toCents(payload.amountReceived);
      // Optional customer (khata). Cash short of the total is only allowed when a customer is attached: the rest goes on credit.
      let customer = null;
      if (payload.customerId) {
        customer = await Customer.findById(payload.customerId).session(ctx.session);
        if (!customer) throw ApiError.badRequest('Customer not found', 'CUSTOMER_NOT_FOUND');
        if (!customer.isActive) throw ApiError.conflict('This customer is inactive', 'CUSTOMER_INACTIVE');
      }
      const creditCents = Math.max(0, totals.total - received);
      if (creditCents > 0 && !customer) throw ApiError.badRequest('Cash received is less than the total due', 'PAYMENT_INSUFFICIENT', { total: fromCents(totals.total) });

      // Phase 2: FEFO allocation with conditional atomic decrements (no overselling, no expired stock).
      const saleId = new mongoose.Types.ObjectId();
      const items = [];
      const movements = [];
      for (const l of lines) {
        const eligible = await Batch.find({ product: l.product._id, remainingQuantity: { $gt: 0 }, $or: [{ expiryDate: null }, { expiryDate: { $gte: today } }] }).session(ctx.session).lean();
        const { allocations, shortfall } = allocateFefo(eligible, l.quantity);
        if (shortfall > 0) {
          const available = round3(eligible.reduce((a, b) => a + b.remainingQuantity, 0));
          throw ApiError.conflict(`Insufficient stock for ${l.product.name}`, 'INSUFFICIENT_STOCK', { productId: l.product._id, name: l.product.name, requested: l.quantity, available });
        }
        let cogsCents = 0;
        for (const a of allocations) {
          const r = await Batch.updateOne({ _id: a.batch, remainingQuantity: { $gte: a.quantity } }, { $inc: { remainingQuantity: -a.quantity } }, sess(ctx));
          if (r.modifiedCount !== 1) throw ApiError.conflict(`Stock for ${l.product.name} changed. Please retry.`, 'STOCK_CHANGED', { productId: l.product._id });
          ctx.onUndo(() => Batch.updateOne({ _id: a.batch }, { $inc: { remainingQuantity: a.quantity } }));
          cogsCents += Math.round(toCents(a.costPrice) * a.quantity);
          movements.push({ product: l.product._id, batch: a.batch, lotNumber: a.lotNumber, type: 'sale', quantity: -a.quantity, unitCost: a.costPrice, reason: 'POS sale', user: user._id, userName: user.name, sale: saleId });
        }
        items.push({
          product: l.product._id, name: l.product.name, sku: l.product.sku, unit: l.product.unit,
          quantity: l.quantity, unitPrice: l.product.sellingPrice, unitCost: fromCents(Math.round(cogsCents / l.quantity)),
          discountPercent: l.discountPercent, discountAmount: fromCents(l.calc.discount), taxRate: l.taxRate, taxAmount: fromCents(l.calc.tax),
          lineNet: fromCents(l.calc.net), lineTotal: fromCents(l.calc.total), cogs: fromCents(cogsCents), allocations,
        });
      }
      const cogsTotal = items.reduce((a, i) => a + toCents(i.cogs), 0);
      const receiptNumber = await nextReceiptNumber(tz, ctx);
      let balanceAfterCents = customer ? customer.balanceCents : null;
      if (creditCents > 0) balanceAfterCents = (await customerService.applyCharge(ctx, customer._id, creditCents)).balanceCents; // atomic, enforces the credit limit
      const [created] = await Sale.create([{
        _id: saleId, receiptNumber, clientRequestId: payload.clientRequestId, cashier: user._id, cashierName: user.name, items,
        subtotal: fromCents(totals.gross), discountTotal: fromCents(totals.discount), taxTotal: fromCents(totals.tax), total: fromCents(totals.total),
        netRevenue: fromCents(totals.net), cogs: fromCents(cogsTotal), grossProfit: fromCents(totals.net - cogsTotal),
        ...(customer ? { customer: customer._id, customerName: customer.name, customerPhone: customer.phone, customerBalanceAfter: fromCents(balanceAfterCents) } : {}),
        payment: { method: creditCents > 0 ? (received > 0 ? 'partial' : 'credit') : 'cash', amountReceived: fromCents(received), change: creditCents > 0 ? 0 : fromCents(received - totals.total), creditAmount: fromCents(creditCents) },
        paymentStatus: creditCents > 0 ? (received > 0 ? 'partial' : 'unpaid') : 'paid',
      }], sess(ctx));
      ctx.onUndo(() => Sale.deleteOne({ _id: saleId }));
      if (creditCents > 0) await customerService.addEntry(ctx, { customer: customer._id, type: 'charge', amount: fromCents(creditCents), balanceAfter: fromCents(balanceAfterCents), sale: saleId, receiptNumber, note: `Sale ${receiptNumber}`, user: user._id, userName: user.name });
      await Movement.create(movements, { ...sess(ctx), ordered: true });
      ctx.onUndo(() => Movement.deleteMany({ sale: saleId }));
      return created;
    });
    await audit.record(req, { action: 'sale.complete', resource: 'sale', resourceId: sale._id, summary: `${sale.receiptNumber} total ${sale.total}${sale.payment.creditAmount > 0 ? ` (on credit ${sale.payment.creditAmount} to ${sale.customerName})` : ''}`, after: { receiptNumber: sale.receiptNumber, total: sale.total, items: sale.items.length, creditAmount: sale.payment.creditAmount } });
    return { sale, duplicate: false };
  } catch (e) {
    if (e.code === 11000 && /clientRequestId/.test(e.message)) {
      const again = await Sale.findOne({ clientRequestId: payload.clientRequestId });
      if (again) return { sale: again, duplicate: true };
    }
    throw e;
  }
}

/** Admin-only full void. Restores stock to the exact batches that were sold from and records explicit movements. */
async function voidSale(req, id, reason) {
  const sale0 = await Sale.findById(id);
  if (!sale0) throw ApiError.notFound('Sale not found');
  if (sale0.status === 'voided') throw ApiError.conflict('Sale is already voided', 'ALREADY_VOIDED');
  const sale = await runAtomic(async (ctx) => {
    const s = await Sale.findOneAndUpdate({ _id: id, status: 'completed' }, { status: 'voided', paymentStatus: 'refunded', voidedAt: new Date(), voidedBy: req.user._id, voidReason: reason }, { new: true, ...sess(ctx) });
    if (!s) throw ApiError.conflict('Sale is already voided', 'ALREADY_VOIDED');
    ctx.onUndo(() => Sale.updateOne({ _id: id }, { status: 'completed', paymentStatus: sale0.paymentStatus, $unset: { voidedAt: 1, voidedBy: 1, voidReason: 1 } }));
    const movements = [];
    for (const item of s.items) {
      for (const a of item.allocations) {
        await Batch.updateOne({ _id: a.batch }, { $inc: { remainingQuantity: a.quantity } }, sess(ctx));
        ctx.onUndo(() => Batch.updateOne({ _id: a.batch }, { $inc: { remainingQuantity: -a.quantity } }));
        movements.push({ product: item.product, batch: a.batch, lotNumber: a.lotNumber, type: 'void_return', quantity: a.quantity, unitCost: a.costPrice, reason: `Void ${s.receiptNumber}: ${reason}`, user: req.user._id, userName: req.user.name, sale: s._id });
      }
    }
    await Movement.create(movements, { ...sess(ctx), ordered: true });
    ctx.onUndo(() => Movement.deleteMany({ sale: s._id, type: 'void_return' }));
    // A sale that was (partly) on credit also reverses its khata charge.
    if (s.customer && s.payment.creditAmount > 0) {
      const c = await customerService.reverseCharge(ctx, s.customer, toCents(s.payment.creditAmount));
      await customerService.addEntry(ctx, { customer: s.customer, type: 'void_reversal', amount: -s.payment.creditAmount, balanceAfter: fromCents(c.balanceCents), sale: s._id, receiptNumber: s.receiptNumber, note: `Void ${s.receiptNumber}: ${reason}`, user: req.user._id, userName: req.user.name });
    }
    return s;
  });
  await audit.record(req, { action: 'sale.void', resource: 'sale', resourceId: sale._id, summary: `${sale.receiptNumber}: ${reason}`, before: { status: 'completed' }, after: { status: 'voided', reason } });
  return sale;
}

async function list(req, q) {
  const filter = {};
  if (req.user.role !== 'admin') filter.cashier = req.user._id; // cashiers only see their own sales
  else if (q.cashier) filter.cashier = q.cashier;
  if (q.status) filter.status = q.status;
  if (q.customer) filter.customer = q.customer;
  if (q.credit) filter['payment.creditAmount'] = { $gt: 0 };
  if (q.from || q.to) { filter.createdAt = {}; if (q.from) filter.createdAt.$gte = q.fromDate; if (q.to) filter.createdAt.$lt = q.toDate; }
  if (q.q) filter.receiptNumber = new RegExp(escapeRegex(q.q), 'i');
  const [rows, total] = await Promise.all([
    Sale.find(filter).select('-items.allocations').sort({ createdAt: -1 }).skip((q.page - 1) * q.limit).limit(q.limit).lean(),
    Sale.countDocuments(filter),
  ]);
  const sumAgg = await Sale.aggregate([{ $match: { ...filter, status: 'completed' } }, { $group: { _id: null, total: { $sum: '$total' }, count: { $sum: 1 } } }]);
  return { rows, total, summary: { completedTotal: sumAgg[0]?.total || 0, completedCount: sumAgg[0]?.count || 0 } };
}

async function getById(req, id) {
  const sale = await Sale.findById(id).lean();
  if (!sale) throw ApiError.notFound('Sale not found');
  if (req.user.role !== 'admin' && String(sale.cashier) !== String(req.user._id)) throw ApiError.forbidden();
  if (req.user.role !== 'admin') {
    // cashiers never see cost / profit figures
    delete sale.cogs; delete sale.grossProfit;
    sale.items = sale.items.map(({ unitCost, cogs, allocations, ...rest }) => rest);
  }
  return sale;
}

async function receipt(req, id) {
  const sale = await getById(req, id);
  const settings = await settingsService.get();
  return { store: settingsService.toPublic(settings), sale };
}

module.exports = { checkout, voidSale, list, getById, receipt };
