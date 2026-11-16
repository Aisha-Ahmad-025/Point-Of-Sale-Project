import { describe, expect, test } from 'vitest';
import { canOpen, decide, normalize, parseCommand, rank, resolveByVoice, scoreMatch, speakMoney, takeNumber, wordsToNumber } from '../utils/voiceCommands';

const P = (text, role) => parseCommand(text, { role });

describe('numbers from speech', () => {
  test.each([['two', 2], ['twenty five', 25], ['one hundred and fifty', 150], ['two thousand', 2000], ['two thousand five hundred', 2500], ['a hundred', 100], ['half', 0.5], ['one and a half', 1.5], ['one point five', 1.5], ['three lakh', 300000], ['2', 2], ['2.5', 2.5], ['2 thousand', 2000], ['fifteen hundred', 1500], ['to', 2], ['for', 4]])('%s -> %s', (text, value) => {
    expect(wordsToNumber(text)).toBe(value);
  });
  test('stops at the first non-number word and reports how many tokens it used', () => {
    expect(takeNumber(['two', 'kg', 'rice'], 0)).toEqual({ value: 2, used: 1 });
    expect(takeNumber(['milk'], 0)).toBeNull();
  });
});

describe('navigation', () => {
  test.each([['open products', '/products'], ['go to the dashboard', '/dashboard'], ['show me customers', '/customers'], ['khata', '/customers'], ['take me to reports', '/reports'], ['open sales history', '/sales'], ['go to inventory page', '/inventory'], ['please open settings', '/settings'], ['stock movements', '/movements']])('%s', (text, to) => {
    expect(P(text)).toMatchObject({ type: 'navigate', to });
  });
  test('create shortcuts deep-link to the forms', () => {
    expect(P('add customer')).toMatchObject({ to: '/customers?new=1' }); expect(P('add new product')).toMatchObject({ to: '/products?new=1' }); expect(P('receive stock')).toMatchObject({ to: '/inventory?receive=1' });
  });
  test('cashiers are not allowed into admin pages', () => {
    expect(canOpen(P('open reports'), 'cashier')).toBe(false); expect(canOpen(P('open pos'), 'cashier')).toBe(true); expect(canOpen(P('open reports'), 'admin')).toBe(true);
  });
});

describe('POS commands', () => {
  test('add with quantities, units and filler', () => {
    expect(P('add two milk')).toMatchObject({ type: 'pos.add', name: 'milk', qty: 2 });
    expect(P('add milk')).toMatchObject({ name: 'milk', qty: 1 });
    expect(P('add 3 bread to the cart')).toMatchObject({ name: 'bread', qty: 3 });
    expect(P('add two kg of basmati rice')).toMatchObject({ name: 'basmati rice', qty: 2 });
    expect(P('add half kg sugar')).toMatchObject({ name: 'sugar', qty: 0.5 });
    expect(P('please give me five cola')).toMatchObject({ name: 'cola', qty: 5 });
    expect(P('sell me to chips')).toMatchObject({ name: 'chips', qty: 2 });
    expect(P('another milk')).toMatchObject({ type: 'pos.add', name: 'milk', qty: 1 });
  });
  test('remove, clear, checkout, credit', () => {
    expect(P('remove milk')).toMatchObject({ type: 'pos.remove', name: 'milk' });
    expect(P('delete the bread from the cart')).toMatchObject({ type: 'pos.remove', name: 'bread' });
    expect(P('clear the cart')).toMatchObject({ type: 'pos.clear' }); expect(P('empty my basket')).toMatchObject({ type: 'pos.clear' });
    expect(P('checkout')).toMatchObject({ type: 'pos.checkout' }); expect(P('complete the sale')).toMatchObject({ type: 'pos.checkout' });
    expect(P('put it on credit')).toMatchObject({ type: 'pos.credit' }); expect(P('pay later')).toMatchObject({ type: 'pos.credit' });
  });
  test('cash amounts and customers', () => {
    expect(P('cash two thousand')).toMatchObject({ type: 'pos.cash', amount: 2000 });
    expect(P('customer paid 1500')).toMatchObject({ type: 'pos.cash', amount: 1500 });
    expect(P('received five hundred rupees')).toMatchObject({ type: 'pos.cash', amount: 500 });
    expect(P('customer Ahmed Khan')).toMatchObject({ type: 'pos.customer', name: 'ahmed khan' });
    expect(P('sell to Sara')).toMatchObject({ type: 'pos.customer', name: 'sara' });
  });
  test('a bare short phrase is only a guess (the user will be asked), never auto-added', () => {
    expect(P('fresh milk')).toMatchObject({ type: 'pos.add', guess: true, name: 'fresh milk' });
  });
});

