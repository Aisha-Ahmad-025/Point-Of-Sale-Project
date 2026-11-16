const mongoose = require('mongoose');

const auditSchema = new mongoose.Schema(
  {
    actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    actorName: String,
    actorRole: String,
    action: { type: String, required: true, index: true },
    resource: { type: String, required: true, index: true },
    resourceId: String,
    summary: String,
    before: mongoose.Schema.Types.Mixed,
    after: mongoose.Schema.Types.Mixed,
    ip: String,
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
auditSchema.index({ createdAt: -1 });

// Audit logs are append-only: block every update/delete path at the model level.
const block = function blocked(next) { next(new Error('Audit logs are immutable')); };
['updateOne', 'updateMany', 'findOneAndUpdate', 'findOneAndDelete', 'findOneAndReplace', 'deleteOne', 'deleteMany', 'replaceOne'].forEach((op) => auditSchema.pre(op, block));
auditSchema.pre('save', function preSave(next) { if (!this.isNew) return next(new Error('Audit logs are immutable')); return next(); });

module.exports = mongoose.model('AuditLog', auditSchema);
