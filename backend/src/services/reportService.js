const Sale = require('../models/Sale');
const Product = require('../models/Product');
const Movement = require('../models/StockMovement');
const Customer = require('../models/Customer');
const Ledger = require('../models/LedgerEntry');
const { profitMetrics } = require('../utils/pricing');
const { classifyMovement } = require('../utils/forecast');
const { toCents, fromCents, round2, round3 } = require('../utils/money');
const { storeToday, addDays, daysBetween, startOfStoreDay } = require('../utils/date');
const { stockMap, emptyStock } = require('./stockService');
const inventoryService = require('./inventoryService');
const settingsService = require('./settingsService');
const { resolveRange } = require('./rangeUtil');
const { config } = require('../config/env');

const COMPLETED = { status: 'completed' };
const money = (n) => round2(n || 0);

async function salesTotals(match) {
  const [r] = await Sale.aggregate([
    { $match: { ...COMPLETED, ...match } },
    { $group: { _id: null, count: { $sum: 1 }, total: { $sum: '$total' }, subtotal: { $sum: '$subtotal' }, discount: { $sum: '$discountTotal' }, tax: { $sum: '$taxTotal' }, netRevenue: { $sum: '$netRevenue' }, cogs: { $sum: '$cogs' }, grossProfit: { $sum: '$grossProfit' } } },
  ]);
  const t = r || { count: 0, total: 0, subtotal: 0, discount: 0, tax: 0, netRevenue: 0, cogs: 0, grossProfit: 0 };
  const units = await unitsSold(match);
  const pm = profitMetrics(toCents(t.netRevenue), toCents(t.cogs));
  return { transactions: t.count, units, total: money(t.total), subtotal: money(t.subtotal), discount: money(t.discount), tax: money(t.tax), netRevenue: money(t.netRevenue), cogs: money(t.cogs), grossProfit: fromCents(pm.grossProfit), marginPct: pm.marginPct };
}

async function unitsSold(match) {
  const [r] = await Sale.aggregate([{ $match: { ...COMPLETED, ...match } }, { $unwind: '$items' }, { $group: { _id: null, units: { $sum: '$items.quantity' } } }]);
  return round3(r ? r.units : 0);
}

async function productPerformance(match) {
  return Sale.aggregate([
    { $match: { ...COMPLETED, ...match } }, { $unwind: '$items' },
    { $group: { _id: '$items.product', name: { $last: '$items.name' }, sku: { $last: '$items.sku' }, units: { $sum: '$items.quantity' }, revenue: { $sum: '$items.lineNet' }, cogs: { $sum: '$items.cogs' }, lastSale: { $max: '$createdAt' } } },
  ]);
}

/** Movement classification (slow / dead / new / normal) for every active product using configurable rules. */
async function movementClassification(settings) {
  const tz = settings.timezone || config.timezone;
  const now = new Date();
  const since = addDays(now, -settings.slowMovingWindowDays);
  const [products, soldRows, lastRows] = await Promise.all([
    Product.find({ isActive: true }).select('name sku createdAt unit sellingPrice costPrice').lean(),
    productPerformance({ createdAt: { $gte: since } }),
    Sale.aggregate([{ $match: COMPLETED }, { $unwind: '$items' }, { $group: { _id: '$items.product', last: { $max: '$createdAt' } } }]),
  ]);
  const sm = await stockMap(products.map((p) => p._id), { today: storeToday(tz) });
  const sold = new Map(soldRows.map((r) => [String(r._id), r.units]));
  const last = new Map(lastRows.map((r) => [String(r._id), r.last]));
  const out = new Map();
  products.forEach((p) => {
    const l = last.get(String(p._id));
    const c = classifyMovement({
      productAgeDays: daysBetween(p.createdAt, now), availableStock: (sm.get(String(p._id)) || emptyStock).sellable,
      unitsSold: sold.get(String(p._id)) || 0, windowDays: settings.slowMovingWindowDays,
      daysSinceLastSale: l ? daysBetween(l, now) : null, graceDays: settings.newProductGraceDays,
      minDaysSinceSale: settings.slowMovingMinIdleDays, slowVelocity: settings.slowMovingVelocity,
    });
    out.set(String(p._id), { ...c, windowDays: settings.slowMovingWindowDays, product: p, stock: sm.get(String(p._id)) || emptyStock });
  });
  return out;
}

async function wastageCost(match) {
  const [r] = await Movement.aggregate([
    { $match: { type: 'wastage', ...match } },
    { $group: { _id: null, cost: { $sum: { $multiply: [{ $abs: '$quantity' }, '$unitCost'] } }, units: { $sum: { $abs: '$quantity' } } } },
  ]);
  return { cost: money(r?.cost), units: round3(r?.units || 0) };
}

