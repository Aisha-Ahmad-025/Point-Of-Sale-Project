const mongoose = require('mongoose');

const settingsSchema = new mongoose.Schema(
  {
    key: { type: String, default: 'store', unique: true },
    storeName: { type: String, default: 'SwiftShelf Mini Mart', trim: true },
    address: { type: String, default: '12 Main Boulevard, Lahore', trim: true },
    phone: { type: String, default: '+92 300 0000000', trim: true },
    receiptFooter: { type: String, default: 'Thank you for shopping with us!', trim: true },
    currency: { type: String, default: 'PKR' },
    timezone: { type: String, default: 'Asia/Karachi' },
    taxRate: { type: Number, default: 0, min: 0, max: 100 },
    cashierMaxDiscountPercent: { type: Number, default: 5, min: 0, max: 100 },
    nearExpiryDays: { type: Number, default: 7, min: 0 },
    forecastWindowDays: { type: Number, default: 30, min: 7, max: 365 },
    coverageDays: { type: Number, default: 14, min: 1, max: 180 },
    defaultLeadTimeDays: { type: Number, default: 3, min: 0 },
    defaultSafetyStock: { type: Number, default: 0, min: 0 },
    slowMovingWindowDays: { type: Number, default: 30, min: 7, max: 365 },
    slowMovingMinIdleDays: { type: Number, default: 21, min: 1 },
    slowMovingVelocity: { type: Number, default: 0.2, min: 0 }, // units/day below which a product is "slow"
    defaultCreditLimit: { type: Number, default: 5000, min: 0 }, // limit given to customers added by cashiers
    whatsappCountryCode: { type: String, default: '92', match: /^\d{1,4}$/ }, // used to turn 03xx numbers into WhatsApp links
    newProductGraceDays: { type: Number, default: 14, min: 0 },
  },
  { timestamps: true },
);

settingsSchema.statics.get = async function get() {
  let doc = await this.findOne({ key: 'store' });
  if (!doc) {
    try { doc = await this.create({ key: 'store' }); } catch (e) {
      if (e.code !== 11000) throw e;
      doc = await this.findOne({ key: 'store' }); // another request created it first
    }
  }
  return doc;
};

module.exports = mongoose.model('Settings', settingsSchema);
