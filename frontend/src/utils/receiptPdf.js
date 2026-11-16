// Builds a professional PDF receipt in the browser (no server needed) using pdf-lib.
// The library is loaded lazily, so it only downloads when someone actually shares/downloads a receipt.

const FOREST = [0.1686, 0.1059, 0.0706]; // #2B1B12
const LIME = [0.949, 0.663, 0.231]; // #F2A93B
const WHITE = [1, 1, 1];
const INK = [0.227, 0.02, 0.098];
const MUTED = [0.439, 0.282, 0.345];
const RULE = [0.902, 0.827, 0.859];
const AMBER = [0.631, 0.369, 0.027];
const RED = [0.706, 0.137, 0.094];
const GREEN = [0.114, 0.42, 0.184];

const W = 288; // 4 inch wide ticket (about 101 mm); height grows with the content
const M = 20;

/** Standard PDF fonts only understand WinAnsi: replace anything outside it so encoding can never throw. */
export function safeText(input) {
  const map = { '\u2212': '-', '\u2013': '-', '\u2014': '-', '\u2018': "'", '\u2019': "'", '\u201C': '"', '\u201D': '"', '\u2022': '*', '\u2026': '...', '\u00D7': 'x' };
  return String(input ?? '').replace(/[\u00A0\u202F\u2009\u2007\u2002\u2003]/g, ' ').split('').map((c) => {
    if (map[c]) return map[c];
    const code = c.charCodeAt(0);
    return code >= 32 && code <= 126 ? c : code >= 161 && code <= 255 ? c : code === 10 ? ' ' : '?';
  }).join('');
}

export const receiptFileName = (sale) => `Receipt-${String(sale.receiptNumber || 'sale').replace(/[^A-Za-z0-9-]/g, '')}.pdf`;

/**
 * @param {{store:object, sale:object, fmt:{money:Function, num:Function, dateTime:Function}}} args
 * @returns {Promise<Uint8Array>} the PDF bytes
 */
