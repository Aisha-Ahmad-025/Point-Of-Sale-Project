const Customer = require('../models/Customer');
const Ledger = require('../models/LedgerEntry');
const ApiError = require('../utils/ApiError');
const { toCents, fromCents } = require('../utils/money');
const { escapeRegex } = require('../utils/pagination');
const { runAtomic } = require('./txService');
const { resolveRange } = require('./rangeUtil');
const settingsService = require('./settingsService');
const audit = require('./auditService');

const sess = (ctx) => (ctx.session ? { session: ctx.session } : {});

/** Public shape: cents are converted to decimals. available = how much more credit can be given. */
function present(c) {
  const o = c.toObject ? c.toObject() : { ...c };
  return {
    _id: o._id, name: o.name, phone: o.phone, address: o.address, notes: o.notes, isActive: o.isActive, lastPaymentAt: o.lastPaymentAt, createdAt: o.createdAt,
    balance: fromCents(o.balanceCents), creditLimit: fromCents(o.creditLimitCents), available: fromCents(Math.max(0, o.creditLimitCents - o.balanceCents)),
  };
}

async function list(q) {
  const filter = {};
  if (q.status === 'active') filter.isActive = true; else if (q.status === 'inactive') filter.isActive = false;
  if (q.owing) filter.balanceCents = { $gt: 0 };
  if (q.q) { const rx = new RegExp(escapeRegex(q.q), 'i'); filter.$or = [{ name: rx }, { phone: rx }]; }
  const sort = q.owing ? { balanceCents: -1, name: 1 } : { name: 1 };
  const [docs, total, agg] = await Promise.all([
    Customer.find(filter).sort(sort).skip((q.page - 1) * q.limit).limit(q.limit),
    Customer.countDocuments(filter),
    Customer.aggregate([{ $match: { balanceCents: { $gt: 0 } } }, { $group: { _id: null, outstanding: { $sum: '$balanceCents' }, count: { $sum: 1 } } }]),
  ]);
  return { rows: docs.map(present), total, summary: { outstanding: fromCents(agg[0]?.outstanding || 0), customersOwing: agg[0]?.count || 0 } };
}

async function getById(id) {
  const c = await Customer.findById(id);
  if (!c) throw ApiError.notFound('Customer not found');
  return present(c);
}

async function create(req, d) {
  const settings = await settingsService.get();
  if (d.creditLimit !== undefined && req.user.role !== 'admin') throw ApiError.forbidden('Only an admin can set a credit limit', 'CREDIT_LIMIT_ADMIN_ONLY');
  const limit = d.creditLimit ?? settings.defaultCreditLimit;
  const c = await Customer.create({ name: d.name, phone: d.phone, address: d.address, notes: d.notes, creditLimitCents: toCents(limit) });
  await audit.record(req, { action: 'customer.create', resource: 'customer', resourceId: c._id, summary: `${c.name}${c.phone ? ` (${c.phone})` : ''}, limit ${limit}`, after: present(c) });
  return present(c);
}

async function update(req, id, d) {
  const c = await Customer.findById(id);
  if (!c) throw ApiError.notFound('Customer not found');
  if (d.creditLimit !== undefined && req.user.role !== 'admin') throw ApiError.forbidden('Only an admin can change a credit limit', 'CREDIT_LIMIT_ADMIN_ONLY');
  const before = present(c);
  ['name', 'phone', 'address', 'notes'].forEach((k) => { if (d[k] !== undefined) c[k] = d[k]; });
  if (d.creditLimit !== undefined) c.creditLimitCents = toCents(d.creditLimit);
  await c.save();
  const after = present(c);
  await audit.record(req, { action: before.creditLimit !== after.creditLimit ? 'customer.credit_limit' : 'customer.update', resource: 'customer', resourceId: c._id, summary: c.name, before, after });
  return after;
}

async function setStatus(req, id, isActive) {
  const c = await Customer.findById(id);
  if (!c) throw ApiError.notFound('Customer not found');
  c.isActive = isActive; await c.save();
  await audit.record(req, { action: isActive ? 'customer.activate' : 'customer.deactivate', resource: 'customer', resourceId: c._id, summary: c.name, after: { isActive } });
  return present(c);
}

