import { useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowRight, Eye, EyeOff, Lock, Mail, Moon, Sun, TriangleAlert } from 'lucide-react';
import toast from 'react-hot-toast';
import Logo from '../components/Logo';
import { Button, Field, apiMessage } from '../components/ui';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { homeFor } from '../layouts/nav';

const EMAIL_KEY = 'ss_last_email';
const readEmail = () => { try { return localStorage.getItem(EMAIL_KEY) || ''; } catch { return ''; } };

export default function Login() {
  const { t } = useTranslation();
  const { user, login } = useAuth();
  const { theme, toggle } = useTheme();
  const loc = useLocation();
  const [err, setErr] = useState(null);
  const [show, setShow] = useState(false);
  const [caps, setCaps] = useState(false);
  const [remember, setRemember] = useState(() => !!readEmail());
  const [hint, setHint] = useState(false);
  const schema = z.object({ email: z.string().min(1, t('validation.required')).email(t('validation.email')), password: z.string().min(1, t('validation.required')) });
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({ resolver: zodResolver(schema), defaultValues: { email: readEmail(), password: '' } });

  if (user) return <Navigate to={loc.state?.from || homeFor(user.role)} replace />;
  const onSubmit = async (v) => {
    setErr(null);
    try {
      await login(v.email, v.password);
      try { if (remember) localStorage.setItem(EMAIL_KEY, v.email); else localStorage.removeItem(EMAIL_KEY); } catch { /* storage unavailable */ }
      toast.success(t('auth.welcome'));
    } catch (e) { setErr(e); }
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-[minmax(0,1.08fr)_minmax(0,1fr)]">
      {/* Brand side: one idea, lots of air */}
      <section className="login-art fade-in hidden min-h-screen flex-col justify-between p-14 lg:flex">
        <Logo size={42} withText className="[&_span]:text-white [&_span_span]:!text-[#F2A93B]" />
        <div className="max-w-xl">
          <p className="mb-5 text-[11px] font-bold uppercase tracking-[.28em] text-[#F0A7C0]">{t('auth.eyebrow')}</p>
          <h1 className="text-[56px] font-extrabold leading-[1.04] tracking-tight text-white">Small store.<br /><span className="text-gradient">Smarter business.</span></h1>
          <p className="mt-6 max-w-md text-[17px] leading-relaxed text-[#F8EAF0]/80">{t('auth.heroText')}</p>
        </div>
        <ul className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs font-semibold uppercase tracking-[.18em] text-[#F8EAF0]/60">
          {['Checkout', 'Inventory', 'Khata', 'Insights'].map((x, i) => <li key={x} className="flex items-center gap-6">{i > 0 && <span className="h-1 w-1 rounded-full bg-[#F2A93B]/70" aria-hidden="true" />}{x}</li>)}
        </ul>
      </section>

      {/* Form side */}
      <section className="relative flex min-h-screen flex-col items-center justify-center px-6 py-12">
        <button className="btn btn-secondary absolute end-5 top-5 !rounded-full !p-2.5" onClick={toggle} aria-label={t('topbar.theme')}>{theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}</button>
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="rise-in w-full max-w-[400px]" style={{ animationDelay: '.12s' }}>
          <Logo size={40} className="mb-10 lg:hidden" />
          <p className="text-[11px] font-bold uppercase tracking-[.22em] text-accent">{t('auth.eyebrowForm')}</p>
          <h2 className="mt-2 text-[34px] font-extrabold leading-tight tracking-tight">{t('auth.welcomeBack')}</h2>
          <p className="mt-2 text-sm text-muted">{t('auth.signInHint')}</p>

          <div className="mt-9 space-y-5">
            {err && <p role="alert" className="flex items-start gap-2 rounded-xl bg-danger/10 p-3 text-sm font-medium text-danger"><TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />{apiMessage(t, err)}</p>}
            <Field label={t('auth.email')} error={errors.email?.message}>
              <div className="relative">
                <Mail className="pointer-events-none absolute start-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden="true" />
                <input className="input !rounded-2xl !py-3 ps-10" dir="ltr" type="email" autoComplete="username" placeholder="you@store.com" {...register('email')} />
              </div>
            </Field>
            <Field label={t('auth.password')} error={errors.password?.message}>
              <div className="relative">
                <Lock className="pointer-events-none absolute start-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden="true" />
                <input className="input !rounded-2xl !py-3 ps-10 pe-11" dir="ltr" type={show ? 'text' : 'password'} autoComplete="current-password" placeholder="••••••••" onKeyUp={(e) => setCaps(e.getModifierState?.('CapsLock') || false)} {...register('password')} />
                <button type="button" onClick={() => setShow((s) => !s)} className="absolute end-2 top-1/2 -translate-y-1/2 rounded-full p-2 text-muted transition hover:bg-raised hover:text-ink" aria-label={show ? t('auth.hidePassword') : t('auth.showPassword')} aria-pressed={show}>
                  {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {caps && <p role="status" className="mt-1.5 text-xs font-semibold text-warn">{t('auth.capsLock')}</p>}
            </Field>

            <div className="flex items-center justify-between text-sm">
              <label className="flex cursor-pointer items-center gap-2 font-medium"><input type="checkbox" className="h-4 w-4 rounded accent-[#D6452B]" checked={remember} onChange={(e) => setRemember(e.target.checked)} />{t('auth.remember')}</label>
              <button type="button" className="font-semibold text-accent hover:underline" onClick={() => setHint((h) => !h)} aria-expanded={hint}>{t('auth.forgot')}</button>
            </div>
            {hint && <p role="note" className="rounded-xl bg-raised p-3 text-xs leading-relaxed text-muted">{t('auth.forgotHelp')}</p>}

            <Button type="submit" variant="brand" className="w-full !rounded-2xl !py-3.5 text-[15px]" loading={isSubmitting}>{t('auth.signIn')}<ArrowRight className="h-4 w-4" /></Button>
          </div>
        </form>
        <p className="fade-in absolute bottom-6 text-xs text-muted" style={{ animationDelay: '.5s' }}>SwiftShelf POS · {t('auth.footer')}</p>
      </section>
    </div>
  );
}
