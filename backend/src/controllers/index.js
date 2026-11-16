const asyncHandler = require('../utils/asyncHandler');
const authService = require('../services/authService');
const productService = require('../services/productService');
const categoryService = require('../services/categoryService');
const saleService = require('../services/saleService');
const inventoryService = require('../services/inventoryService');
const reportService = require('../services/reportService');
const forecastService = require('../services/forecastService');
const employeeService = require('../services/employeeService');
const auditQueryService = require('../services/auditQueryService');
const settingsService = require('../services/settingsService');
const customerService = require('../services/customerService');
const { ok, paged, withDates } = require('./helpers');
const { dbState } = require('../config/db');

const q = (req) => req.validatedQuery;
const wrap = (obj) => Object.fromEntries(Object.entries(obj).map(([k, fn]) => [k, asyncHandler(fn)]));

const auth = wrap({
  async login(req, res) {
    const { user, token, csrfToken } = await authService.login(req.body.email, req.body.password);
    authService.setSessionCookie(res, token);
    ok(res, { user: user.toSafeJSON(), csrfToken });
  },
  async logout(req, res) { authService.clearSessionCookie(res); ok(res, { loggedOut: true }); },
  async me(req, res) { ok(res, { user: req.user.toSafeJSON(), csrfToken: req.csrfToken }); },
});

const products = wrap({
  async list(req, res) { const r = await productService.list(q(req), req.user.role); paged(res, r, q(req)); },
  async get(req, res) { ok(res, await productService.getById(req.params.id, req.user.role)); },
  async barcode(req, res) { ok(res, await productService.byBarcode(req.params.code, req.user.role)); },
  async create(req, res) { ok(res, await productService.create(req, req.body), null, 201); },
  async update(req, res) { ok(res, await productService.update(req, req.params.id, req.body)); },
  async status(req, res) { ok(res, await productService.setStatus(req, req.params.id, req.body.isActive)); },
});

const categories = wrap({
  async list(req, res) { ok(res, await categoryService.list()); },
  async create(req, res) { ok(res, await categoryService.create(req, req.body), null, 201); },
  async update(req, res) { ok(res, await categoryService.update(req, req.params.id, req.body)); },
  async remove(req, res) { await categoryService.remove(req, req.params.id); ok(res, { deleted: true }); },
});

const sales = wrap({
  async checkout(req, res) { const r = await saleService.checkout(req, req.body); ok(res, { sale: r.sale, duplicate: r.duplicate }, null, r.duplicate ? 200 : 201); },
  async list(req, res) { const query = await withDates(q(req)); const r = await saleService.list(req, query); paged(res, r, query); },
  async get(req, res) { ok(res, await saleService.getById(req, req.params.id)); },
  async receipt(req, res) { ok(res, await saleService.receipt(req, req.params.id)); },
  async void(req, res) { ok(res, await saleService.voidSale(req, req.params.id, req.body.reason)); },
});

const inventory = wrap({
  async stock(req, res) { const r = await inventoryService.listStock(q(req)); paged(res, r, q(req)); },
  async movements(req, res) { const query = await withDates(q(req)); paged(res, await inventoryService.listMovements(query), query); },
  async receipt(req, res) { const r = await inventoryService.receiveStock(req, req.body); ok(res, r, null, r.duplicate ? 200 : 201); },
  async adjust(req, res) { const r = await inventoryService.adjustStock(req, req.body); ok(res, r, null, r.duplicate ? 200 : 201); },
  async wastage(req, res) { const r = await inventoryService.recordWastage(req, req.body); ok(res, r, null, r.duplicate ? 200 : 201); },
});

const expiry = wrap({
  async batches(req, res) { paged(res, await inventoryService.listBatches(q(req)), q(req)); },
  async alerts(req, res) { ok(res, await inventoryService.expiryAlerts()); },
});

const reports = wrap({
  async dashboard(req, res) { ok(res, await reportService.dashboard(q(req))); },
  async sales(req, res) { ok(res, await reportService.salesReport(q(req))); },
  async profit(req, res) { ok(res, await reportService.profitReport(q(req))); },
  async products(req, res) { ok(res, await reportService.productsReport(q(req))); },
  async stock(req, res) { ok(res, await reportService.stockReport()); },
});

const customers = wrap({
  async list(req, res) { paged(res, await customerService.list(q(req)), q(req)); },
  async create(req, res) { ok(res, await customerService.create(req, req.body), null, 201); },
  async get(req, res) { ok(res, await customerService.getById(req.params.id)); },
  async update(req, res) { ok(res, await customerService.update(req, req.params.id, req.body)); },
  async status(req, res) { ok(res, await customerService.setStatus(req, req.params.id, req.body.isActive)); },
  async ledger(req, res) { paged(res, await customerService.ledger(req.params.id, q(req)), q(req)); },
  async statement(req, res) { ok(res, await customerService.statement(req.params.id, q(req))); },
  async payment(req, res) { const r = await customerService.recordPayment(req, req.params.id, req.body); ok(res, r, null, r.duplicate ? 200 : 201); },
  async adjust(req, res) { const r = await customerService.adjust(req, req.params.id, req.body); ok(res, r, null, r.duplicate ? 200 : 201); },
});

const forecasting = wrap({ async reorder(req, res) { ok(res, await forecastService.reorderRecommendations(q(req))); } });

const employees = wrap({
  async list(req, res) { paged(res, await employeeService.list(q(req)), q(req)); },
  async create(req, res) { ok(res, await employeeService.create(req, req.body), null, 201); },
  async update(req, res) { ok(res, await employeeService.update(req, req.params.id, req.body)); },
  async status(req, res) { ok(res, await employeeService.setStatus(req, req.params.id, req.body.isActive)); },
});

const audit = wrap({ async list(req, res) { const query = await withDates(q(req)); paged(res, await auditQueryService.list(query), query); } });

const settings = wrap({
  async get(req, res) { const s = await settingsService.get(); ok(res, req.user.role === 'admin' ? s : settingsService.toPublic(s)); },
  async update(req, res) { ok(res, await settingsService.update(req, req.body)); },
});

const health = (req, res) => ok(res, { status: 'ok', transactions: dbState.transactions, time: new Date().toISOString() });

module.exports = { customers, auth, products, categories, sales, inventory, expiry, reports, forecasting, employees, audit, settings, health };
