# Testing

## Commands
```bash
npm test                 # backend + frontend
npm run test:backend     # Jest (runInBand). First run downloads MongoDB for mongodb-memory-server
npm run test:frontend    # Vitest + React Testing Library (jsdom)
npm run lint
```

## Backend (Jest)
| File | Covers |
|---|---|
| `tests/unit/pricing.test.js` | line/total maths in integer cents, discount-before-tax, profit & margin (incl. zero revenue) |
| `tests/unit/forecast.test.js` | ROP/target/suggested formulas, zero demand, out of stock, high risk, new products, stock-out days excluded, slow-moving classes |
| `tests/unit/fefo.test.js` | FEFO ordering/allocation, ties, batch status incl. “expires today” |
| `tests/unit/seedData.test.js` | seed volume, stock and khata reconciliation, credit limits respected, totals = lines, no expired batch sold, expired/near/void/wastage present |
| `tests/auth.test.js` | HttpOnly cookie, no hashes leaked, uniform 401, lockout, deactivated sessions, CSRF, 403 matrix for admin-only endpoints, cashier cost hiding, audit immutability, employee safeguards |
| `tests/products.test.js` | validation, duplicate SKU/barcode, optional barcode, negative values, opening stock, price-change audit, archive, search/pagination, safe category delete |
| `tests/checkout.test.js` *(replica set / transactions)* | server totals & snapshots, client totals ignored, insufficient cash/stock, atomic multi-line rollback, duplicate submission, concurrent oversell, FEFO + expired exclusion, expiry-today, discount authorisation, whole units, validation, cashier visibility, receipt, void, ledger reconciliation |
| `tests/checkout.standalone.test.js` *(standalone mongod)* | same guarantees through the compensating fallback |
| `tests/customers.test.js` | customer creation/validation/duplicate phone, cashier vs admin permissions, full/partial/attached-cash credit sales, receipt snapshots, limit enforcement + rollback, concurrent credit sales vs limit, inactive/unknown customers, duplicate submission, void reversal, payments (overpayment, duplicates), admin adjustments, ledger/statement, list filters, dashboard cash-vs-credit split |
| `tests/inventory.test.js` | receiving rules, no negative adjustments, set-to-count, duplicate adjustment, wastage cost, expiry alerts, stock filters/valuation |
| `tests/reports.test.js` | dashboard = real transactions, profit definitions, wastage separate, cost snapshots immune to later cost edits, grouping/comparison, range validation, classification, valuation, forecasting & voided exclusion, settings |

## Frontend (Vitest)
`format.test.js` (money/number/date, cart preview mirrors server), `i18n.test.js` (English-only catalogue, no empty/leftover non-English text, interpolation), `whatsapp.test.js` (number conversion, wa.me links, receipt/credit/reminder/payment messages), `theme.test.jsx` (default, toggle, persistence), `ui.test.jsx` (dialog semantics/Escape/focus restore, LTR isolation, pagination), `search.test.jsx` (search box padding for the icon, clear button, prop forwarding), `splash.test.jsx` (welcome screen timing, skip, single completion), `receiptPdf.test.js` (valid one-page PDF for cash/credit/void sales, awkward characters, height grows with content), `dock.test.js` (live navigation badges), `voiceCommands.test.js` (spoken numbers incl. lakh/half/“one and a half”, ~50 command phrases for navigation/POS/questions, role limits, fuzzy matching, ambiguity handling, spelling variants and compound words), `posVoice.test.js` (voice-to-POS bridge: direct delivery, queuing while the POS loads, stale unsubscribe), `motion.test.jsx` (sparkline geometry incl. empty/flat data, trend badge colours, count-up under reduced motion, scroll-reveal fallback, command-palette filtering, route-prefetch guard, every illustration renders).

## What was actually executed while building this archive
The authoring sandbox had no internet access and no MongoDB, so dependencies could not be installed. Executed there (new in this round: the PDF generator was run and its output rendered to images and inspected; the PDF and dock tests ran through the shim, and the pure logic behind sparklines and the command palette was run directly; the voice parser (51 tests) and the voice-to-POS bridge (3 tests) were run, and ~20 phrases were simulated against the real demo catalogue): `node --check` on all backend files; the DB-free backend unit suites (29 tests) through a minimal Jest-compatible shim; the frontend pricing/format/WhatsApp tests (11) through a minimal Vitest-compatible shim; direct runs of the utilities; TypeScript-parser syntax checks of all 44 frontend files; a static check that every JSX component/hook/helper used is imported; locale JSON validity and translation-key coverage; and the seed generator's stock **and khata** reconciliation self-check. **Not executed:** the Jest integration suites (including `customers.test.js`), the real Vitest suites, ESLint and the Vite build. Please run them locally — failures there are possible and should be reported/fixed.

## Manual QA checklist
POS happy path & print · insufficient stock message · double-click “Complete sale” creates one sale · expired lot excluded · wastage + cost · void restores stock · cashier cannot reach admin pages/API · RTL layout on every page · dark theme contrast · mobile drawer and POS on a phone · keyboard-only checkout.
