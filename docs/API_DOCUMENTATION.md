# API Documentation

Base URL: `http://localhost:5000/api/v1` · JSON · cookie session.

## Conventions
* Success: `{ "success": true, "data": …, "meta": { "total", "page", "limit", "pages", … } }`
* Error: `{ "success": false, "error": { "code": "INSUFFICIENT_STOCK", "message": "…", "details": … } }`
* Status codes: 200/201 OK/created · 400 validation · 401 unauthenticated · 403 forbidden (role, discount limit, CSRF) · 404 · 409 conflict (duplicate, insufficient stock, in use) · 423 locked account · 429 rate limited · 500 (no stack traces).
* **Auth:** `POST /auth/login` sets the `ss_token` HttpOnly cookie and returns `csrfToken`. Send the cookie (`credentials: include`) and, on every POST/PUT/PATCH/DELETE, the header `X-CSRF-Token: <csrfToken>`.
* Pagination: `?page=1&limit=20` (limit ≤ 100). Dates: `YYYY-MM-DD` interpreted in the store time zone (`from` inclusive, `to` inclusive).
* Roles: **A** = admin, **C** = cashier.

## Auth
| Method & path | Role | Notes |
|---|---|---|
| `POST /auth/login` | public | `{email,password}` → `{user, csrfToken}`; 10 attempts/15 min/IP, lock after 5 failures |
| `POST /auth/logout` | any | clears the cookie |
| `GET /auth/me` | A,C | `{user, csrfToken}` |

## Products & categories
| Method & path | Role | Notes |
|---|---|---|
| `GET /products` | A,C | `q, category, status(active\|inactive\|all), stock(low\|out\|in), sort, page, limit`; includes `stock{onHand,sellable,expired,value,nextExpiry}`; cashiers don't receive `costPrice` |
| `POST /products` | A | `name,nameUr?,sku,barcode?,category,unit,sellingPrice,costPrice,reorderThreshold,leadTimeDays?,safetyStock?,taxRate?,trackExpiry,openingStock?{quantity,lotNumber?,expiryDate?}` |
| `GET /products/:id` · `GET /products/barcode/:code` | A,C | barcode lookup matches barcode or SKU of active products |
| `PATCH /products/:id` | A | partial update; price changes audited as `product.price_change` |
| `PATCH /products/:id/status` | A | `{isActive}` archive/restore |
| `GET /categories` | A,C | with `productCount` |
| `POST /categories` · `PATCH /categories/:id` · `DELETE /categories/:id` | A | delete returns 409 `CATEGORY_IN_USE` if any product references it |

## Sales
| Method & path | Role | Notes |
|---|---|---|
| `POST /sales` | A,C | `{clientRequestId, items:[{productId, quantity, discountPercent?}], amountReceived, customerId?}` → `{sale, duplicate}`. With a `customerId`, cash below the total puts the rest on the customer's khata (`payment.creditAmount`). Totals are computed server-side; client totals are ignored. Errors: `INSUFFICIENT_STOCK`, `PAYMENT_INSUFFICIENT`, `CREDIT_LIMIT_EXCEEDED`, `CUSTOMER_INACTIVE`, `CUSTOMER_NOT_FOUND`, `DISCOUNT_NOT_ALLOWED`, `PRODUCT_INACTIVE`, `WHOLE_UNITS_ONLY`, `STOCK_CHANGED` |
| `GET /sales` | A,C | `q(receipt), status, cashier(A), from, to`; cashiers: own sales only; `meta.summary` |
| `GET /sales/:id` · `GET /sales/:id/receipt` | A,C | receipt = `{store, sale}`; cashiers: own only, no cost/profit fields |
| `POST /sales/:id/void` | A | `{reason}` restores stock to the original batches |

## Customers & khata
| Method & path | Role | Notes |
|---|---|---|
| `GET /customers` | A,C | `q(name/phone), status, owing` ; `meta.summary{outstanding, customersOwing}`; each customer has `balance, creditLimit, available` |
| `POST /customers` | A,C | `{name, phone?, address?, notes?, creditLimit?}`. Cashiers get the store default limit and receive 403 `CREDIT_LIMIT_ADMIN_ONLY` if they send `creditLimit` |
| `GET /customers/:id` · `PATCH /customers/:id` | A,C | cashiers cannot change `creditLimit` |
| `PATCH /customers/:id/status` | A | `{isActive}` |
| `GET /customers/:id/ledger` | A,C | `type, page, limit`, newest first |
| `GET /customers/:id/statement` | A,C | `from,to` → `{customer, store, range, openingBalance, entries[], closingBalance, totals}` |
| `POST /customers/:id/payments` | A,C | `{amount, note?, requestId}`; 409 `OVERPAYMENT` if more than owed; idempotent per `requestId` |
| `POST /customers/:id/adjustments` | A | `{amount(+/-), reason, requestId}`; 409 `NEGATIVE_BALANCE` |

## Inventory & expiry (admin)
| Method & path | Notes |
|---|---|
| `GET /inventory/stock` | `q, category, status(low\|out\|expired\|near), includeInactive`; `meta.summary` valuation |
| `GET /inventory/movements` | `product, type, from, to` |
| `POST /inventory/receipts` | `{productId, quantity, costPrice?, lotNumber?, expiryDate?, receivedDate?, note?, requestId}` creates a new batch |
| `POST /inventory/adjustments` | `{batchId, mode:'delta'\|'set', quantity, reason, requestId}`; never negative |
| `POST /inventory/wastage` | `{batchId, quantity, reason:'expired'\|'damaged'\|'spoiled'\|'other', note?, requestId}` → includes `cost` |
| `GET /expiry/batches` | `status(expired\|near\|ok), product, q, includeEmpty` |
| `GET /expiry/alerts` | `{expired[], near[], expiredValue, nearValue, nearExpiryDays}` |

`requestId` (8–100 chars) makes each write idempotent: a repeat returns `200` with `duplicate:true` instead of applying twice.

## Reports & forecasting (admin)
`GET /reports/dashboard?from&to` (now also returns `payments[]` split into cash/credit and `credit{outstanding, customersOwing, collected, collections}`) · `GET /reports/sales?from&to&groupBy=day|week|month` (with previous-period comparison) · `GET /reports/profit?from&to` (totals, `wastage`, `grossProfitAfterWastage`, `definitions`, per-product) · `GET /reports/products?from&to&class=` (classification + reasonKey) · `GET /reports/stock` · `GET /forecasting/reorder?windowDays&coverageDays&risk&q&onlyActionable` (rows with `avgDailyDemand, daysRemaining, reorderPoint, targetStock, suggestedQty, risk, reasonKey, insufficientHistory, basis, estimated:true`, plus `formulas` and `disclaimer`).

## Employees, audit, settings
* `GET/POST /employees`, `PATCH /employees/:id` (name, email, role, password), `PATCH /employees/:id/status` — admin; blocks self-deactivation, self-role-change and removing the last active admin; role/password/deactivation invalidate existing sessions.
* `GET /audit-logs` — admin, read-only: `q, action(prefix e.g. sale|product|inventory), resource, actor, from, to`.
* `GET /settings` — A (full) / C (public subset). `PUT /settings` — A, strict partial update (unknown keys rejected).
* `GET /health` — `{status, transactions, time}`.
