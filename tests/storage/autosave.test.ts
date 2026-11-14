// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAutoSaver } from '../../src/storage/autosave';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('autosave', () => {
  it('groups consecutive changes into one write after the debounce', async () => {
    const save = vi.fn(async () => undefined);
    const saver = createAutoSaver(save, 800);
    expect(saver.status.value).toBe('saved');

    saver.schedule();
    await vi.advanceTimersByTimeAsync(500);
    saver.schedule();
    expect(saver.status.value).toBe('saving');
    await vi.advanceTimersByTimeAsync(799);
    expect(save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(save).toHaveBeenCalledTimes(1);
    expect(saver.status.value).toBe('saved');
  });

  it('error: shows the status and retries on flush or on the next change', async () => {
    const save = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error('no permission'))
      .mockRejectedValueOnce(new Error('no permission'))
      .mockResolvedValue(undefined);
    const saver = createAutoSaver(save, 800);

    saver.schedule();
    await vi.advanceTimersByTimeAsync(800);
    expect(saver.status.value).toBe('error');

    await saver.flush();
    expect(save).toHaveBeenCalledTimes(2);
    expect(saver.status.value).toBe('error');

    saver.schedule();
    await vi.advanceTimersByTimeAsync(800);
    expect(save).toHaveBeenCalledTimes(3);
    expect(saver.status.value).toBe('saved');
  });

  it('does not write in parallel; a change during a write schedules another', async () => {
    let release: () => void = () => undefined;
    let running = 0;
    let maxRunning = 0;
    const save = vi.fn(async () => {
      running++;
      maxRunning = Math.max(maxRunning, running);
      await new Promise<void>((resolve) => (release = resolve));
      running--;
    });
    const saver = createAutoSaver(save, 800);

    saver.schedule();
    await vi.advanceTimersByTimeAsync(800);
    expect(save).toHaveBeenCalledTimes(1);
    saver.schedule();
    const flushing = saver.flush();
    release();
    await vi.advanceTimersByTimeAsync(0);
    release();
    await flushing;
    expect(save).toHaveBeenCalledTimes(2);
    expect(maxRunning).toBe(1);
    expect(saver.status.value).toBe('saved');
  });

  it('flush without pending changes does not write; dispose cancels the scheduled one', async () => {
    const save = vi.fn(async () => undefined);
    const saver = createAutoSaver(save, 800);
    await saver.flush();
    saver.schedule();
    saver.dispose();
    await vi.advanceTimersByTimeAsync(2000);
    expect(save).not.toHaveBeenCalled();
    saver.schedule();
    await vi.advanceTimersByTimeAsync(2000);
    expect(save).not.toHaveBeenCalled();
  });
});

