const Settings = require('../models/Settings');
const audit = require('./auditService');

const PUBLIC_FIELDS = ['storeName', 'address', 'phone', 'receiptFooter', 'currency', 'timezone', 'taxRate', 'cashierMaxDiscountPercent', 'nearExpiryDays', 'whatsappCountryCode'];

const get = () => Settings.get();
const toPublic = (s) => Object.fromEntries(PUBLIC_FIELDS.map((k) => [k, s[k]]));

async function update(req, patch) {
  const current = await Settings.get();
  const before = current.toObject();
  Object.assign(current, patch);
  await current.save();
  await audit.record(req, { action: 'settings.update', resource: 'settings', resourceId: current._id, summary: 'Store settings updated', before, after: current.toObject() });
  return current;
}
module.exports = { get, update, toPublic };
