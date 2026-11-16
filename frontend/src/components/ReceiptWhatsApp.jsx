import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Download, FileText, MessageCircle, Share2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { useFormat, useSettings } from '../contexts/SettingsContext';
import { isValidWhatsAppNumber, receiptCaption, toWhatsAppNumber, whatsAppUrl } from '../utils/whatsapp';
import { Button, Field, Modal } from './ui';

/**
 * "Send receipt as PDF on WhatsApp".
 * WhatsApp's click-to-chat link cannot attach files, so we (1) build a real PDF in the browser, then
 *  - on phones/tablets: open the native share sheet with the PDF so the cashier picks WhatsApp and the customer;
 *  - on desktop: download the PDF and open the customer's WhatsApp chat with a caption, ready for the file to be attached.
 */
export default function ReceiptWhatsApp({ store, sale, label, variant = 'secondary', size, className }) {
  const { t } = useTranslation();
  const f = useFormat();
  const { settings } = useSettings();
  const cc = settings.whatsappCountryCode || '92';
  const [busy, setBusy] = useState(false);
  const [pdf, setPdf] = useState(null); // { file, url }
  const [phone, setPhone] = useState(sale.customerPhone || '');
  const [err, setErr] = useState('');
  const urlRef = useRef(null);
  useEffect(() => () => { if (urlRef.current) URL.revokeObjectURL(urlRef.current); }, []);

  const caption = receiptCaption({ store, sale, fmt: f });
  const canShare = !!pdf && typeof navigator !== 'undefined' && typeof navigator.canShare === 'function' && navigator.canShare({ files: [pdf.file] });

  const create = async () => {
    setBusy(true);
    try {
      const { buildReceiptPdf, receiptFileName } = await import('../utils/receiptPdf');
      const bytes = await buildReceiptPdf({ store, sale, fmt: f });
      const file = new File([bytes], receiptFileName(sale), { type: 'application/pdf' });
      const url = URL.createObjectURL(file);
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      urlRef.current = url; setPhone(sale.customerPhone || ''); setErr(''); setPdf({ file, url });
    } catch { toast.error(t('whatsapp.pdfError')); } finally { setBusy(false); }
  };
  const close = () => { setPdf(null); };

  const download = () => { const a = document.createElement('a'); a.href = pdf.url; a.download = pdf.file.name; document.body.appendChild(a); a.click(); a.remove(); };
  const share = async () => {
    try { await navigator.share({ files: [pdf.file], title: pdf.file.name, text: caption }); }
    catch (e) { if (e?.name !== 'AbortError') toast.error(t('whatsapp.pdfError')); }
  };
  const openChat = () => {
    const n = toWhatsAppNumber(phone, cc);
    if (phone && !isValidWhatsAppNumber(n)) { setErr(t('whatsapp.invalid')); return; }
    setErr(''); download();
    window.open(whatsAppUrl(n, caption), '_blank', 'noopener,noreferrer');
    toast.success(t('whatsapp.pdfSaved'));
  };

  return (
    <>
      <Button variant={variant} size={size} className={className} onClick={create} loading={busy}><MessageCircle className="h-4 w-4 text-[#1faa52]" />{label || t('whatsapp.sendPdf')}</Button>
      <Modal open={!!pdf} onClose={close} title={t('whatsapp.pdfTitle')} size="md"
        footer={<>
          <Button variant="secondary" onClick={download}><Download className="h-4 w-4" />{t('whatsapp.download')}</Button>
          {canShare && <Button variant="secondary" onClick={share}><Share2 className="h-4 w-4" />{t('whatsapp.shareFile')}</Button>}
          <Button onClick={openChat}><MessageCircle className="h-4 w-4" />{t('whatsapp.downloadAndOpen')}</Button>
        </>}>
        {pdf && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 rounded-2xl border border-line bg-raised/60 p-3">
              <span className="icon-brand icon-tile h-11 w-11 shrink-0"><FileText className="h-5 w-5" aria-hidden="true" /></span>
              <div className="min-w-0"><p className="truncate text-sm font-bold">{pdf.file.name}</p><p className="text-xs text-muted">{t('whatsapp.pdfReady', { size: Math.max(1, Math.round(pdf.file.size / 1024)) })}</p></div>
            </div>
            <iframe title={pdf.file.name} src={`${pdf.url}#toolbar=0&navpanes=0&view=FitH`} className="hidden h-72 w-full rounded-xl border border-line bg-white sm:block" />
            <Field label={t('whatsapp.number')} error={err} hint={t('whatsapp.numberHint', { code: cc })}>
              <input className="input" dir="ltr" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0300 1234567" />
            </Field>
            <ol className="list-decimal space-y-1 rounded-xl bg-raised/60 p-3 ps-8 text-xs text-muted">
              <li>{t('whatsapp.step1')}</li><li>{t('whatsapp.step2')}</li><li>{t('whatsapp.step3')}</li>
            </ol>
          </div>
        )}
      </Modal>
    </>
  );
}
