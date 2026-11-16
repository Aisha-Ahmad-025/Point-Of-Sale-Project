const mongoose = require('mongoose');

const TYPES = ['opening', 'receipt', 'sale', 'void_return', 'adjustment_in', 'adjustment_out', 'wastage'];

const movementSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
    batch: { type: mongoose.Schema.Types.ObjectId, ref: 'InventoryBatch', index: true },
    lotNumber: String,
    type: { type: String, enum: TYPES, required: true, index: true },
    quantity: { type: Number, required: true }, // signed: + adds stock, - removes stock
    unitCost: { type: Number, default: 0 },
    reason: { type: String, trim: true, maxlength: 200 },
    wastageReason: { type: String, enum: ['expired', 'damaged', 'spoiled', 'other'] },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    userName: String,
    sale: { type: mongoose.Schema.Types.ObjectId, ref: 'Sale', index: true },
    requestId: { type: String, index: { unique: true, sparse: true } }, // duplicate-submission guard
  },
  { timestamps: true },
);
movementSchema.index({ createdAt: -1 });
movementSchema.statics.TYPES = TYPES;

module.exports = mongoose.model('StockMovement', movementSchema);
