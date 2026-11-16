const mongoose = require('mongoose');

const money = { type: Number, min: 0, required: true, set: (v) => Math.round((Number(v) + Number.EPSILON) * 100) / 100 };

const productSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    sku: { type: String, required: true, unique: true, uppercase: true, trim: true, maxlength: 40 },
    barcode: { type: String, trim: true, maxlength: 40, set: (v) => (v === '' || v === null ? undefined : v) },
    category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true, index: true },
    description: { type: String, trim: true, maxlength: 500 },
    unit: { type: String, enum: ['pcs', 'kg', 'g', 'l', 'ml', 'pack', 'box', 'dozen'], default: 'pcs' },
    sellingPrice: money,
    costPrice: money,
    reorderThreshold: { type: Number, min: 0, default: 0 },
    leadTimeDays: { type: Number, min: 0, default: null },
    safetyStock: { type: Number, min: 0, default: null },
    taxRate: { type: Number, min: 0, max: 100, default: null }, // null = store default
    trackExpiry: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true },
);

// Unique barcode only when a non-empty string is present (optional barcode).
productSchema.index({ barcode: 1 }, { unique: true, partialFilterExpression: { barcode: { $type: 'string' } } });

module.exports = mongoose.model('Product', productSchema);
