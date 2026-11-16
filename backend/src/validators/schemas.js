const { z } = require('zod');

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');
const num = (min = 0, max = 100000000) => z.coerce.number().finite().min(min).max(max);
const qty = z.coerce.number().finite().positive().max(1000000).transform((v) => Math.round(v * 1000) / 1000);
const optText = (max) => z.string().trim().max(max).optional();
const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}/, 'Use YYYY-MM-DD');
const requestId = z.string().min(8).max(100);
const bool = z.union([z.boolean(), z.enum(['true', 'false']).transform((v) => v === 'true')]);

const page = { page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(100).default(20) };
const dates = { from: dateStr.optional(), to: dateStr.optional() };

const idParam = z.object({ id: objectId });

// ---- auth
const login = z.object({ email: z.string().trim().toLowerCase().email().max(120), password: z.string().min(1).max(200) });

// ---- categories
const category = z.object({ name: z.string().trim().min(1).max(60), description: optText(300), isActive: z.boolean().optional() });

// ---- products
const productBase = z.object({
  name: z.string().trim().min(1).max(120),
  sku: z.string().trim().min(1).max(40),
  barcode: z.string().trim().max(40).optional().nullable(),
  category: objectId,
  description: optText(500),
  unit: z.enum(['pcs', 'kg', 'g', 'l', 'ml', 'pack', 'box', 'dozen']).default('pcs'),
  sellingPrice: num(),
  costPrice: num(),
  reorderThreshold: num(0, 1000000).default(0),
  leadTimeDays: num(0, 365).nullable().optional(),
  safetyStock: num(0, 1000000).nullable().optional(),
  taxRate: num(0, 100).nullable().optional(),
  trackExpiry: z.boolean().default(false),
});
const productCreate = productBase.extend({
  openingStock: z.object({ quantity: qty, lotNumber: optText(40), expiryDate: dateStr.optional().nullable() }).optional(),
});
const productUpdate = productBase.partial().extend({ unit: productBase.shape.unit.optional(), trackExpiry: z.boolean().optional(), reorderThreshold: num(0, 1000000).optional() });
const productList = z.object({
  ...page, q: z.string().trim().max(80).optional(), category: objectId.optional(), status: z.enum(['active', 'inactive', 'all']).optional(),
  stock: z.enum(['low', 'out', 'in']).optional(), sort: z.enum(['name', '-name', 'price', '-price', 'newest', 'sku']).optional(),
});
const status = z.object({ isActive: z.boolean() });

// ---- sales
const checkout = z.object({
  clientRequestId: requestId,
  items: z.array(z.object({ productId: objectId, quantity: qty, discountPercent: num(0, 100).optional() })).min(1).max(100),
  amountReceived: num(0, 1000000000),
  customerId: objectId.optional(),
  paymentMethod: z.literal('cash').optional(),
});
const saleList = z.object({ ...page, ...dates, customer: objectId.optional(), credit: bool.optional(), q: z.string().trim().max(40).optional(), status: z.enum(['completed', 'voided']).optional(), cashier: objectId.optional() });
const voidBody = z.object({ reason: z.string().trim().min(3).max(200) });

// ---- inventory
const receipt = z.object({
  productId: objectId, quantity: qty, costPrice: num().optional(), lotNumber: optText(40), expiryDate: dateStr.optional().nullable(),
  receivedDate: dateStr.optional(), note: optText(200), requestId,
});
const adjustment = z.object({
  batchId: objectId, mode: z.enum(['delta', 'set']).default('delta'), quantity: z.coerce.number().finite().min(-1000000).max(1000000), reason: z.string().trim().min(3).max(200), requestId,
}).refine((d) => d.mode !== 'set' || d.quantity >= 0, { message: 'Counted quantity cannot be negative', path: ['quantity'] });
const wastage = z.object({ batchId: objectId, quantity: qty, reason: z.enum(['expired', 'damaged', 'spoiled', 'other']), note: optText(200), requestId });
const stockList = z.object({ ...page, q: z.string().trim().max(80).optional(), category: objectId.optional(), status: z.enum(['low', 'out', 'expired', 'near', 'all']).optional(), includeInactive: bool.optional() });
const movementList = z.object({ ...page, ...dates, product: objectId.optional(), type: z.enum(['opening', 'receipt', 'sale', 'void_return', 'adjustment_in', 'adjustment_out', 'wastage']).optional() });
const batchList = z.object({ ...page, q: z.string().trim().max(80).optional(), product: objectId.optional(), status: z.enum(['expired', 'near', 'ok', 'all']).optional(), includeEmpty: bool.optional() });

