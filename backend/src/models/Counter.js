const mongoose = require('mongoose');

const counterSchema = new mongoose.Schema({ _id: String, seq: { type: Number, default: 0 } });

counterSchema.statics.next = async function next(key, opts = {}) {
  const doc = await this.findOneAndUpdate({ _id: key }, { $inc: { seq: 1 } }, { new: true, upsert: true, ...opts });
  return doc.seq;
};

module.exports = mongoose.model('Counter', counterSchema);
