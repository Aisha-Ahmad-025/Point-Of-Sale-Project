import { beforeEach, describe, expect, test } from 'vitest';
import { pendingPosCommands, registerPos, resetPosVoice, sendToPos } from '../utils/posVoice';

describe('voice -> POS bridge', () => {
  beforeEach(() => resetPosVoice());
  test('delivers straight to the POS when it is open and returns its reply', () => {
    const got = []; registerPos((c) => { got.push(c); return { message: 'ok' }; });
    expect(sendToPos({ type: 'clear' })).toEqual({ message: 'ok' }); expect(got).toEqual([{ type: 'clear' }]);
  });
  test('queues commands while the POS is still loading and delivers them in order on mount', () => {
    expect(sendToPos({ type: 'add', n: 1 })).toBeNull(); expect(sendToPos({ type: 'add', n: 2 })).toBeNull(); expect(pendingPosCommands()).toBe(2);
    const got = []; registerPos((c) => { got.push(c.n); }); expect(got).toEqual([1, 2]); expect(pendingPosCommands()).toBe(0);
  });
  test('after the POS unmounts new commands queue again, and a stale unsubscribe cannot remove a newer handler', () => {
    const off1 = registerPos(() => {}); off1();
    expect(sendToPos({ type: 'x' })).toBeNull();
    const got = []; const off2 = registerPos((c) => { got.push(c.type); }); off1(); sendToPos({ type: 'y' }); expect(got).toEqual(['x', 'y']); off2();
  });
});
