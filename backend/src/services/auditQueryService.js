const AuditLog = require('../models/AuditLog');
const { escapeRegex } = require('../utils/pagination');

async function list(q) {
  const filter = {};
  if (q.action) filter.action = new RegExp(`^${escapeRegex(q.action)}`);
  if (q.resource) filter.resource = q.resource;
  if (q.actor) filter.actor = q.actor;
  if (q.q) { const rx = new RegExp(escapeRegex(q.q), 'i'); filter.$or = [{ summary: rx }, { actorName: rx }, { action: rx }, { resourceId: rx }]; }
  if (q.from || q.to) { filter.createdAt = {}; if (q.from) filter.createdAt.$gte = q.fromDate; if (q.to) filter.createdAt.$lt = q.toDate; }
  const [rows, total] = await Promise.all([AuditLog.find(filter).sort({ createdAt: -1 }).skip((q.page - 1) * q.limit).limit(q.limit).lean(), AuditLog.countDocuments(filter)]);
  return { rows, total };
}
module.exports = { list };
