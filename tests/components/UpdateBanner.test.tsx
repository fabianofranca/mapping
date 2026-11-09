import { act, cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const applyUpdate = vi.hoisted(() => vi.fn());
vi.mock('../../src/app/pwa', async () => {
  const { signal } = await import('@preact/signals');
  return { updateReady: signal(true), applyUpdate };
});

import { openProject } from '../../src/app/controller';
import { updateReady } from '../../src/app/pwa';
import { t } from '../../src/i18n';
import { locale } from '../../src/store/settings';
import { UpdateBanner } from '../../src/ui/UpdateBanner';

// Fase 1 da #954 (item 41): atualizar não recarrega a página se a gravação do projeto falhou.

beforeEach(() => {
  locale.value = 'pt-BR';
  updateReady.value = true;
  applyUpdate.mockReset();
});
afterEach(() => {
  cleanup();
  openProject.value = null;
});

function openWithFlush(result: { ok: true } | { ok: false; error: unknown }) {
  openProject.value = {
    session: { flush: vi.fn(async () => result) },
  } as unknown as NonNullable<typeof openProject.value>;
}

async function clickUpdate() {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: t('pwa.update') }));
  });
}

describe('UpdateBanner', () => {
  it('gravou: recarrega com a versão nova', async () => {
    openWithFlush({ ok: true });
    render(<UpdateBanner />);
    await clickUpdate();
    expect(applyUpdate).toHaveBeenCalledTimes(1);
  });

  it('sem projeto aberto: recarrega', async () => {
    render(<UpdateBanner />);
    await clickUpdate();
    expect(applyUpdate).toHaveBeenCalledTimes(1);
  });

  it('a gravação falhou: não recarrega e o aviso diz que não salvou', async () => {
    openWithFlush({ ok: false, error: new Error('sem permissão') });
    render(<UpdateBanner />);
    await clickUpdate();
    expect(applyUpdate).not.toHaveBeenCalled();
    expect(screen.getByRole('status').textContent).toContain(t('status.error'));
    expect(screen.getByRole('button', { name: t('pwa.update') })).toBeTruthy();
  });

  it('uma nova tentativa que grava recarrega', async () => {
    const flush = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, error: new Error('x') })
      .mockResolvedValueOnce({ ok: true });
    openProject.value = { session: { flush } } as unknown as NonNullable<
      typeof openProject.value
    >;
    render(<UpdateBanner />);
    await clickUpdate();
    await clickUpdate();
    expect(applyUpdate).toHaveBeenCalledTimes(1);
  });
});
