import { cleanup, fireEvent, render, screen, within } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CanvasController } from '../../src/canvas/CanvasController';
import { t } from '../../src/i18n';
import { locale, semanticText, setSemanticText } from '../../src/store/settings';
import type { SheetHeight } from '../../src/store/ui';
import { BottomSheet, SHEET_SWIPE } from '../../src/ui/BottomSheet';
import { EditorContext } from '../../src/ui/EditorContext';
import { sampleProject } from '../model/fixtures';
import { createHarness, type Harness } from './harness';
import type { EditorPanelProps } from '../../src/app/EditorPanel';
import type { EditorDialogs } from '../../src/app/useEditorDialogs';
import type { ProjectCommands } from '../../src/app/useProjectCommands';

vi.mock('../../src/app/controller', async () => {
  const { signal } = await import('@preact/signals');
  return { closeProject: vi.fn(), openProject: signal(null) };
});

import { EditorSheet } from '../../src/app/EditorPanel';
import { MobileWindow } from '../../src/app/MobileWindow';
import { PanelsMenu } from '../../src/app/PanelsMenu';

// Layout do celular (R8): telas cheias com a faixa de abas (B6), menu Painéis (B6) e a
// gaveta de três alturas (B7).

beforeEach(() => {
  locale.value = 'pt-BR';
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function withContext(harness: Harness, ui: preact.ComponentChildren) {
  return render(
    <EditorContext.Provider value={harness.context}>{ui}</EditorContext.Provider>,
  );
}

function fakeDialogs(): EditorDialogs {
  return {
    current: null,
    show: vi.fn(),
    close: vi.fn(),
    requestDeleteImage: vi.fn(),
    requestDeleteMarking: vi.fn(),
  };
}

function fakePanel(): EditorPanelProps {
  return {
    busy: false,
    dialogs: fakeDialogs(),
    onReplace: vi.fn(),
    onGoToAnnotation: vi.fn(),
  };
}

function fakeCanvas(harness: Harness) {
  const canvas = { focusSelection: vi.fn() };
  harness.context.canvas.current = canvas as unknown as CanvasController;
  return canvas;
}

describe('tela cheia (B6)', () => {
  function setup(id: 'layers' | 'tree' | 'list' | 'incomplete' | 'diagnostics') {
    const harness = createHarness(sampleProject());
    harness.ui.mobileWindow.value = id;
    const onBack = vi.fn();
    const onSelect = vi.fn();
    const view = withContext(
      harness,
      <MobileWindow id={id} panel={fakePanel()} onSelect={onSelect} onBack={onBack} />,
    );
    return { harness, onBack, onSelect, view, user: userEvent.setup() };
  }

  it('Camadas: voltar, título, ações no cabeçalho e a lista', async () => {
    const { harness, onBack, user } = setup('layers');
    const screenEl = screen.getByRole('region', { name: t('layer.title') });
    expect(within(screenEl).getByRole('heading', { level: 1 }).textContent).toBe(
      t('layer.title'),
    );
    // O foco começa no voltar.
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: t('mobile.back') }),
    );
    await user.click(screen.getByRole('button', { name: t('layer.add') }));
    expect(harness.project().layers).toHaveLength(3);
    expect(screen.getAllByLabelText(t('layer.name'))).toHaveLength(3);
    await user.click(screen.getByRole('button', { name: t('mobile.back') }));
    expect(onBack).toHaveBeenCalledOnce();
  });

  it('a faixa de abas troca de janela e mostra as pendências', async () => {
    const { harness, user } = setup('layers');
    const strip = screen.getByRole('tablist', { name: t('window.stripLabel') });
    const tabs = within(strip).getAllByRole('tab');
    expect(tabs.map((tab) => tab.textContent?.replace(/\d+$/, ''))).toEqual([
      t('panel.tree'),
      t('layer.title'),
      t('panel.details'),
      t('view.list'),
      t('incomplete.title'),
      t('diagnostics.title'),
    ]);
    expect(within(strip).getByRole('tab', { name: t('layer.title') }).ariaSelected).toBe(
      'true',
    );
    await user.click(within(strip).getByRole('tab', { name: t('view.list') }));
    expect(harness.ui.mobileWindow.value).toBe('list');
  });

  it('Árvore: escolher um item chama onSelect (que volta ao canvas)', async () => {
    const { onSelect, user } = setup('tree');
    await user.click(screen.getByRole('button', { name: /^Porta/ }));
    expect(onSelect).toHaveBeenCalledWith({ kind: 'marking', id: 'M1' });
  });

  it('Esc volta ao canvas', () => {
    const { onBack } = setup('diagnostics');
    fireEvent.keyDown(screen.getByRole('button', { name: t('mobile.back') }), {
      key: 'Escape',
    });
    expect(onBack).toHaveBeenCalledOnce();
  });

  it('Diagnóstico: Copiar e Limpar no cabeçalho', () => {
    setup('diagnostics');
    const header = screen.getByRole('heading', { level: 1 }).parentElement;
    if (!header) throw new Error('sem cabeçalho');
    expect(
      within(header).getByRole('button', { name: t('diagnostics.copy') }),
    ).toBeTruthy();
    expect(
      within(header).getByRole('button', { name: t('diagnostics.clear') }),
    ).toBeTruthy();
  });
});

