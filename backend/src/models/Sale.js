const mongoose = require('mongoose');

const allocationSchema = new mongoose.Schema(
  { batch: { type: mongoose.Schema.Types.ObjectId, ref: 'InventoryBatch' }, lotNumber: String, quantity: Number, costPrice: Number },
  { _id: false },
);

const itemSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    name: { type: String, required: true },
    sku: { type: String, required: true },
    unit: String,
    quantity: { type: Number, required: true, min: 0 },
    unitPrice: { type: Number, required: true }, // selling price snapshot
    unitCost: { type: Number, required: true }, // weighted cost snapshot from allocated batches
    discountPercent: { type: Number, default: 0 },
    discountAmount: { type: Number, default: 0 },
    taxRate: { type: Number, default: 0 },
    taxAmount: { type: Number, default: 0 },
    lineNet: { type: Number, required: true }, // after discount, excl. tax
    lineTotal: { type: Number, required: true }, // incl. tax
    cogs: { type: Number, required: true },
    allocations: [allocationSchema],
  },
  { _id: false },
);

const saleSchema = new mongoose.Schema(
  {
    receiptNumber: { type: String, required: true, unique: true },
    clientRequestId: { type: String, index: { unique: true, sparse: true } }, // idempotency key
    cashier: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    cashierName: { type: String, required: true },
    items: { type: [itemSchema], validate: (v) => v.length > 0 },
    subtotal: { type: Number, required: true }, // gross before discount, excl. tax
    discountTotal: { type: Number, default: 0 },
    taxTotal: { type: Number, default: 0 },
    total: { type: Number, required: true }, // payable
    netRevenue: { type: Number, required: true }, // total - tax
    cogs: { type: Number, required: true },
    grossProfit: { type: Number, required: true },
    customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', index: true },
    customerName: String,
    customerPhone: String,
    customerBalanceAfter: Number, // customer's khata balance right after this sale (snapshot for the receipt)
    payment: {
      method: { type: String, enum: ['cash', 'credit', 'partial'], default: 'cash' },
      amountReceived: { type: Number, required: true }, // cash handed over now
      change: { type: Number, required: true },
      creditAmount: { type: Number, default: 0 }, // portion put on the customer's khata
    },
    status: { type: String, enum: ['completed', 'voided'], default: 'completed', index: true },
    paymentStatus: { type: String, enum: ['paid', 'partial', 'unpaid', 'refunded'], default: 'paid' },
    voidedAt: Date,
    voidedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    voidReason: String,
  },
  { timestamps: true },
);
saleSchema.index({ createdAt: -1 });
saleSchema.index({ status: 1, createdAt: -1 });
saleSchema.index({ 'items.product': 1, createdAt: -1 });

module.exports = mongoose.model('Sale', saleSchema);
