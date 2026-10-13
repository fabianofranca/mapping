import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/preact';
import { modalOpen } from '../../src/ui/focus';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { signal } from '@preact/signals';
import { useState } from 'preact/hooks';
import { t } from '../../src/i18n';
import type { CanvasController } from '../../src/canvas/CanvasController';
import { hideToolWindow, isToolWindowOpen } from '../../src/store/toolWindows';
import { EditorContext } from '../../src/ui/EditorContext';
import { sampleProject } from '../model/fixtures';
import { createHarness } from './harness';
import type { EditorDialogs } from '../../src/app/useEditorDialogs';
import type { EditorNotices } from '../../src/app/useEditorNotices';

const controller = vi.hoisted(() => ({
  buildExport: vi.fn(),
  closeProject: vi.fn(),
  markExported: vi.fn(),
}));

vi.mock('../../src/app/controller', async () => {
  const { signal } = await import('@preact/signals');
  return { ...controller, openProject: signal(null) };
});

import { CanvasNotices } from '../../src/app/CanvasNotices';
import { EditorDialogs as EditorDialogsView } from '../../src/app/EditorDialogs';
import { useEditorDialogs } from '../../src/app/useEditorDialogs';
import { EditorMainBar } from '../../src/app/EditorMainBar';
import { ErrorBoundary } from '../../src/app/ErrorBoundary';
import { ExportDialog } from '../../src/app/ExportDialog';
import { useEditorNotices } from '../../src/app/useEditorNotices';
import { useEditorShortcuts } from '../../src/app/useEditorShortcuts';
import {
  useProjectCommands,
  type ProjectCommands,
} from '../../src/app/useProjectCommands';

