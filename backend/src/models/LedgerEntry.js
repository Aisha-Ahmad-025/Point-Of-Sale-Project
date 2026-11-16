const mongoose = require('mongoose');

const TYPES = ['charge', 'payment', 'adjustment', 'void_reversal'];

// Append-only customer ledger (khata). amount > 0 increases what the customer owes, amount < 0 reduces it.
const ledgerSchema = new mongoose.Schema(
  {
    customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true },
    type: { type: String, enum: TYPES, required: true },
    amount: { type: Number, required: true }, // signed, 2 decimals
    balanceAfter: { type: Number, required: true },
    sale: { type: mongoose.Schema.Types.ObjectId, ref: 'Sale' },
    receiptNumber: String,
    note: { type: String, trim: true, maxlength: 200 },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    userName: String,
    requestId: { type: String, index: { unique: true, sparse: true } },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
ledgerSchema.index({ customer: 1, createdAt: -1 });
ledgerSchema.index({ type: 1, createdAt: -1 });
ledgerSchema.statics.TYPES = TYPES;

module.exports = mongoose.model('LedgerEntry', ledgerSchema);