/** Cash actually collected at the till vs. credit extended (khata). Cash part of a sale = total - creditAmount. */
async function paymentSummary(match) {
  const [r] = await Sale.aggregate([
    { $match: { ...COMPLETED, ...match } },
    { $addFields: { credit: { $ifNull: ['$payment.creditAmount', 0] } } },
    { $group: { _id: null, cash: { $sum: { $subtract: ['$total', '$credit'] } }, cashCount: { $sum: { $cond: [{ $gt: [{ $subtract: ['$total', '$credit'] }, 0] }, 1, 0] } }, credit: { $sum: '$credit' }, creditCount: { $sum: { $cond: [{ $gt: ['$credit', 0] }, 1, 0] } } } },
  ]);
  const out = [];
  if (r && r.cashCount > 0) out.push({ method: 'cash', total: money(r.cash), count: r.cashCount });
  if (r && r.creditCount > 0) out.push({ method: 'credit', total: money(r.credit), count: r.creditCount });
  return out;
}

async function creditSummary(match) {
  const [owed, collected] = await Promise.all([
    Customer.aggregate([{ $match: { balanceCents: { $gt: 0 } } }, { $group: { _id: null, cents: { $sum: '$balanceCents' }, n: { $sum: 1 } } }]),
    Ledger.aggregate([{ $match: { type: 'payment', createdAt: match.createdAt } }, { $group: { _id: null, total: { $sum: { $multiply: ['$amount', -1] } }, n: { $sum: 1 } } }]),
  ]);
  return { outstanding: fromCents(owed[0]?.cents || 0), customersOwing: owed[0]?.n || 0, collected: money(collected[0]?.total), collections: collected[0]?.n || 0 };
}

async function dashboard(q) {
  const settings = await settingsService.get();
  const tz = settings.timezone || config.timezone;
  const range = resolveRange(q, tz, 7);
  const todayStart = startOfStoreDay(tz);
  const todayMatch = { createdAt: { $gte: todayStart, $lt: new Date(todayStart.getTime() + 86400000) } };
  const rangeMatch = { createdAt: { $gte: range.fromDate, $lt: range.toDate } };

  const [today, rangeTotals, trend, payments, best, recent, alerts, stock, cls] = await Promise.all([
    salesTotals(todayMatch),
    salesTotals(rangeMatch),
    Sale.aggregate([{ $match: { ...COMPLETED, ...rangeMatch } }, { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: tz } }, revenue: { $sum: '$total' }, grossProfit: { $sum: '$grossProfit' }, transactions: { $sum: 1 } } }, { $sort: { _id: 1 } }]),
    paymentSummary(rangeMatch),
    productPerformance(rangeMatch),
    Sale.find(COMPLETED).select('receiptNumber total cashierName customerName createdAt payment.creditAmount items.name items.quantity').sort({ createdAt: -1 }).limit(8).lean(),
    inventoryService.expiryAlerts(),
    inventoryService.listStock({ page: 1, limit: 8, status: 'low' }),
    movementClassification(settings),
  ]);
  const credit = await creditSummary(rangeMatch);
  // Previous period of the same length, so the dashboard can show up/down arrows.
  const len = range.toDate - range.fromDate;
  const previous = await salesTotals({ createdAt: { $gte: new Date(range.fromDate - len), $lt: range.fromDate } });
  const pct = (cur, prev) => (prev > 0 ? Math.round(((cur - prev) / prev) * 10000) / 100 : null);
  const change = { revenuePct: pct(rangeTotals.total, previous.total), profitPct: pct(rangeTotals.grossProfit, previous.grossProfit), transactionsPct: pct(rangeTotals.transactions, previous.transactions) };
  const bestSellers = best.sort((a, b) => b.units - a.units).slice(0, 5).map((r) => ({ productId: r._id, name: r.name, sku: r.sku, units: round3(r.units), revenue: money(r.revenue) }));
  const slow = [...cls.values()].filter((c) => c.class === 'slow' || c.class === 'dead').sort((a, b) => a.velocity - b.velocity).slice(0, 5)
    .map((c) => ({ productId: c.product._id, name: c.product.name, sku: c.product.sku, class: c.class, reasonKey: c.reasonKey, velocity: c.velocity, daysSinceLastSale: c.daysSinceLastSale, windowDays: c.windowDays, available: c.stock.sellable }));
  return {
    range: { from: range.from.toISOString().slice(0, 10), to: range.to.toISOString().slice(0, 10) },
    today, rangeTotals,
    trend: trend.map((t) => ({ date: t._id, revenue: money(t.revenue), grossProfit: money(t.grossProfit), transactions: t.transactions })),
    payments, credit, previous, change,
    bestSellers, slowMoving: slow,
    lowStock: stock.rows.map((r) => ({ _id: r._id, name: r.name, sku: r.sku, unit: r.unit, sellable: r.stock.sellable, threshold: r.reorderThreshold })),
    lowStockCount: stock.summary.low, outOfStockCount: stock.summary.out,
    nearExpiry: alerts.near.slice(0, 8), nearExpiryCount: alerts.near.length, expiredCount: alerts.expired.length,
    recent,
  };
}

