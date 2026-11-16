const Product = require('../models/Product');
const Sale = require('../models/Sale');
const Movement = require('../models/StockMovement');
const { forecastProduct, countInStockDays } = require('../utils/forecast');
const { storeToday, addDays, daysBetween, toDateKey } = require('../utils/date');
const { stockMap, emptyStock } = require('./stockService');
const settingsService = require('./settingsService');
const { escapeRegex } = require('../utils/pagination');
const { config } = require('../config/env');

const RISK_ORDER = { out: 0, high: 1, medium: 2, low: 3 };

/**
 * Rule-based reorder recommendations (estimates, not machine learning).
 * Reversed (voided) sales are excluded. "Available stock" is sellable (non-expired) stock.
 */
async function reorderRecommendations(q = {}) {
  const settings = await settingsService.get();
  const tz = settings.timezone || config.timezone;
  const windowDays = q.windowDays || settings.forecastWindowDays;
  const coverageDays = q.coverageDays || settings.coverageDays;
  const today = storeToday(tz);
  const now = new Date();
  const since = addDays(now, -windowDays);
  const days = Array.from({ length: windowDays }, (_, i) => toDateKey(addDays(today, -(windowDays - 1 - i))));

  const filter = { isActive: true };
  if (q.q) { const rx = new RegExp(escapeRegex(q.q), 'i'); filter.$or = [{ name: rx }, { sku: rx }]; }
  const products = await Product.find(filter).populate('category', 'name').lean();
  const ids = products.map((p) => p._id);

  const [soldDaily, moveDaily, sm] = await Promise.all([
    Sale.aggregate([{ $match: { status: 'completed', createdAt: { $gte: since } } }, { $unwind: '$items' },
      { $group: { _id: { p: '$items.product', d: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: tz } } }, units: { $sum: '$items.quantity' } } }]),
    Movement.aggregate([{ $match: { createdAt: { $gte: since }, product: { $in: ids } } },
      { $group: { _id: { p: '$product', d: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: tz } } }, delta: { $sum: '$quantity' } } }]),
    stockMap(ids, { today }),
  ]);
  const byProduct = new Map();
  const slot = (p, d) => { const m = byProduct.get(p) || {}; byProduct.set(p, m); m[d] = m[d] || { delta: 0, sold: 0 }; return m[d]; };
  soldDaily.forEach((r) => { slot(String(r._id.p), r._id.d).sold += r.units; });
  moveDaily.forEach((r) => { slot(String(r._id.p), r._id.d).delta += r.delta; });

  let rows = products.map((p) => {
    const s = sm.get(String(p._id)) || emptyStock;
    const byDay = byProduct.get(String(p._id)) || {};
    const unitsSold = Object.values(byDay).reduce((a, d) => a + d.sold, 0);
    const f = forecastProduct({
      unitsSold, windowDays, inStockDays: countInStockDays(s.onHand, byDay, days), productAgeDays: daysBetween(p.createdAt, now),
      availableStock: s.sellable, leadTimeDays: p.leadTimeDays ?? settings.defaultLeadTimeDays, safetyStock: p.safetyStock ?? settings.defaultSafetyStock, coverageDays,
    });
    return { productId: p._id, name: p.name, sku: p.sku, unit: p.unit, category: p.category, costPrice: p.costPrice, available: s.sellable, estimatedOrderCost: Math.round(f.suggestedQty * p.costPrice * 100) / 100, ...f };
  });
  if (q.risk) rows = rows.filter((r) => r.risk === q.risk);
  else if (q.onlyActionable) rows = rows.filter((r) => r.suggestedQty > 0 && r.risk !== 'low');
  rows.sort((a, b) => RISK_ORDER[a.risk] - RISK_ORDER[b.risk] || (a.daysRemaining ?? 1e9) - (b.daysRemaining ?? 1e9));
  return {
    parameters: { windowDays, coverageDays, defaultLeadTimeDays: settings.defaultLeadTimeDays },
    formulas: { reorderPoint: 'avgDailyDemand x leadTimeDays + safetyStock', targetStock: 'avgDailyDemand x coverageDays + safetyStock', suggestedQty: 'max(0, ceil(targetStock - availableStock))' },
    disclaimer: 'Estimates from recent sales history using fixed rules. This is not machine learning.',
    rows,
  };
}
module.exports = { reorderRecommendations };