/* ---------- used inside checkout / void (already inside runAtomic) ---------- */

/** Put `cents` on the customer's khata. Refuses atomically when it would exceed the credit limit. */
async function applyCharge(ctx, customerId, cents) {
  const updated = await Customer.findOneAndUpdate(
    { _id: customerId, isActive: true, $expr: { $lte: [{ $add: ['$balanceCents', cents] }, '$creditLimitCents'] } },
    { $inc: { balanceCents: cents } }, { new: true, ...sess(ctx) },
  );
  if (!updated) {
    const c = await Customer.findById(customerId).session(ctx.session);
    if (!c) throw ApiError.badRequest('Customer not found', 'CUSTOMER_NOT_FOUND');
    if (!c.isActive) throw ApiError.conflict('This customer is inactive and cannot buy on credit', 'CUSTOMER_INACTIVE');
    const p = present(c);
    throw ApiError.conflict('Credit limit exceeded', 'CREDIT_LIMIT_EXCEEDED', { limit: p.creditLimit, balance: p.balance, available: p.available, requested: fromCents(cents) });
  }
  ctx.onUndo(() => Customer.updateOne({ _id: customerId }, { $inc: { balanceCents: -cents } }));
  return updated;
}

/** Reverse a charge (void). The balance may go negative if the customer already paid it: that is an advance. */
async function reverseCharge(ctx, customerId, cents) {
  const updated = await Customer.findOneAndUpdate({ _id: customerId }, { $inc: { balanceCents: -cents } }, { new: true, ...sess(ctx) });
  if (!updated) throw ApiError.conflict('Customer record is missing', 'CUSTOMER_NOT_FOUND');
  ctx.onUndo(() => Customer.updateOne({ _id: customerId }, { $inc: { balanceCents: cents } }));
  return updated;
}

async function addEntry(ctx, data) {
  const [e] = await Ledger.create([data], sess(ctx));
  ctx.onUndo(() => Ledger.deleteOne({ _id: e._id }));
  return e;
}

/* ---------- payments and adjustments ---------- */

async function findDup(requestId) { return requestId ? Ledger.findOne({ requestId }) : null; }

/** Customer pays towards their balance. Cannot exceed what they owe. Idempotent per requestId. */
async function recordPayment(req, id, d) {
  const dup = await findDup(d.requestId);
  if (dup) return { entry: dup, customer: await getById(id), duplicate: true };
  const cents = toCents(d.amount);
  if (cents <= 0) throw ApiError.badRequest('Amount must be greater than zero', 'VALIDATION_ERROR');
  try {
    const entry = await runAtomic(async (ctx) => {
      const updated = await Customer.findOneAndUpdate({ _id: id, balanceCents: { $gte: cents } }, { $inc: { balanceCents: -cents }, $set: { lastPaymentAt: new Date() } }, { new: true, ...sess(ctx) });
      if (!updated) {
        const c = await Customer.findById(id).session(ctx.session);
        if (!c) throw ApiError.notFound('Customer not found');
        throw ApiError.conflict('Payment is more than the outstanding balance', 'OVERPAYMENT', { balance: fromCents(Math.max(0, c.balanceCents)) });
      }
      ctx.onUndo(() => Customer.updateOne({ _id: id }, { $inc: { balanceCents: cents } }));
      return addEntry(ctx, { customer: id, type: 'payment', amount: fromCents(-cents), balanceAfter: fromCents(updated.balanceCents), note: d.note || 'Payment received', user: req.user._id, userName: req.user.name, requestId: d.requestId });
    });
    const customer = await getById(id);
    await audit.record(req, { action: 'credit.payment', resource: 'customer', resourceId: id, summary: `${customer.name} paid ${d.amount}, balance ${customer.balance}`, after: { amount: d.amount, balance: customer.balance } });
    return { entry, customer, duplicate: false };
  } catch (e) {
    if (e.code === 11000 && d.requestId) { const again = await findDup(d.requestId); if (again) return { entry: again, customer: await getById(id), duplicate: true }; }
    throw e;
  }
}

