// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { mapLimit } from '../../src/utils/mapLimit';

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

describe('mapLimit', () => {
  it('returns the results in item order, even when they finish out of order', async () => {
    const out = await mapLimit([30, 5, 20, 1], 4, async (ms) => {
      await sleep(ms);
      return ms * 2;
    });
    expect(out).toEqual([60, 10, 40, 2]);
  });

  it('never runs more than `limit` tasks at the same time', async () => {
    let running = 0;
    let peak = 0;
    const out = await mapLimit(
      Array.from({ length: 12 }, (_, i) => i),
      3,
      async (i) => {
        running++;
        peak = Math.max(peak, running);
        await sleep(2);
        running--;
        return i;
      },
    );
    expect(out).toHaveLength(12);
    expect(peak).toBe(3);
  });

  it('the first error rejects after the in-progress tasks and no other starts', async () => {
    const started: number[] = [];
    const finished: number[] = [];
    const boom = new Error('boom');
    const run = mapLimit([0, 1, 2, 3, 4, 5], 2, async (i) => {
      started.push(i);
      if (i === 0) {
        await sleep(1);
        throw boom;
      }
      await sleep(15);
      finished.push(i);
      return i;
    });
    await expect(run).rejects.toBe(boom);
    // Task 1 was in progress and finished before the rejection; nobody besides them started.
    expect(finished).toEqual([1]);
    expect(started).toEqual([0, 1]);
  });

  it('an empty list returns [] without calling fn', async () => {
    const fn = vi.fn(async () => 1);
    expect(await mapLimit([], 4, fn)).toEqual([]);
    expect(fn).not.toHaveBeenCalled();
  });

  it('works with a limit larger than the list', async () => {
    expect(await mapLimit(['a', 'b'], 10, async (s) => s.toUpperCase())).toEqual([
      'A',
      'B',
    ]);
  });

  it('fn receives (item, index)', async () => {
    expect(await mapLimit(['x', 'y', 'z'], 2, async (s, i) => `${i}${s}`)).toEqual([
      '0x',
      '1y',
      '2z',
    ]);
  });
});
