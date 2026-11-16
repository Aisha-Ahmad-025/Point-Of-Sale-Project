const mongoose = require('mongoose');
const { dbState } = require('../config/db');

/**
 * Runs `work(ctx)` atomically.
 *  - Replica set / Atlas: a real MongoDB multi-document transaction (ctx.session is set).
 *  - Standalone MongoDB: no session. Every side effect registers an undo via ctx.onUndo(fn);
 *    on failure the undos run in reverse order (compensating rollback). Stock decrements
 *    additionally use conditional atomic updates ({remaining: {$gte: qty}}) so overselling
 *    is impossible even without transactions.
 * `work` may be retried by MongoDB (transient errors) so it must be safe to re-run.
 */
async function runAtomic(work) {
  if (dbState.transactions) {
    const session = await mongoose.startSession();
    try {
      let result;
      await session.withTransaction(async () => { result = await work({ session, onUndo: () => {} }); });
      return result;
    } finally { await session.endSession(); }
  }
  const undos = [];
  try {
    return await work({ session: null, onUndo: (fn) => undos.push(fn) });
  } catch (e) {
    for (const fn of undos.reverse()) {
      try { await fn(); } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[tx] compensating rollback step failed:', err.message);
      }
    }
    throw e;
  }
}

module.exports = { runAtomic };
