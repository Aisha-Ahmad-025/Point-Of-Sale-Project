const AuditLog = require('../models/AuditLog');

const SENSITIVE = /pass|token|secret|hash|csrf/i;
function sanitize(value, depth = 0) {
  if (value === null || value === undefined) return value;
  if (depth > 4) return '[truncated]';
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => sanitize(v, depth + 1));
  if (value instanceof Date) return value;
  if (typeof value === 'object') {
    const src = typeof value.toObject === 'function' ? value.toObject() : value;
    if (src._bsontype) return String(src);
    return Object.fromEntries(Object.entries(src).filter(([k]) => !SENSITIVE.test(k) && k !== '__v').map(([k, v]) => [k, sanitize(v, depth + 1)]));
  }
  return value;
}

/** Record an audit entry. Failures never break the business operation but are logged. */
async function record(req, { action, resource, resourceId, summary, before, after, actor }) {
  try {
    const u = actor || (req && req.user);
    await AuditLog.create({
      actor: u && u._id, actorName: u && u.name, actorRole: u && u.role,
      action, resource, resourceId: resourceId ? String(resourceId) : undefined, summary,
      before: sanitize(before), after: sanitize(after), ip: req && req.ip,
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[audit] failed to write entry:', e.message);
  }
}
module.exports = { record, sanitize };
