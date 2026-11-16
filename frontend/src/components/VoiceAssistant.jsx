import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AlertCircle, ArrowRight, CheckCircle2, HelpCircle, Loader2, Mic, MicOff, Send, Volume2, VolumeX, X } from 'lucide-react';
import { api } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useVoice } from '../contexts/VoiceContext';
import { useFormat } from '../contexts/SettingsContext';
import { speak, stopSpeaking, useSpeechRecognition } from '../hooks/useSpeech';
import { canOpen, parseCommand, resolveByVoice, speakMoney } from '../utils/voiceCommands';
import { sendToPos } from '../utils/posVoice';
import { cx } from './ui';

const read = (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };
const write = (k, v) => { try { localStorage.setItem(k, v); } catch { /* storage unavailable */ } };
const WHOLE = new Set(['pcs', 'pack', 'box', 'dozen']);
const LANGS = [['en-US', 'English (US)'], ['en-PK', 'English (Pakistan)'], ['en-GB', 'English (UK)']];
const ADMIN_TOPICS = new Set(['salesToday', 'profitToday', 'transactions', 'lowStock', 'expiry', 'bestSeller']);

/**
 * Voice assistant (part 1: free, no API key). Speech comes in through the browser's speech recognition, is turned into an
 * intent by the local rule-based parser (utils/voiceCommands.js) and then runs against the app's normal screens and API.
 * Nothing irreversible happens by voice: checkout only opens the on-screen confirmation.
 */
