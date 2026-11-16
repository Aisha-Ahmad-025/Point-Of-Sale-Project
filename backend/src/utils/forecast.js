/**
 * Transparent, rule-based forecasting. No machine learning is used or claimed.
 *   Reorder point (ROP)      = avgDailyDemand x leadTimeDays + safetyStock
 *   Target stock level       = avgDailyDemand x coverageDays + safetyStock
 *   Suggested reorder qty    = max(0, ceil(target - availableStock))
 */
const MIN_HISTORY_DAYS = 7;

/**
 * Count days in the window on which the product could actually sell.
 * Days that closed with zero on-hand stock AND had no sales are excluded so that
 * stock-out periods do not understate demand.
 * @param {number} currentOnHand on-hand quantity today (all batches)
 * @param {Object<string, {delta:number, sold:number}>} byDay map YYYY-MM-DD -> net movement delta and units sold
 * @param {string[]} days ordered oldest -> newest YYYY-MM-DD (the window, newest = today)
 */
function countInStockDays(currentOnHand, byDay, days) {
  let closing = currentOnHand;
  let inStock = 0;
  for (let i = days.length - 1; i >= 0; i -= 1) {
    const d = byDay[days[i]] || { delta: 0, sold: 0 };
    if (closing > 0 || d.sold > 0) inStock += 1;
    closing -= d.delta; // step back to the previous day's closing balance
  }
  return inStock;
}

function forecastProduct({ unitsSold, windowDays, inStockDays, productAgeDays, availableStock, leadTimeDays, safetyStock, coverageDays }) {
  const historyDays = Math.max(0, Math.min(windowDays, productAgeDays));
  const effectiveDays = Math.max(0, Math.min(inStockDays ?? historyDays, historyDays));
  const insufficientHistory = historyDays < MIN_HISTORY_DAYS;
  const avgDailyDemand = effectiveDays > 0 ? unitsSold / effectiveDays : 0;
  const stock = Math.max(0, availableStock);

  const reorderPoint = avgDailyDemand * leadTimeDays + safetyStock;
  const targetStock = avgDailyDemand * coverageDays + safetyStock;
  const suggestedQty = Math.max(0, Math.ceil(targetStock - stock - 1e-9));
  const daysRemaining = avgDailyDemand > 0 ? stock / avgDailyDemand : null;

  let risk;
  let reasonKey;
  if (stock <= 0) { risk = 'out'; reasonKey = 'outOfStock'; }
  else if (avgDailyDemand > 0 && daysRemaining < leadTimeDays) { risk = 'high'; reasonKey = 'stockoutBeforeDelivery'; }
  else if (stock <= reorderPoint) { risk = 'medium'; reasonKey = 'belowReorderPoint'; }
  else if (avgDailyDemand === 0) { risk = 'low'; reasonKey = 'noRecentDemand'; }
  else { risk = 'low'; reasonKey = 'healthy'; }

  const r2 = (n) => Math.round(n * 100) / 100;
  return {
    avgDailyDemand: r2(avgDailyDemand),
    daysRemaining: daysRemaining === null ? null : r2(daysRemaining),
    reorderPoint: r2(reorderPoint),
    targetStock: r2(targetStock),
    suggestedQty,
    risk,
    reasonKey,
    insufficientHistory,
    estimated: true,
    basis: { unitsSold, windowDays, effectiveDays, historyDays, leadTimeDays, safetyStock, coverageDays, availableStock: stock },
  };
}

/**
 * Slow-moving classification with explicit, explainable reasons.
 * classes: new | no_stock | dead | slow | normal
 */
function classifyMovement({ productAgeDays, availableStock, unitsSold, windowDays, daysSinceLastSale, graceDays, minDaysSinceSale, slowVelocity }) {
  const velocity = windowDays > 0 ? unitsSold / windowDays : 0;
  const base = { velocity: Math.round(velocity * 1000) / 1000, daysSinceLastSale };
  if (productAgeDays < graceDays) return { class: 'new', reasonKey: 'newProduct', ...base };
  if (availableStock <= 0) return { class: 'no_stock', reasonKey: 'noStockContext', ...base };
  const idle = daysSinceLastSale === null ? productAgeDays : daysSinceLastSale;
  if (unitsSold === 0 && idle >= minDaysSinceSale) return { class: 'dead', reasonKey: 'noSalesInWindow', ...base };
  if (velocity < slowVelocity) return { class: 'slow', reasonKey: 'lowVelocity', ...base };
  return { class: 'normal', reasonKey: 'normalVelocity', ...base };
}

module.exports = { forecastProduct, classifyMovement, countInStockDays, MIN_HISTORY_DAYS };
