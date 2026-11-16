// Bridge between the voice assistant (global) and the POS screen (which owns the cart).
// If the POS is not open yet, commands wait here for a few seconds and are delivered as soon as it mounts.
const MAX_AGE = 15000;
let handler = null;
let queue = [];

/** Send a command to the POS. Returns the POS's reply ({ message }) when it is open, otherwise null (queued). */
export function sendToPos(cmd) {
  if (handler) return handler(cmd) ?? null;
  queue.push({ cmd, at: Date.now() });
  return null;
}

/** Called by the POS page. Delivers anything that was queued while it was loading. Returns an unsubscribe function. */
export function registerPos(h) {
  handler = h;
  const pending = queue; queue = [];
  pending.filter((q) => Date.now() - q.at <= MAX_AGE).forEach((q) => h(q.cmd));
  return () => { if (handler === h) handler = null; };
}
export const pendingPosCommands = () => queue.length;
export const resetPosVoice = () => { handler = null; queue = []; };
