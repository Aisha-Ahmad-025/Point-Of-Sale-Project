// WhatsApp click-to-chat helpers (no API key needed): https://wa.me/<number>?text=<message>

/** Turn a locally written phone number into WhatsApp's international format (digits only, no +). */
export function toWhatsAppNumber(phone, countryCode = '92') {
  if (!phone) return '';
  const raw = String(phone).trim();
  const digits = raw.replace(/\D/g, '');
  if (!digits) return '';
  if (raw.startsWith('+')) return digits; // already international
  if (digits.startsWith('00')) return digits.slice(2);
  if (digits.startsWith('0')) return `${countryCode}${digits.slice(1)}`; // 0300 1234567 -> 92 300 1234567
  if (digits.startsWith(countryCode) && digits.length >= countryCode.length + 8) return digits;
  return `${countryCode}${digits}`;
}
export const isValidWhatsAppNumber = (n) => /^\d{8,15}$/.test(n || '');

/** wa.me link. Without a number WhatsApp lets the user pick the contact. */
export const whatsAppUrl = (number, text) => `https://wa.me/${isValidWhatsAppNumber(number) ? number : ''}?text=${encodeURIComponent(text)}`;

const line = (a, b) => `${a}: ${b}`;

/** Plain-text receipt (WhatsApp understands *bold*). `fmt` = { money, dateTime }. */
export function receiptMessage({ store, sale, fmt }) {
  const L = [];
  L.push(`*${store?.storeName || 'Receipt'}*`);
  if (store?.address) L.push(store.address);
  L.push('');
  L.push(line('Receipt', sale.receiptNumber));
  L.push(line('Date', fmt.dateTime(sale.createdAt)));
  if (sale.customerName) L.push(line('Customer', sale.customerName));
  L.push('------------------------');
  sale.items.forEach((i) => L.push(`${i.quantity} x ${i.name} - ${fmt.money(i.lineNet)}`));
  L.push('------------------------');
  L.push(line('Subtotal', fmt.money(sale.subtotal)));
  if (sale.discountTotal > 0) L.push(line('Discount', `-${fmt.money(sale.discountTotal)}`));
  if (sale.taxTotal > 0) L.push(line('Tax', fmt.money(sale.taxTotal)));
  L.push(`*${line('Total', fmt.money(sale.total))}*`);
  const credit = sale.payment?.creditAmount || 0;
  if (credit > 0) {
    L.push(line('Paid now', fmt.money(sale.payment.amountReceived)));
    L.push(`*${line('On credit (khata)', fmt.money(credit))}*`);
    if (sale.customerBalanceAfter !== undefined && sale.customerBalanceAfter !== null) L.push(line('Your balance', fmt.money(sale.customerBalanceAfter)));
  } else {
    L.push(line('Paid (cash)', fmt.money(sale.payment.amountReceived)));
    if (sale.payment.change > 0) L.push(line('Change', fmt.money(sale.payment.change)));
  }
  if (store?.receiptFooter) { L.push(''); L.push(store.receiptFooter); }
  return L.join('\n');
}

export function reminderMessage({ store, customer, fmt }) {
  return `Assalam o Alaikum ${customer.name},\n\nThis is a friendly reminder from *${store?.storeName || 'our store'}*. Your outstanding balance is *${fmt.money(customer.balance)}*.\n\nPlease settle it at your earliest convenience. Thank you for your trust!`;
}

export function paymentMessage({ store, customer, amount, balance, fmt }) {
  return `*${store?.storeName || 'Payment receipt'}*\n\nThank you ${customer.name}! We received your payment of *${fmt.money(amount)}*.\n${balance > 0 ? `Remaining balance: *${fmt.money(balance)}*` : '*Your account is fully settled.*'}`;
}

export function statementMessage({ store, statement, fmt }) {
  const s = statement;
  return `*${store?.storeName || 'Statement'}* - Account statement\nCustomer: ${s.customer.name}\nPeriod: ${s.range.from} to ${s.range.to}\n\nOpening balance: ${fmt.money(s.openingBalance)}\nCharges: ${fmt.money(s.totals.charges)}\nPayments: ${fmt.money(s.totals.payments)}\n*Closing balance: ${fmt.money(s.closingBalance)}*`;
}

/** Short message that goes with the receipt PDF (the PDF itself is attached by the sender in WhatsApp). */
export function receiptCaption({ store, sale, fmt }) {
  const who = sale.customerName ? `Hello ${sale.customerName},\n\n` : 'Hello,\n\n';
  const credit = sale.payment?.creditAmount || 0;
  const tail = credit > 0 ? ` ${fmt.money(credit)} was put on your account.` : '';
  return `${who}Thank you for shopping at *${store?.storeName || 'our store'}*. Your receipt *${sale.receiptNumber}* for *${fmt.money(sale.total)}* is attached as a PDF.${tail}`;
}
