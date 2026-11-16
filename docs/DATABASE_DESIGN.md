# Database Design

MongoDB via Mongoose 8. Money is stored as JavaScript numbers rounded to 2 decimals (all arithmetic is performed in integer minor units in `utils/money.js`/`pricing.js`). Quantities are numbers (3-decimal precision for weighed goods).

## Collections
| Collection | Purpose | Notable fields / rules |
|---|---|---|
| `users` | Admins & cashiers | `email` unique lowercase, `passwordHash` (`select:false`), `role` enum, `isActive`, `failedLogins`, `lockedUntil`, `tokenVersion` (invalidates sessions on role/password/deactivation change) |
| `categories` | Product groups | `name` unique (case-insensitive collation), `nameUr`, `isActive` |
| `products` | Catalogue | `sku` unique uppercase; `barcode` **unique only when present** (partial index on `$type:'string'`); `category` ref; `unit` enum; `sellingPrice`/`costPrice` ≥ 0; `reorderThreshold`; optional `leadTimeDays`, `safetyStock`, `taxRate`; `trackExpiry`; `isActive` (archive instead of delete); text index on name/nameUr/sku |
| `inventorybatches` | All stock | `product`, `lotNumber` (unique per product), `receivedDate`, `expiryDate` (null = no expiry), `quantityReceived`, `remainingQuantity ≥ 0`, `costPrice`. Index `{product, remainingQuantity, expiryDate, receivedDate}` serves FEFO |
| `sales` | Transactions | unique `receiptNumber`; unique sparse `clientRequestId` (idempotency); `cashier` ref + `cashierName`; `items[]` snapshots with `allocations[]`; `subtotal`, `discountTotal`, `taxTotal`, `total`, `netRevenue`, `cogs`, `grossProfit`; `payment{method,amountReceived,change}`; `status` (`completed`/`voided`); `paymentStatus` (`paid`/`refunded`); void metadata |
| `stockmovements` | Immutable stock ledger | `type` (opening, receipt, sale, void_return, adjustment_in/out, wastage), signed `quantity`, `unitCost`, `batch`, `lotNumber`, `reason`, `wastageReason`, `user`, `sale` ref, unique sparse `requestId` |
| `auditlogs` | Append-only audit trail | actor, action, resource, `before`/`after` (sanitised), `ip`; Mongoose hooks reject every update/delete operation |
| `customers` | Khata customers | `name`, `phone` (normalised, unique when present), `address`, `notes`, `creditLimitCents` (0 = no credit), `balanceCents` (integer paisa; > 0 owes, < 0 advance), `lastPaymentAt`, `isActive` |
| `ledgerentries` | Append-only customer ledger | `customer`, `type` (charge/payment/adjustment/void_reversal), signed `amount`, `balanceAfter`, `sale` + `receiptNumber`, `note`, `user`, unique sparse `requestId` |
| `settings` | Singleton (`key:'store'`) | store info, currency, timezone, tax, discount limit, near-expiry days, forecasting & slow-mover parameters |
| `counters` | Justified extra | atomic daily receipt sequence (`receipt-YYYYMMDD`) |

**Reconciliation invariants:** for every batch, `Σ movements.quantity = remainingQuantity`; for every customer, `Σ ledger amounts = balance` and every entry's `balanceAfter` equals the running total.

**Credit atomicity:** `balanceCents` is an integer updated with `$inc`; the credit-limit check is part of the filter (`$expr: balance + credit ≤ limit`), so it is race-free. Sales additionally store `customer`, `customerName/Phone` and `customerBalanceAfter` snapshots plus `payment.creditAmount`; `paymentStatus` is `paid | partial | unpaid | refunded`. The seed verifies this before writing, and an integration test checks it after sales, a void and an adjustment.

## Relationships
`Customer 1—* LedgerEntry`, `Customer 1—* Sale` (optional), `Sale 1—* LedgerEntry`, `Product 1—* InventoryBatch`, `Product 1—* StockMovement`, `Category 1—* Product`, `User 1—* Sale`, `Sale 1—* StockMovement`. Sale items copy product data, so deleting/archiving or repricing products never changes history; products referenced by sales cannot be deleted (there is no delete endpoint — only archive).

## Indexes (summary)
users.email · categories.name(ci) · products.sku, products.barcode(partial), products.category, text · batches {product,lotNumber} unique, FEFO compound, expiryDate · sales.receiptNumber, clientRequestId(sparse), cashier, createdAt, {status,createdAt}, {items.product,createdAt} · movements product, batch, type, sale, createdAt, requestId(sparse) · auditlogs action, resource, createdAt.

## Consistency and transactions
`services/txService.js#runAtomic` selects the strategy at runtime (detected at startup, logged, and exposed on `/api/v1/health`):

* **Replica set / Atlas (`dbState.transactions = true`)** — checkout, void, receipt, adjustment, wastage and opening-stock creation run inside `session.withTransaction()`; any error aborts everything. Transient errors are retried by the driver, so the work functions are re-runnable.
* **Standalone mongod (fallback)** — no sessions. Each stock decrement is a single conditional atomic update (`remainingQuantity ≥ qty`), so overselling is impossible even under concurrency. Every side effect registers an undo; on any failure the undos run in reverse (restore batch quantities, delete the sale and its movements). Failures during rollback are logged loudly (never silent). Residual risk: a process crash between the steps cannot be undone — documented, and the reason production should use a replica set.
* `USE_TRANSACTIONS=true` makes the API refuse to start without transactions; `false` forces the fallback (used by the standalone test suite).
* Duplicate-submission protection: unique sparse keys (`sales.clientRequestId`, `stockmovements.requestId`); a duplicate-key race returns the original record.

## Seed data
`backend/src/scripts/seedData.js` is a pure, deterministic generator (seeded PRNG) that simulates 45 trading days against in-memory batches with FEFO + the production pricing code: restocking cycles, expiring lots, write-offs of long-expired lots, two voided sales, damaged/spoiled wastage, one stock-count correction, low/out-of-stock products, a slow mover, a dead-stock item and a brand-new product. Records are inserted with their historical `createdAt` through the native driver (Mongoose treats `createdAt` as immutable).
