// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { mapLimit } from '../../src/utils/mapLimit';

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

describe('mapLimit', () => {
  it('devolve os resultados na ordem dos itens, mesmo terminando fora de ordem', async () => {
    const out = await mapLimit([30, 5, 20, 1], 4, async (ms) => {
      await sleep(ms);
      return ms * 2;
    });
    expect(out).toEqual([60, 10, 40, 2]);
  });

  it('nunca roda mais de `limit` tarefas ao mesmo tempo', async () => {
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

  it('o primeiro erro rejeita depois das tarefas em curso e nenhuma outra começa', async () => {
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
    // A tarefa 1 estava em curso e terminou antes da rejeição; ninguém além delas começou.
    expect(finished).toEqual([1]);
    expect(started).toEqual([0, 1]);
  });

  it('lista vazia devolve [] sem chamar fn', async () => {
    const fn = vi.fn(async () => 1);
    expect(await mapLimit([], 4, fn)).toEqual([]);
    expect(fn).not.toHaveBeenCalled();
  });

  it('funciona com limit maior que a lista', async () => {
    expect(await mapLimit(['a', 'b'], 10, async (s) => s.toUpperCase())).toEqual([
      'A',
      'B',
    ]);
  });

  it('fn recebe (item, index)', async () => {
    expect(await mapLimit(['x', 'y', 'z'], 2, async (s, i) => `${i}${s}`)).toEqual([
      '0x',
      '1y',
      '2z',
    ]);
  });
});
