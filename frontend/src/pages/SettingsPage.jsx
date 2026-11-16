import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { api } from '../services/api';
import { useSettings } from '../contexts/SettingsContext';
import { Button, Card, Field, PageHeader, apiMessage } from '../components/ui';

export default function SettingsPage() {
  const { t } = useTranslation();
  const { settings, refresh } = useSettings();
  const n = (min, max) => z.preprocess((v) => (v === '' ? undefined : Number(v)), z.number({ required_error: t('validation.required'), invalid_type_error: t('validation.number') }).min(min, t('validation.min', { count: min })).max(max, t('validation.max', { count: max })));
  const schema = z.object({
    storeName: z.string().trim().min(1, t('validation.required')).max(80), address: z.string().trim().max(200), phone: z.string().trim().max(40), receiptFooter: z.string().trim().max(200),
    currency: z.string().trim().length(3, t('validation.currency')), timezone: z.string().trim().min(1, t('validation.required')),
    defaultCreditLimit: n(0, 100000000), whatsappCountryCode: z.string().trim().regex(/^\d{1,4}$/, t('validation.number')),
    taxRate: n(0, 100), cashierMaxDiscountPercent: n(0, 100), nearExpiryDays: n(0, 365), forecastWindowDays: n(7, 365), coverageDays: n(1, 180), defaultLeadTimeDays: n(0, 365), defaultSafetyStock: n(0, 1000000),
    slowMovingWindowDays: n(7, 365), slowMovingMinIdleDays: n(1, 365), slowMovingVelocity: n(0, 1000), newProductGraceDays: n(0, 365),
  });
  const { register, handleSubmit, reset, formState: { errors, isSubmitting, isDirty } } = useForm({ resolver: zodResolver(schema), defaultValues: settings });
  const [err, setErr] = useState(null);
  useEffect(() => { reset(settings); }, [settings, reset]);
  const submit = async (v) => { setErr(null); try { await api.put('/settings', v); await refresh(); toast.success(t('settings.saved')); } catch (e) { setErr(e); } };
  const E = (k) => errors[k]?.message;
  const num = (k, label, hint) => <Field label={label} error={E(k)} hint={hint}><input className="input" dir="ltr" inputMode="decimal" {...register(k)} /></Field>;

  return (
    <>
      <PageHeader title={t('settings.title')} subtitle={t('settings.subtitle')} actions={<Button loading={isSubmitting} disabled={!isDirty} onClick={handleSubmit(submit)}>{t('actions.save')}</Button>} />
      <form onSubmit={handleSubmit(submit)} noValidate className="space-y-4">
        {err && <p role="alert" className="rounded-xl bg-danger/10 p-3 text-sm text-danger">{apiMessage(t, err)}</p>}
        <Card className="grid gap-3 p-5 sm:grid-cols-2">
          <h2 className="font-bold sm:col-span-2">{t('settings.store')}</h2>
          <Field label={t('settings.storeName')} error={E('storeName')} required><input className="input" {...register('storeName')} /></Field>
          <Field label={t('settings.address')}><input className="input" {...register('address')} /></Field>
          <Field label={t('settings.phone')}><input className="input" dir="ltr" {...register('phone')} /></Field>
          <Field label={t('settings.receiptFooter')} className="sm:col-span-2"><input className="input" {...register('receiptFooter')} /></Field>
          <Field label={t('settings.currency')} error={E('currency')} hint={t('settings.currencyHint')}><input className="input uppercase" dir="ltr" maxLength={3} {...register('currency')} /></Field>
          <Field label={t('settings.timezone')} error={E('timezone')} hint={t('settings.timezoneHint')}><input className="input" dir="ltr" {...register('timezone')} /></Field>
        </Card>
        <Card className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-3">
          <h2 className="font-bold sm:col-span-2 lg:col-span-3">{t('settings.sales')}</h2>
          {num('taxRate', t('settings.taxRate'), t('settings.taxHint'))}
          {num('cashierMaxDiscountPercent', t('settings.cashierDiscount'), t('settings.cashierDiscountHint'))}
          {num('nearExpiryDays', t('settings.nearExpiryDays'), t('settings.nearExpiryHint'))}
        </Card>
        <Card className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-3">
          <h2 className="font-bold sm:col-span-2 lg:col-span-3">{t('settings.credit')}</h2>
          {num('defaultCreditLimit', t('settings.defaultCreditLimit'), t('settings.defaultCreditLimitHint'))}
          <Field label={t('settings.whatsappCode')} error={E('whatsappCountryCode')} hint={t('settings.whatsappCodeHint')}><input className="input" dir="ltr" maxLength={4} inputMode="numeric" {...register('whatsappCountryCode')} /></Field>
        </Card>
        <Card className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-3">
          <h2 className="font-bold sm:col-span-2 lg:col-span-3">{t('settings.forecasting')}</h2>
          {num('forecastWindowDays', t('settings.forecastWindow'), t('settings.forecastWindowHint'))}
          {num('coverageDays', t('settings.coverage'), t('settings.coverageHint'))}
          {num('defaultLeadTimeDays', t('settings.leadTime'), t('settings.leadTimeHint'))}
          {num('defaultSafetyStock', t('settings.safety'), t('settings.safetyHint'))}
        </Card>
        <Card className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-3">
          <h2 className="font-bold sm:col-span-2 lg:col-span-3">{t('settings.slowMoving')}</h2>
          {num('slowMovingWindowDays', t('settings.slowWindow'), t('settings.slowWindowHint'))}
          {num('slowMovingMinIdleDays', t('settings.slowIdle'), t('settings.slowIdleHint'))}
          {num('slowMovingVelocity', t('settings.slowVelocity'), t('settings.slowVelocityHint'))}
          {num('newProductGraceDays', t('settings.grace'), t('settings.graceHint'))}
        </Card>
      </form>
    </>
  );
}
