const mongoose = require('mongoose');

// Every unit of stock lives in a batch. Products without expiry use batches with expiryDate = null.
const batchSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
    lotNumber: { type: String, required: true, trim: true, maxlength: 40 },
    receivedDate: { type: Date, required: true, default: Date.now },
    expiryDate: { type: Date, default: null }, // stored as UTC midnight of the store-local date
    quantityReceived: { type: Number, required: true, min: 0 },
    remainingQuantity: { type: Number, required: true, min: 0 },
    costPrice: { type: Number, required: true, min: 0 },
  },
  { timestamps: true },
);
batchSchema.index({ product: 1, lotNumber: 1 }, { unique: true });
// FEFO lookup
batchSchema.index({ product: 1, remainingQuantity: 1, expiryDate: 1, receivedDate: 1 });
batchSchema.index({ expiryDate: 1 });

module.exports = mongoose.model('InventoryBatch', batchSchema);