beforeEach(() => {
  for (const fn of Object.values(controller)) fn.mockReset();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function fakeDialogs(): EditorDialogs {
  return {
    current: null,
    slot: null,
    exportButton: { current: null },
    show: vi.fn(),
    close: vi.fn(),
    requestDeleteImage: vi.fn(),
    requestDeleteMarking: vi.fn(),
  };
}

function fakeCommands(): ProjectCommands {
  return { exportProject: vi.fn(), closeProject: vi.fn() } as unknown as ProjectCommands;
}

function fakeNotices(over: Partial<EditorNotices> = {}): EditorNotices {
  return {
    progress: null,
    message: null,
    busy: false,
    setProgress: vi.fn(),
    setMessage: vi.fn(),
    ...over,
  };
}

function withContext(
  harness: ReturnType<typeof createHarness>,
  ui: preact.ComponentChildren,
) {
  return render(
    <EditorContext.Provider value={harness.context}>{ui}</EditorContext.Provider>,
  );
}

describe('useEditorNotices', () => {
  it('busy acompanha o progresso', () => {
    const ref: { current: EditorNotices | null } = { current: null };
    function Probe() {
      ref.current = useEditorNotices();
      return <output>{`${ref.current.busy}:${ref.current.message}`}</output>;
    }
    render(<Probe />);
    expect(screen.getByRole('status').textContent).toBe('false:null');
    act(() => ref.current?.setProgress('x'));
    expect(screen.getByRole('status').textContent).toBe('true:null');
    act(() => ref.current?.setMessage('erro'));
    expect(screen.getByRole('status').textContent).toBe('true:erro');
  });
});

describe('useProjectCommands', () => {
  function setup() {
    const harness = createHarness(sampleProject());
    const dialogs = fakeDialogs();
    const notices = fakeNotices();
    let commands: ProjectCommands | null = null;
    function Probe() {
      commands = useProjectCommands(dialogs, notices);
      return null;
    }
    withContext(harness, <Probe />);
    return {
      harness,
      dialogs,
      notices,
      commands: () => {
        if (!commands) throw new Error('hook não montado');
        return commands;
      },
    };
  }

  it('exportar com sucesso abre o diálogo com o arquivo', async () => {
    const s = setup();
    const file = new File(['z'], 'p.zip');
    controller.buildExport.mockResolvedValue({
      ok: true,
      value: { file, missingImages: [], saved: true },
    });
    await s.commands().exportProject();
    expect(s.notices.setProgress).toHaveBeenNthCalledWith(1, t('editor.exporting'));
    expect(s.notices.setProgress).toHaveBeenLastCalledWith(null);
    expect(s.dialogs.show).toHaveBeenCalledWith({ kind: 'export', file, saved: true });
    expect(s.notices.setMessage).toHaveBeenLastCalledWith(null);
  });

  it('exportar com imagens ausentes abre o diálogo e avisa quais faltaram', async () => {
    const s = setup();
    const file = new File(['z'], 'p.zip');
    controller.buildExport.mockResolvedValue({
      ok: true,
      value: { file, missingImages: ['images/a.jpg', 'images/b.png'], saved: true },
    });
    await s.commands().exportProject();
    expect(s.dialogs.show).toHaveBeenCalledWith({ kind: 'export', file, saved: true });
    expect(s.notices.setMessage).toHaveBeenLastCalledWith(
      t('editor.exportMissingImages', {
        count: 2,
        files: 'images/a.jpg, images/b.png',
      }),
    );
  });

  // Etapa 8 (8.7), resíduo 1 (S8): o zip com a gravação em erro leva o confirmado, que o
  // armazenamento ainda não tem; o diálogo recebe `saved` para avisar.
  it('exportar com a gravação em erro repassa saved: false ao diálogo', async () => {
    const s = setup();
    const file = new File(['z'], 'p.zip');
    controller.buildExport.mockResolvedValue({
      ok: true,
      value: { file, missingImages: [], saved: false },
    });
    await s.commands().exportProject();
    expect(s.dialogs.show).toHaveBeenCalledWith({ kind: 'export', file, saved: false });
  });

  it('exportar com erro mostra a mensagem traduzida', async () => {
    const s = setup();
    controller.buildExport.mockResolvedValue({ ok: false, error: 'storage-failed' });
    await s.commands().exportProject();
    expect(s.notices.setMessage).toHaveBeenLastCalledWith(t('error.storage-failed'));
    expect(s.dialogs.show).not.toHaveBeenCalled();
  });

  it('fechar grava e fecha o projeto', async () => {
    const s = setup();
    const flush = vi
      .spyOn(s.harness.context.session, 'flush')
      .mockResolvedValue({ ok: true });
    await s.commands().closeProject();
    expect(flush).toHaveBeenCalledOnce();
    expect(controller.closeProject).toHaveBeenCalledOnce();
    expect(s.dialogs.show).not.toHaveBeenCalled();
  });

  it('fechar com o salvamento em erro pede confirmação e não fecha', async () => {
    const s = setup();
    vi.spyOn(s.harness.context.session, 'flush').mockResolvedValue({ ok: true });
    Object.defineProperty(s.harness.context.session, 'saveStatus', {
      value: signal('error'),
    });
    await s.commands().closeProject();
    expect(s.dialogs.show).toHaveBeenCalledWith({ kind: 'confirmClose' });
    expect(controller.closeProject).not.toHaveBeenCalled();
  });
});

describe('useEditorShortcuts', () => {
  function setup(readOnly = false) {
    const harness = createHarness(sampleProject(), readOnly);
    const dialogs = fakeDialogs();
    const cancelInteraction = vi.fn(() => false);
    harness.context.canvas.current = { cancelInteraction } as unknown as CanvasController;
    const commands: ProjectCommands = {
      exportProject: vi.fn(),
      closeProject: vi.fn(),
    };
    function Probe() {
      useEditorShortcuts(dialogs, commands);
      return null;
    }
    withContext(harness, <Probe />);
    return { harness, dialogs, cancelInteraction, commands };
  }

  it('Ctrl+Z desfaz e Ctrl+Shift+Z refaz', () => {
    const { harness } = setup();
    harness.actions.renameProject('Novo');
    expect(harness.project().project.name).toBe('Novo');
    fireEvent.keyDown(window, { key: 'z', ctrlKey: true });
    expect(harness.project().project.name).not.toBe('Novo');
    fireEvent.keyDown(window, { key: 'z', ctrlKey: true, shiftKey: true });
    expect(harness.project().project.name).toBe('Novo');
  });

  it('Esc cancela o gesto; sem gesto, limpa a seleção', () => {
    const { harness, cancelInteraction } = setup();
    harness.ui.selection.value = { kind: 'marking', id: 'M1' };
    cancelInteraction.mockReturnValueOnce(true);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(harness.ui.selection.value).not.toBeNull();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(harness.ui.selection.value).toBeNull();
  });

  it('Delete pede a exclusão da marcação ou da imagem selecionada', () => {
    const { harness, dialogs } = setup();
    harness.ui.selection.value = { kind: 'marking', id: 'M1' };
    fireEvent.keyDown(window, { key: 'Delete' });
    expect(dialogs.requestDeleteMarking).toHaveBeenCalledOnce();
    harness.ui.selection.value = { kind: 'image', id: 'I1' };
    fireEvent.keyDown(window, { key: 'Delete' });
    expect(dialogs.requestDeleteImage).toHaveBeenCalledOnce();
  });

  it('Ctrl+L abre e foca a janela Camadas no desktop', async () => {
    const { dialogs } = setup();
    hideToolWindow('layers');
    expect(isToolWindowOpen('layers')).toBe(false);
    fireEvent.keyDown(window, { key: 'l', ctrlKey: true });
    expect(isToolWindowOpen('layers')).toBe(true);
    expect(dialogs.show).not.toHaveBeenCalled();
  });

  it('somente leitura não exclui', () => {
    const { harness, dialogs } = setup(true);
    harness.ui.selection.value = { kind: 'marking', id: 'M1' };
    fireEvent.keyDown(window, { key: 'Delete' });
    expect(dialogs.requestDeleteMarking).not.toHaveBeenCalled();
  });

  it('ignora teclas em campos de texto e com diálogo aberto', () => {
    const { harness, dialogs } = setup();
    harness.ui.selection.value = { kind: 'marking', id: 'M1' };
    const input = document.createElement('input');
    document.body.append(input);
    fireEvent.keyDown(input, { key: 'Delete' });
    input.remove();
    // Etapa 8 (8.3), F4: um modal aberto conta em `modalOpen` (no lugar de `dialog[open]`).
    modalOpen.value += 1;
    fireEvent.keyDown(window, { key: 'Delete' });
    modalOpen.value -= 1;
    fireEvent.keyDown(window, { key: 'a' });
    expect(dialogs.requestDeleteMarking).not.toHaveBeenCalled();
  });
});

describe('CanvasNotices', () => {
  it('mostra mensagem, progresso e dica de desenho; a mensagem pode ser dispensada', async () => {
    const harness = createHarness(sampleProject());
    harness.ui.mode.value = 'draw';
    const notices = fakeNotices({ message: 'Deu ruim', progress: 'Importando' });
    withContext(harness, <CanvasNotices notices={notices} />);
    expect(screen.getByRole('alert').textContent).toContain('Deu ruim');
    expect(screen.getByText('Importando')).toBeTruthy();
    expect(screen.getByText(t('editor.drawHint'))).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: t('editor.dismiss') }));
    expect(notices.setMessage).toHaveBeenCalledWith(null);
  });

  it('somente leitura mostra o aviso e esconde a dica de desenho', () => {
    const harness = createHarness(sampleProject(), true);
    harness.ui.mode.value = 'draw';
    withContext(harness, <CanvasNotices notices={fakeNotices()} />);
    expect(screen.getByText(t('editor.readOnlyNotice'))).toBeTruthy();
    expect(screen.queryByText(t('editor.drawHint'))).toBeNull();
  });
});

