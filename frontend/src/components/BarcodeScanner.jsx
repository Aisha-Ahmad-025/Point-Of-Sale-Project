import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from './ui';

/** Camera barcode scanning via the browser BarcodeDetector API (Chromium/Android/Safari 17+). Falls back to manual entry. */
export default function BarcodeScanner({ open, onClose, onDetect }) {
  const { t } = useTranslation();
  const video = useRef(null);
  const [error, setError] = useState(null);
  const [manual, setManual] = useState('');
  const supported = typeof window !== 'undefined' && 'BarcodeDetector' in window;

  useEffect(() => {
    if (!open || !supported) return undefined;
    let stream; let raf; let stopped = false;
    setError(null);
    (async () => {
      try {
        const detector = new window.BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'qr_code'] });
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        if (stopped) return;
        video.current.srcObject = stream; await video.current.play();
        const tick = async () => {
          if (stopped) return;
          try { const codes = await detector.detect(video.current); if (codes[0]) { onDetect(codes[0].rawValue); return; } } catch { /* frame not ready */ }
          raf = requestAnimationFrame(tick);
        };
        tick();
      } catch (e) { setError(e.name === 'NotAllowedError' ? 'permission' : 'camera'); }
    })();
    return () => { stopped = true; cancelAnimationFrame(raf); stream?.getTracks().forEach((tr) => tr.stop()); };
  }, [open, supported, onDetect]);

  return (
    <Modal open={open} onClose={onClose} title={t('pos.scanTitle')} size="sm">
      {supported && !error ? (
        <div className="overflow-hidden rounded-xl bg-black"><video ref={video} muted playsInline className="aspect-video w-full object-cover" aria-label={t('pos.scanTitle')} /></div>
      ) : (
        <p className="mb-3 rounded-xl bg-warn/15 p-3 text-sm text-warn" role="status">{error === 'permission' ? t('pos.scanDenied') : t('pos.scanUnsupported')}</p>
      )}
      <form className="mt-4 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (manual.trim()) { onDetect(manual.trim()); setManual(''); } }}>
        <input className="input ltr-id" dir="ltr" value={manual} onChange={(e) => setManual(e.target.value)} placeholder={t('pos.manualBarcode')} inputMode="numeric" data-autofocus={!supported || undefined} />
        <button className="btn btn-primary" type="submit">{t('actions.add')}</button>
      </form>
    </Modal>
  );
}
