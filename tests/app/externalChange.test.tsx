import { signal, type Signal } from '@preact/signals';
import { cleanup, render, screen, within } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CanvasNotices } from '../../src/app/CanvasNotices';
import { EditorDialogs } from '../../src/app/EditorDialogs';
import type { EditorDialogs as Dialogs } from '../../src/app/useEditorDialogs';
import type { EditorNotices } from '../../src/app/useEditorNotices';
import { EXTERNAL_POLL_MS, useExternalChanges } from '../../src/app/useExternalChanges';
import { t } from '../../src/i18n';
import { serialize } from '../../src/model';
import { AUTOSAVE_DELAY_MS } from '../../src/storage/autosave';
import { createFolderStorage } from '../../src/storage/folder';
import { createDisplayImages } from '../../src/store/displayImages';
import {
  openSession,
  type ExternalConflict,
  type ProjectSession,
} from '../../src/store/session';
import { locale } from '../../src/store/settings';
import { EditorContext, createEditorContextValue } from '../../src/ui/EditorContext';
import { createHarness, type Harness } from '../components/harness';
import { sampleProject } from '../model/fixtures';
import { MemoryDirectory } from '../storage/memoryFs';

// Etapa 3a.2: o diálogo "Projeto alterado fora da app", o aviso "Projeto atualizado por
// fora" e a conferência periódica do mapping.json.

