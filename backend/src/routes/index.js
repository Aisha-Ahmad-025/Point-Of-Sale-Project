const express = require('express');
const c = require('../controllers');
const v = require('../validators/schemas');
const validate = require('../middleware/validate');
const { authenticate, admin, anyRole } = require('../middleware/auth');
const { loginLimiter } = require('../middleware/rateLimit');

const r = express.Router();
const secure = express.Router();
const id = { params: v.idParam };

r.get('/health', c.health);

// Auth
r.post('/auth/login', loginLimiter, validate({ body: v.login }), c.auth.login);
r.post('/auth/logout', c.auth.logout);
r.get('/auth/me', authenticate, c.auth.me);

// Products (cashiers may search/look up; only admins may write)
secure.get('/products', authenticate, anyRole, validate({ query: v.productList }), c.products.list);
secure.get('/products/barcode/:code', authenticate, anyRole, c.products.barcode);
secure.post('/products', authenticate, admin, validate({ body: v.productCreate }), c.products.create);
secure.get('/products/:id', authenticate, anyRole, validate(id), c.products.get);
secure.patch('/products/:id', authenticate, admin, validate({ ...id, body: v.productUpdate }), c.products.update);
secure.patch('/products/:id/status', authenticate, admin, validate({ ...id, body: v.status }), c.products.status);

// Categories
secure.get('/categories', authenticate, anyRole, c.categories.list);
secure.post('/categories', authenticate, admin, validate({ body: v.category }), c.categories.create);
secure.patch('/categories/:id', authenticate, admin, validate({ ...id, body: v.category.partial() }), c.categories.update);
secure.delete('/categories/:id', authenticate, admin, validate(id), c.categories.remove);

// Sales
secure.post('/sales', authenticate, anyRole, validate({ body: v.checkout }), c.sales.checkout);
secure.get('/sales', authenticate, anyRole, validate({ query: v.saleList }), c.sales.list);
secure.get('/sales/:id', authenticate, anyRole, validate(id), c.sales.get);
secure.get('/sales/:id/receipt', authenticate, anyRole, validate(id), c.sales.receipt);
secure.post('/sales/:id/void', authenticate, admin, validate({ ...id, body: v.voidBody }), c.sales.void);

// Inventory
secure.get('/inventory/stock', authenticate, admin, validate({ query: v.stockList }), c.inventory.stock);
secure.get('/inventory/movements', authenticate, admin, validate({ query: v.movementList }), c.inventory.movements);
secure.post('/inventory/receipts', authenticate, admin, validate({ body: v.receipt }), c.inventory.receipt);
secure.post('/inventory/adjustments', authenticate, admin, validate({ body: v.adjustment }), c.inventory.adjust);
secure.post('/inventory/wastage', authenticate, admin, validate({ body: v.wastage }), c.inventory.wastage);

// Expiry
secure.get('/expiry/batches', authenticate, admin, validate({ query: v.batchList }), c.expiry.batches);
secure.get('/expiry/alerts', authenticate, admin, c.expiry.alerts);

// Reports & forecasting
secure.get('/reports/dashboard', authenticate, admin, validate({ query: v.range }), c.reports.dashboard);
secure.get('/reports/sales', authenticate, admin, validate({ query: v.range }), c.reports.sales);
secure.get('/reports/profit', authenticate, admin, validate({ query: v.range }), c.reports.profit);
secure.get('/reports/products', authenticate, admin, validate({ query: v.range }), c.reports.products);
secure.get('/reports/stock', authenticate, admin, c.reports.stock);
secure.get('/forecasting/reorder', authenticate, admin, validate({ query: v.reorder }), c.forecasting.reorder);

// Customers and credit ledger (khata). Cashiers can add customers and collect payments; admins control limits and adjustments.
secure.get('/customers', authenticate, anyRole, validate({ query: v.customerList }), c.customers.list);
secure.post('/customers', authenticate, anyRole, validate({ body: v.customerCreate }), c.customers.create);
secure.get('/customers/:id', authenticate, anyRole, validate(id), c.customers.get);
secure.patch('/customers/:id', authenticate, anyRole, validate({ ...id, body: v.customerUpdate }), c.customers.update);
secure.patch('/customers/:id/status', authenticate, admin, validate({ ...id, body: v.status }), c.customers.status);
secure.get('/customers/:id/ledger', authenticate, anyRole, validate({ ...id, query: v.ledgerList }), c.customers.ledger);
secure.get('/customers/:id/statement', authenticate, anyRole, validate({ ...id, query: v.statementQuery }), c.customers.statement);
secure.post('/customers/:id/payments', authenticate, anyRole, validate({ ...id, body: v.customerPayment }), c.customers.payment);
secure.post('/customers/:id/adjustments', authenticate, admin, validate({ ...id, body: v.customerAdjustment }), c.customers.adjust);

// Employees
secure.get('/employees', authenticate, admin, validate({ query: v.employeeList }), c.employees.list);
secure.post('/employees', authenticate, admin, validate({ body: v.employeeCreate }), c.employees.create);
secure.patch('/employees/:id', authenticate, admin, validate({ ...id, body: v.employeeUpdate }), c.employees.update);
secure.patch('/employees/:id/status', authenticate, admin, validate({ ...id, body: v.status }), c.employees.status);

// Audit logs (read-only) and settings
secure.get('/audit-logs', authenticate, admin, validate({ query: v.auditList }), c.audit.list);
secure.get('/settings', authenticate, anyRole, c.settings.get);
secure.put('/settings', authenticate, admin, validate({ body: v.settings }), c.settings.update);

r.use(secure);

module.exports = r;