/** Admin correction / write-off. Positive adds to what is owed, negative reduces it (never below zero). */
async function adjust(req, id, d) {
  const dup = await findDup(d.requestId);
  if (dup) return { entry: dup, customer: await getById(id), duplicate: true };
  const cents = toCents(d.amount);
  if (cents === 0) throw ApiError.badRequest('Amount cannot be zero', 'VALIDATION_ERROR');
  try {
    const entry = await runAtomic(async (ctx) => {
      const filter = cents < 0 ? { _id: id, balanceCents: { $gte: -cents } } : { _id: id };
      const updated = await Customer.findOneAndUpdate(filter, { $inc: { balanceCents: cents } }, { new: true, ...sess(ctx) });
      if (!updated) {
        const c = await Customer.findById(id).session(ctx.session);
        if (!c) throw ApiError.notFound('Customer not found');
        throw ApiError.conflict('This adjustment would make the balance negative', 'NEGATIVE_BALANCE', { balance: fromCents(c.balanceCents) });
      }
      ctx.onUndo(() => Customer.updateOne({ _id: id }, { $inc: { balanceCents: -cents } }));
      return addEntry(ctx, { customer: id, type: 'adjustment', amount: fromCents(cents), balanceAfter: fromCents(updated.balanceCents), note: d.reason, user: req.user._id, userName: req.user.name, requestId: d.requestId });
    });
    const customer = await getById(id);
    await audit.record(req, { action: 'credit.adjustment', resource: 'customer', resourceId: id, summary: `${customer.name} ${d.amount > 0 ? '+' : ''}${d.amount}: ${d.reason}`, after: { amount: d.amount, balance: customer.balance } });
    return { entry, customer, duplicate: false };
  } catch (e) {
    if (e.code === 11000 && d.requestId) { const again = await findDup(d.requestId); if (again) return { entry: again, customer: await getById(id), duplicate: true }; }
    throw e;
  }
}

/* ---------- reading the ledger ---------- */

async function ledger(id, q) {
  if (!(await Customer.exists({ _id: id }))) throw ApiError.notFound('Customer not found');
  const filter = { customer: id };
  if (q.type) filter.type = q.type;
  const [rows, total] = await Promise.all([
    Ledger.find(filter).sort({ createdAt: -1, _id: -1 }).skip((q.page - 1) * q.limit).limit(q.limit).lean(),
    Ledger.countDocuments(filter),
  ]);
  return { rows, total };
}

/** Printable statement: opening balance, entries in the range (oldest first), closing balance. */
async function statement(id, q) {
  const customer = await getById(id);
  const settings = await settingsService.get();
  const range = resolveRange({ from: q.from, to: q.to }, settings.timezone, 30);
  const [before, entries, upTo] = await Promise.all([
    Ledger.findOne({ customer: id, createdAt: { $lt: range.fromDate } }).sort({ createdAt: -1, _id: -1 }).lean(),
    Ledger.find({ customer: id, createdAt: { $gte: range.fromDate, $lt: range.toDate } }).sort({ createdAt: 1, _id: 1 }).lean(),
    Ledger.findOne({ customer: id, createdAt: { $lt: range.toDate } }).sort({ createdAt: -1, _id: -1 }).lean(),
  ]);
  const sum = (type) => fromCents(entries.filter((e) => e.type === type).reduce((a, e) => a + toCents(e.amount), 0));
  return {
    customer, store: settingsService.toPublic(settings),
    range: { from: range.from.toISOString().slice(0, 10), to: range.to.toISOString().slice(0, 10) },
    openingBalance: before ? before.balanceAfter : 0, closingBalance: upTo ? upTo.balanceAfter : 0, entries,
    totals: { charges: sum('charge'), payments: -sum('payment'), adjustments: sum('adjustment') + sum('void_reversal') },
  };
}

module.exports = { present, list, getById, create, update, setStatus, applyCharge, reverseCharge, addEntry, recordPayment, adjust, ledger, statement };
