const { toCents, fromCents } = require('./money');

/**
 * Compute one cart line in integer minor units.
 * discount applies to the gross line amount; tax (exclusive) applies to the discounted net.
 */
function computeLine({ quantity, unitPrice, discountPercent = 0, taxRate = 0 }) {
  const gross = Math.round(toCents(unitPrice) * quantity);
  const discount = Math.round((gross * discountPercent) / 100);
  const net = gross - discount;
  const tax = Math.round((net * taxRate) / 100);
  return { gross, discount, net, tax, total: net + tax };
}

/** Sum lines (already in cents) into sale totals. */
function computeTotals(lines) {
  return lines.reduce(
    (a, l) => ({ gross: a.gross + l.gross, discount: a.discount + l.discount, net: a.net + l.net, tax: a.tax + l.tax, total: a.total + l.total }),
    { gross: 0, discount: 0, net: 0, tax: 0, total: 0 },
  );
}

const linesToMoney = (l) => ({ gross: fromCents(l.gross), discount: fromCents(l.discount), net: fromCents(l.net), tax: fromCents(l.tax), total: fromCents(l.total) });

/**
 * Gross profit = net sales revenue (excl. sales tax, after discounts) - COGS (cents in, cents out)
 * Gross margin % = gross profit / net revenue * 100 (null when revenue <= 0)
 */
function profitMetrics(netRevenueCents, cogsCents) {
  const grossProfit = netRevenueCents - cogsCents;
  const marginPct = netRevenueCents > 0 ? Math.round((grossProfit / netRevenueCents) * 10000) / 100 : null;
  return { netRevenue: netRevenueCents, cogs: cogsCents, grossProfit, marginPct };
}

module.exports = { computeLine, computeTotals, linesToMoney, profitMetrics };
