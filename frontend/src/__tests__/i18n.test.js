import { describe, expect, test } from 'vitest';
import i18n from '../i18n';
import common from '../i18n/locales/en/common.json';
import pages from '../i18n/locales/en/pages.json';

const flat = (o, p = '') => Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' ? flat(v, `${p}${k}.`) : [[`${p}${k}`, v]]));

describe('English text catalogue', () => {
  test('the app is English-only, left-to-right', () => {
    expect(i18n.language).toBe('en');
    expect(document.documentElement.lang).toBe('en');
    expect(document.documentElement.dir).toBe('ltr');
    expect(Object.keys(i18n.options.resources)).toEqual(['en']);
  });
  test('no empty or untranslated entries and no leftover Urdu text', () => {
    const entries = [...flat(common), ...flat(pages)];
    expect(entries.length).toBeGreaterThan(500);
    expect(entries.filter(([, v]) => !String(v).trim())).toEqual([]);
    expect(entries.filter(([, v]) => /[\u0600-\u06FF]/.test(String(v)))).toEqual([]);
  });
  test('top-level groups of the two files do not collide', () => {
    const a = Object.keys(common); const b = Object.keys(pages);
    expect(a.filter((k) => b.includes(k))).toEqual([]);
  });
  test('interpolation and khata/WhatsApp texts', () => {
    expect(i18n.t('pos.notEnough', { name: 'SKU-001', count: 3 })).toBe('Only 3 of SKU-001 available');
    expect(i18n.t('errors.CREDIT_LIMIT_EXCEEDED', { limit: 100, balance: 80, available: 20 })).toContain('available 20');
    expect(i18n.t('whatsapp.shareReceipt')).toMatch(/WhatsApp/);
    expect(i18n.t('nav.customers')).toBe('Customers (Khata)');
  });
});