export default function VoiceAssistant() {
  const { open, close } = useVoice();
  const { t } = useTranslation();
  const f = useFormat();
  const nav = useNavigate(); const loc = useLocation();
  const { user } = useAuth(); const role = user.role;
  const { setTheme, toggle: toggleTheme } = useTheme();

  const [lang, setLang] = useState(() => read('ss_voice_lang', 'en-US'));
  const [speakOn, setSpeakOn] = useState(() => read('ss_voice_speak', '1') === '1');
  const [keep, setKeep] = useState(() => read('ss_voice_keep', '0') === '1');
  const [busy, setBusy] = useState(false);
  const [heard, setHeard] = useState(''); const [interim, setInterim] = useState('');
  const [typed, setTyped] = useState('');
  const [reply, setReply] = useState(null);
  const [help, setHelp] = useState(false);
  const [error, setError] = useState('');
  const live = useRef({}); live.current = { speakOn, keep, lang, open, path: loc.pathname };
  const run = useRef(() => {});

  const ttsLang = lang.startsWith('en-GB') ? 'en-GB' : 'en-US';
  const sr = useSpeechRecognition({
    lang,
    onInterim: (txt) => setInterim(txt),
    onFinal: (txt, alts) => { setInterim(''); run.current(txt, alts); },
    onError: (code) => {
      setInterim('');
      if (code === 'aborted') return;
      setError({ 'not-allowed': 'voice.micDenied', 'service-not-allowed': 'voice.micDenied', 'no-speech': 'voice.noSpeech', 'audio-capture': 'voice.noMic', network: 'voice.network' }[code] || 'voice.error');
    },
  });

  const afterReply = useCallback(async (say) => {
    await speak(say, { lang: ttsLang, enabled: live.current.speakOn });
    if (live.current.keep && live.current.open && sr.supported) setTimeout(() => { if (live.current.open) sr.start(); }, 350);
  }, [ttsLang, sr]);

  const show = useCallback((r) => {
    setReply(r);
    afterReply(r.say ?? r.text).then(() => { if (r.autoClose) setTimeout(close, 300); });
  }, [afterReply, close]);

  /* ---------- helpers that talk to the API ---------- */
  const searchProducts = (q) => api.get('/products', { q, status: 'active', limit: 8 }).then((r) => r.data);
  const allProducts = () => api.get('/products', { status: 'active', limit: 100 }).then((r) => r.data);
  const searchCustomers = (q) => api.get('/customers', { q, status: 'active', limit: 8 }).then((r) => r.data);
  const allCustomers = () => api.get('/customers', { status: 'active', limit: 100 }).then((r) => r.data);
  const toPos = (cmd) => { if (!live.current.path.startsWith('/pos')) nav('/pos'); return sendToPos(cmd); };

  const addProduct = (product, qty) => {
    const q = WHOLE.has(product.unit) ? Math.max(1, Math.round(qty)) : qty;
    const res = toPos({ type: 'add', product, qty: q });
    const text = res?.message || t('voice.adding', { qty: f.num(q), name: product.name });
    show({ text, tone: res?.tone || 'ok' });
  };
  const pickCustomer = (customer) => { const res = toPos({ type: 'customer', customer }); show({ text: res?.message || t('voice.customerSet', { name: customer.name }), tone: 'ok' }); };

  const resolveAndAsk = async (search, fetchAll, name, onPick, labelOf, subOf, notFoundKey, guess) => {
    const r = await resolveByVoice(search, name, undefined, fetchAll);
    if (r.kind === 'none') return show({ text: t(notFoundKey, { name }), tone: 'warn' });
    if (r.kind === 'single' && !guess) return onPick(r.item);
    const items = r.kind === 'single' ? [r.item] : r.items;
    return show({ text: t(guess ? 'voice.didYouMean' : 'voice.which'), choices: items.map((it) => ({ key: it._id, label: labelOf(it), sub: subOf(it), pick: () => onPick(it) })), tone: 'info' });
  };

  const runQuery = async (topic) => {
    if (ADMIN_TOPICS.has(topic) && role !== 'admin') return show({ text: t('voice.adminOnly'), tone: 'warn' });
    const to = (path, key) => ({ to: path, label: t(`nav.${key}`) });
    const dash = () => api.get('/reports/dashboard').then((r) => r.data);
    switch (topic) {
      case 'salesToday': {
        const d = await dash();
        if (!d.today.transactions) return show({ text: t('voice.q.noSales'), action: to('/dashboard', 'dashboard') });
        return show({ text: t('voice.q.sales', { total: f.money(d.today.total), count: d.today.transactions }), say: t('voice.q.sales', { total: speakMoney(d.today.total), count: d.today.transactions }), action: to('/dashboard', 'dashboard') });
      }
      case 'profitToday': { const d = await dash(); return show({ text: t('voice.q.profit', { value: f.money(d.today.grossProfit) }), say: t('voice.q.profit', { value: speakMoney(d.today.grossProfit) }), action: to('/reports', 'reports') }); }
      case 'transactions': { const d = await dash(); return show({ text: t('voice.q.transactions', { count: d.today.transactions }), action: to('/sales', 'sales') }); }
      case 'bestSeller': {
        const d = await dash(); const b = d.bestSellers[0];
        return show({ text: b ? t('voice.q.best', { name: b.name, units: f.num(b.units) }) : t('voice.q.bestNone'), action: to('/reports', 'reports') });
      }
      case 'lowStock': {
        const [low, out] = await Promise.all([api.get('/inventory/stock', { status: 'low', limit: 6 }), api.get('/inventory/stock', { status: 'out', limit: 6 })]);
        const rows = [...out.data, ...low.data];
        if (!rows.length) return show({ text: t('voice.q.lowNone'), action: to('/inventory', 'inventory') });
        const names = rows.slice(0, 4).map((r) => r.name).join(', ');
        return show({ text: t('voice.q.lowStock', { list: names }), lines: rows.slice(0, 6).map((r) => `${r.name}: ${r.stock.sellable > 0 ? t('voice.left', { count: f.num(r.stock.sellable) }) : t('status.outOfStock')}`), action: to('/inventory?status=low', 'inventory') });
      }
      case 'expiry': {
        const a = (await api.get('/expiry/alerts')).data;
        if (!a.expired.length && !a.near.length) return show({ text: t('voice.q.expiryNone'), action: to('/expiry', 'expiry') });
        return show({ text: t('voice.q.expiry', { expired: a.expired.length, near: a.near.length }), lines: [...a.expired, ...a.near].slice(0, 5).map((b) => `${b.product?.name || ''} (${b.lotNumber})`), action: to('/expiry', 'expiry') });
      }
      case 'topDebtor': {
        const r = await api.get('/customers', { owing: true, limit: 1 });
        const c = r.data[0];
        if (!c) return show({ text: t('voice.q.noDebtors'), action: to('/customers', 'customers') });
        return show({ text: t('voice.q.topDebtor', { name: c.name, amount: f.money(c.balance) }), say: t('voice.q.topDebtor', { name: c.name, amount: speakMoney(c.balance) }), action: { to: `/customers/${c._id}`, label: c.name } });
      }
      case 'outstanding': { const s = (await api.get('/customers', { limit: 1 })).meta.summary; return show({ text: t('voice.q.outstanding', { amount: f.money(s.outstanding) }), say: t('voice.q.outstanding', { amount: speakMoney(s.outstanding) }), action: to('/customers', 'customers') }); }
      case 'owingCount': { const s = (await api.get('/customers', { limit: 1 })).meta.summary; return show({ text: t('voice.q.owingCount', { count: s.customersOwing }), action: to('/customers', 'customers') }); }
      default: return show({ text: t('voice.unknown', { text: topic }), tone: 'warn' });
    }
  };

  const execute = async (intent) => {
    switch (intent.type) {
      case 'help': setHelp(true); return show({ text: t('voice.helpSaid') });
      case 'cancel': close(); return null;
      case 'theme': if (intent.mode === 'toggle') toggleTheme(); else setTheme(intent.mode); return show({ text: t(`voice.theme.${intent.mode}`), autoClose: true });
      case 'navigate': {
        const page = t(`nav.${intent.key}`);
        if (!canOpen(intent, role)) return show({ text: t('voice.pageDenied', { page }), tone: 'warn' });
        nav(intent.to); return show({ text: t('voice.opening', { page }), autoClose: true });
      }
      case 'query': return runQuery(intent.topic);
      case 'pos.add': return resolveAndAsk(searchProducts, allProducts, intent.name, (p) => addProduct(p, intent.qty), (p) => p.name, (p) => `${f.money(p.sellingPrice)} · ${p.stock.sellable > 0 ? t('pos.inStock', { count: f.num(p.stock.sellable) }) : t('status.outOfStock')}`, 'voice.notFound', intent.guess);
      case 'pos.customer': return resolveAndAsk(searchCustomers, allCustomers, intent.name, pickCustomer, (c) => c.name, (c) => c.phone || '', 'voice.customerNotFound', false);
      case 'pos.remove': { const res = toPos({ type: 'remove', name: intent.name }); return show({ text: res?.message || t('voice.removing', { name: intent.name }), tone: res?.tone || 'ok' }); }
      case 'pos.clear': { const res = toPos({ type: 'clear' }); return show({ text: res?.message || t('voice.cartCleared'), tone: res?.tone || 'ok' }); }
      case 'pos.cash': { const res = toPos({ type: 'cash', amount: intent.amount }); return show({ text: res?.message || t('voice.cashSet', { amount: f.money(intent.amount) }), say: res?.say, tone: res?.tone || 'ok' }); }
      case 'pos.credit': { const res = toPos({ type: 'credit' }); return show({ text: res?.message || t('voice.creditSet'), tone: res?.tone || 'ok' }); }
      case 'pos.checkout': { const res = toPos({ type: 'checkout' }); return show({ text: res?.message || t('voice.checkoutReady'), tone: res?.tone || 'ok' }); }
      default: return show({ text: t('voice.unknown', { text: intent.raw }), tone: 'warn', showHelp: true });
    }
  };

  run.current = async (text, alts = []) => {
    if (!text) return;
    setHeard(text); setError(''); setReply(null); setBusy(true);
    try {
      // try the alternative guesses from the speech engine until one is a real command
      const options = [text, ...alts.filter((a) => a !== text)];
      let intent = null;
      for (const o of options) { const i = parseCommand(o, { role }); if (i.type !== 'unknown' && !i.guess) { intent = i; break; } if (!intent) intent = i; }
      await execute(intent);
    } catch (e) {
      show({ text: e?.message ? t('voice.failed', { reason: e.message }) : t('voice.error'), tone: 'error' });
    } finally { setBusy(false); }
  };

  /* ---------- lifecycle ---------- */
  useEffect(() => {
    if (open) { setReply(null); setError(''); setHeard(''); setInterim(''); setTyped(''); setHelp(false); if (sr.supported) setTimeout(() => sr.start(), 180); }
    else { sr.abort(); stopSpeaking(); setBusy(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  useEffect(() => {
    if (!open) return undefined;
    const k = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', k); return () => document.removeEventListener('keydown', k);
  }, [open, close]);

  const micClick = () => { if (sr.listening) { sr.stop(); return; } stopSpeaking(); setError(''); sr.start(); };
  const submitTyped = (e) => { e.preventDefault(); const v = typed.trim(); if (!v) return; setTyped(''); stopSpeaking(); run.current(v, []); };
  const toggleSpeak = () => { const n = !speakOn; setSpeakOn(n); write('ss_voice_speak', n ? '1' : '0'); if (!n) stopSpeaking(); };
  const toggleKeep = () => { const n = !keep; setKeep(n); write('ss_voice_keep', n ? '1' : '0'); };
  const changeLang = (v) => { setLang(v); write('ss_voice_lang', v); };

  if (!open) return null;
  const status = busy ? 'thinking' : sr.listening ? 'listening' : 'idle';
  const toneIcon = { ok: CheckCircle2, info: HelpCircle, warn: AlertCircle, error: AlertCircle };
  const ToneIcon = reply ? toneIcon[reply.tone || 'ok'] : CheckCircle2;
  const toneClass = { ok: 'text-ok', info: 'text-info', warn: 'text-warn', error: 'text-danger' };

  return (
    <div role="dialog" aria-label={t('voice.title')} className="no-print modal-in fixed inset-x-3 bottom-[92px] z-[65] max-h-[78vh] overflow-hidden rounded-3xl border border-line bg-surface shadow-pop sm:inset-x-auto sm:bottom-6 sm:end-6 sm:w-[410px] lg:bottom-6">
      <div className="hero flex items-center justify-between gap-3 px-5 py-3.5">
        <div className="flex items-center gap-2.5"><span className="icon-brand icon-tile h-8 w-8"><Mic className="h-4 w-4" aria-hidden="true" /></span><h2 className="text-sm font-extrabold">{t('voice.title')}</h2></div>
        <div className="flex items-center gap-1">
          <button onClick={toggleSpeak} className="rounded-xl p-2 text-white/80 transition hover:bg-white/15" aria-label={speakOn ? t('voice.speakOff') : t('voice.speakOn')} aria-pressed={speakOn} title={speakOn ? t('voice.speakOn') : t('voice.speakOff')}>{speakOn ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}</button>
          <button onClick={close} className="rounded-xl p-2 text-white/80 transition hover:bg-white/15" aria-label={t('actions.close')}><X className="h-4 w-4" /></button>
        </div>
      </div>

      <div className="max-h-[calc(78vh-60px)] space-y-4 overflow-y-auto p-5 no-scrollbar">
        <div className="flex flex-col items-center gap-3">
          <div className="relative flex h-[92px] w-[92px] items-center justify-center">
            {status === 'listening' && <><span className="mic-ring" aria-hidden="true" /><span className="mic-ring r2" aria-hidden="true" /></>}
            <button onClick={micClick} disabled={!sr.supported} aria-pressed={sr.listening} aria-label={sr.listening ? t('voice.stop') : t('voice.mic')}
              className={cx('relative z-10 flex h-[68px] w-[68px] items-center justify-center rounded-full transition-transform active:scale-95 disabled:opacity-50', status === 'listening' ? 'bg-danger text-white shadow-[0_10px_30px_-8px_rgb(220_38_38/.8)]' : 'icon-brand')}>
              {status === 'thinking' ? <Loader2 className="h-7 w-7 animate-spin" /> : sr.supported ? <Mic className="h-7 w-7" /> : <MicOff className="h-7 w-7" />}
            </button>
          </div>
          {status === 'listening' && <div className="flex h-5 items-end gap-1" aria-hidden="true">{[0, 1, 2, 3, 4].map((i) => <span key={i} className="eq-bar" style={{ animationDelay: `${i * 110}ms` }} />)}</div>}
          <p className="text-center text-sm font-semibold" aria-live="polite">{status === 'listening' ? t('voice.listening') : status === 'thinking' ? t('voice.thinking') : sr.supported ? t('voice.tapToSpeak') : t('voice.unsupported')}</p>
          {interim && <p className="rounded-xl bg-raised px-3 py-2 text-center text-sm italic text-muted">“{interim}”</p>}
        </div>

        {error && <p role="alert" className="flex items-start gap-2 rounded-xl bg-danger/10 p-3 text-sm font-medium text-danger"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />{t(error)}</p>}

        {(heard || reply) && (
          <div className="space-y-2 rounded-2xl border border-line bg-raised/50 p-4">
            {heard && <p className="text-xs text-muted">{t('voice.heard')}: <span className="font-bold text-ink">“{heard}”</span></p>}
            {reply && (
              <>
                <p className={cx('flex items-start gap-2 text-[15px] font-bold leading-snug', toneClass[reply.tone || 'ok'])}><ToneIcon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /><span className="text-ink">{reply.text}</span></p>
                {reply.lines && <ul className="space-y-1 ps-6 text-sm text-muted">{reply.lines.map((l) => <li key={l} className="list-disc">{l}</li>)}</ul>}
                {reply.choices && (
                  <ul className="space-y-1.5 pt-1">
                    {reply.choices.map((c) => (
                      <li key={c.key}><button type="button" onClick={c.pick} className="flex w-full items-center justify-between gap-3 rounded-xl border border-line bg-surface px-3 py-2.5 text-start transition hover:border-accent/50 hover:bg-brand/20">
                        <span className="min-w-0"><span className="block truncate text-sm font-bold">{c.label}</span>{c.sub && <span className="block truncate text-xs text-muted">{c.sub}</span>}</span><ArrowRight className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
                      </button></li>
                    ))}
                  </ul>
                )}
                {reply.action && <button type="button" onClick={() => { nav(reply.action.to); close(); }} className="mt-1 inline-flex items-center gap-1.5 text-xs font-bold text-accent hover:underline">{reply.action.label}<ArrowRight className="h-3.5 w-3.5" aria-hidden="true" /></button>}
              </>
            )}
          </div>
        )}

        <form onSubmit={submitTyped} className="flex gap-2">
          <input value={typed} onChange={(e) => setTyped(e.target.value)} className="input !rounded-xl" placeholder={t('voice.typePlaceholder')} aria-label={t('voice.typePlaceholder')} autoComplete="off" spellCheck={false} />
          <button type="submit" className="btn btn-primary !px-3.5" aria-label={t('voice.send')}><Send className="h-4 w-4" /></button>
        </form>

        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <label className="flex cursor-pointer items-center gap-2 font-semibold"><input type="checkbox" className="h-4 w-4 rounded accent-[#D6452B]" checked={keep} onChange={toggleKeep} />{t('voice.keepListening')}</label>
          <select value={lang} onChange={(e) => changeLang(e.target.value)} className="input !w-auto !rounded-lg !py-1 !text-xs" aria-label={t('voice.language')}>{LANGS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        </div>

        <button type="button" onClick={() => setHelp((h) => !h)} className="flex items-center gap-1.5 text-xs font-bold text-accent hover:underline" aria-expanded={help}><HelpCircle className="h-3.5 w-3.5" aria-hidden="true" />{t('voice.help')}</button>
        {help && (
          <dl className="space-y-2 rounded-2xl bg-raised/60 p-3 text-xs">
            {['nav', 'sell', 'ask'].map((g) => <div key={g}><dt className="font-extrabold uppercase tracking-wider text-muted">{t(`voice.group.${g}`)}</dt><dd className="mt-0.5 leading-relaxed">{t(`voice.examples.${g}`)}</dd></div>)}
          </dl>
        )}
        <p className="text-[11px] leading-relaxed text-muted">{t('voice.privacy')}</p>
      </div>
    </div>
  );
}
