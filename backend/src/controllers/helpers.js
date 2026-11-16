const { resolveRange } = require('../services/rangeUtil');
const settingsService = require('../services/settingsService');
const { pageMeta } = require('../utils/pagination');

const ok = (res, data, meta, status = 200) => res.status(status).json({ success: true, data, ...(meta ? { meta } : {}) });

/** Adds fromDate/toDate (store timezone aware) to a validated query that has from/to. */
async function withDates(q) {
  if (!q.from && !q.to) return q;
  const s = await settingsService.get();
  const { fromDate, toDate } = resolveRange({ from: q.from, to: q.to }, s.timezone, 3650);
  return { ...q, from: q.from ? 1 : undefined, to: q.to ? 1 : undefined, fromDate, toDate: q.to ? toDate : new Date(Date.now() + 86400000) };
}
const paged = (res, { rows, total, ...extra }, q) => ok(res, rows, { ...pageMeta(total, q.page, q.limit), ...extra });

module.exports = { ok, paged, withDates };