export async function buildReceiptPdf({ store, sale, fmt }) {
  const { PDFDocument, StandardFonts, rgb, degrees } = await import('pdf-lib');
  const pdf = await PDFDocument.create();
  const reg = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const col = (c) => rgb(c[0], c[1], c[2]);

  const credit = sale.payment?.creditAmount || 0;
  const voided = sale.status === 'voided';
  const status = voided ? { label: 'VOID', color: RED } : credit > 0 ? { label: sale.payment.amountReceived > 0 ? 'PART PAID' : 'ON CREDIT', color: AMBER } : { label: 'PAID', color: GREEN };

  // ---- layout runs twice: first without a page to measure the height, then to draw ----
  function run(page, H) {
    let y = 0; // distance from the top of the page
    const Y = (v) => H - v;
    const width = (s, size, f) => f.widthOfTextAtSize(safeText(s), size);
    const text = (s, x, size, f, color, align = 'left') => {
      const t = safeText(s); const w = f.widthOfTextAtSize(t, size);
      const px = align === 'right' ? x - w : align === 'center' ? x - w / 2 : x;
      if (page) page.drawText(t, { x: px, y: Y(y + size * 0.85), size, font: f, color: col(color) });
    };
    const spaced = (s, x, size, f, color, gap, align = 'left') => {
      const t = safeText(s).toUpperCase(); const total = [...t].reduce((a, c) => a + f.widthOfTextAtSize(c, size) + gap, -gap);
      let px = align === 'right' ? x - total : align === 'center' ? x - total / 2 : x;
      [...t].forEach((c) => { if (page) page.drawText(c, { x: px, y: Y(y + size * 0.85), size, font: f, color: col(color) }); px += f.widthOfTextAtSize(c, size) + gap; });
    };
    const wrap = (s, size, f, maxW) => {
      const words = safeText(s).split(/\s+/).filter(Boolean); const lines = []; let cur = '';
      words.forEach((w) => { const next = cur ? `${cur} ${w}` : w; if (f.widthOfTextAtSize(next, size) <= maxW || !cur) cur = next; else { lines.push(cur); cur = w; } });
      if (cur) lines.push(cur); return lines.length ? lines : [''];
    };
    const rr = (x, top, w, h, r, opts) => { if (!page) return; const p = `M ${r} 0 H ${w - r} Q ${w} 0 ${w} ${r} V ${h - r} Q ${w} ${h} ${w - r} ${h} H ${r} Q 0 ${h} 0 ${h - r} V ${r} Q 0 0 ${r} 0 Z`; page.drawSvgPath(p, { x, y: Y(top), ...opts }); };
    const hline = (x1, x2, color, thickness = 0.6, dash) => { if (page) page.drawLine({ start: { x: x1, y: Y(y) }, end: { x: x2, y: Y(y) }, thickness, color: col(color), ...(dash ? { dashArray: dash } : {}) }); };
    const row = (left, right, size, lf, rf, lc, rc) => { text(left, M, size, lf, lc); text(right, W - M, size, rf, rc, 'right'); y += size + 5; };

    // header band
    if (page) { page.drawRectangle({ x: 0, y: Y(96), width: W, height: 96, color: col(FOREST) }); page.drawRectangle({ x: 0, y: Y(98), width: W, height: 2, color: col(LIME) }); }
    const lx = W / 2 - 15; const ly = 16;
    if (page) {
      rr(lx, ly, 30, 30, 8, { color: col(LIME) });
      const s = 30 / 64; const bar = (bx, by, bw, bh) => page.drawRectangle({ x: lx + bx * s, y: Y(ly + (by + bh) * s), width: bw * s, height: bh * s, color: col(WHITE) });
      bar(12, 20, 9, 12); bar(24, 15, 9, 17); bar(36, 22, 9, 10); bar(9, 33, 46, 4); bar(14, 41, 12, 9); bar(29, 43, 8, 7); bar(40, 39, 10, 11); bar(9, 51, 46, 4);
    }
    y = 54; text(store?.storeName || 'Receipt', W / 2, 15, bold, [1, 1, 1], 'center');
    y = 73; if (store?.address) text(store.address, W / 2, 7.5, reg, [0.82, 0.91, 0.75], 'center');
    y = 83; if (store?.phone) text(`Phone: ${store.phone}`, W / 2, 7.5, reg, [0.82, 0.91, 0.75], 'center');

    // title + status
    y = 116; spaced('Sales receipt', M, 8, bold, INK, 2);
    const pillW = width(status.label, 7, bold) + 18;
    if (page) rr(W - M - pillW, y - 3, pillW, 15, 4, { borderColor: col(status.color), borderWidth: 1, color: undefined });
    text(status.label, W - M - pillW / 2, 7, bold, status.color, 'center');
    y += 22;

    // meta grid
    const meta = [['Receipt no.', sale.receiptNumber], ['Date', fmt.dateTime(sale.createdAt)], ['Cashier', sale.cashierName], ['Customer', sale.customerName || 'Walk-in']];
    const colW = (W - 2 * M) / 2;
    for (let i = 0; i < 4; i += 2) {
      [0, 1].forEach((k) => {
        const [label, value] = meta[i + k]; const x = M + k * colW;
        const saveY = y; spaced(label, x, 6, bold, MUTED, 1); y += 9;
        const lines = wrap(value, 9, bold, colW - 8); lines.forEach((ln) => { text(ln, x, 9, bold, INK); y += 11; });
        const used = y - saveY; if (k === 0) { meta[i].used = used; y = saveY; } else y = saveY + Math.max(meta[i].used, used);
      });
      y += 6;
    }
    y += 2; hline(M, W - M, RULE, 0.8, [2, 2]); y += 12;

    // items
    spaced('Item', M, 6.5, bold, MUTED, 1); spaced('Amount', W - M, 6.5, bold, MUTED, 1, 'right'); y += 10; hline(M, W - M, RULE, 0.8); y += 8;
    sale.items.forEach((it, idx) => {
      const nameLines = wrap(it.name, 9, bold, W - 2 * M - 72);
      nameLines.forEach((ln, k) => { text(ln, M, 9, bold, INK); if (k === 0) text(fmt.money(it.lineNet), W - M, 9, bold, INK, 'right'); y += 11; });
      const unit = it.unit && it.unit !== 'pcs' ? ` ${it.unit}` : '';
      text(`${fmt.num(it.quantity)}${unit} x ${fmt.money(it.unitPrice)}`, M, 7.5, reg, MUTED); y += 10;
      if (it.discountPercent > 0) { text(`Discount ${fmt.num(it.discountPercent, 1)}% (-${fmt.money(it.discountAmount)})`, M, 7, reg, GREEN); y += 10; }
      if (idx < sale.items.length - 1) { y += 2; hline(M, W - M, [0.88, 0.9, 0.85], 0.5, [1, 2]); y += 6; } else y += 4;
    });
    y += 4; hline(M, W - M, RULE, 0.8, [2, 2]); y += 12;

    // totals
    text(`${sale.items.length} ${sale.items.length === 1 ? 'item' : 'items'}`, M, 7.5, reg, MUTED); y += 12;
    row('Subtotal', fmt.money(sale.subtotal), 9, reg, reg, INK, INK);
    if (sale.discountTotal > 0) row('Discount', `-${fmt.money(sale.discountTotal)}`, 9, reg, reg, INK, GREEN);
    row('Tax', fmt.money(sale.taxTotal), 9, reg, reg, INK, INK);
    y += 4;
    if (page) rr(M, y, W - 2 * M, 38, 9, { color: col(FOREST) });
    y += 14; spaced('Total', M + 12, 8, bold, LIME, 2); text(fmt.money(sale.total), W - M - 12, 17, bold, [1, 1, 1], 'right'); y += 31;

    // payment
    row('Payment method', { cash: 'Cash', credit: 'On credit (khata)', partial: 'Cash + credit' }[sale.payment.method] || 'Cash', 8.5, reg, bold, MUTED, INK);
    row(credit > 0 ? 'Paid now' : 'Cash received', fmt.money(sale.payment.amountReceived), 9, reg, bold, INK, INK);
    if (credit === 0) row('Change', fmt.money(sale.payment.change), 9, reg, bold, INK, INK);
    if (credit > 0) {
      y += 4; const boxH = sale.customerBalanceAfter != null ? 44 : 30;
      if (page) rr(M, y, W - 2 * M, boxH, 8, { color: rgb(1, 0.965, 0.9), borderColor: col(AMBER), borderWidth: 1, borderDashArray: [3, 2] });
      y += 9; text('On credit (khata)', M + 10, 9, bold, [0.42, 0.26, 0.02]); text(fmt.money(credit), W - M - 10, 9, bold, [0.42, 0.26, 0.02], 'right'); y += 15;
      if (sale.customerBalanceAfter != null) { text('Customer balance', M + 10, 8.5, reg, [0.42, 0.26, 0.02]); text(fmt.money(sale.customerBalanceAfter), W - M - 10, 8.5, bold, [0.42, 0.26, 0.02], 'right'); y += 14; } else y += 6;
      y += 8;
    }

    // footer
    y += 8; hline(M, W - M, RULE, 0.8, [2, 2]); y += 14;
    text('Thank you for shopping with us!', W / 2, 10, bold, INK, 'center'); y += 15;
    if (store?.receiptFooter && !/^thank you for shopping with us!?$/i.test(store.receiptFooter.trim())) wrap(store.receiptFooter, 8, reg, W - 2 * M - 20).forEach((ln) => { text(ln, W / 2, 8, reg, MUTED, 'center'); y += 11; });
    y += 8; spaced('SwiftShelf POS', W / 2, 6, bold, [0.62, 0.68, 0.57], 2, 'center'); y += 16;
    return y;
  }

  const H = Math.max(360, Math.ceil(run(null, 1000)));
  const page = pdf.addPage([W, H]);
  if (voided) {
    page.drawText('VOID', { x: W / 2 - 62, y: H / 2 - 52, size: 92, font: bold, color: col(RED), opacity: 0.16, rotate: degrees(28) });
  }
  run(page, H);
  pdf.setTitle(`Receipt ${sale.receiptNumber}`); pdf.setAuthor(store?.storeName || 'SwiftShelf POS'); pdf.setCreator('SwiftShelf POS'); pdf.setProducer('SwiftShelf POS');
  return pdf.save();
}
