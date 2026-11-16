// Understanding of spoken (or typed) commands. Pure functions, no browser APIs, fully unit-tested.
// It is deliberately rule-based: no AI service, no API key, no cost, and it behaves the same every time.

const ONES = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19 };
const TENS = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
const SCALES = { thousand: 1000, lakh: 100000, lakhs: 100000, lac: 100000, lacs: 100000, million: 1000000 };
// speech engines often hear these instead of the number word (only trusted in a quantity position)
const LENIENT = { to: 2, too: 2, for: 4, won: 1, tree: 3, ate: 8, fife: 5 };
const UNITS = new Set(['kg', 'kgs', 'kilo', 'kilos', 'kilogram', 'kilograms', 'gram', 'grams', 'g', 'litre', 'litres', 'liter', 'liters', 'l', 'pack', 'packs', 'packet', 'packets', 'piece', 'pieces', 'pcs', 'pc', 'dozen', 'box', 'boxes', 'bottle', 'bottles']);

export function normalize(text) {
  return String(text || '').toLowerCase().replace(/['\u2019]/g, '').replace(/[^a-z0-9.\s-]/g, ' ').replace(/-/g, ' ')
    .replace(/(?<!\d)\.|\.(?!\d)/g, ' ').replace(/\s+/g, ' ').trim();
}

const isDigits = (t) => /^\d+(\.\d+)?$/.test(t);
const isNumberish = (t, lenient) => isDigits(t) || t in ONES || t in TENS || t in SCALES || t === 'hundred' || t === 'half' || t === 'quarter' || t === 'point' || (lenient && t in LENIENT);

/**
 * Reads a number from tokens[start...]. Understands digits, number words, hundred/thousand/lakh/million,
 * "half", "one and a half" and "one point five". Returns { value, used } or null.
 */
export function takeNumber(tokens, start = 0, lenient = false) {
  let total = 0; let cur = 0; let any = false; let j = start;
  while (j < tokens.length) {
    const tok = tokens[j];
    if (isDigits(tok)) { cur += parseFloat(tok); any = true; j += 1; }
    else if (tok in ONES) { cur += ONES[tok]; any = true; j += 1; }
    else if (tok in TENS) { cur += TENS[tok]; any = true; j += 1; }
    else if (lenient && !any && tok in LENIENT) { cur += LENIENT[tok]; any = true; j += 1; }
    else if (tok === 'hundred') { cur = (cur || 1) * 100; any = true; j += 1; }
    else if (tok in SCALES) { total += (cur || 1) * SCALES[tok]; cur = 0; any = true; j += 1; }
    else if (tok === 'half') { cur += 0.5; any = true; j += 1; }
    else if (tok === 'quarter') { cur += 0.25; any = true; j += 1; }
    else if (tok === 'point' && any) {
      let frac = ''; let k = j + 1;
      while (k < tokens.length && (isDigits(tokens[k]) && tokens[k].length === 1 || (tokens[k] in ONES && ONES[tokens[k]] < 10))) { frac += isDigits(tokens[k]) ? tokens[k] : String(ONES[tokens[k]]); k += 1; }
      if (!frac) break;
      cur += parseFloat(`0.${frac}`); j = k; break;
    } else if ((tok === 'and' || tok === 'a' || tok === 'an') && any && j + 1 < tokens.length) {
      // "one and a half", "a hundred"
      const next = tokens[j + 1] === 'a' || tokens[j + 1] === 'an' ? tokens[j + 2] : tokens[j + 1];
      if (next !== undefined && isNumberish(next, false) && next !== 'point') { j += tokens[j + 1] === 'a' || tokens[j + 1] === 'an' ? 2 : 1; } else break;
    } else if ((tok === 'a' || tok === 'an') && !any && j + 1 < tokens.length && (tokens[j + 1] === 'hundred' || tokens[j + 1] === 'thousand' || tokens[j + 1] === 'lakh' || tokens[j + 1] === 'half' || tokens[j + 1] === 'quarter')) { cur += 1; j += 1; }
    else break;
  }
  if (!any) return null;
  return { value: Math.round((total + cur) * 1000) / 1000, used: j - start };
}

export const wordsToNumber = (text) => { const r = takeNumber(normalize(text).split(' '), 0, true); return r ? r.value : null; };

/* ---------------------------------- fuzzy matching ---------------------------------- */
const STOP = new Set(['of', 'the', 'a', 'an', 'and', 'my', 'some', 'please', 'to', 'in', 'for', 'one']);
export const tokensOf = (s) => normalize(s).split(' ').filter((w) => w && !STOP.has(w));

function lev(a, b) {
  const m = a.length; const n = b.length; if (!m) return n; if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i += 1) {
    const cur = [i];
    for (let j = 1; j <= n; j += 1) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
}
export function tokenSim(a, b) {
  if (a === b) return 1;
  if (a.length >= 3 && b.length >= 3 && (b.startsWith(a) || a.startsWith(b))) return 0.92;
  if (a.length >= 5 && b.includes(a)) return 0.85; // short words must match from the start, otherwise 'cola' would match 'cho-cola-te'
  const d = lev(a, b); const max = Math.max(a.length, b.length);
  return max >= 4 && d <= (max >= 7 ? 2 : 1) ? 1 - d / max : 0;
}
/** 0..1: how well the spoken words match a candidate name (every spoken word must find a partner). */
export function scoreMatch(spoken, candidate) {
  const s = tokensOf(spoken); const c = tokensOf(candidate);
  if (!s.length || !c.length) return 0;
  const avg = s.map((w) => Math.max(...c.map((x) => tokenSim(w, x)))).reduce((a, b) => a + b, 0) / s.length;
  // "dish wash" / "tooth paste" are often heard as two words but written as one
  const joined = s.length > 1 ? s.join('') : '';
  const compound = joined ? Math.max(...c.map((x) => tokenSim(joined, x))) : 0;
  return Math.max(avg, compound >= 0.9 ? compound : 0);
}
export function rank(items, spoken, getName = (x) => x.name, min = 0.6) {
  return items.map((item) => ({ item, score: scoreMatch(spoken, getName(item)) })).filter((r) => r.score >= min).sort((a, b) => b.score - a.score);
}
/** single = confident match; choices = ask the user; none = nothing found. */
export function decide(ranked, limit = 5) {
  if (!ranked.length) return { kind: 'none' };
  const [best, second] = ranked;
  if (best.score >= 0.85 && (!second || best.score - second.score >= 0.2)) return { kind: 'single', item: best.item, score: best.score };
  return { kind: 'choices', items: ranked.slice(0, limit).map((r) => r.item) };
}
/**
 * Finds the thing the user meant using an injected async `search(query)` (e.g. the products API).
 * Tries the whole phrase first, then the longest single words, and stops as soon as there is a confident match.
 */
export async function resolveByVoice(search, spoken, getName = (x) => x.name, fetchAll = null) {
  const toks = tokensOf(spoken);
  const queries = [...new Set([normalize(spoken), ...toks.filter((t) => t.length >= 3).sort((a, b) => b.length - a.length).slice(0, 3)])].filter(Boolean);
  const pool = new Map();
  for (const q of queries) {
    const rows = await search(q);
    rows.forEach((r) => pool.set(r._id ?? getName(r), r));
    const ranked = rank([...pool.values()], spoken, getName);
    if (ranked[0] && ranked[0].score >= 0.85) break;
  }
  // The server search is a plain substring match, so a different spelling ("yoghurt" vs "Yogurt") finds nothing.
  // A mini mart catalogue is small, so fall back to ranking the whole list locally.
  if (!pool.size && fetchAll) (await fetchAll()).forEach((r) => pool.set(r._id ?? getName(r), r));
  const ranked = rank([...pool.values()], spoken, getName);
  if (ranked.length) return decide(ranked);
  // Nothing scored well, but the search did find candidates that share a word with what was said: let the user choose.
  const loose = rank([...pool.values()], spoken, getName, 0.2);
  return loose.length ? { kind: 'choices', items: loose.slice(0, 5).map((r) => r.item) } : { kind: 'none' };
}

/* ------------------------------------ intent parsing ------------------------------------ */
export const PAGES = [
  { to: '/dashboard', key: 'dashboard', role: 'admin', words: ['dashboard', 'home', 'overview', 'home page'] },
  { to: '/pos', key: 'pos', role: 'any', words: ['point of sale', 'pos', 'sell screen', 'selling screen', 'new sale', 'counter', 'till', 'cashier screen', 'sell'] },
  { to: '/products', key: 'products', role: 'admin', words: ['products', 'product list', 'items', 'catalogue', 'catalog'] },
  { to: '/categories', key: 'categories', role: 'admin', words: ['categories', 'category'] },
  { to: '/inventory', key: 'inventory', role: 'admin', words: ['inventory', 'stock levels', 'stock'] },
  { to: '/movements', key: 'movements', role: 'admin', words: ['stock movements', 'movements', 'stock history'] },
  { to: '/expiry', key: 'expiry', role: 'admin', words: ['expiry and wastage', 'expiry', 'wastage', 'waste'] },
  { to: '/sales', key: 'sales', role: 'any', words: ['sales history', 'sales page', 'sales list', 'receipts', 'transactions', 'sales'] },
  { to: '/customers', key: 'customers', role: 'any', words: ['customers', 'customer list', 'khata', 'credit ledger', 'ledger', 'customer accounts'] },
  { to: '/reports', key: 'reports', role: 'admin', words: ['reports', 'report', 'analytics', 'forecast', 'reorder forecast'] },
  { to: '/employees', key: 'employees', role: 'admin', words: ['employees', 'staff', 'users', 'cashiers', 'team'] },
  { to: '/audit', key: 'audit', role: 'admin', words: ['audit logs', 'audit log', 'audit', 'logs'] },
  { to: '/settings', key: 'settings', role: 'admin', words: ['settings', 'store settings', 'preferences'] },
];

const FILLER = /^(?:hey|hi|ok|okay|please|swift ?shelf|assistant|can you|could you|would you|will you|i want to|i would like to|i d like to|lets|let us|just|kindly)\s+/;
const NAV_VERB = /^(?:open|go to|goto|go|show me|show|take me to|navigate to|switch to|launch|view|display|bring up)\s+(?:the\s+)?/;
const PAGE_SUFFIX = /\s+(?:page|screen|section|tab|list|view)$/;
const CART_WORDS = /\b(cart|basket|order|everything|all)\b/;

const Q = [
  ['bestSeller', /\b(best sell(?:er|ing)|top sell(?:er|ing)|most sold|bestseller)\b/],
  ['topDebtor', /\bwho owes?\b.*\b(most|more|biggest|highest)\b|\b(biggest|highest|top)\s+(debtor|balance|debt)\b|\bwho has the (most|highest)\b.*\b(credit|balance|khata)\b/],
  ['owingCount', /\bhow many\b.*\b(customers?|people)\b.*\b(owe|owes|credit|khata|outstanding)\b/],
  ['outstanding', /\bhow much\b.*\b(owed|owe|outstanding|credit|khata)\b|\btotal\b.*\b(khata|credit|outstanding|owed)\b/],
  ['profitToday', /\b(how much|what|whats|what is)\b.*\bprofit\b|\bprofit today\b|\btodays? profit\b/],
  ['transactions', /\bhow many\b.*\b(sales|transactions|bills|orders)\b/],
  ['salesToday', /\b(how much|what|whats|what is|total)\b.*\b(sold|sales|revenue|made|earned|takings|sell)\b|\b(sales|revenue|takings)\b.*\btoday\b|\btodays? (sales|revenue)\b/],
  ['lowStock', /\b(low (?:on |in )?stock|what(?:s| is)? low|running (?:low|out)|out of stock|need(?:s)? (?:to )?(?:re ?order|restock|order)|what should i (?:re ?order|restock|order)|almost finished)\b/],
  ['expiry', /\b(expir(?:ed|ing|y)|about to expire|going off)\b.*\b(product|products|item|items|stock|batch|batches|anything|soon|today)\b|\bwhat s expiring\b|\banything expiring\b|\bwhats expiring\b/],
];

/** Turn text into an intent. role: 'admin' | 'cashier'. Never throws. */
export function parseCommand(text, { role = 'admin' } = {}) {
  const raw = String(text || '');
  let t = normalize(raw);
  for (let i = 0; i < 3; i += 1) { const n = t.replace(FILLER, ''); if (n === t) break; t = n; }
  if (!t) return { type: 'unknown', raw };
  const tokens = t.split(' ');

  if (/^(help|what can i say|what can you do|commands|examples)$/.test(t) || /\bwhat can i say\b/.test(t)) return { type: 'help', raw };
  if (/^(cancel|stop|never mind|nevermind|close|exit|quit|dismiss|go away|thats all|that is all)$/.test(t)) return { type: 'cancel', raw };
  const theme = t.match(/\b(dark|night|light|day)\s+(mode|theme)\b/); if (theme) return { type: 'theme', mode: /dark|night/.test(theme[1]) ? 'dark' : 'light', raw };
  if (/\b(switch|toggle|change)\b.*\b(theme|mode)\b/.test(t)) return { type: 'theme', mode: 'toggle', raw };

  // quick "create" shortcuts
  if (/^(add|create|new)\s+(a\s+)?(new\s+)?(customer|client)$/.test(t)) return { type: 'navigate', to: '/customers?new=1', key: 'customers', role: 'any', raw };
  if (/^(add|create|new)\s+(a\s+)?(new\s+)?product$/.test(t)) return { type: 'navigate', to: '/products?new=1', key: 'products', role: 'admin', raw };
  if (/^(receive|add|restock)\s+(some\s+)?stock$/.test(t) || /^(receive|record) (a )?delivery$/.test(t)) return { type: 'navigate', to: '/inventory?receive=1', key: 'inventory', role: 'admin', raw };

  // explicit navigation verbs win over question patterns ("go to inventory")
  const explicitNav = NAV_VERB.test(t);
  const matchPage = (phrase) => {
    const p = phrase.replace(PAGE_SUFFIX, '').trim();
    let best = null;
    PAGES.forEach((pg) => pg.words.forEach((w) => { if ((p === w || p === `the ${w}`) && (!best || w.length > best.w.length)) best = { pg, w }; }));
    return best && best.pg;
  };
  if (explicitNav) { const pg = matchPage(t.replace(NAV_VERB, '')); if (pg) return { type: 'navigate', to: pg.to, key: pg.key, role: pg.role, raw }; }

  for (const [topic, re] of Q) if (re.test(t)) return { type: 'query', topic, raw };

  // ---- POS commands
  if (/\b(check ?out|complete (?:the )?sale|finish (?:the )?sale|take payment|charge (?:them|him|her|it)|pay now)\b/.test(t) || /^(pay|charge|done)$/.test(t)) return { type: 'pos.checkout', raw };
  if (/\b(clear|empty|reset)\b/.test(t) && CART_WORDS.test(t) || /^(start over|clear it|clear all)$/.test(t)) return { type: 'pos.clear', raw };
  if (/\b(on (?:credit|khata|account|tab)|pay later|full credit|credit sale)\b/.test(t)) return { type: 'pos.credit', raw };

  const cash = t.match(/^(?:cash|received|receive|paid|they paid|customer paid|cash received|cash given|got|take|tender|tendered)\s+(.+)$/);
  if (cash) { const n = takeNumber(cash[1].replace(/\b(rupees?|rs|pkr)\b/g, '').trim().split(' ').filter(Boolean), 0, true); if (n) return { type: 'pos.cash', amount: n.value, raw }; }

  const cust = t.match(/^(?:select |choose |set |change |pick )?(?:the )?(?:customer|client)(?: is| to| name)?\s+(.+)$/) || t.match(/^(?:sell(?:ing)? to|selling for|bill to|charge to)\s+(.+)$/);
  if (cust && !/^(list|page|screen|accounts?)$/.test(cust[1])) return { type: 'pos.customer', name: cust[1].trim(), raw };

  const rem = t.match(/^(?:remove|delete|take out|take off|drop|cancel|void)\s+(.+)$/);
  if (rem) { const name = rem[1].replace(/\s+(from|off)\s+(?:the\s+)?(?:cart|basket|order)$/, '').replace(/^(?:the|my)\s+/, '').trim(); if (name && !CART_WORDS.test(name)) return { type: 'pos.remove', name, raw }; }

  const add = t.match(/^(?:add|put|give me|give|get me|get|sell me|sell|ring up|i want|include|plus|one more|another|more)\s*(.*)$/);
  if (add && add[1]) {
    let rest = add[1].replace(/\s+(?:to|into|in|on)\s+(?:the\s+|my\s+)?(?:cart|basket|order|bill)$/, '').replace(/\s+please$/, '').trim();
    if (/^(?:one more|another|more)/.test(t) || /^(?:one more|another)$/.test(t.split(' ').slice(0, 2).join(' '))) { /* qty stays 1 */ }
    const rt = rest.split(' ').filter(Boolean);
    const num = takeNumber(rt, 0, true);
    let qty = 1; let i = 0;
    if (num && rt.length > num.used) { qty = num.value; i = num.used; }
    else if (num && rt.length === num.used) { /* only a number: not a product */ return { type: 'unknown', raw }; }
    if (UNITS.has(rt[i]) && rt.length > i + 1) i += 1;
    if (rt[i] === 'of') i += 1;
    const name = rt.slice(i).join(' ').replace(/^(?:the|my|some)\s+/, '').trim();
    if (name) return { type: 'pos.add', name, qty: qty > 0 ? qty : 1, raw };
  }

  // ---- bare page names ("products", "khata")
  const bare = matchPage(t); if (bare) return { type: 'navigate', to: bare.to, key: bare.key, role: bare.role, raw };

  // ---- a short phrase with no verb: probably a product name -> offer matches instead of guessing
  if (tokens.length <= 4 && !/^(yes|no|ok|okay|thanks|thank you|hello|hi)$/.test(t) && !/^(add|remove|delete|put|get|give|sell|cash|customer|select|open|go|show|checkout|clear|cancel|received|paid)\b/.test(t)) return { type: 'pos.add', name: t, qty: 1, guess: true, raw };
  return { type: 'unknown', raw };
}

/** Can this role open the page? (cashiers only get POS, sales and customers) */
export const canOpen = (intent, role) => intent.role !== 'admin' || role === 'admin';
export const speakMoney = (v) => { const n = Math.round(Number(v) || 0); return `${n.toLocaleString('en-US')} rupee${n === 1 ? '' : 's'}`; };
