# SwiftShelf POS — Smart Mini Mart Point of Sale & Inventory Management

A full-stack **MERN** application (MongoDB, Express, React, Node.js) for a single physical mini mart: fast checkout (cash or **khata credit**), a customer credit ledger, **WhatsApp receipt sharing**, batch-aware inventory with FEFO selling, expiry & wastage tracking, rule-based reorder forecasting, honest profit analytics, a premium English UI with light/dark themes, role-based access and an immutable audit trail.

> **Honest status:** the code was written and statically checked in a sandbox without internet access, so `npm install`, the Vite production build, the Jest/Vitest suites against MongoDB and the live API/UI were **not executed there**. See [Verification status](#verification-status) for exactly what was and was not run, and run the commands in [Testing](#testing) on your machine before a demo.

## Contents
1. [Features and modules](#features-and-modules) · 2. [Tech stack](#technology-stack) · 3. [Architecture](#architecture) · 4. [Project structure](#project-structure) · 5. [Prerequisites](#prerequisites) · 6. [MongoDB setup](#mongodb-setup) · 7. [Configuration](#configuration-environment-variables) · 8. [Install, seed, run](#install-seed-and-run) · 9. [Demo guide](#demonstration-guide) · 10. [Testing](#testing) · 11. [Production build](#production-build-and-deployment) · 12. [API overview](#api-overview) · 13. [Security](#security) · 14. [Troubleshooting](#troubleshooting) · 15. [Limitations & future work](#limitations-and-future-improvements) · 16. [University demo checklist](#university-demonstration-checklist)

## Features and modules
| Module | What it does |
|---|---|
| **Dashboard** | Today's revenue, transactions, units, gross profit; range filters; sales trend chart; payment summary; best sellers; slow movers; low stock; near-expiry batches; recent sales. All numbers are aggregated from real sales. |
| **POS** | Product search, USB-scanner (keyboard) and camera barcode scanning, cart, quantity/discount, cash received & change, server-priced checkout, unique receipt numbers, printable 80 mm receipt, idempotent submission. |
| **Products / Categories** | Validated CRUD, optional unique barcode, decimals, archive/restore (history never deleted), safe category deletion. |
| **Customers & Khata** | Customer accounts with credit limits, credit/partial sales at the POS, atomic limit enforcement, payments (with duplicate protection), admin adjustments/write-offs, a full ledger with running balance, printable statements and WhatsApp reminders. Voiding a credit sale reverses the charge. |
| **WhatsApp sharing** | **Receipts are sent as a real PDF** (built in the browser with `pdf-lib`, A-ticket layout with branded header, itemised lines, totals, khata box, VOID watermark). On phones/tablets the native share sheet attaches the PDF (pick WhatsApp); on desktop the PDF is downloaded and the customer's WhatsApp chat opens with a caption so the file can be attached with the paperclip. Payment confirmations, balance reminders and statement summaries are sent as text. Uses click-to-chat links (`wa.me`) — **no API key or account needed**, and the cashier always presses send. |
| **Inventory** | Per-product stock (sellable vs expired), valuation at batch cost, receiving (new batch/lot), adjustments (delta or counted quantity), wastage. |
| **Stock Movements** | Immutable ledger: opening, receipt, sale, void return, adjustments, wastage — with employee, reason, batch. |
| **Expiry & Wastage** | Per-batch expiry, near-expiry/expired alerts, FEFO selling, expired stock can never be sold, write-offs with cost impact. |
| **Sales History** | Filter/search, details, reprint, admin-only void (restores stock to the exact batches). Cashiers see only their own sales (no cost data). |
| **Analytics & Reports** | Sales (day/week/month + period comparison), profit (revenue ex-tax, COGS, gross profit, margin, wastage shown separately), product performance & slow-mover classification with reasons, stock valuation, **reorder forecast**. CSV export. |
| **Employees** | Create/edit/activate/deactivate admins and cashiers; last-admin and self-lockout protection. |
| **Audit Logs** | Searchable, append-only; price changes, adjustments, wastage, sales, voids, role changes, settings (before/after, no secrets). |
| **Settings** | Store info, currency/timezone, default tax, cashier discount limit, near-expiry days, forecasting and slow-mover parameters. |

Cross-cutting: page transitions and scroll-reveal, count-up KPI numbers with sparklines and trend arrows, a swipeable highlights slider, a Ctrl+K command palette, hover/idle route prefetching, undo toasts instead of confirmations for reversible actions, sticky table headers, illustrated empty states, a phone bottom tab bar, POS keyboard shortcuts, a minimalist premium sign-in screen, a floating **liquid-dock navigation** that never scrolls (glider highlight, magnetic hover, cursor light, live badges for stock/expiry alerts, customers owing and today's sales), a polished English UI (matching lime/forest shade system), light/dark/system theme (persisted), responsive layout, collapsible sidebar + mobile drawer, skeleton loaders, empty/error states, accessible dialogs (focus trap, Esc, ARIA), reduced-motion support.

## Technology stack
**Frontend:** React 18, Vite 5, JavaScript/JSX, Tailwind CSS 3, React Router 6, Axios, Recharts, Lucide React, React Hook Form + Zod, React Context, i18next (English text catalogue), react-hot-toast.
**Backend:** Node.js ≥ 18.18, Express 4, Mongoose 8 (MongoDB), JWT in HttpOnly cookie, bcryptjs, Zod validation, Helmet, express-rate-limit, CORS allow-list, centralized error handler.
**Testing:** Jest + Supertest + mongodb-memory-server (backend), Vitest + React Testing Library (frontend).

## Architecture
```mermaid
flowchart LR
  subgraph Browser
    UI[React SPA<br/>Vite · Tailwind · i18next]
  end
  subgraph API[Express API /api/v1]
    MW[helmet · CORS · rate limit<br/>auth · CSRF · RBAC · zod]
    CT[Controllers] --> SV[Services<br/>checkout · FEFO · inventory<br/>reports · forecast · audit]
    MW --> CT
  end
  DB[(MongoDB<br/>users · products · categories<br/>inventorybatches · sales<br/>stockmovements · auditlogs · settings)]
  UI -- "HttpOnly cookie + X-CSRF-Token (JSON)" --> MW
  SV --> DB
  SV -. "transaction (replica set)<br/>or compensating fallback (standalone)" .-> DB
```

Key design decisions
* **Every unit of stock lives in a batch** (`InventoryBatch`). Products without expiry simply have batches with `expiryDate = null`. Stock per product is aggregated from batches, so it can never drift from a denormalised counter.
* **Server-side money:** the client sends product ids, quantities, optional discount % and cash received. Prices, tax, totals, COGS and batches are decided on the server, in integer minor units (paisa).
* **Atomic stock:** `updateOne({_id, remainingQuantity: {$gte: qty}}, {$inc: …})` guards every deduction. With a replica set the whole sale (batches + movements + sale + receipt counter) is one MongoDB transaction; on a standalone server a compensating rollback undoes partial work (see `DATABASE_DESIGN.md`).
* **Idempotency:** checkout, receipts, adjustments and wastage require a client request id with a unique index, so double-clicks/retries never double-apply.
* **Dates:** expiry dates are stored as UTC-midnight of the store-local date; stock expiring *today* is still sellable (valid through the end of that day).

## Project structure
```
SwiftShelf-POS-MERN/
├─ package.json            root scripts (installs backend + frontend via postinstall)
├─ README.md  docs/        PROJECT_OVERVIEW, DATABASE_DESIGN, API_DOCUMENTATION, TESTING
├─ backend/
│  ├─ .env.example
│  ├─ src/
│  │  ├─ config/ (env, db)         ├─ models/ (8 collections + Counter)
│  │  ├─ routes/  controllers/     ├─ services/ (business logic)
│  │  ├─ middleware/ (auth, csrf, rbac, validate, errors, rate limit)
│  │  ├─ validators/ (zod)         ├─ utils/ (money, pricing, fefo, forecast, date)
│  │  ├─ scripts/ (seed, seedData, createAdmin)   └─ app.js, server.js
│  └─ tests/ (unit/ + integration)
└─ frontend/
   ├─ .env.example, index.html, vite/tailwind config, public/favicon.svg
   └─ src/ components/ layouts/ pages/ contexts/ hooks/ services/ utils/
          i18n/locales/en/  __tests__/
```

## Prerequisites
* **Node.js 18.18+** (20 LTS or 22 recommended) and npm 9+ — <https://nodejs.org>
* **MongoDB 6+** — local Community Server *or* a free MongoDB Atlas cluster
* A modern browser (Chrome/Edge/Safari). Camera barcode scanning needs a browser with the `BarcodeDetector` API and HTTPS or `localhost`; otherwise use a USB scanner or manual entry.

## MongoDB setup
**Option A — MongoDB Atlas (easiest, transactions included).** Create a free cluster → Database Access: add a user → Network Access: allow your IP → Connect → *Drivers* → copy the SRV string, e.g. `mongodb+srv://USER:PASS@cluster0.xxxxx.mongodb.net/swiftshelf_pos?retryWrites=true&w=majority` into `MONGODB_URI`. URL-encode special characters in the password.

**Option B — local MongoDB, standalone.** Install MongoDB Community, start `mongod`, use `mongodb://127.0.0.1:27017/swiftshelf_pos`. Checkout works with the **compensating fallback** (no multi-document transactions). The API logs `standalone: compensating fallback ON` at startup.

**Option C — local single-node replica set (enables real transactions).**
```bash
mkdir -p ~/mongo-rs && mongod --replSet rs0 --dbpath ~/mongo-rs --port 27017 --bind_ip 127.0.0.1
# in another terminal, once:
mongosh --eval 'rs.initiate({_id:"rs0",members:[{_id:0,host:"127.0.0.1:27017"}]})'
```
Then `MONGODB_URI=mongodb://127.0.0.1:27017/swiftshelf_pos?replicaSet=rs0`. Set `USE_TRANSACTIONS=true` to make startup fail loudly if transactions are unavailable (`auto` detects, `false` forces the fallback).

## Configuration (environment variables)
```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```
Generate two different secrets (never commit them, never put them in a `VITE_` variable):
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```
| Variable (backend/.env) | Meaning |
|---|---|
| `NODE_ENV` | `development` \| `production` \| `test`. Production enables `Secure` cookies and refuses the seed script. |
| `PORT` | API port, default `5000`. |
| `MONGODB_URI` | Connection string (see above). |
| `JWT_ACCESS_SECRET` / `COOKIE_SECRET` | ≥ 32 random chars each. The API **refuses to start** with missing/placeholder secrets. |
| `JWT_ACCESS_EXPIRES_IN` | Access-token lifetime, default `15m`. The session slides (cookie is re-issued when half the lifetime has passed) up to `SESSION_ABSOLUTE_HOURS` (default 12). |
| `CLIENT_URL` | Exact browser origin(s), comma-separated, for CORS, e.g. `http://localhost:5173`. Must match what you open in the browser (`localhost` ≠ `127.0.0.1`). |
| `COOKIE_SAMESITE` | `lax` (default; same-site deployments), `strict`, or `none` (cross-site, HTTPS + production only). |
| `CURRENCY_CODE`, `STORE_TIMEZONE` | Defaults `PKR`, `Asia/Karachi`. Both are editable later in **Settings**. |
| `USE_TRANSACTIONS` | `auto` \| `true` \| `false`. |
| `ADMIN_NAME/EMAIL/PASSWORD` | Only for `npm run create-admin`. |

Frontend: `VITE_API_BASE_URL=http://localhost:5000/api/v1`. No third-party API keys are required for any feature.

## Install, seed and run
> After updating from an older copy of this project run `npm install` once more (the PDF receipts use the small `pdf-lib` package).

```bash
# from the project root
npm install                 # installs root + backend + frontend (via postinstall)
npm run seed                # seeds an EMPTY dev database (see safety rules below)
npm run dev                 # API on :5000 and web app on :5173 concurrently
```
Open **http://localhost:5173** (API health: http://localhost:5000/api/v1/health).

Individual commands: `npm run dev:backend`, `npm run dev:frontend`, `npm run build`, `npm test`, `npm run lint`.

**Seed safety.** `npm run seed` only writes to an empty database. `npm run seed:reset` (= `--reset --yes`) wipes only this app's collections and reseeds. It refuses to run when `NODE_ENV=production` or when the database name doesn't contain `swiftshelf`, `dev`, `demo` or `test`. It generates 37 fictional products in 8 categories, ~200 batches (expired, near-expiry, long-life), ~6,600 stock movements and ~2,000 sales over 45 days by *simulating* real trading against the same FEFO/pricing code as checkout, then verifies that movements reconcile with batch quantities before writing anything. Dashboard figures are aggregated from these seeded sales.

**Development-only demo accounts** (printed by the seed; never use elsewhere):

| Role | Email | Password |
|---|---|---|
| Admin | `admin@swiftshelf.test` | `Admin@12345` |
| Cashier | `ali@swiftshelf.test` / `sara@swiftshelf.test` | `Cashier@12345` |

**Real deployments** have no public registration. Create the first admin with `ADMIN_NAME=… ADMIN_EMAIL=… ADMIN_PASSWORD=… npm run create-admin`, then add staff in *Employees*.

## Voice assistant (free, no API key)
Press the **mic** in the top bar, the **Voice** button on the POS, **Alt+V**, or choose *Voice assistant* in the Ctrl+K palette, then speak (or type a command in the same box).

**How it works, step by step**
1. **Listening:** the browser's built-in speech recognition (Web Speech API) turns your voice into text. In Chrome the audio is processed by Google's speech service, so it needs internet and microphone permission. SwiftShelf never records or stores audio.
2. **Understanding:** a local, rule-based parser (`frontend/src/utils/voiceCommands.js`) converts the text into an intent: numbers in words (“two thousand five hundred”, “half”, “three lakh”), navigation, POS actions, questions. The speech engine's alternative guesses are tried too. No AI service is involved, so it is free and behaves the same every time.
3. **Finding things:** product and customer names are matched by the real API and then ranked with fuzzy matching (typos, different spellings, “dish wash” = “Dishwash”). A clear match is used; an ambiguous one (“milk” → two products) shows tappable choices; nothing found says so.
4. **Acting:** navigation opens the page; cart commands go to the POS through a small bridge (if the POS is not open yet it opens and the command is delivered when it loads); questions call the normal reports/stock/customer endpoints.
5. **Answering:** the result appears in the panel and is read aloud with the browser's text-to-speech (toggle with the speaker icon).

**What you can say** — *Go:* “open products”, “go to khata”, “show reports”, “add customer”, “receive stock”, “dark mode”. *Sell:* “add two milk”, “add half kg sugar”, “remove milk”, “customer Ahmed”, “cash two thousand”, “put it on credit”, “checkout”, “clear the cart”. *Ask:* “how much did we sell today”, “what is low on stock”, “who owes the most”, “what is expiring soon”, “best seller”, “how much profit today”. Say “help” for the list. Cashiers can use the sell commands and khata questions; sales/profit/stock questions and admin pages need an admin.

**Safety rules:** voice never completes a sale, payment or void by itself — “checkout” only opens the on-screen confirmation (it tells you if cash is short or the cart is empty); removing/clearing the cart shows the normal Undo; the panel always shows what it heard.

**Settings in the panel:** spoken replies on/off, *Keep listening* (re-listens after each answer), speech language (English US / Pakistan / UK).

**Browser support:** use **Chrome** (desktop or Android). Safari has partial support; Firefox has none; Edge is unreliable for recognition. If listening is unavailable you can still type commands into the same box. Needs `localhost` or HTTPS.

**Known limits:** noisy shops, strong accents and unusual product names cause mistakes (that is why choices and “I heard…” are shown); brand nicknames that are not in the product name (e.g. “coke” for “Cola”) are not understood; commands are English only for now. An optional AI chatbot for free-form questions is deliberately not included.

## How barcode scanning works
* **USB / Bluetooth scanners** act like a keyboard: they “type” the barcode and press Enter. Keep the cursor in the POS search box (it is focused automatically) and scan: a code that looks like a barcode/SKU is looked up exactly (`GET /products/barcode/:code`, which matches the barcode or the SKU of **active** products) and the product is added to the cart; anything else is treated as a normal text search.
* **Camera scanning** (the *Scan* button) uses the browser's built-in `BarcodeDetector` API to read EAN-13/8, UPC-A/E, Code 128/39 and QR codes from the camera. It needs HTTPS or `localhost`, camera permission, and a browser that implements the API (Chrome/Edge on Android and some desktops, Safari 17+). If it is unsupported or denied, the dialog explains why and offers **manual entry**.
* Out-of-stock, archived or unknown barcodes show a clear message and nothing is added; quantities never exceed sellable stock.
* Demo products have valid EAN-13 barcodes (see the Products page). A fallback decoder library (e.g. ZXing) can be added later for browsers without `BarcodeDetector`.

## Where the admin account lives (and how login works)
* Accounts are **documents in your MongoDB database** (`users` collection in `swiftshelf_pos`). Each has `email`, `role` (`admin`/`cashier`), `isActive` and a **bcrypt password hash** (`passwordHash`). The plain password is never stored anywhere.
* The demo admin (`admin@swiftshelf.test` / `Admin@12345`) is created by `npm run seed` from the `DEMO` constants at the top of `backend/src/scripts/seed.js` — that is the only place the demo password appears (development use only).
* On login the server hashes what you typed and compares it with the stored hash, then issues an HttpOnly session cookie. The browser never sees the hash.
* For a real shop: run `ADMIN_NAME=… ADMIN_EMAIL=… ADMIN_PASSWORD=… npm run create-admin` (PowerShell: set the three `$env:` variables first), sign in, then add/replace staff in **Employees** (an admin can reset any password there). The app refuses to deactivate the last active admin, so create your real admin first, then deactivate the demo one.
* To inspect: Atlas → *Browse Collections* → `swiftshelf_pos` → `users` (you will see hashes, not passwords).

## Demonstration guide
1. **Login** as admin → *Dashboard* shows today's figures, 7-day trend, payments, best/slow sellers, low-stock and near-expiry lists.
2. **POS** (sidebar, or sign in as a cashier): search “milk”, click a product, or type/scan a barcode from *Products* and press Enter. Change quantity, add a 5 % discount (cashier limit; admin can exceed), type cash received → **Checkout** → confirm → receipt appears → **Print receipt** (80 mm print stylesheet) → **New sale**.
3. **Stock deduction:** open *Inventory* — the sold product's sellable stock dropped; *Stock Movements* shows the `Sale` line with lot number and cashier. *Sales History → View → Void* (admin) restores the stock to the same batch and logs a `Void return`.
4. **Expiry (FEFO):** *Expiry & Wastage → Alerts* lists expired (e.g. `YG-OLD-…` yogurt) and near-expiry batches. Sell a product that has two lots, then open *Stock Movements* (filter by that product): the `Sale` rows show the lot numbers consumed — the earlier expiry goes first. Expired lots can never be sold.
5. **Wastage:** *Write off* an expired batch → choose reason → see the cost impact → *Wastage history* tab and *Reports → Profit* (“Wastage cost”, shown separately from gross profit).
6. **Forecasting:** *Reports → Reorder forecast* shows average daily demand, days of stock left, reorder point, suggested quantity, risk and a plain-language reason. Change windows in *Settings*. It is explicitly labelled a rule-based estimate.
7. **Reports:** switch tabs (sales/profit/products/stock), change the date range, export CSV. *Product performance* explains each slow-moving classification; the brand-new *Protein Bar* is never flagged.
8. **Khata (credit):** in *POS* click the customer row → pick or add a customer → enter less cash than the total (or press **Put it all on credit**) → the remainder goes on their khata; the receipt shows *Paid now / On credit / Balance*. Try exceeding the limit (blocked atomically). Open *Customers (Khata)* → a customer → **Record payment**, **Statement** (printable) and **Send reminder**. Voiding the sale in *Sales History* reverses the charge.
9. **WhatsApp PDF:** after any sale click **Send receipt as PDF** → a preview dialog shows the generated PDF. On a phone press **Share PDF…** and choose WhatsApp. On a computer press **Download & open WhatsApp**: the PDF is saved and the customer's chat opens with a caption — click the paperclip → *Document* → pick the PDF → send. Local numbers starting with `0` use the country code from *Settings* (default 92).
10. **First impression:** every page load starts with an animated **welcome screen** (logo + “Small store. Smarter business.”, click/tap/any key to skip) that lifts like a curtain onto the sign-in page. On a phone the menu button opens an animated **slide-in drawer** (swipe left, tap outside or Esc to close). The top-bar search shows **live suggestions** for products and customers (arrow keys + Enter; press `/` to focus it).
11. **Receipt:** complete or open any sale to see the paper-style receipt (store header, status stamp, itemised lines, totals, payment/khata block, VOID watermark on voided sales); **Print receipt** produces a clean 80 mm layout.
12. **Premium touches to try:** press **Ctrl+K** (⌘K on Mac) for the command palette (jump to pages, add a product/customer, receive stock, search products and customers); hover a menu item and watch the page load instantly (**route prefetching**); swipe the **Highlights** cards on the dashboard; watch numbers count up and sparklines draw; remove a cart line or archive a product and use **Undo**; in the POS use **F2** (search), **F4** (checkout) and **Esc**; scroll a long table to see the **sticky header**, and any page to see the green **scroll-progress line**; on a phone use the **bottom tab bar** and the floating **View cart** bar.
13. **Theme:** the sun/moon button toggles light/dark (persisted; follows the OS on first visit).
9. **RBAC:** sign in as `ali@swiftshelf.test` — only POS and Sales History exist; typing `/products` redirects back, and direct API calls to admin endpoints return 403. *Audit Logs* (admin) shows everything above.

## Testing
```bash
npm test                    # backend (Jest) then frontend (Vitest)
npm run test:backend        # first run downloads a MongoDB binary for mongodb-memory-server (needs internet once)
npm run test:frontend
npm run lint
```
Backend: unit tests (pricing, FEFO, forecast formulas & edge cases, seed reconciliation) need no database; integration tests start an in-memory **replica set** (transactions ON) and a **standalone** server (fallback path) and cover auth/RBAC/CSRF, product validation & duplicates, checkout (totals, snapshots, insufficient stock, rollback, duplicate submission, concurrency, discounts, voids), FEFO/expiry, inventory, wastage, reports and forecasting. Frontend: formatting/pricing preview, locale parity & RTL switching, theme persistence, dialog accessibility. Details in [docs/TESTING.md](docs/TESTING.md).

## Production build and deployment
```bash
npm run build               # -> frontend/dist
NODE_ENV=production npm start   # API (set real secrets, MONGODB_URI, CLIENT_URL)
```
* Serve `frontend/dist` from any static host / reverse proxy. Simplest and safest: **same site** (e.g. `https://shop.example.com` for the SPA and `/api` proxied to Node) with `COOKIE_SAMESITE=lax`; set `VITE_API_BASE_URL=/api/v1` at build time.
* Cross-site deployments (SPA and API on different registrable domains) need `COOKIE_SAMESITE=none`, HTTPS everywhere and `CLIENT_URL` set to the SPA origin.
* Behind a proxy the API sets `trust proxy` in production so rate limiting uses the real client IP.
* Use Atlas or a replica set in production so sales use real transactions. Back up MongoDB regularly.

## API overview
Versioned REST under `/api/v1`; JSON `{ success, data, meta? }` or `{ success:false, error:{code,message,details?} }`. Full reference: [docs/API_DOCUMENTATION.md](docs/API_DOCUMENTATION.md).

| Area | Endpoints |
|---|---|
| Auth | `POST /auth/login`, `POST /auth/logout`, `GET /auth/me` |
| Products | `GET/POST /products`, `GET/PATCH /products/:id`, `PATCH /products/:id/status`, `GET /products/barcode/:code` |
| Categories | `GET/POST /categories`, `PATCH/DELETE /categories/:id` |
| Sales | `POST /sales`, `GET /sales`, `GET /sales/:id`, `GET /sales/:id/receipt`, `POST /sales/:id/void` |
| Inventory | `GET /inventory/stock`, `GET /inventory/movements`, `POST /inventory/receipts|adjustments|wastage` |
| Expiry | `GET /expiry/batches`, `GET /expiry/alerts` |
| Reports | `GET /reports/dashboard|sales|profit|products|stock` |
| Forecasting | `GET /forecasting/reorder` |
| Employees | `GET/POST /employees`, `PATCH /employees/:id`, `PATCH /employees/:id/status` |
| Customers / Khata | `GET/POST /customers`, `GET/PATCH /customers/:id`, `PATCH /customers/:id/status`, `GET /customers/:id/ledger`, `GET /customers/:id/statement`, `POST /customers/:id/payments`, `POST /customers/:id/adjustments` |
| Audit / Settings | `GET /audit-logs`, `GET/PUT /settings` |

## Security
* Passwords hashed with bcrypt (cost 12); login throttled (10/15 min per IP) and accounts lock for 15 min after 5 failures; identical errors for unknown email vs wrong password.
* JWT stored in an **HttpOnly, SameSite** (and `Secure` in production) cookie; never exposed to JavaScript. **CSRF:** a session-bound HMAC token is returned on login/`me` and must be sent as `X-CSRF-Token` on every unsafe request. CORS is an exact-origin allow-list with credentials.
* Authorization is enforced **on the server** per route (`admin` vs `admin|cashier`); cashiers never receive cost prices, COGS or profit; they only see their own sales; discount limits and price changes are enforced/audited server-side.
* Zod validation on every body/query/param (unknown keys stripped; settings are strict); Helmet headers; JSON body limit 200 kB; regex inputs escaped.
* Audit log model blocks all update/delete paths; sensitive keys (`password`, `token`, `secret`, `hash`) are stripped from audit details. Error responses never include stack traces.
* No admin self-registration; secrets validated at startup; seed refuses to run in production; `.env` files are git-ignored.

## Troubleshooting
| Symptom | Fix |
|---|---|
| API exits with *Invalid configuration* | Set both secrets in `backend/.env` (≥ 32 chars, not the placeholder). |
| `MongooseServerSelectionError` | MongoDB isn't running / wrong URI / Atlas IP not allow-listed. |
| Login works but next request is 401 | `CLIENT_URL` must equal the browser origin exactly; use the same host (`localhost`) for web and API; cookies need `COOKIE_SAMESITE=none` + HTTPS only for cross-site. |
| 403 `CSRF_INVALID` | Reload the page (token is issued at login/`me`); don't call the API from another origin. |
| `USE_TRANSACTIONS=true` fails at start | Your MongoDB isn't a replica set; use Option C/Atlas or set `auto`. |
| Seed says “already contains data” | Intentional. Run `npm run seed:reset` on a dev database. |
| WhatsApp doesn't open | Allow pop-ups for the site; install/sign in to WhatsApp Web or Desktop; check the number has the right country code in *Settings*. |
| New khata data missing after updating the code | The seed only fills an empty database. Run `npm run seed:reset` once on your **development** database to regenerate demo customers. |
| Camera scan unavailable | Needs HTTPS/localhost and a `BarcodeDetector` browser; use USB scanner or the manual field. |
| Tests hang on first run | mongodb-memory-server is downloading MongoDB; wait or pre-set `MONGOMS_SYSTEM_BINARY`. |

## Limitations and future improvements
* **Cash and khata credit only** (no card/wallet). WhatsApp sharing uses click-to-chat: it opens a pre-filled message but cannot send automatically or confirm delivery (that would need the paid WhatsApp Business API).
* Khata has no interest/penalties, due dates or instalment plans; a customer's balance is a single running total (credit limit enforced per customer).
* Voids are **full-sale only**; partial returns/refunds per line are not implemented.
* Single store, single currency at a time; no supplier/purchase-order module (forecast only *suggests* orders); no customer accounts/loyalty.
* On standalone MongoDB the fallback is compensating (best-effort undo), not ACID: a process crash mid-sale could leave stock decremented without a sale. Use a replica set/Atlas in production.
* Receipt numbers may have gaps if a transaction aborts after the counter increments (standalone mode).
* Forecasts are simple moving-average rules: no seasonality, promotions or trend modelling.
* PDF export is not included (CSV only); print uses the browser's print dialog; no ESC/POS thermal driver.
* Future: purchase orders & suppliers, partial returns, multi-store, barcode label printing, email/WhatsApp low-stock alerts, PWA offline mode.

## University demonstration checklist
- [ ] MongoDB running (replica set/Atlas preferred) and `backend/.env` + `frontend/.env` created; `npm install` done
- [ ] `npm run seed` (or `seed:reset`) printed demo credentials; `npm run dev` shows API + web ready
- [ ] Login as admin, show Dashboard (hero + credit KPIs); toggle light/dark theme
- [ ] POS: barcode/keyboard add, discount, cash/change, complete sale, print receipt
- [ ] Khata: credit sale at POS, limit block, record payment, statement, WhatsApp receipt & reminder
- [ ] Show stock deduction in Inventory + Stock Movements; void a sale and show restoration
- [ ] Expiry alerts, FEFO explanation, record wastage, show cost impact
- [ ] Reports: profit definitions, wastage shown separately, slow-moving reasons, reorder forecast with formulas
- [ ] Login as cashier: restricted menu; show a 403 from an admin API call; show Audit Logs as admin
- [ ] Run `npm test` and `npm run build`; present limitations honestly