// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAutoSaver } from '../../src/storage/autosave';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('salvamento automático', () => {
  it('agrupa alterações seguidas numa gravação após o debounce', async () => {
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

  it('erro: mostra o status e tenta de novo no flush ou na próxima alteração', async () => {
    const save = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error('sem permissão'))
      .mockRejectedValueOnce(new Error('sem permissão'))
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

  it('não grava em paralelo; alteração durante a gravação agenda outra', async () => {
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

  it('flush sem alterações pendentes não grava; dispose cancela o agendado', async () => {
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

describe('salvamento automático: reset', () => {
  it('descarta a gravação agendada e volta a "saved" (recarregar do disco)', async () => {
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

  it('descarta também o erro pendente', async () => {
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

  it('uma alteração depois do reset grava normalmente', async () => {
    const save = vi.fn(async () => undefined);
    const saver = createAutoSaver(save, 800);
    saver.schedule();
    saver.reset();
    saver.schedule();
    await vi.advanceTimersByTimeAsync(800);
    expect(save).toHaveBeenCalledTimes(1);
  });
});

// Fase 8.1 (achados S2 e S3): uma fila só para gravar e para o que não pode cruzar com a
// gravação, e os invariantes que a interface supõe (`saved` = nada em curso nem pendente;
// uma gravação em curso é sempre `saving`).
describe('fila única e invariantes (fase 8.1)', () => {
  /** `save()` cujo término o teste controla: cada chamada espera `resolve`/`reject`. */
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

  it('a gravação enfileirada atrás de uma que falhou roda com o status "saving" (S2)', async () => {
    const c = controlled();
    const saver = createAutoSaver(c.save, 800);
    saver.schedule();
    await vi.advanceTimersByTimeAsync(800);
    expect(c.inFlight()).toBe(1);
    // Outra alteração durante a gravação: a segunda fica na fila.
    saver.schedule();
    await vi.advanceTimersByTimeAsync(800);
    c.pending[0]?.reject(new Error('sem permissão'));
    await vi.advanceTimersByTimeAsync(0);
    expect(c.save).toHaveBeenCalledTimes(2);
    expect(c.inFlight()).toBe(1);
    // Há uma gravação rodando: o status diz isso, não o erro da anterior.
    expect(saver.status.value).toBe('saving');
    c.pending[1]?.resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(saver.status.value).toBe('saved');
  });

  it('reset() cancela a gravação enfileirada ainda não iniciada (S3)', async () => {
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

  it('um save() em curso quando reset() acontece termina sem mudar o status', async () => {
    const c = controlled();
    const saver = createAutoSaver(c.save, 800);
    saver.schedule();
    await vi.advanceTimersByTimeAsync(800);
    saver.reset();
    // A gravação ainda está rodando: o status continua dizendo isso.
    expect(saver.status.value).toBe('saving');
    c.pending[0]?.reject(new Error('sem permissão'));
    await vi.advanceTimersByTimeAsync(0);
    // O pendente foi descartado pelo reset: a falha dele não vira erro nem pendência.
    expect(saver.status.value).toBe('saved');
    await saver.flush();
    expect(c.save).toHaveBeenCalledTimes(1);
  });

  it('enqueue(): um trabalho espera a gravação em curso e a gravação seguinte espera o trabalho', async () => {
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
          release = () => resolve('feito');
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
    expect(await result).toBe('feito');
    await vi.advanceTimersByTimeAsync(0);
    expect(c.save).toHaveBeenCalledTimes(2);
    c.pending[1]?.resolve();
    expect(await flushing).toEqual({ ok: true });
    expect(order).toEqual(['job']);
  });

  it('um trabalho que rejeita não quebra a fila', async () => {
    const save = vi.fn(async () => undefined);
    const saver = createAutoSaver(save, 800);
    await expect(saver.enqueue(() => Promise.reject(new Error('x')))).rejects.toThrow(
      'x',
    );
    saver.schedule();
    expect(await saver.flush()).toEqual({ ok: true });
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('invariantes: saved ⇒ nada em curso nem pendente; em curso ⇒ saving; error ⇒ nada em curso', async () => {
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
