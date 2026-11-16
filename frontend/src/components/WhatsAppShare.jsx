import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Copy, MessageCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { useSettings } from '../contexts/SettingsContext';
import { isValidWhatsAppNumber, toWhatsAppNumber, whatsAppUrl } from '../utils/whatsapp';
import { Button, Field, Modal } from './ui';

function openChat(number, text) { window.open(whatsAppUrl(number, text), '_blank', 'noopener,noreferrer'); }

/**
 * "Share on WhatsApp" button. If a valid phone number is known the chat opens straight away with the message
 * pre-filled; otherwise a small dialog asks for the number (or lets the user pick a contact inside WhatsApp).
 */
export default function WhatsAppShare({ text, phone, label, variant = 'secondary', size, className }) {
  const { t } = useTranslation();
  const { settings } = useSettings();
  const cc = settings.whatsappCountryCode || '92';
  const [ask, setAsk] = useState(false);
  const [value, setValue] = useState('');
  const [err, setErr] = useState('');
  const known = toWhatsAppNumber(phone, cc);

  const click = () => {
    if (isValidWhatsAppNumber(known)) { openChat(known, text); toast.success(t('whatsapp.opened')); } else { setValue(phone || ''); setErr(''); setAsk(true); }
  };
  const send = () => {
    const n = toWhatsAppNumber(value, cc);
    if (!isValidWhatsAppNumber(n)) { setErr(t('whatsapp.invalid')); return; }
    openChat(n, text); setAsk(false); toast.success(t('whatsapp.opened'));
  };
  const copy = async () => { try { await navigator.clipboard.writeText(text); toast.success(t('whatsapp.copied')); } catch { toast.error('Copy is not available in this browser'); } };

  return (
    <>
      <Button variant={variant} size={size} className={className} onClick={click}><MessageCircle className="h-4 w-4 text-[#1faa52]" />{label || t('whatsapp.share')}</Button>
      <Modal open={ask} onClose={() => setAsk(false)} title={t('whatsapp.title')} size="md"
        footer={<><Button variant="secondary" onClick={copy}><Copy className="h-4 w-4" />{t('whatsapp.copy')}</Button><Button variant="secondary" onClick={() => { openChat('', text); setAsk(false); }}>{t('whatsapp.choose')}</Button><Button onClick={send}><MessageCircle className="h-4 w-4" />{t('whatsapp.open')}</Button></>}>
        <div className="space-y-4">
          <Field label={t('whatsapp.number')} error={err} hint={t('whatsapp.numberHint', { code: cc })}>
            <input className="input" dir="ltr" inputMode="tel" value={value} onChange={(e) => setValue(e.target.value)} placeholder="0300 1234567" data-autofocus onKeyDown={(e) => { if (e.key === 'Enter') send(); }} />
          </Field>
          <div><p className="mb-1 text-xs font-bold uppercase tracking-wider text-muted">{t('whatsapp.preview')}</p><pre className="max-h-56 overflow-auto whitespace-pre-wrap rounded-xl bg-raised p-3 text-xs leading-relaxed">{text}</pre></div>
        </div>
      </Modal>
    </>
  );
}