// ---- reports / forecasting
const range = z.object({ ...dates, groupBy: z.enum(['day', 'week', 'month']).optional(), class: z.enum(['new', 'no_stock', 'dead', 'slow', 'normal']).optional() });
const reorder = z.object({
  q: z.string().trim().max(80).optional(), risk: z.enum(['out', 'high', 'medium', 'low']).optional(),
  windowDays: z.coerce.number().int().min(7).max(365).optional(), coverageDays: z.coerce.number().int().min(1).max(180).optional(), onlyActionable: bool.optional(),
});

// ---- employees
const password = z.string().min(8, 'At least 8 characters').max(100).regex(/[A-Za-z]/, 'Must contain a letter').regex(/\d/, 'Must contain a number');
const employeeCreate = z.object({ name: z.string().trim().min(2).max(80), email: z.string().trim().toLowerCase().email().max(120), role: z.enum(['admin', 'cashier']).default('cashier'), password });
const employeeUpdate = z.object({ name: z.string().trim().min(2).max(80).optional(), email: z.string().trim().toLowerCase().email().max(120).optional(), role: z.enum(['admin', 'cashier']).optional(), password: password.optional() });
const employeeList = z.object({ ...page, q: z.string().trim().max(80).optional(), role: z.enum(['admin', 'cashier']).optional(), status: z.enum(['active', 'inactive']).optional() });

// ---- audit
const auditList = z.object({ ...page, ...dates, q: z.string().trim().max(80).optional(), action: z.string().trim().max(60).optional(), resource: z.string().trim().max(40).optional(), actor: objectId.optional() });

// ---- settings
const settings = z.object({
  storeName: z.string().trim().min(1).max(80), address: z.string().trim().max(200), phone: z.string().trim().max(40), receiptFooter: z.string().trim().max(200),
  currency: z.string().trim().length(3).toUpperCase(), timezone: z.string().trim().max(60).refine((tz) => { try { new Intl.DateTimeFormat('en', { timeZone: tz }); return true; } catch { return false; } }, 'Unknown timezone'),
  taxRate: num(0, 100), cashierMaxDiscountPercent: num(0, 100), nearExpiryDays: z.coerce.number().int().min(0).max(365),
  forecastWindowDays: z.coerce.number().int().min(7).max(365), coverageDays: z.coerce.number().int().min(1).max(180), defaultLeadTimeDays: num(0, 365), defaultSafetyStock: num(0, 1000000),
  defaultCreditLimit: num(0, 100000000), whatsappCountryCode: z.string().trim().regex(/^\d{1,4}$/, 'Digits only, e.g. 92'),
  slowMovingWindowDays: z.coerce.number().int().min(7).max(365), slowMovingMinIdleDays: z.coerce.number().int().min(1).max(365), slowMovingVelocity: num(0, 1000), newProductGraceDays: z.coerce.number().int().min(0).max(365),
}).partial().strict();

// ---- customers / khata
const phone = z.string().trim().max(20).regex(/^[0-9+\-\s()]{7,20}$/, 'Enter a valid phone number').optional().or(z.literal(''));
const customerCreate = z.object({ name: z.string().trim().min(2).max(80), phone, address: optText(200), notes: optText(300), creditLimit: num(0, 100000000).optional() });
const customerUpdate = customerCreate.partial();
const customerList = z.object({ ...page, q: z.string().trim().max(80).optional(), status: z.enum(['active', 'inactive']).optional(), owing: bool.optional() });
const ledgerList = z.object({ ...page, type: z.enum(['charge', 'payment', 'adjustment', 'void_reversal']).optional() });
const statementQuery = z.object({ ...dates });
const customerPayment = z.object({ amount: num(0.01, 100000000), note: optText(200), requestId });
const customerAdjustment = z.object({ amount: z.coerce.number().finite().min(-100000000).max(100000000).refine((v) => v !== 0, 'Amount cannot be zero'), reason: z.string().trim().min(3).max(200), requestId });

module.exports = { customerCreate, customerUpdate, customerList, ledgerList, statementQuery, customerPayment, customerAdjustment, idParam, login, category, productCreate, productUpdate, productList, status, checkout, saleList, voidBody, receipt, adjustment, wastage, stockList, movementList, batchList, range, reorder, employeeCreate, employeeUpdate, employeeList, auditList, settings };
