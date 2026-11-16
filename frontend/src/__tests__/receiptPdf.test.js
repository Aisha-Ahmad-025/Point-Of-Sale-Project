import { describe, expect, test } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { buildReceiptPdf, receiptFileName, safeText } from '../utils/receiptPdf';

const fmt = { money: (v) => `Rs ${Number(v).toFixed(2)}`, num: (v) => String(v), dateTime: () => '22 Oct 2026, 12:45\u202Fpm' }; // note the narrow no-break space ICU puts before "pm"
const store = { storeName: 'SwiftShelf Mini Mart', address: '12 Main Boulevard', phone: '+92 300 0000000', receiptFooter: 'Exchange within 3 days.' };
const item = (name) => ({ name, quantity: 2, unit: 'pcs', unitPrice: 100, lineNet: 200, discountPercent: 0, discountAmount: 0 });
const sale = (over = {}) => ({ receiptNumber: 'SS-20261022-00007', createdAt: '2026-10-22', cashierName: 'Ali', customerName: 'Ahmed', status: 'completed', items: [item('Milk 1L')], subtotal: 200, discountTotal: 0, taxTotal: 10, total: 210, payment: { method: 'cash', amountReceived: 300, change: 90, creditAmount: 0 }, ...over });

describe('PDF receipt', () => {
  test('produces a valid one-page PDF for a cash sale', async () => {
    const bytes = await buildReceiptPdf({ store, sale: sale(), fmt });
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe('%PDF-');
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
    expect(doc.getTitle()).toBe('Receipt SS-20261022-00007');
    expect(doc.getPage(0).getWidth()).toBe(288);
  });
  test('handles credit sales, voided sales and awkward characters without throwing', async () => {
    const credit = await buildReceiptPdf({ store, sale: sale({ customerBalanceAfter: 500, payment: { method: 'partial', amountReceived: 100, change: 0, creditAmount: 110 } }), fmt });
    const voided = await buildReceiptPdf({ store, sale: sale({ status: 'voided', items: [item('Caf\u00e9 \u2013 \u201CSpecial\u201D \u0627\u0631\u062F\u0648 \u2022 pack')] }), fmt });
    expect((await PDFDocument.load(credit)).getPageCount()).toBe(1);
    expect((await PDFDocument.load(voided)).getPageCount()).toBe(1);
  });
  test('the page grows with the number of lines', async () => {
    const short = await PDFDocument.load(await buildReceiptPdf({ store, sale: sale(), fmt }));
    const long = await PDFDocument.load(await buildReceiptPdf({ store, sale: sale({ items: Array.from({ length: 25 }, (_, i) => item(`Item number ${i + 1} with a rather long descriptive name`)) }), fmt }));
    expect(long.getPage(0).getHeight()).toBeGreaterThan(short.getPage(0).getHeight() + 300);
  });
  test('text is made safe for the standard PDF fonts and file names are clean', () => {
    expect(safeText('12:45\u202Fpm')).toBe('12:45 pm');
    expect(safeText('a\u2212b \u2013 c')).toBe('a-b - c');
    expect(safeText('\u0627')).toBe('?');
    expect(receiptFileName({ receiptNumber: 'SS-2026/10 22#7' })).toBe('Receipt-SS-20261022' + '7.pdf');
  });
});