describe('ErrorBoundary', () => {
  it('mostra a tela de falha e oferece recarregar', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    function Boom(): never {
      throw new Error('quebrou');
    }
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );
    expect(screen.getByRole('alert').textContent).toContain(t('error.crashed'));
    expect(screen.getByRole('button', { name: t('error.reload') })).toBeTruthy();
  });

  it('sem erro, renderiza os filhos', () => {
    render(
      <ErrorBoundary>
        <p>ok</p>
      </ErrorBoundary>,
    );
    expect(screen.getByText('ok')).toBeTruthy();
  });
});

describe('ExportDialog', () => {
  it('baixar marca como exportado e fecha', async () => {
    const onDone = vi.fn();
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);
    Object.assign(URL, {
      createObjectURL: vi.fn(() => 'blob:x'),
      revokeObjectURL: vi.fn(),
    });
    render(<ExportDialog file={new File(['z'], 'p.zip')} onDone={onDone} />);
    await userEvent.click(screen.getByRole('button', { name: t('export.download') }));
    expect(click).toHaveBeenCalled();
    expect(controller.markExported).toHaveBeenCalledOnce();
    expect(onDone).toHaveBeenCalledOnce();
  });

  it('compartilhar com sucesso marca como exportado; falha mostra erro', async () => {
    const onDone = vi.fn();
    const share = vi.fn().mockResolvedValueOnce(undefined);
    Object.defineProperty(navigator, 'canShare', {
      configurable: true,
      value: () => true,
    });
    Object.defineProperty(navigator, 'share', { configurable: true, value: share });
    render(<ExportDialog file={new File(['z'], 'p.zip')} onDone={onDone} />);
    await userEvent.click(screen.getByRole('button', { name: t('export.share') }));
    expect(onDone).toHaveBeenCalledOnce();
    expect(controller.markExported).toHaveBeenCalledOnce();

    share.mockRejectedValueOnce(new Error('falhou'));
    await userEvent.click(screen.getByRole('button', { name: t('export.share') }));
    expect((await screen.findByRole('alert')).textContent).toBe(t('export.shareFailed'));
    Reflect.deleteProperty(navigator, 'canShare');
    Reflect.deleteProperty(navigator, 'share');
  });

  it('mostra o arquivo gerado, com o tamanho', () => {
    render(
      <ExportDialog
        file={new File([new Uint8Array(2048)], 'projeto.zip')}
        onDone={vi.fn()}
      />,
    );
    const card = document.querySelector('.file-card') as HTMLElement;
    expect(card.textContent).toContain('projeto.zip');
    expect(card.textContent).toContain(t('export.fileMeta', { size: '2 KB' }));
  });

  // Etapa 8 (8.7), resíduo 1 (S8).
  it('com a gravação em erro, avisa que o zip leva alterações ainda não salvas', () => {
    render(
      <ExportDialog file={new File(['z'], 'p.zip')} saved={false} onDone={vi.fn()} />,
    );
    expect(screen.getByRole('status').textContent).toBe(t('export.unsaved'));
  });

  it('com tudo gravado, não mostra o aviso', () => {
    render(<ExportDialog file={new File(['z'], 'p.zip')} saved onDone={vi.fn()} />);
    expect(screen.queryByText(t('export.unsaved'))).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('cancelar só fecha', async () => {
    const onDone = vi.fn();
    render(<ExportDialog file={new File(['z'], 'p.zip')} onDone={onDone} />);
    await userEvent.click(screen.getByRole('button', { name: t('common.cancel') }));
    expect(onDone).toHaveBeenCalledOnce();
    expect(controller.markExported).not.toHaveBeenCalled();
  });
});

// Etapa 7 (7.1), achado A1: o zip é gerado antes de o diálogo abrir, com o botão Exportar
// desabilitado (o Chrome tira o foco dele), então o diálogo não tem a quem devolver o foco.
describe('ExportDialog: foco ao fechar', () => {
  function ExportFlow({
    harness,
  }: {
    readonly harness: ReturnType<typeof createHarness>;
  }) {
    const [busy, setBusy] = useState(false);
    const [file, setFile] = useState<File | null>(null);
    // Etapa 8 (8.3), F4: o retorno vem do botão da barra (buttonRef), não de um seletor.
    const [dialogs] = useState(fakeDialogs);
    const commands = {
      exportProject: async () => {
        setBusy(true);
        // O botão fica desabilitado enquanto o zip é gerado: o foco cai no body.
        (document.activeElement as HTMLElement | null)?.blur();
        await Promise.resolve();
        setBusy(false);
        setFile(new File(['z'], 'p.zip'));
      },
      closeProject: vi.fn(),
    } as unknown as ProjectCommands;
    return (
      <EditorContext.Provider value={harness.context}>
        <EditorMainBar
          busy={busy}
          onAdd={vi.fn()}
          dialogs={dialogs}
          commands={commands}
        />
        {file && (
          <ExportDialog
            file={file}
            onDone={() => setFile(null)}
            returnFocus={() => dialogs.exportButton.current}
          />
        )}
      </EditorContext.Provider>
    );
  }

  async function openExport() {
    render(<ExportFlow harness={createHarness(sampleProject())} />);
    const user = userEvent.setup();
    const button = screen.getByRole('button', { name: t('editor.export') });
    await user.click(button);
    const dialog = await vi.waitFor(() => {
      const el = document.querySelector('dialog');
      // Aberto de fato: o foco inicial já entrou nele.
      if (!el?.contains(document.activeElement)) throw new Error('ainda não abriu');
      return el;
    });
    return { user, button, dialog };
  }

  it('Cancelar devolve o foco ao botão Exportar (e não ao body)', async () => {
    const { user, button, dialog } = await openExport();
    await user.click(
      within(dialog).getByRole('button', { name: t('common.cancel'), hidden: true }),
    );
    await vi.waitFor(() => expect(document.querySelector('dialog')).toBeNull());
    expect(document.activeElement).toBe(button);
  });

  it('Esc devolve o foco ao botão Exportar', async () => {
    const { button, dialog } = await openExport();
    dialog.dispatchEvent(new Event('cancel', { cancelable: true }));
    await vi.waitFor(() => expect(document.querySelector('dialog')).toBeNull());
    expect(document.activeElement).toBe(button);
  });
});

// Fase 6.1 (achado 7): no Chrome e no Edge, Baixar abre o "Salvar como" pelo
// `showSaveFilePicker`; o projeto só conta como exportado depois de o arquivo ser gravado.
describe('ExportDialog com o seletor de arquivo', () => {
  const steps: string[] = [];

  function installPicker(outcome: 'cancel' | 'save'): ReturnType<typeof vi.fn> {
    const picker = vi.fn(() => {
      steps.push('picker');
      if (outcome === 'cancel') {
        return Promise.reject(new DOMException('cancelado', 'AbortError'));
      }
      return Promise.resolve({
        createWritable: () =>
          Promise.resolve({
            write: (data: Blob) => {
              steps.push(`write:${data.size}`);
              return Promise.resolve();
            },
            close: () => {
              steps.push('close');
              return Promise.resolve();
            },
            abort: () => Promise.resolve(),
          }),
      });
    });
    Reflect.set(globalThis, 'showSaveFilePicker', picker);
    return picker;
  }

  beforeEach(() => {
    steps.length = 0;
    controller.markExported.mockImplementation(() => {
      steps.push('markExported');
      return Promise.resolve();
    });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {
      steps.push('download');
    });
    Object.assign(URL, {
      createObjectURL: vi.fn(() => 'blob:x'),
      revokeObjectURL: vi.fn(),
    });
  });

  afterEach(() => {
    Reflect.deleteProperty(globalThis, 'showSaveFilePicker');
    vi.restoreAllMocks();
  });

  it('cancelar o "Salvar como" não marca como exportado e mantém o diálogo', async () => {
    installPicker('cancel');
    const onDone = vi.fn();
    render(<ExportDialog file={new File(['z'], 'p.zip')} onDone={onDone} />);
    await userEvent.click(screen.getByRole('button', { name: t('export.download') }));
    expect(controller.markExported).not.toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();
    expect(steps).toEqual(['picker']);
    expect(screen.getByRole('button', { name: t('export.download') })).toBeTruthy();
  });

  it('salvar grava pelo handle e só depois do close marca como exportado', async () => {
    const picker = installPicker('save');
    const onDone = vi.fn();
    render(<ExportDialog file={new File(['zip!'], 'p.zip')} onDone={onDone} />);
    await userEvent.click(screen.getByRole('button', { name: t('export.download') }));
    expect(steps).toEqual(['picker', 'write:4', 'close', 'markExported']);
    expect(picker).toHaveBeenCalledWith(
      expect.objectContaining({
        suggestedName: 'p.zip',
        types: [expect.objectContaining({ accept: { 'application/zip': ['.zip'] } })],
      }),
    );
    expect(onDone).toHaveBeenCalledOnce();
    expect(screen.queryByText(t('export.downloadHint'))).toBeNull();
  });

  it('falha ao gravar mostra o erro, descarta a gravação e não marca', async () => {
    const abort = vi.fn(() => Promise.resolve());
    Reflect.set(globalThis, 'showSaveFilePicker', () =>
      Promise.resolve({
        createWritable: () =>
          Promise.resolve({
            write: () => Promise.reject(new DOMException('cheio', 'QuotaExceededError')),
            close: () => Promise.resolve(),
            abort,
          }),
      }),
    );
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const onDone = vi.fn();
    render(<ExportDialog file={new File(['z'], 'p.zip')} onDone={onDone} />);
    await userEvent.click(screen.getByRole('button', { name: t('export.download') }));
    expect((await screen.findByRole('alert')).textContent).toBe(t('export.saveFailed'));
    expect(abort).toHaveBeenCalledOnce();
    expect(controller.markExported).not.toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();
  });

  it('sem o seletor, baixa como antes e avisa que cancelar exige exportar de novo', async () => {
    const onDone = vi.fn();
    render(<ExportDialog file={new File(['z'], 'p.zip')} onDone={onDone} />);
    expect(screen.getByText(t('export.downloadHint'))).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: t('export.download') }));
    expect(steps).toEqual(['download', 'markExported']);
    expect(onDone).toHaveBeenCalledOnce();
  });

  it('cancelar o compartilhamento não marca como exportado', async () => {
    Object.defineProperty(navigator, 'canShare', {
      configurable: true,
      value: () => true,
    });
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: () => Promise.reject(new DOMException('cancelado', 'AbortError')),
    });
    const onDone = vi.fn();
    render(<ExportDialog file={new File(['z'], 'p.zip')} onDone={onDone} />);
    await userEvent.click(screen.getByRole('button', { name: t('export.share') }));
    expect(controller.markExported).not.toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();
    expect(screen.queryByRole('alert')).toBeNull();
    Reflect.deleteProperty(navigator, 'canShare');
    Reflect.deleteProperty(navigator, 'share');
  });
});