describe('menu Painéis (B6)', () => {
  function setup(busy = false) {
    const harness = createHarness(sampleProject());
    const dialogs = fakeDialogs();
    const commands = { exportProject: vi.fn(), closeProject: vi.fn() };
    withContext(
      harness,
      <PanelsMenu
        dialogs={dialogs}
        commands={commands as unknown as ProjectCommands}
        busy={busy}
      />,
    );
    return { harness, dialogs, commands, user: userEvent.setup() };
  }

  it('as seis janelas abrem em tela cheia e fecham o menu', async () => {
    const { harness, dialogs, user } = setup();
    const menu = screen.getByRole('dialog', { name: t('panels.title') });
    const tiles = within(menu)
      .getAllByRole('button')
      .filter((b) => b.classList.contains('panel-tile'));
    expect(tiles).toHaveLength(6);
    await user.click(within(menu).getByRole('button', { name: /^Incompletas/ }));
    expect(dialogs.close).toHaveBeenCalled();
    expect(harness.ui.mobileWindow.value).toBe('incomplete');
  });

  it('ações do projeto: exportar, especializações, ajuda, configurações e fechar', async () => {
    const { dialogs, commands, user } = setup();
    await user.click(screen.getByRole('button', { name: t('editor.export') }));
    expect(commands.exportProject).toHaveBeenCalledOnce();
    await user.click(screen.getByRole('button', { name: t('spec.menu') }));
    expect(dialogs.show).toHaveBeenCalledWith({ kind: 'specs' });
    await user.click(screen.getByRole('button', { name: t('help.open') }));
    expect(dialogs.show).toHaveBeenCalledWith({ kind: 'help' });
    await user.click(screen.getByRole('button', { name: t('settings.title') }));
    expect(dialogs.show).toHaveBeenCalledWith({ kind: 'settings' });
    await user.click(screen.getByRole('button', { name: t('editor.closeProject') }));
    expect(commands.closeProject).toHaveBeenCalledOnce();
  });

  it('Texto no canvas é uma caixa de seleção; o rodapé resume o status', async () => {
    setSemanticText(false);
    const { user } = setup();
    await user.click(screen.getByLabelText(t('view.semanticText')));
    expect(semanticText.value).toBe(true);
    setSemanticText(false);
    expect(screen.getByText(t('status.saved'))).toBeTruthy();
    expect(
      screen.getByText(t('status.targetLabel', { target: t('status.targetFolder') })),
    ).toBeTruthy();
  });

  it('ocupado: exportar desabilitado', () => {
    setup(true);
    expect(
      screen.getByRole<HTMLButtonElement>('button', { name: t('editor.export') })
        .disabled,
    ).toBe(true);
  });
});

