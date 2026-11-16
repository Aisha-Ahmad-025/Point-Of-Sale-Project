import { describe, expect, test } from 'vitest';
import { isValidWhatsAppNumber, paymentMessage, receiptCaption, receiptMessage, reminderMessage, toWhatsAppNumber, whatsAppUrl } from '../utils/whatsapp';

const fmt = { money: (v) => `Rs ${Number(v).toFixed(2)}`, dateTime: () => '18 Oct 2026, 03:10 pm' };
const store = { storeName: 'SwiftShelf Mini Mart', address: '12 Main Boulevard', receiptFooter: 'Thank you!' };

describe('WhatsApp numbers', () => {
  test('converts local and international formats', () => {
    expect(toWhatsAppNumber('0300 1234567')).toBe('923001234567');
    expect(toWhatsAppNumber('03001234567')).toBe('923001234567');
    expect(toWhatsAppNumber('+92 300-1234567')).toBe('923001234567');
    expect(toWhatsAppNumber('00923001234567')).toBe('923001234567');
    expect(toWhatsAppNumber('923001234567')).toBe('923001234567');
    expect(toWhatsAppNumber('(0300) 123 4567', '92')).toBe('923001234567');
    expect(toWhatsAppNumber('', '92')).toBe('');
  });
  test('uses the configured country code', () => { expect(toWhatsAppNumber('07911123456', '44')).toBe('447911123456'); });
  test('validation and link building', () => {
    expect(isValidWhatsAppNumber('923001234567')).toBe(true);
    expect(isValidWhatsAppNumber('123')).toBe(false);
    expect(whatsAppUrl('923001234567', 'Hello & thanks')).toBe('https://wa.me/923001234567?text=Hello%20%26%20thanks');
    expect(whatsAppUrl('', 'Hi')).toBe('https://wa.me/?text=Hi'); // no number: user picks the contact
  });
});

describe('message builders', () => {
  const base = { receiptNumber: 'SS-20261018-00007', createdAt: '2026-10-18', customerName: 'Ahmed Khan', items: [{ quantity: 2, name: 'Milk 1L', lineNet: 560 }], subtotal: 560, discountTotal: 0, taxTotal: 28, total: 588 };
  test('cash receipt', () => {
    const t = receiptMessage({ store, sale: { ...base, payment: { amountReceived: 600, change: 12, creditAmount: 0 } }, fmt });
    expect(t).toContain('*SwiftShelf Mini Mart*'); expect(t).toContain('SS-20261018-00007'); expect(t).toContain('2 x Milk 1L - Rs 560.00');
    expect(t).toContain('*Total: Rs 588.00*'); expect(t).toContain('Change: Rs 12.00'); expect(t).not.toContain('khata');
  });
  test('credit receipt shows paid now, credit and balance', () => {
    const t = receiptMessage({ store, sale: { ...base, customerBalanceAfter: 1288, payment: { amountReceived: 100, change: 0, creditAmount: 488 } }, fmt });
    expect(t).toContain('Paid now: Rs 100.00'); expect(t).toContain('*On credit (khata): Rs 488.00*'); expect(t).toContain('Your balance: Rs 1288.00');
  });
  test('reminder and payment messages', () => {
    expect(reminderMessage({ store, customer: { name: 'Ahmed Khan', balance: 1500 }, fmt })).toContain('*Rs 1500.00*');
    expect(paymentMessage({ store, customer: { name: 'Ahmed' }, amount: 500, balance: 0, fmt })).toContain('fully settled');
    expect(paymentMessage({ store, customer: { name: 'Ahmed' }, amount: 500, balance: 250, fmt })).toContain('Remaining balance: *Rs 250.00*');
  });

  test('PDF caption mentions the receipt, total and any credit', () => {
    const c = receiptCaption({ store, sale: { ...base, payment: { amountReceived: 100, change: 0, creditAmount: 488 } }, fmt });
    expect(c).toContain('SS-20261018-00007'); expect(c).toContain('*Rs 588.00*'); expect(c).toContain('attached as a PDF'); expect(c).toContain('Rs 488.00 was put on your account');
    expect(receiptCaption({ store, sale: { ...base, customerName: '', payment: { amountReceived: 600, change: 12, creditAmount: 0 } }, fmt })).not.toContain('on your account');
  });
});