describe('barras do editor', () => {
  it('principal (desktop): modo, desfazer, exportar e os diálogos da barra', async () => {
    const harness = createHarness(sampleProject());
    const dialogs = fakeDialogs();
    const commands = { exportProject: vi.fn(), closeProject: vi.fn() };
    withContext(
      harness,
      <EditorMainBar
        busy={false}
        onAdd={vi.fn()}
        dialogs={dialogs}
        commands={commands as unknown as ProjectCommands}
      />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: t('editor.modeDraw') }));
    expect(harness.ui.mode.value).toBe('draw');
    await user.click(screen.getByRole('button', { name: t('editor.undo') }));
    expect(harness.ui.mode.value).toBe('draw');
    await user.click(screen.getByRole('button', { name: t('editor.export') }));
    expect(commands.exportProject).toHaveBeenCalledOnce();
    await user.click(screen.getByRole('button', { name: t('spec.menu') }));
    expect(dialogs.show).toHaveBeenCalledWith({ kind: 'specs' });
    await user.click(screen.getByRole('button', { name: t('help.open') }));
    expect(dialogs.show).toHaveBeenCalledWith({ kind: 'help' });
    await user.click(screen.getByRole('button', { name: t('settings.title') }));
    expect(dialogs.show).toHaveBeenCalledWith({ kind: 'settings' });
    // O estado do salvamento saiu da barra (foi para a barra de status).
    expect(screen.queryByText(t('status.saved'))).toBeNull();
  });

  it('menu do projeto (desktop): exportar e fechar', async () => {
    const harness = createHarness(sampleProject());
    const commands = { exportProject: vi.fn(), closeProject: vi.fn() };
    withContext(
      harness,
      <EditorMainBar
        busy={false}
        onAdd={vi.fn()}
        dialogs={fakeDialogs()}
        commands={commands as unknown as ProjectCommands}
      />,
    );
    const user = userEvent.setup();
    const trigger = screen.getByRole('button', { name: t('editor.projectMenu') });
    expect(trigger.textContent).toContain(harness.project().project.name);
    await user.click(trigger);
    await user.click(screen.getByRole('button', { name: t('editor.closeProject') }));
    expect(commands.closeProject).toHaveBeenCalledOnce();
    // O menu fecha ao escolher.
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('barra principal: o chip da camada ativa abre a janela Camadas (sem diálogo)', async () => {
    const harness = createHarness(sampleProject());
    const dialogs = fakeDialogs();
    hideToolWindow('layers');
    withContext(
      harness,
      <EditorMainBar
        busy={false}
        onAdd={vi.fn()}
        dialogs={dialogs}
        commands={{ exportProject: vi.fn(), closeProject: vi.fn() } as ProjectCommands}
      />,
    );
    const name = harness.project().layers[0]?.name ?? '';
    await userEvent.click(
      screen.getByRole('button', { name: t('layer.chipLabel', { name }) }),
    );
    expect(isToolWindowOpen('layers')).toBe(true);
    expect(dialogs.show).not.toHaveBeenCalled();
  });

  it('principal: somente leitura ou ocupado desabilita desenhar e adicionar', () => {
    const harness = createHarness(sampleProject(), true);
    withContext(
      harness,
      <EditorMainBar
        busy
        onAdd={vi.fn()}
        dialogs={fakeDialogs()}
        commands={fakeCommands()}
      />,
    );
    expect(
      screen.getByRole('button', { name: t('editor.modeDraw') }).hasAttribute('disabled'),
    ).toBe(true);
    expect(
      screen
        .getByRole('button', { name: t('editor.addImages') })
        .hasAttribute('disabled'),
    ).toBe(true);
  });
});

