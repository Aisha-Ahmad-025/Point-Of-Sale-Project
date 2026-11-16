import { useTranslation } from 'react-i18next';
import { useFormat } from '../contexts/SettingsContext';
import { Ltr } from './ui';
import { productName } from '../utils/misc';

const Mark = () => (
  <svg width="26" height="26" viewBox="0 0 64 64" aria-hidden="true">
    <rect width="64" height="64" rx="16" fill="#F2A93B" />
    <g fill="#FFFFFF">
      <rect x="12" y="20" width="9" height="12" rx="2" /><rect x="24" y="15" width="9" height="17" rx="2" /><rect x="36" y="22" width="9" height="10" rx="2" />
      <rect x="9" y="33" width="46" height="4" rx="2" /><rect x="14" y="41" width="12" height="9" rx="2" /><rect x="29" y="43" width="8" height="7" rx="2" /><rect x="40" y="39" width="10" height="11" rx="2" />
      <rect x="9" y="51" width="46" height="4" rx="2" />
    </g>
  </svg>
);

/**
 * Professional sales receipt. On screen it looks like torn paper; when printed it becomes a clean 80 mm roll receipt
 * (see the .rcpt rules in index.css). Handles cash, part-credit and full-credit (khata) sales and voided sales.
 */
export default function Receipt({ store, sale }) {
  const { t } = useTranslation();
  const f = useFormat();
  if (!sale) return null;
  const credit = sale.payment.creditAmount || 0;
  const voided = sale.status === 'voided';
  const stamp = voided ? ['void', t('status.voided')] : credit > 0 ? ['credit', t(sale.payment.amountReceived > 0 ? 'status.partial' : 'status.unpaid')] : ['paid', t('status.paid')];
  const units = sale.items.reduce((a, i) => a + i.quantity, 0);

  return (
    <div className="print-area">
      <div className="rcpt-wrap">
        <div className="rcpt" data-testid="receipt">
          {voided && <div className="void-mark" aria-hidden="true"><span>{t('status.voided').toUpperCase()}</span></div>}

          <div className="head">
            <div className="brand"><Mark /></div>
            <div className="store">{store?.storeName}</div>
            {store?.address && <div className="sub">{store.address}</div>}
            {store?.phone && <div className="sub">{t('settings.phone')}: <Ltr>{store.phone}</Ltr></div>}
          </div>

          <hr className="rule solid" />
          <div className="title"><b>{t('receipt.title')}</b><span className={`stamp ${stamp[0]}`}>{stamp[1]}</span></div>
          <div className="meta">
            <div><small>{t('receipt.number')}</small><span><Ltr>{sale.receiptNumber}</Ltr></span></div>
            <div><small>{t('receipt.date')}</small><span>{f.dateTime(sale.createdAt)}</span></div>
            <div><small>{t('receipt.cashier')}</small><span>{sale.cashierName}</span></div>
            <div><small>{t('receipt.customer')}</small><span>{sale.customerName || t('sales.walkIn')}</span></div>
          </div>

          <hr className="rule" />
          <div className="cols"><span>{t('receipt.item')}</span><span>{t('receipt.amount')}</span></div>
          {sale.items.map((it, i) => (
            <div className="item" key={i}>
              <div className="row"><span className="nm">{productName(it)}</span><span className="amt">{f.money(it.lineNet)}</span></div>
              <div className="calc">{f.num(it.quantity)}{it.unit && it.unit !== 'pcs' ? ` ${t(`units.${it.unit}`)}` : ''} × {f.money(it.unitPrice)}</div>
              {it.discountPercent > 0 && <div className="off">{t('pos.discount')} {f.num(it.discountPercent, 1)}% (−{f.money(it.discountAmount)})</div>}
            </div>
          ))}

          <hr className="rule" />
          <div className="tot muted"><span>{t('receipt.itemsCount', { count: f.num(units) })}</span><span /></div>
          <div className="tot"><span>{t('pos.subtotal')}</span><span>{f.money(sale.subtotal)}</span></div>
          {sale.discountTotal > 0 && <div className="tot"><span>{t('pos.discount')}</span><span>−{f.money(sale.discountTotal)}</span></div>}
          <div className="tot"><span>{t('pos.tax')}</span><span>{f.money(sale.taxTotal)}</span></div>
          <div className="grand"><span>{t('pos.total')}</span><span>{f.money(sale.total)}</span></div>

          <div className="pay">
            <div className="tot muted"><span>{t('pos.method')}</span><span>{t(`payment.${sale.payment.method}`)}</span></div>
            <div className="tot"><span>{credit > 0 ? t('receipt.paidNow') : t('pos.received')}</span><span>{f.money(sale.payment.amountReceived)}</span></div>
            {credit === 0 && <div className="tot"><span>{t('pos.change')}</span><span>{f.money(sale.payment.change)}</span></div>}
          </div>
          {credit > 0 && (
            <div className="khata">
              <div className="tot"><b>{t('receipt.onCredit')}</b><b>{f.money(credit)}</b></div>
              {sale.customerBalanceAfter !== undefined && sale.customerBalanceAfter !== null && <div className="tot"><span>{t('receipt.balance')}</span><span>{f.money(sale.customerBalanceAfter)}</span></div>}
            </div>
          )}

          <hr className="rule" />
          <div className="thanks"><b>{t('receipt.thanks')}</b>{store?.receiptFooter && <p>{store.receiptFooter}</p>}</div>
          <div className="powered">SwiftShelf POS</div>
        </div>
      </div>
    </div>
  );
}
