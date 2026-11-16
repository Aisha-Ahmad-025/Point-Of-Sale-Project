const mongoose = require('mongoose');
const Batch = require('../models/InventoryBatch');
const { config } = require('../config/env');
const { storeToday } = require('../utils/date');

const exp = { $ifNull: ['$expiryDate', null] };

/**
 * Aggregated stock per product.
 *  onHand   = all remaining units (including expired)
 *  sellable = units that can be sold today (not expired)
 *  expired  = units in expired batches
 *  value    = onHand valued at batch cost
 */
async function stockMap(productIds, { today } = {}) {
  const t = today || storeToday(config.timezone);
  const match = { remainingQuantity: { $gt: 0 } };
  if (productIds) match.product = { $in: productIds.map((id) => new mongoose.Types.ObjectId(String(id))) };
  const sellableCond = { $or: [{ $eq: [exp, null] }, { $gte: [exp, t] }] };
  const rows = await Batch.aggregate([
    { $match: match },
    {
      $group: {
        _id: '$product',
        onHand: { $sum: '$remainingQuantity' },
        sellable: { $sum: { $cond: [sellableCond, '$remainingQuantity', 0] } },
        expired: { $sum: { $cond: [{ $and: [{ $ne: [exp, null] }, { $lt: [exp, t] }] }, '$remainingQuantity', 0] } },
        value: { $sum: { $multiply: ['$remainingQuantity', '$costPrice'] } },
        nextExpiry: { $min: { $cond: [{ $and: [{ $ne: [exp, null] }, { $gte: [exp, t] }] }, '$expiryDate', null] } },
      },
    },
  ]);
  const map = new Map();
  rows.forEach((r) => map.set(String(r._id), { onHand: r.onHand, sellable: r.sellable, expired: r.expired, value: Math.round(r.value * 100) / 100, nextExpiry: r.nextExpiry }));
  return map;
}

const emptyStock = { onHand: 0, sellable: 0, expired: 0, value: 0, nextExpiry: null };

const { batchStatus, fefoSort, allocateFefo } = require('../utils/fefo');

module.exports = { stockMap, emptyStock, batchStatus, fefoSort, allocateFefo };
