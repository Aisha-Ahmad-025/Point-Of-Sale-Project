// Store-timezone aware helpers. "Store date" values are represented as UTC-midnight Dates
// (e.g. expiry dates), so comparisons are timezone independent.
function partsInTz(date, timeZone) {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
  const [y, m, d] = f.format(date).split('-').map(Number);
  return { y, m, d };
}
function storeToday(timeZone, now = new Date()) {
  const { y, m, d } = partsInTz(now, timeZone);
  return new Date(Date.UTC(y, m - 1, d));
}
function addDays(date, n) { return new Date(date.getTime() + n * 86400000); }
function daysBetween(a, b) { return Math.floor((b.getTime() - a.getTime()) / 86400000); }
/** Start instant (UTC) of the store's local day for `now`. Offset resolved via Intl. */
function startOfStoreDay(timeZone, now = new Date()) {
  const { y, m, d } = partsInTz(now, timeZone);
  const guess = new Date(Date.UTC(y, m - 1, d));
  const asLocal = new Date(guess.toLocaleString('en-US', { timeZone }));
  const asUtc = new Date(guess.toLocaleString('en-US', { timeZone: 'UTC' }));
  return new Date(guess.getTime() - (asLocal.getTime() - asUtc.getTime()));
}
function parseDateOnly(str) {
  if (!str) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(str));
  if (!m) return null;
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
}
const toDateKey = (d) => d.toISOString().slice(0, 10);
module.exports = { storeToday, addDays, daysBetween, startOfStoreDay, parseDateOnly, partsInTz, toDateKey };
