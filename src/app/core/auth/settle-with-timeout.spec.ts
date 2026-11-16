import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OperationTimeoutError, settleWithTimeout } from './settle-with-timeout';

describe('settleWithTimeout', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('devuelve el resultado si la operación termina a tiempo', async () => {
    await expect(settleWithTimeout(Promise.resolve('ok'), 1000, 'demora')).resolves.toBe('ok');
  });

  it('rechaza con el código indicado si la operación nunca termina', async () => {
    const neverEndingOperation = new Promise<string>(() => undefined);
    const settledOperation = settleWithTimeout(neverEndingOperation, 1000, 'auth/session-timeout');
    vi.advanceTimersByTime(1000);
    await expect(settledOperation).rejects.toBeInstanceOf(OperationTimeoutError);
    await expect(settledOperation).rejects.toMatchObject({ code: 'auth/session-timeout' });
  });
});
