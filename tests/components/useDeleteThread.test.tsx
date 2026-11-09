import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { t } from '../../src/i18n';
import { clearIdentity, setIdentity } from '../../src/store/identity';
import { locale } from '../../src/store/settings';
import { EditorContext } from '../../src/ui/EditorContext';
import {
  useDeleteThread,
  type DeleteThread,
} from '../../src/ui/comments/useDeleteThread';
import { sampleProject } from '../model/fixtures';
import { AGENT, HUMAN, message, sampleThread } from '../model/threadFixtures';
import { createHarness } from './harness';

// Apagar conversa (#959, decisão 7): o resultado da action aparece; o diálogo só fecha no sucesso.

beforeEach(() => {
  localStorage.clear();
  locale.value = 'pt-BR';
  setIdentity('Marina Alves', 'marina@exemplo.com');
});
afterEach(() => {
  cleanup();
  clearIdentity();
  vi.restoreAllMocks();
});

const own = sampleThread({
  id: 'own',
  messages: [message('m0', '2026-09-01T10:00:00.000Z', HUMAN, 'minha')],
});
const mixed = sampleThread({
  id: 'mixed',
  messages: [
    message('m0', '2026-09-01T10:00:00.000Z', HUMAN, 'minha'),
    message('m1', '2026-09-01T11:00:00.000Z', AGENT, 'do agente'),
  ],
});

function setup(
  result: Awaited<
    ReturnType<
      ReturnType<typeof createHarness>['context']['session']['threadActions']['remove']
    >
  >,
) {
  const harness = createHarness(sampleProject());
  const remove = vi
    .spyOn(harness.context.session.threadActions, 'remove')
    .mockResolvedValue(result);
  let hook: DeleteThread | null = null;
  function Probe() {
    hook = useDeleteThread();
    return <>{hook.dialog}</>;
  }
  render(
    <EditorContext.Provider value={harness.context}>
      <Probe />
    </EditorContext.Provider>,
  );
  return {
    remove,
    request: (thread: typeof own) => act(() => hook?.request(thread)),
  };
}

describe('useDeleteThread: falha ao apagar', () => {
  it('com confirmação: o diálogo fica aberto com o erro e o botão volta a funcionar', async () => {
    const s = setup({ ok: false, error: 'write-failed' });
    s.request(mixed);
    fireEvent.click(
      await screen.findByRole('button', { name: t('comments.delete.confirm') }),
    );
    const alert = await screen
      .findByRole('alert', {}, { timeout: 2000 })
      .catch(() => null);
    expect(alert).not.toBeNull();
    expect(screen.getByText(t('comments.delete.title'))).toBeTruthy();
    expect(
      (
        screen.getByRole('button', {
          name: t('comments.delete.confirm'),
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false);
    expect(s.remove).toHaveBeenCalledWith('mixed');
  });

  it('direto: o aviso aparece junto do hook', async () => {
    const s = setup({ ok: false, error: 'gone' });
    s.request(own);
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(s.remove).toHaveBeenCalledWith('own');
  });

  it('com confirmação e sucesso: o diálogo fecha, sem aviso', async () => {
    const s = setup({ ok: true });
    s.request(mixed);
    fireEvent.click(
      await screen.findByRole('button', { name: t('comments.delete.confirm') }),
    );
    await waitFor(() =>
      expect(screen.queryByText(t('comments.delete.title'))).toBeNull(),
    );
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