async function salesReport(q) {
  const settings = await settingsService.get();
  const tz = settings.timezone || config.timezone;
  const range = resolveRange(q, tz, 30);
  const match = { createdAt: { $gte: range.fromDate, $lt: range.toDate } };
  const fmt = { day: '%Y-%m-%d', month: '%Y-%m', week: '%G-W%V' }[q.groupBy || 'day'];
  const rows = await Sale.aggregate([
    { $match: { ...COMPLETED, ...match } },
    { $group: { _id: { $dateToString: { format: fmt, date: '$createdAt', timezone: tz } }, transactions: { $sum: 1 }, subtotal: { $sum: '$subtotal' }, discount: { $sum: '$discountTotal' }, tax: { $sum: '$taxTotal' }, total: { $sum: '$total' }, netRevenue: { $sum: '$netRevenue' }, cogs: { $sum: '$cogs' }, grossProfit: { $sum: '$grossProfit' } } },
    { $sort: { _id: 1 } },
  ]);
  const totals = await salesTotals(match);
  // comparison with the previous period of equal length
  const len = range.toDate - range.fromDate;
  const prev = await salesTotals({ createdAt: { $gte: new Date(range.fromDate - len), $lt: range.fromDate } });
  const pct = (a, b) => (b > 0 ? Math.round(((a - b) / b) * 10000) / 100 : null);
  return {
    range: { from: range.from.toISOString().slice(0, 10), to: range.to.toISOString().slice(0, 10) },
    rows: rows.map((r) => ({ period: r._id, transactions: r.transactions, subtotal: money(r.subtotal), discount: money(r.discount), tax: money(r.tax), total: money(r.total), netRevenue: money(r.netRevenue), cogs: money(r.cogs), grossProfit: money(r.grossProfit) })),
    totals, previous: prev, change: { revenuePct: pct(totals.netRevenue, prev.netRevenue), profitPct: pct(totals.grossProfit, prev.grossProfit), transactionsPct: pct(totals.transactions, prev.transactions) },
  };
}

async function profitReport(q) {
  const settings = await settingsService.get();
  const tz = settings.timezone || config.timezone;
  const range = resolveRange(q, tz, 30);
  const match = { createdAt: { $gte: range.fromDate, $lt: range.toDate } };
  const [totals, perf, waste] = await Promise.all([salesTotals(match), productPerformance(match), wastageCost(match)]);
  const products = perf.map((r) => {
    const pm = profitMetrics(toCents(r.revenue), toCents(r.cogs));
    return { productId: r._id, name: r.name, sku: r.sku, units: round3(r.units), revenue: money(r.revenue), cogs: money(r.cogs), grossProfit: fromCents(pm.grossProfit), marginPct: pm.marginPct };
  }).sort((a, b) => b.grossProfit - a.grossProfit);
  return {
    range: { from: range.from.toISOString().slice(0, 10), to: range.to.toISOString().slice(0, 10) },
    totals, wastage: waste,
    // Wastage is NOT part of COGS or gross profit above. It is reported separately here.
    grossProfitAfterWastage: round2(totals.grossProfit - waste.cost),
    definitions: { grossProfit: 'netRevenue (after discounts, excluding sales tax) - COGS from batch cost snapshots', marginPct: 'grossProfit / netRevenue x 100', wastageIncluded: false, voidedSalesExcluded: true },
    products,
  };
}

async function productsReport(q) {
  const settings = await settingsService.get();
  const tz = settings.timezone || config.timezone;
  const range = resolveRange(q, tz, 30);
  const [perf, cls] = await Promise.all([productPerformance({ createdAt: { $gte: range.fromDate, $lt: range.toDate } }), movementClassification(settings)]);
  const perfMap = new Map(perf.map((r) => [String(r._id), r]));
  const rows = [...cls.entries()].map(([id, c]) => {
    const r = perfMap.get(id);
    const pm = profitMetrics(toCents(r?.revenue || 0), toCents(r?.cogs || 0));
    return { productId: id, name: c.product.name, sku: c.product.sku, units: round3(r?.units || 0), revenue: money(r?.revenue), grossProfit: fromCents(pm.grossProfit), marginPct: pm.marginPct, available: c.stock.sellable, class: c.class, reasonKey: c.reasonKey, velocity: c.velocity, daysSinceLastSale: c.daysSinceLastSale, windowDays: c.windowDays };
  });
  const filtered = q.class ? rows.filter((r) => r.class === q.class) : rows;
  return { range: { from: range.from.toISOString().slice(0, 10), to: range.to.toISOString().slice(0, 10) }, rows: filtered.sort((a, b) => b.units - a.units) };
}

async function stockReport() {
  const all = await inventoryService.listStock({ page: 1, limit: 100000, includeInactive: true });
  return { summary: all.summary, rows: all.rows.map((r) => ({ _id: r._id, name: r.name, sku: r.sku, unit: r.unit, category: r.category, onHand: r.stock.onHand, sellable: r.stock.sellable, expired: r.stock.expired, costValue: r.stock.value, retailValue: r.retailValue, stockStatus: r.stockStatus })) };
}

module.exports = { dashboard, salesReport, profitReport, productsReport, stockReport, salesTotals, movementClassification };
