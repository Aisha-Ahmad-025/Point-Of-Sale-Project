# SwiftShelf POS — Project Overview

**Goal.** A working point-of-sale and inventory system for one mini mart, built as a university-level MERN project: not a mock-up — every screen is backed by the API and MongoDB.

## Users and roles
| Role | Can do |
|---|---|
| **Admin** | Everything: products, categories, inventory (receive/adjust/wastage), sales (incl. void), reports, forecasting, employees, audit logs, settings, unlimited discounts. |
| **Cashier** | POS checkout (cash), product lookup, receipts, *own* sales history (no cost/profit data), discounts up to the store limit (default 5 %). |

## Core business rules
1. **Server decides money.** Client sends `{productId, quantity, discountPercent?}` + cash received + a request id. The server loads prices, applies discount (to the gross line), then tax (exclusive) to the discounted net, in integer paisa.
2. **No overselling / no expired sales.** Allocation is FEFO over batches with `remaining > 0` and (`expiry` null or `expiry ≥ store-local today`). Each deduction is a conditional atomic update. Stock expiring *today* is still sellable.
3. **Snapshots.** Sale items store name, SKU, unit price, discount, tax, weighted unit cost and the exact batch allocations — later price/cost edits never rewrite history.
4. **Idempotency.** Duplicate checkout submissions with the same request id return the first sale (`duplicate:true`); same for receipts, adjustments and wastage.
5. **Voids** are admin-only and full-sale: status → `voided`, stock returns to the *same* batches, `void_return` movements are written, reports exclude the sale.
6. **Audit.** Product/price changes, stock receipts/adjustments/wastage, sales, voids, employee changes and settings updates are logged with actor and before/after (no secrets). The model blocks updates/deletes.

## Financial definitions
* `Net revenue = Σ (gross − discount)` per line, **excluding sales tax**.
* `COGS = Σ allocated quantity × batch cost` (cost snapshot at sale time).
* `Gross profit = Net revenue − COGS`; `Gross margin % = Gross profit ÷ Net revenue × 100` (only when revenue > 0).
* **Discounts** lower revenue, not cost. **Tax** is never revenue or profit. **Voided sales** are excluded entirely.
* **Wastage** is *not* inside COGS or gross profit; it is reported separately (`quantity × batch cost`) and `grossProfitAfterWastage = grossProfit − wastageCost` is shown as its own figure.

## Forecasting rules (rule-based, no ML)
```
avgDailyDemand = unitsSold(window) ÷ sellingDays      sellingDays excludes days that closed with zero stock and no sales,
                                                      and is capped by product age (new products use their real history)
reorderPoint   = avgDailyDemand × leadTimeDays + safetyStock
targetStock    = avgDailyDemand × coverageDays + safetyStock
suggestedQty   = max(0, ceil(targetStock − sellableStock))
daysRemaining  = sellableStock ÷ avgDailyDemand   (null when no demand)
risk           = out (no stock) | high (daysRemaining < lead time) | medium (stock ≤ ROP) | low
```
Window, coverage, default lead time and safety stock are configurable (per product overrides for lead time and safety stock). Fewer than 7 days of history → flagged “little history”. Voided sales are excluded; availability uses *sellable* (non-expired) stock.

**Slow-moving classification** (`new → no_stock → dead → slow → normal`): products younger than the grace period are never flagged; products with no sellable stock get no verdict; `dead` = zero sales in the window and idle ≥ N days; `slow` = velocity below the threshold. Each result carries a reason shown in the UI.

## Customer credit (khata) rules
1. A sale may carry an optional `customerId`. If the cash handed over is **less than the total**, the shortfall is put on that customer's khata (`payment.method` = `credit` when no cash was paid, `partial` otherwise). Without a customer, short cash is still rejected.
2. The credit limit is enforced **atomically**: `balance + credit ≤ limit` is part of the update filter, so concurrent sales can never exceed it. A limit of 0 means no credit. Inactive customers cannot buy on credit.
3. Every change to a balance writes an append-only **ledger entry** (`charge`, `payment`, `adjustment`, `void_reversal`) with the running balance, receipt number, employee and a duplicate-protection request id. Invariant: sum of a customer's entries = stored balance.
4. **Payments** (cashier or admin) cannot exceed the outstanding balance. **Adjustments / write-offs** are admin-only, need a reason, are audited and can never push the balance below zero.
5. **Voiding** a (part-)credit sale reverses its charge; if the customer had already paid, the balance can go negative and is shown as an **advance**.
6. Revenue and profit are recognised at the time of sale (accrual). The dashboard separates *cash collected at the till*, *credit given* and *khata payments collected*.
7. Cashiers can add customers (they get the store's default limit) and collect payments, but cannot set/raise limits, adjust balances or deactivate customers.

## WhatsApp sharing
No API key is used. **Receipts go out as a PDF**: the browser builds the file (`pdf-lib`, loaded lazily), then either opens the native share sheet with the PDF attached (phones/tablets via the Web Share API) or downloads it and opens `https://wa.me/<number>?text=<caption>` so the cashier attaches it with the paperclip. WhatsApp's click-to-chat link can never attach a file by itself and cannot send automatically — fully automatic delivery would need the paid WhatsApp Business Cloud API with a server. Numbers are normalised with the store's country code (`0300…` → `92300…`). Payment confirmations, balance reminders and statement summaries are plain-text messages.

## Voice assistant
Free and key-less: browser speech recognition and speech synthesis (Web Speech API) around a local rule-based command parser. Intents: navigate, POS (add/remove/clear/customer/cash/credit/checkout), questions (sales, profit, transactions, low stock, expiry, best seller, who owes most, outstanding khata), theme, help. Role-aware (cashiers cannot ask admin questions or open admin pages). Irreversible actions are never executed by voice: checkout only opens the confirmation dialog. Audio is handled by the browser vendor's speech service and is not stored by SwiftShelf.

## Interface language
The app is **English-only**. `i18next` is kept only as an organised text catalogue (`frontend/src/i18n/locales/en/{common,pages}.json`) so UI text is not scattered through components. Currency (default PKR) and time zone come from Settings; dates and numbers use `Intl` (`en-PK`). SKUs, barcodes, e-mails and receipt numbers are isolated with `dir="ltr"`.
