const mongoose = require('mongoose');

// Balances are stored as INTEGER minor units (paisa) so credit arithmetic is exact and can use atomic $inc.
// balanceCents > 0  => the customer owes the store.   balanceCents < 0 => the store holds an advance for the customer.
const customerSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    phone: { type: String, trim: true, maxlength: 20, set: (v) => (v ? String(v).replace(/[\s\-()]/g, '') || undefined : undefined) },
    address: { type: String, trim: true, maxlength: 200 },
    notes: { type: String, trim: true, maxlength: 300 },
    creditLimitCents: { type: Number, required: true, min: 0, default: 0, validate: Number.isInteger }, // 0 = credit not allowed
    balanceCents: { type: Number, required: true, default: 0, validate: Number.isInteger },
    lastPaymentAt: { type: Date },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true },
);
customerSchema.index({ phone: 1 }, { unique: true, partialFilterExpression: { phone: { $type: 'string' } } });
customerSchema.index({ name: 1 });
customerSchema.index({ balanceCents: -1 });

module.exports = mongoose.model('Customer', customerSchema);