describe('autosave: reset', () => {
  it('discards the scheduled write and returns to "saved" (reload from disk)', async () => {
    const save = vi.fn(async () => undefined);
    const saver = createAutoSaver(save, 800);
    saver.schedule();
    expect(saver.status.value).toBe('saving');
    saver.reset();
    expect(saver.status.value).toBe('saved');
    await vi.advanceTimersByTimeAsync(2000);
    await saver.flush();
    expect(save).not.toHaveBeenCalled();
  });

  it('also discards the pending error', async () => {
    const save = vi.fn<() => Promise<void>>().mockRejectedValue(new Error('x'));
    const saver = createAutoSaver(save, 800);
    saver.schedule();
    await vi.advanceTimersByTimeAsync(800);
    expect(saver.status.value).toBe('error');
    saver.reset();
    expect(saver.status.value).toBe('saved');
    await saver.flush();
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('a change after the reset writes normally', async () => {
    const save = vi.fn(async () => undefined);
    const saver = createAutoSaver(save, 800);
    saver.schedule();
    saver.reset();
    saver.schedule();
    await vi.advanceTimersByTimeAsync(800);
    expect(save).toHaveBeenCalledTimes(1);
  });
});

// Phase 8.1 (findings S2 and S3): a single queue for writing and for whatever cannot cross
// the write, and the invariants the interface assumes (`saved` = nothing in progress or pending;
// a write in progress is always `saving`).
describe('single queue and invariants (phase 8.1)', () => {
  /** A `save()` whose end the test controls: each call waits for `resolve`/`reject`. */
  function controlled() {
    const pending: { resolve: () => void; reject: (e: Error) => void }[] = [];
    let inFlight = 0;
    const save = vi.fn(
      () =>
        new Promise<void>((resolve, reject) => {
          inFlight++;
          pending.push({
            resolve: () => {
              inFlight--;
              resolve();
            },
            reject: (e) => {
              inFlight--;
              reject(e);
            },
          });
        }),
    );
    return { save, pending, inFlight: () => inFlight };
  }

  beforeEach(() => vi.spyOn(console, 'error').mockImplementation(() => undefined));
  afterEach(() => vi.restoreAllMocks());

  it('the write queued behind one that failed runs with the "saving" status (S2)', async () => {
    const c = controlled();
    const saver = createAutoSaver(c.save, 800);
    saver.schedule();
    await vi.advanceTimersByTimeAsync(800);
    expect(c.inFlight()).toBe(1);
    // Another change during the write: the second one stays in the queue.
    saver.schedule();
    await vi.advanceTimersByTimeAsync(800);
    c.pending[0]?.reject(new Error('no permission'));
    await vi.advanceTimersByTimeAsync(0);
    expect(c.save).toHaveBeenCalledTimes(2);
    expect(c.inFlight()).toBe(1);
    // A write is running: the status says so, not the error of the previous one.
    expect(saver.status.value).toBe('saving');
    c.pending[1]?.resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(saver.status.value).toBe('saved');
  });

  it('reset() cancels the queued write that has not started yet (S3)', async () => {
    const c = controlled();
    const saver = createAutoSaver(c.save, 800);
    saver.schedule();
    await vi.advanceTimersByTimeAsync(800);
    saver.schedule();
    const queued = saver.flush();
    saver.reset();
    c.pending[0]?.resolve();
    expect(await queued).toEqual({ ok: true });
    await vi.advanceTimersByTimeAsync(2000);
    expect(c.save).toHaveBeenCalledTimes(1);
    expect(saver.status.value).toBe('saved');
  });

  it('a save() in progress when reset() happens ends without changing the status', async () => {
    const c = controlled();
    const saver = createAutoSaver(c.save, 800);
    saver.schedule();
    await vi.advanceTimersByTimeAsync(800);
    saver.reset();
    // The write is still running: the status keeps saying so.
    expect(saver.status.value).toBe('saving');
    c.pending[0]?.reject(new Error('no permission'));
    await vi.advanceTimersByTimeAsync(0);
    // The pending one was discarded by the reset: its failure becomes neither an error nor a pending item.
    expect(saver.status.value).toBe('saved');
    await saver.flush();
    expect(c.save).toHaveBeenCalledTimes(1);
  });

  it('enqueue(): a job waits for the write in progress and the next write waits for the job', async () => {
    const c = controlled();
    const saver = createAutoSaver(c.save, 800);
    const order: string[] = [];
    saver.schedule();
    await vi.advanceTimersByTimeAsync(800);
    let release: () => void = () => undefined;
    const job = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          order.push('job');
          release = () => resolve('done');
        }),
    );
    const result = saver.enqueue(job);
    await vi.advanceTimersByTimeAsync(0);
    expect(job).not.toHaveBeenCalled();
    c.pending[0]?.resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(job).toHaveBeenCalledOnce();
    saver.schedule();
    const flushing = saver.flush();
    await vi.advanceTimersByTimeAsync(0);
    expect(c.save).toHaveBeenCalledTimes(1);
    release();
    expect(await result).toBe('done');
    await vi.advanceTimersByTimeAsync(0);
    expect(c.save).toHaveBeenCalledTimes(2);
    c.pending[1]?.resolve();
    expect(await flushing).toEqual({ ok: true });
    expect(order).toEqual(['job']);
  });

  it('a job that rejects does not break the queue', async () => {
    const save = vi.fn(async () => undefined);
    const saver = createAutoSaver(save, 800);
    await expect(saver.enqueue(() => Promise.reject(new Error('x')))).rejects.toThrow(
      'x',
    );
    saver.schedule();
    expect(await saver.flush()).toEqual({ ok: true });
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('invariants: saved => nothing in progress or pending; in progress => saving; error => nothing in progress', async () => {
    for (let seed = 1; seed <= 20; seed++) {
      let state = seed;
      const rnd = () => {
        state = (state * 1103515245 + 12345) & 0x7fffffff;
        return state / 0x7fffffff;
      };
      const c = controlled();
      const saver = createAutoSaver(c.save, 100);
      for (let step = 0; step < 200; step++) {
        const r = rnd();
        if (r < 0.3) saver.schedule();
        else if (r < 0.45) void saver.flush();
        else if (r < 0.55) saver.reset();
        else if (r < 0.75) {
          const p = c.pending.shift();
          if (p) {
            if (rnd() < 0.7) p.resolve();
            else p.reject(new Error('x'));
          }
        } else await vi.advanceTimersByTimeAsync(100);
        await vi.advanceTimersByTimeAsync(0);

        const where = `semente ${seed}, passo ${step}`;
        if (c.inFlight() > 0) expect(saver.status.value, where).toBe('saving');
        if (saver.status.value === 'error') expect(c.inFlight(), where).toBe(0);
        if (saver.status.value === 'saved') {
          expect(c.inFlight(), where).toBe(0);
          const before = c.save.mock.calls.length;
          await saver.flush();
          expect(c.save.mock.calls.length, where).toBe(before);
        }
      }
      for (const p of c.pending) p.resolve();
      await vi.advanceTimersByTimeAsync(0);
    }
  });
});
