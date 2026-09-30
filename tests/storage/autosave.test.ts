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
