// Pure batch helpers (no database access) so they are easy to unit test.
function batchStatus(batch, today, nearDays) {
  if (!batch.expiryDate) return { status: 'no_expiry', daysToExpiry: null };
  const days = Math.floor((batch.expiryDate.getTime() - today.getTime()) / 86400000);
  if (days < 0) return { status: 'expired', daysToExpiry: days };
  if (days <= nearDays) return { status: 'near_expiry', daysToExpiry: days };
  return { status: 'ok', daysToExpiry: days };
}

/** FEFO ordering: earliest expiry first; batches without expiry last; then oldest received. */
function fefoSort(batches) {
  return [...batches].sort((a, b) => {
    const ae = a.expiryDate ? a.expiryDate.getTime() : Infinity;
    const be = b.expiryDate ? b.expiryDate.getTime() : Infinity;
    if (ae !== be) return ae - be;
    return new Date(a.receivedDate) - new Date(b.receivedDate);
  });
}

/** Pure FEFO allocation over already-eligible batches. Returns {allocations, shortfall}. */
function allocateFefo(batches, quantity) {
  let need = quantity;
  const allocations = [];
  for (const b of fefoSort(batches)) {
    if (need <= 1e-9) break;
    const take = Math.min(b.remainingQuantity, need);
    if (take > 0) { allocations.push({ batch: b._id, lotNumber: b.lotNumber, quantity: Math.round(take * 1000) / 1000, costPrice: b.costPrice }); need -= take; }
  }
  return { allocations, shortfall: Math.max(0, Math.round(need * 1000) / 1000) };
}

module.exports = { batchStatus, fefoSort, allocateFefo };