describe('questions, utilities and the unknown', () => {
  test.each([['how much did we sell today', 'salesToday'], ["what are today's sales", 'salesToday'], ['sales today', 'salesToday'], ['how much profit today', 'profitToday'], ['how many sales today', 'transactions'],
    ['what is low on stock', 'lowStock'], ['what should i reorder', 'lowStock'], ['who owes the most', 'topDebtor'], ['how many customers owe money', 'owingCount'], ['how much is owed', 'outstanding'],
    ['what is expiring soon', 'expiry'], ['best seller', 'bestSeller']])('%s', (text, topic) => { expect(P(text)).toMatchObject({ type: 'query', topic }); });
  test('theme, help, cancel', () => {
    expect(P('dark mode')).toMatchObject({ type: 'theme', mode: 'dark' }); expect(P('switch to light theme')).toMatchObject({ mode: 'light' }); expect(P('toggle theme')).toMatchObject({ mode: 'toggle' });
    expect(P('help')).toMatchObject({ type: 'help' }); expect(P('what can I say')).toMatchObject({ type: 'help' }); expect(P('cancel')).toMatchObject({ type: 'cancel' });
  });
  test('gibberish and empty input do not crash', () => {
    expect(P('')).toMatchObject({ type: 'unknown' }); expect(P(null)).toMatchObject({ type: 'unknown' });
    expect(P('the quick brown fox jumps over the lazy dog')).toMatchObject({ type: 'unknown' }); expect(P('add')).toMatchObject({ type: 'unknown' }); expect(P('add five')).toMatchObject({ type: 'unknown' });
  });
  test('normalisation and money for speech', () => {
    expect(normalize("  Add TWO  Milk!! (please) ")).toBe('add two milk please'); expect(normalize('add 2.5 kg')).toBe('add 2.5 kg');
    expect(speakMoney(1234.6)).toBe('1,235 rupees'); expect(speakMoney(1)).toBe('1 rupee');
  });
});

describe('fuzzy matching and disambiguation', () => {
  const products = [{ _id: '1', name: 'Fresh Milk 1L' }, { _id: '2', name: 'Milk Chocolate Bar 40g' }, { _id: '3', name: 'Cola 1.5L' }, { _id: '4', name: 'White Bread Loaf' }, { _id: '5', name: 'Basmati Rice (loose)' }];
  test('scores exact, partial and misheard words', () => {
    expect(scoreMatch('cola', 'Cola 1.5L')).toBe(1); expect(scoreMatch('bred', 'White Bread Loaf')).toBeGreaterThan(0.7); expect(scoreMatch('basmati rice', 'Basmati Rice (loose)')).toBe(1); expect(scoreMatch('laptop', 'Cola 1.5L')).toBe(0);
  });
  test('a confident match is picked; an ambiguous word asks; nothing found says none', () => {
    expect(decide(rank(products, 'cola'))).toMatchObject({ kind: 'single', item: { _id: '3' } });
    expect(decide(rank(products, 'milk')).kind).toBe('choices');
    expect(decide(rank(products, 'fresh milk'))).toMatchObject({ kind: 'single', item: { _id: '1' } });
    expect(decide(rank(products, 'laptop'))).toEqual({ kind: 'none' });
  });
  test('resolveByVoice searches the whole phrase, then single words, and stops when confident', async () => {
    const calls = [];
    const search = async (q) => { calls.push(q); return products.filter((p) => p.name.toLowerCase().includes(q)); };
    expect(await resolveByVoice(search, 'full cream milk')).toMatchObject({ kind: 'choices' });
    expect(calls[0]).toBe('full cream milk'); expect(calls.length).toBeGreaterThan(1);
    calls.length = 0;
    expect(await resolveByVoice(search, 'cola')).toMatchObject({ kind: 'single' }); expect(calls).toEqual(['cola']);
    expect(await resolveByVoice(async () => [], 'unicorn')).toEqual({ kind: 'none' });
  });

  test('compound words and different spellings are still found', async () => {
    const catalogue = [{ _id: 'a', name: 'Dishwash Liquid 500ml' }, { _id: 'b', name: 'Yogurt 400g' }, { _id: 'c', name: 'Cola 1.5L' }];
    expect(scoreMatch('dish wash', 'Dishwash Liquid 500ml')).toBeGreaterThan(0.9);
    const substringOnly = async (q) => catalogue.filter((p) => p.name.toLowerCase().includes(q));
    expect(await resolveByVoice(substringOnly, 'yoghurt')).toEqual({ kind: 'none' });
    expect(await resolveByVoice(substringOnly, 'yoghurt', undefined, async () => catalogue)).toMatchObject({ kind: 'single', item: { _id: 'b' } });
  });
});