beforeEach(() => {
  locale.value = 'pt-BR';
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/** O `conflict` da sessão é só de leitura para a interface; o teste o escreve. */
const conflictOf = (h: Harness) =>
  h.context.session.conflict as unknown as Signal<ExternalConflict | null>;
const reloadsOf = (h: Harness) => h.context.session.reloads as unknown as Signal<number>;

function renderDialogs(harness: Harness) {
  const dialogs = {
    current: null,
    show: vi.fn(),
    close: vi.fn(),
    requestDeleteImage: vi.fn(),
    requestDeleteMarking: vi.fn(),
  } as unknown as Dialogs;
  return render(
    <EditorContext.Provider value={harness.context}>
      <EditorDialogs dialogs={dialogs} />
    </EditorContext.Provider>,
  );
}

const dialogEl = () => document.querySelector('dialog') as HTMLElement | null;

describe('diálogo "Projeto alterado fora da app"', () => {
  it('não aparece sem conflito', () => {
    renderDialogs(createHarness(sampleProject()));
    expect(dialogEl()).toBeNull();
  });

  it('aparece com o conflito, com Recarregar e Manter as minhas', async () => {
    const harness = createHarness(sampleProject());
    renderDialogs(harness);
    conflictOf(harness).value = { reloadFailed: false };
    await vi.waitFor(() => expect(dialogEl()).not.toBeNull());
    const dialog = within(dialogEl()!);
    expect(
      dialog.getByRole('heading', { name: t('external.title'), hidden: true }),
    ).toBeTruthy();
    expect(
      dialog.getByRole('button', { name: t('external.reload'), hidden: true }),
    ).toBeTruthy();
    expect(
      dialog.getByRole('button', { name: t('external.keep'), hidden: true }),
    ).toBeTruthy();
    expect(dialog.queryByRole('alert', { hidden: true })).toBeNull();
  });

  it('cada botão decide o conflito na sessão', async () => {
    const harness = createHarness(sampleProject());
    const resolve = vi
      .spyOn(harness.context.session, 'resolveConflict')
      .mockResolvedValue(undefined);
    renderDialogs(harness);
    conflictOf(harness).value = { reloadFailed: false };
    await vi.waitFor(() => expect(dialogEl()).not.toBeNull());
    const dialog = within(dialogEl()!);

    await userEvent.click(
      dialog.getByRole('button', { name: t('external.reload'), hidden: true }),
    );
    expect(resolve).toHaveBeenLastCalledWith('reload');
    await userEvent.click(
      dialog.getByRole('button', { name: t('external.keep'), hidden: true }),
    );
    expect(resolve).toHaveBeenLastCalledWith('keep');
  });

  // Etapa 6 (6.2), achado 9: o X aparecia e não fazia nada. A escolha é obrigatória, então
  // o diálogo não tem botão de fechar; Esc e o clique no fundo também não decidem.
  it('sem o X: Esc e o clique no fundo não decidem por ninguém', async () => {
    const harness = createHarness(sampleProject());
    const resolve = vi.spyOn(harness.context.session, 'resolveConflict');
    renderDialogs(harness);
    conflictOf(harness).value = { reloadFailed: false };
    await vi.waitFor(() => expect(dialogEl()).not.toBeNull());
    expect(
      within(dialogEl()!).queryByRole('button', {
        name: t('dialog.close'),
        hidden: true,
      }),
    ).toBeNull();
    expect(within(dialogEl()!).getAllByRole('button', { hidden: true })).toHaveLength(2);
    const esc = new Event('cancel', { cancelable: true });
    dialogEl()!.dispatchEvent(esc);
    expect(esc.defaultPrevented).toBe(true);
    await userEvent.click(dialogEl()!);
    expect(resolve).not.toHaveBeenCalled();
    expect(conflictOf(harness).value).not.toBeNull();
    expect(dialogEl()).not.toBeNull();
  });

  it('avisa quando recarregar falhou', async () => {
    const harness = createHarness(sampleProject());
    renderDialogs(harness);
    conflictOf(harness).value = { reloadFailed: true };
    await vi.waitFor(() => expect(dialogEl()).not.toBeNull());
    expect(within(dialogEl()!).getByRole('alert', { hidden: true }).textContent).toBe(
      t('external.reloadFailed'),
    );
  });

  it('some quando o conflito é resolvido', async () => {
    const harness = createHarness(sampleProject());
    renderDialogs(harness);
    conflictOf(harness).value = { reloadFailed: false };
    await vi.waitFor(() => expect(dialogEl()).not.toBeNull());
    conflictOf(harness).value = null;
    await vi.waitFor(() => expect(dialogEl()).toBeNull());
  });
});

describe('avisos sobre o canvas', () => {
  const notices: EditorNotices = {
    progress: null,
    message: null,
    busy: false,
    setProgress: () => undefined,
    setMessage: () => undefined,
  };

  function renderNotices(harness: Harness) {
    return render(
      <EditorContext.Provider value={harness.context}>
        <CanvasNotices notices={notices} />
      </EditorContext.Provider>,
    );
  }

  it('mostra o aviso curto da UI (ex.: "Referência copiada")', async () => {
    const harness = createHarness(sampleProject());
    renderNotices(harness);
    expect(screen.queryByRole('status')).toBeNull();
    harness.ui.toast.value = t('copy.referenceDone');
    expect((await screen.findByRole('status')).textContent).toBe(t('copy.referenceDone'));
    harness.ui.toast.value = null;
    await vi.waitFor(() => expect(screen.queryByRole('status')).toBeNull());
  });

  it('o erro de gravação some enquanto o diálogo de conflito explica o motivo', async () => {
    const harness = createHarness(sampleProject());
    const status = harness.context.session.saveStatus as unknown as Signal<string>;
    renderNotices(harness);
    status.value = 'error';
    expect(await screen.findByRole('alert')).toBeTruthy();
    conflictOf(harness).value = { reloadFailed: false };
    await vi.waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  });
});

describe('useExternalChanges', () => {
  function Probe({ interval }: { readonly interval?: number }) {
    useExternalChanges(interval);
    return null;
  }

  function mount(harness: Harness, interval?: number) {
    return render(
      <EditorContext.Provider value={harness.context}>
        <Probe interval={interval} />
      </EditorContext.Provider>,
    );
  }

  const setVisibility = (state: 'visible' | 'hidden') =>
    Object.defineProperty(document, 'visibilityState', {
      value: state,
      configurable: true,
    });

  beforeEach(() => {
    vi.useFakeTimers();
    setVisibility('visible');
  });
  afterEach(() => Reflect.deleteProperty(document, 'visibilityState'));

  it('confere o mapping.json a cada 3 s com a janela visível (sem olhar as imagens)', async () => {
    const harness = createHarness(sampleProject());
    const sync = vi.spyOn(harness.context.session, 'sync').mockResolvedValue('unchanged');
    mount(harness);
    expect(sync).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(EXTERNAL_POLL_MS);
    expect(sync).toHaveBeenCalledTimes(1);
    expect(sync).toHaveBeenLastCalledWith({ images: false });
    await vi.advanceTimersByTimeAsync(EXTERNAL_POLL_MS * 2);
    expect(sync).toHaveBeenCalledTimes(3);
  });

  it('com a janela escondida, não confere', async () => {
    const harness = createHarness(sampleProject());
    const sync = vi.spyOn(harness.context.session, 'sync').mockResolvedValue('unchanged');
    mount(harness);
    setVisibility('hidden');
    await vi.advanceTimersByTimeAsync(EXTERNAL_POLL_MS * 3);
    window.dispatchEvent(new Event('focus'));
    expect(sync).not.toHaveBeenCalled();
  });

  it('ao voltar o foco, confere na hora, inclusive os arquivos de imagem', () => {
    const harness = createHarness(sampleProject());
    const sync = vi.spyOn(harness.context.session, 'sync').mockResolvedValue('unchanged');
    mount(harness);
    window.dispatchEvent(new Event('focus'));
    expect(sync).toHaveBeenLastCalledWith({ images: true });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(sync).toHaveBeenCalledTimes(2);
  });

  it('recarregou: avisa "Projeto atualizado por fora" e o aviso some sozinho', async () => {
    const harness = createHarness(sampleProject());
    vi.spyOn(harness.context.session, 'sync')
      .mockResolvedValueOnce('reloaded')
      .mockResolvedValue('unchanged');
    mount(harness);
    await vi.advanceTimersByTimeAsync(EXTERNAL_POLL_MS);
    expect(harness.ui.toast.value).toBe(t('editor.externalUpdated'));
    await vi.advanceTimersByTimeAsync(5000);
    expect(harness.ui.toast.value).toBeNull();
  });

  it('sem recarga (nada mudou, ou há pendências), não avisa', async () => {
    const harness = createHarness(sampleProject());
    const sync = vi.spyOn(harness.context.session, 'sync').mockResolvedValue('busy');
    mount(harness);
    await vi.advanceTimersByTimeAsync(EXTERNAL_POLL_MS);
    expect(sync).toHaveBeenCalled();
    expect(harness.ui.toast.value).toBeNull();
  });

  it('um erro da conferência vai para o Diagnóstico e a conferência continua', async () => {
    const harness = createHarness(sampleProject());
    const sync = vi
      .spyOn(harness.context.session, 'sync')
      .mockRejectedValueOnce(new Error('sem permissão'))
      .mockResolvedValue('unchanged');
    mount(harness);
    await vi.advanceTimersByTimeAsync(EXTERNAL_POLL_MS * 2);
    expect(sync).toHaveBeenCalledTimes(2);
  });

  it('projeto fora de uma pasta (não observável) não confere nada', async () => {
    const harness = createHarness(sampleProject());
    Object.defineProperty(harness.context.session, 'watchable', { value: false });
    const sync = vi.spyOn(harness.context.session, 'sync');
    mount(harness);
    await vi.advanceTimersByTimeAsync(EXTERNAL_POLL_MS * 2);
    window.dispatchEvent(new Event('focus'));
    expect(sync).not.toHaveBeenCalled();
  });

  it('ao desmontar, para de conferir', async () => {
    const harness = createHarness(sampleProject());
    const sync = vi.spyOn(harness.context.session, 'sync').mockResolvedValue('unchanged');
    const view = mount(harness);
    view.unmount();
    await vi.advanceTimersByTimeAsync(EXTERNAL_POLL_MS * 2);
    window.dispatchEvent(new Event('focus'));
    expect(sync).not.toHaveBeenCalled();
  });

  it('depois de recarregar, a seleção que deixou de existir é limpa; a que existe fica', async () => {
    const harness = createHarness(sampleProject());
    mount(harness);
    harness.ui.selection.value = { kind: 'marking', id: 'M2' };
    reloadsOf(harness).value++;
    expect(harness.ui.selection.value).toEqual({ kind: 'marking', id: 'M2' });

    harness.ui.selection.value = { kind: 'marking', id: 'sumiu' };
    reloadsOf(harness).value++;
    expect(harness.ui.selection.value).toBeNull();
  });

  // Etapa 6 (6.2), achado 8 (R6.10): com a gravação em erro (arquivo travado), a alteração
  // feita por fora abre o diálogo na conferência seguinte, sem esperar "Tentar de novo".
  describe('com a gravação em erro (fase 6.2)', () => {
    function lockedFolder() {
      const root = new MemoryDirectory('loja');
      const project = sampleProject();
      const text = serialize(project);
      root.put('mapping.json', text);
      const session = openSession({
        storage: createFolderStorage(root, { copyId: 'externa' }),
        project,
        loadedText: text,
        prepareImage: () => Promise.reject(new Error('sem imagens aqui')),
        now: () => '2026-10-11T12:00:00.000Z',
      });
      const context = createEditorContextValue({
        kind: 'folder',
        session,
        display: createDisplayImages<ImageBitmap>(() => Promise.resolve(null)),
        localId: null,
        unexported: signal(false),
      });
      const view = render(
        <EditorContext.Provider value={context}>
          <Probe />
          <EditorDialogs
            dialogs={
              {
                current: null,
                show: vi.fn(),
                close: vi.fn(),
                requestDeleteImage: vi.fn(),
                requestDeleteMarking: vi.fn(),
              } as unknown as Dialogs
            }
          />
        </EditorContext.Provider>,
      );
      return { root, project, session, view };
    }

    /** R6.9 e R6.10: edição na app com o arquivo travado, depois edição por fora. */
    async function failedThenExternal(root: MemoryDirectory, session: ProjectSession) {
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      root.failWrites = new Error('NoModificationAllowedError');
      session.actions.renameProject('Título app');
      await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
      expect(session.saveStatus.value).toBe('error');
      const external = serialize({
        ...sampleProject(),
        revision: 1,
        project: { ...sampleProject().project, name: 'Rodapé externo' },
      });
      root.put('mapping.json', external);
      return external;
    }

    it('o diálogo abre em até um ciclo da conferência', async () => {
      const { root, session, view } = lockedFolder();
      await failedThenExternal(root, session);
      expect(dialogEl()).toBeNull();
      await vi.advanceTimersByTimeAsync(EXTERNAL_POLL_MS);
      await vi.waitFor(() => expect(dialogEl()).not.toBeNull());
      expect(
        within(dialogEl()!).getByRole('heading', {
          name: t('external.title'),
          hidden: true,
        }),
      ).toBeTruthy();
      expect(session.store.project.value?.project.name).toBe('Título app');
      view.unmount();
      await session.close();
    });

    it('Recarregar a partir desse estado lê o arquivo de fora', async () => {
      const { root, session, view } = lockedFolder();
      const external = await failedThenExternal(root, session);
      await vi.advanceTimersByTimeAsync(EXTERNAL_POLL_MS);
      await vi.waitFor(() => expect(dialogEl()).not.toBeNull());
      within(dialogEl()!)
        .getByRole('button', { name: t('external.reload'), hidden: true })
        .click();
      await vi.waitFor(() => expect(dialogEl()).toBeNull());
      expect(session.store.project.value?.project.name).toBe('Rodapé externo');
      expect(session.saveStatus.value).toBe('saved');
      expect(await root.read('mapping.json')).toBe(external);
      view.unmount();
      await session.close();
    });

    it('Manter as minhas a partir desse estado grava por cima ao devolver a permissão', async () => {
      const { root, session, view } = lockedFolder();
      await failedThenExternal(root, session);
      await vi.advanceTimersByTimeAsync(EXTERNAL_POLL_MS);
      await vi.waitFor(() => expect(dialogEl()).not.toBeNull());
      root.failWrites = null;
      within(dialogEl()!)
        .getByRole('button', { name: t('external.keep'), hidden: true })
        .click();
      await vi.waitFor(() => expect(dialogEl()).toBeNull());
      await vi.waitFor(() => expect(session.saveStatus.value).toBe('saved'));
      const saved = await root.read('mapping.json');
      expect(saved).toContain('Título app');
      expect(saved).not.toContain('Rodapé externo');
      view.unmount();
      await session.close();
    });
  });

  it('camadas visíveis e ativa continuam como estavam', () => {
    const harness = createHarness(sampleProject());
    mount(harness);
    harness.ui.hiddenLayers.value = new Set(['L2']);
    harness.ui.activeLayer.value = 'L1';
    reloadsOf(harness).value++;
    expect([...harness.ui.hiddenLayers.value]).toEqual(['L2']);
    expect(harness.ui.activeLayer.value).toBe('L1');
  });
});