// Etapa 8 (8.3), achado F3: a troca de diálogo no mesmo slot (Configurações › Ver atalhos)
// desmontava o antigo antes de o novo guardar quem abriu; o Esc deixava o foco no primeiro
// controle da app (ou no body), e não no botão Configurações.
describe('troca de diálogo no editor (F3)', () => {
  function Shell() {
    const dialogs = useEditorDialogs();
    return (
      <>
        <EditorMainBar
          busy={false}
          onAdd={vi.fn()}
          dialogs={dialogs}
          commands={fakeCommands()}
        />
        <EditorDialogsView dialogs={dialogs} />
      </>
    );
  }

  it('Configurações › Ver atalhos › Esc volta ao botão Configurações', async () => {
    Element.prototype.scrollIntoView = vi.fn();
    withContext(createHarness(sampleProject()), <Shell />);
    const user = userEvent.setup();
    const settings = screen.getByRole('button', { name: t('settings.title') });
    await user.click(settings);
    await user.click(
      await screen.findByRole('button', { name: t('settings.shortcuts'), hidden: true }),
    );
    const help = await vi.waitFor(() => {
      const el = document.querySelector('dialog');
      if (!el?.querySelector('.help')) throw new Error('a Ajuda ainda não abriu');
      return el;
    });
    help.dispatchEvent(new Event('cancel', { cancelable: true }));
    await vi.waitFor(() => expect(document.querySelector('dialog')).toBeNull());
    expect(document.activeElement).toBe(settings);
  });
});
