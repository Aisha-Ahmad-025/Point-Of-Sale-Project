const { startOfStoreDay, addDays, parseDateOnly, storeToday } = require('../utils/date');
const ApiError = require('../utils/ApiError');

/** Convert YYYY-MM-DD from/to (store-local, inclusive) into [fromDate, toDate) instants. Default: last `defaultDays` days incl. today. */
function resolveRange({ from, to }, tz, defaultDays = 7) {
  const today = storeToday(tz);
  const f = parseDateOnly(from) || addDays(today, -(defaultDays - 1));
  const t = parseDateOnly(to) || today;
  if (t < f) throw ApiError.badRequest('"to" must not be before "from"', 'INVALID_RANGE');
  if ((t - f) / 86400000 > 731) throw ApiError.badRequest('Date range too large (max 2 years)', 'INVALID_RANGE');
  const noon = (d) => new Date(d.getTime() + 12 * 3600000);
  return { fromDate: startOfStoreDay(tz, noon(f)), toDate: startOfStoreDay(tz, noon(addDays(t, 1))), from: f, to: t };
}
module.exports = { resolveRange };