describe('gaveta (B7)', () => {
  function setup(initial: SheetHeight = 'peek') {
    let height = initial;
    const onHeightChange = vi.fn((next: SheetHeight) => (height = next));
    const onFull = vi.fn();
    const view = render(
      <BottomSheet
        title="Porta"
        height={height}
        onHeightChange={onHeightChange}
        onFull={onFull}
      >
        <p>conteúdo</p>
      </BottomSheet>,
    );
    const rerender = () =>
      view.rerender(
        <BottomSheet
          title="Porta"
          height={height}
          onHeightChange={onHeightChange}
          onFull={onFull}
        >
          <p>conteúdo</p>
        </BottomSheet>,
      );
    return { onHeightChange, onFull, rerender, view };
  }

  /** Arrasta o cabeçalho na vertical (dy negativo: para cima). */
  function swipe(header: Element, dy: number) {
    fireEvent.pointerDown(header, { button: 0, clientY: 300, pointerId: 1 });
    fireEvent.pointerMove(header, { clientY: 300 + dy, pointerId: 1 });
    fireEvent.pointerUp(header, { clientY: 300 + dy, pointerId: 1 });
  }

  it('recolhida mostra só o cabeçalho; o botão abre e recolhe', async () => {
    const { onHeightChange, rerender } = setup();
    expect(screen.queryByText('conteúdo')).toBeNull();
    expect(screen.queryByRole('button', { name: t('sheet.full') })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: t('panel.expand') }));
    expect(onHeightChange).toHaveBeenLastCalledWith('open');
    rerender();
    expect(screen.getByText('conteúdo')).toBeTruthy();
    const collapse = screen.getByRole('button', { name: t('panel.collapse') });
    expect(collapse.getAttribute('aria-expanded')).toBe('true');
    await userEvent.click(collapse);
    expect(onHeightChange).toHaveBeenLastCalledWith('peek');
  });

  it('aberta: o botão de tela cheia é a terceira altura', async () => {
    const { onFull } = setup('open');
    await userEvent.click(screen.getByRole('button', { name: t('sheet.full') }));
    expect(onFull).toHaveBeenCalledOnce();
  });

  it('arrastar o cabeçalho sobe ou desce uma altura; tocar alterna', () => {
    const { onHeightChange, onFull, rerender, view } = setup();
    const header = () => {
      const el = view.container.querySelector('.sheet-header');
      if (!el) throw new Error('sem cabeçalho');
      return el;
    };
    swipe(header(), -SHEET_SWIPE * 2);
    expect(onHeightChange).toHaveBeenLastCalledWith('open');
    rerender();
    swipe(header(), -SHEET_SWIPE * 2);
    expect(onFull).toHaveBeenCalledOnce();
    swipe(header(), SHEET_SWIPE * 2);
    expect(onHeightChange).toHaveBeenLastCalledWith('peek');
    rerender();
    // Um toque (sem deslocamento) alterna.
    swipe(header(), 0);
    expect(onHeightChange).toHaveBeenLastCalledWith('open');
  });

  it('EditorSheet: título da seleção e tela cheia em Detalhes', async () => {
    const harness = createHarness(sampleProject());
    fakeCanvas(harness);
    harness.ui.selection.value = { kind: 'marking', id: 'M1' };
    harness.ui.sheet.value = 'open';
    const { container } = withContext(harness, <EditorSheet {...fakePanel()} />);
    expect(container.querySelector('.sheet-title')?.textContent).toBe('Porta');
    await userEvent.click(screen.getByRole('button', { name: t('sheet.full') }));
    expect(harness.ui.mobileWindow.value).toBe('details');
  });
});
