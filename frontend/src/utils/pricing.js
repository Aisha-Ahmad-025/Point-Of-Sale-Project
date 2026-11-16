// Client-side PREVIEW only. The server recalculates every price, discount, tax and total at checkout.
export const toCents = (v) => Math.round(Number(v || 0) * 100);
export function computeLine({ quantity, unitPrice, discountPercent = 0, taxRate = 0 }) {
  const gross = Math.round(toCents(unitPrice) * quantity);
  const discount = Math.round((gross * discountPercent) / 100);
  const net = gross - discount;
  const tax = Math.round((net * taxRate) / 100);
  return { gross, discount, net, tax, total: net + tax };
}
export function computeCart(lines, defaultTaxRate = 0) {
  const t = { gross: 0, discount: 0, net: 0, tax: 0, total: 0 };
  lines.forEach((l) => {
    const c = computeLine({ quantity: l.quantity, unitPrice: l.product.sellingPrice, discountPercent: l.discountPercent, taxRate: l.product.taxRate ?? defaultTaxRate });
    Object.keys(t).forEach((k) => { t[k] += c[k]; });
  });
  return Object.fromEntries(Object.entries(t).map(([k, v]) => [k, v / 100]));
}
