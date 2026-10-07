import { cleanup, render } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CanvasController } from '../../src/canvas/CanvasController';
import type { EditorDialogs } from '../../src/app/useEditorDialogs';
import type { ProjectCommands } from '../../src/app/useProjectCommands';
import { useEditorShortcuts } from '../../src/app/useEditorShortcuts';
import { t } from '../../src/i18n';
import { ITEM_CLIPBOARD_MIME, parseRef } from '../../src/model';
import * as imageCrop from '../../src/storage/imageCrop';
import {
  RESIZE_STEP,
  hideToolWindow,
  isToolWindowOpen,
  resetToolWindowSize,
  showToolWindow,
  toolWindowSizes,
} from '../../src/store/toolWindows';
import { ADD_ANNOTATION_ACTION } from '../../src/ui/AnnotationsPanel';
import { EditorContext } from '../../src/ui/EditorContext';
import { createHarness, type Harness } from '../components/harness';
import { sampleProject } from '../model/fixtures';

// Atalhos do editor ligados ao store, à UI e ao canvas: o que cada tecla faz de verdade
// (a tradução tecla → atalho é testada à parte, em `shortcuts.test.ts`).

type Mods = Partial<Record<'ctrl' | 'meta' | 'shift' | 'alt', boolean>>;

interface Fake {
  readonly harness: Harness;
  readonly dialogs: {
    [K in keyof EditorDialogs]: EditorDialogs[K] extends (...a: never[]) => unknown
      ? ReturnType<typeof vi.fn>
      : EditorDialogs[K];
  };
  readonly commands: {
    exportProject: ReturnType<typeof vi.fn>;
    closeProject: () => Promise<void>;
  };
  readonly canvas: {
    cancelInteraction: ReturnType<typeof vi.fn>;
    focusSelection: ReturnType<typeof vi.fn>;
    zoomBy: ReturnType<typeof vi.fn>;
    zoomTo: ReturnType<typeof vi.fn>;
  };
  readonly press: (key: string, mods?: Mods, init?: KeyboardEventInit) => KeyboardEvent;
  readonly rerender: (dialogs: EditorDialogs) => void;
  readonly unmount: () => void;
}

function Probe({
  dialogs,
  commands,
  desktop,
}: {
  readonly dialogs: EditorDialogs;
  readonly commands: ProjectCommands;
  readonly desktop: boolean;
}) {
  useEditorShortcuts(dialogs, commands, desktop);
  return null;
}

function setup({ desktop = true, readOnly = false } = {}): Fake {
  const harness = createHarness(sampleProject(), readOnly);
  const canvas = {
    cancelInteraction: vi.fn(() => false),
    focusSelection: vi.fn(),
    zoomBy: vi.fn(),
    zoomTo: vi.fn(),
  };
  harness.context.canvas.current = canvas as unknown as CanvasController;
  const dialogs = {
    current: null,
    show: vi.fn(),
    close: vi.fn(),
    requestDeleteImage: vi.fn(),
    requestDeleteMarking: vi.fn(),
  } as unknown as Fake['dialogs'];
  const commands = {
    exportProject: vi.fn(() => Promise.resolve()),
    closeProject: () => Promise.resolve(),
  };
  const tree = (d: EditorDialogs) => (
    <EditorContext.Provider value={harness.context}>
      <Probe dialogs={d} commands={commands} desktop={desktop} />
    </EditorContext.Provider>
  );
  const view = render(tree(dialogs as unknown as EditorDialogs));
  return {
    harness,
    dialogs,
    commands,
    canvas,
    press: (key, mods = {}, init = {}) => {
      const event = new KeyboardEvent('keydown', {
        key,
        ctrlKey: mods.ctrl ?? false,
        metaKey: mods.meta ?? false,
        shiftKey: mods.shift ?? false,
        altKey: mods.alt ?? false,
        bubbles: true,
        cancelable: true,
        ...init,
      });
      window.dispatchEvent(event);
      return event;
    },
    rerender: (d) => view.rerender(tree(d)),
    unmount: view.unmount,
  };
}

const marking = (h: Harness, id: string) => {
  const found = h.project().markings.find((m) => m.id === id);
  if (!found) throw new Error(id);
  return found;
};

/** Dispara o evento a partir de um elemento (o alvo conta para campos de texto). */
function pressOn(el: Element, key: string, mods: Mods = {}): KeyboardEvent {
  const event = new KeyboardEvent('keydown', {
    key,
    ctrlKey: mods.ctrl ?? false,
    shiftKey: mods.shift ?? false,
    altKey: mods.alt ?? false,
    bubbles: true,
    cancelable: true,
  });
  el.dispatchEvent(event);
  return event;
}

beforeEach(() => {
  for (const id of ['tree', 'layers', 'details', 'list'] as const) hideToolWindow(id);
});
afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('useEditorShortcuts: edição', () => {
  it('Ctrl+Z desfaz, Ctrl+Shift+Z e Ctrl+Y refazem, e o navegador não recebe a tecla', () => {
    const s = setup();
    s.harness.actions.renameLayer('L1', 'Pintura');
    expect(s.press('z', { ctrl: true }).defaultPrevented).toBe(true);
    expect(s.harness.project().layers[0]?.name).toBe('Lataria');
    s.press('z', { ctrl: true, shift: true });
    expect(s.harness.project().layers[0]?.name).toBe('Pintura');
    s.press('z', { ctrl: true });
    s.press('y', { ctrl: true });
    expect(s.harness.project().layers[0]?.name).toBe('Pintura');
  });

  it('Cmd+Z também desfaz (macOS)', () => {
    const s = setup();
    s.harness.actions.renameLayer('L1', 'Pintura');
    s.press('z', { meta: true });
    expect(s.harness.project().layers[0]?.name).toBe('Lataria');
  });

  it('fora do foco em campos: Ctrl+Z num campo de texto é do campo, não do editor', () => {
    const s = setup();
    s.harness.actions.renameLayer('L1', 'Pintura');
    const input = document.createElement('input');
    document.body.append(input);
    const event = pressOn(input, 'z', { ctrl: true });
    expect(event.defaultPrevented).toBe(false);
    expect(s.harness.project().layers[0]?.name).toBe('Pintura');
  });

  it('Esc sem gesto em andamento limpa a seleção; com gesto, só cancela o gesto', () => {
    const s = setup();
    s.harness.ui.selection.value = { kind: 'marking', id: 'M1' };
    s.canvas.cancelInteraction.mockReturnValue(true);
    s.press('Escape');
    expect(s.harness.ui.selection.value).toEqual({ kind: 'marking', id: 'M1' });
    s.canvas.cancelInteraction.mockReturnValue(false);
    s.press('Escape');
    expect(s.harness.ui.selection.value).toBeNull();
  });

  it('Esc sem canvas montado também limpa a seleção', () => {
    const s = setup();
    s.harness.context.canvas.current = null;
    s.harness.ui.selection.value = { kind: 'image', id: 'I1' };
    s.press('Escape');
    expect(s.harness.ui.selection.value).toBeNull();
  });
});

describe('useEditorShortcuts: excluir', () => {
  it('Delete e Backspace pedem a exclusão da marcação selecionada', () => {
    const s = setup();
    s.harness.ui.selection.value = { kind: 'marking', id: 'M2' };
    s.press('Delete');
    s.press('Backspace');
    expect(s.dialogs.requestDeleteMarking).toHaveBeenCalledTimes(2);
    expect(s.dialogs.requestDeleteMarking.mock.calls[0]?.[0]).toMatchObject({ id: 'M2' });
    expect(s.dialogs.requestDeleteImage).not.toHaveBeenCalled();
  });

  it('com uma imagem selecionada, pede a exclusão da imagem', () => {
    const s = setup();
    s.harness.ui.selection.value = { kind: 'image', id: 'I2' };
    s.press('Delete');
    expect(s.dialogs.requestDeleteImage.mock.calls[0]?.[0]).toMatchObject({ id: 'I2' });
  });

  it('sem seleção ou em projeto somente leitura, não faz nada', () => {
    const none = setup();
    none.press('Delete');
    expect(none.dialogs.requestDeleteMarking).not.toHaveBeenCalled();
    expect(none.dialogs.requestDeleteImage).not.toHaveBeenCalled();
    cleanup();
    const ro = setup({ readOnly: true });
    ro.harness.ui.selection.value = { kind: 'marking', id: 'M1' };
    ro.press('Delete');
    expect(ro.dialogs.requestDeleteMarking).not.toHaveBeenCalled();
  });

  it('num campo de texto, Delete apaga texto e não o item', () => {
    const s = setup();
    s.harness.ui.selection.value = { kind: 'marking', id: 'M1' };
    const input = document.createElement('input');
    document.body.append(input);
    expect(pressOn(input, 'Delete').defaultPrevented).toBe(false);
    expect(s.dialogs.requestDeleteMarking).not.toHaveBeenCalled();
  });
});

describe('useEditorShortcuts: trava (Alt+L)', () => {
  it('tranca e destranca a marcação selecionada, com uma entrada de desfazer cada', () => {
    const s = setup();
    s.harness.ui.selection.value = { kind: 'marking', id: 'M2' };
    expect(s.press('l', { alt: true }).defaultPrevented).toBe(true);
    expect(marking(s.harness, 'M2').locked).toBe(true);
    s.press('l', { alt: true });
    expect(marking(s.harness, 'M2').locked).toBe(false);
    expect(s.harness.store.revision.value).toBe(2);
    s.harness.store.undo();
    expect(marking(s.harness, 'M2').locked).toBe(true);
  });

  it('tranca a imagem selecionada', () => {
    const s = setup();
    s.harness.ui.selection.value = { kind: 'image', id: 'I1' };
    s.press('l', { alt: true });
    expect(s.harness.project().images[0]?.locked).toBe(true);
    s.press('l', { alt: true });
    expect(s.harness.project().images[0]?.locked).toBe(false);
  });

  it('o item trancado continua selecionado', () => {
    const s = setup();
    s.harness.ui.selection.value = { kind: 'marking', id: 'M1' };
    s.press('l', { alt: true });
    expect(s.harness.ui.selection.value).toEqual({ kind: 'marking', id: 'M1' });
  });

  it('sem seleção, somente leitura ou num campo de texto, não faz nada', () => {
    const none = setup();
    none.press('l', { alt: true });
    expect(none.harness.store.canUndo.value).toBe(false);
    cleanup();
    const ro = setup({ readOnly: true });
    ro.harness.ui.selection.value = { kind: 'marking', id: 'M1' };
    ro.press('l', { alt: true });
    expect(marking(ro.harness, 'M1').locked).toBe(false);
    cleanup();
    const typing = setup();
    typing.harness.ui.selection.value = { kind: 'marking', id: 'M1' };
    const input = document.createElement('input');
    document.body.append(input);
    pressOn(input, 'l', { alt: true });
    expect(marking(typing.harness, 'M1').locked).toBe(false);
  });
});

describe('useEditorShortcuts: andar na seleção (Alt+↑ / Alt+↓)', () => {
  it('Alt+↑ sobe para o pai e, na marcação raiz, para a imagem', () => {
    const s = setup();
    s.harness.ui.selection.value = { kind: 'marking', id: 'M3' };
    s.press('ArrowUp', { alt: true });
    expect(s.harness.ui.selection.value).toEqual({ kind: 'marking', id: 'M2' });
    s.press('ArrowUp', { alt: true });
    s.press('ArrowUp', { alt: true });
    expect(s.harness.ui.selection.value).toEqual({ kind: 'image', id: 'I1' });
    expect(s.canvas.focusSelection).toHaveBeenCalledTimes(3);
  });

  it('Alt+↓ desce para o primeiro filho; da imagem, para a primeira marcação raiz', () => {
    const s = setup();
    s.harness.ui.selection.value = { kind: 'image', id: 'I1' };
    s.press('ArrowDown', { alt: true });
    expect(s.harness.ui.selection.value).toEqual({ kind: 'marking', id: 'M1' });
    s.press('ArrowDown', { alt: true });
    expect(s.harness.ui.selection.value).toEqual({ kind: 'marking', id: 'M2' });
  });

  it('sem filhos, Alt+↓ não muda a seleção; sem seleção, nada acontece', () => {
    const s = setup();
    s.harness.ui.selection.value = { kind: 'marking', id: 'M3' };
    s.press('ArrowDown', { alt: true });
    expect(s.harness.ui.selection.value).toEqual({ kind: 'marking', id: 'M3' });
    s.harness.ui.selection.value = null;
    s.press('ArrowUp', { alt: true });
    expect(s.harness.ui.selection.value).toBeNull();
    expect(s.canvas.focusSelection).not.toHaveBeenCalled();
  });

  it('a imagem sem marcações não tem para onde descer', () => {
    const s = setup();
    s.harness.actions.removeMarking('M4');
    s.harness.ui.selection.value = { kind: 'image', id: 'I2' };
    s.press('ArrowDown', { alt: true });
    expect(s.harness.ui.selection.value).toEqual({ kind: 'image', id: 'I2' });
  });
});

describe('useEditorShortcuts: zoom, ajuda, configurações e projeto', () => {
  it('Ctrl+= e Ctrl+− dão zoom por passo, e Ctrl+0 volta a 100%', () => {
    const s = setup();
    s.press('=', { ctrl: true });
    s.press('-', { ctrl: true });
    s.press('0', { ctrl: true });
    expect(s.canvas.zoomBy).toHaveBeenNthCalledWith(1, 1.25);
    expect(s.canvas.zoomBy).toHaveBeenNthCalledWith(2, 1 / 1.25);
    expect(s.canvas.zoomTo).toHaveBeenCalledWith(1);
  });

  it('F1 abre a Ajuda e Ctrl+, as Configurações', () => {
    const s = setup();
    s.press('F1');
    s.press(',', { ctrl: true });
    expect(s.dialogs.show).toHaveBeenNthCalledWith(1, { kind: 'help' });
    expect(s.dialogs.show).toHaveBeenNthCalledWith(2, { kind: 'settings' });
  });

  it('Ctrl+E exporta o projeto', () => {
    const s = setup();
    s.press('e', { ctrl: true });
    expect(s.commands.exportProject).toHaveBeenCalledOnce();
  });

  it('Ctrl+L: abre Camadas no desktop; no celular, em tela cheia', () => {
    const desktop = setup();
    desktop.press('l', { ctrl: true });
    expect(isToolWindowOpen('layers')).toBe(true);
    cleanup();
    const mobile = setup({ desktop: false });
    mobile.press('l', { ctrl: true });
    expect(mobile.harness.ui.mobileWindow.value).toBe('layers');
  });
});

describe('useEditorShortcuts: janelas', () => {
  it('Ctrl+Shift+N abre a janela; de novo, com ela em foco, esconde', () => {
    const s = setup();
    s.press('1', { ctrl: true, shift: true }, { code: 'Digit1' });
    expect(isToolWindowOpen('tree')).toBe(true);
    // Com o foco dentro da janela, o mesmo atalho a esconde.
    const el = document.createElement('section');
    el.className = 'tool-window';
    el.setAttribute('data-window', 'tree');
    el.tabIndex = 0;
    document.body.append(el);
    el.focus();
    s.press('1', { ctrl: true, shift: true }, { code: 'Digit1' });
    expect(isToolWindowOpen('tree')).toBe(false);
  });

  it('Alt+N abre a janela onde o navegador deixa (fora do Linux)', () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(
      'Mozilla/5.0 (Windows NT 10.0)',
    );
    const s = setup();
    s.press('3', { alt: true }, { code: 'Digit3' });
    expect(isToolWindowOpen('details')).toBe(true);
  });

  it('no Chrome do Linux, Alt+número é ignorado (o navegador troca de aba)', () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(
      'Mozilla/5.0 (X11; Linux x86_64)',
    );
    const s = setup();
    s.press('3', { alt: true }, { code: 'Digit3' });
    expect(isToolWindowOpen('details')).toBe(false);
  });

  it('no celular, Ctrl+Shift+N alterna a janela em tela cheia, e Shift+Esc a fecha', () => {
    const s = setup({ desktop: false });
    s.press('1', { ctrl: true, shift: true }, { code: 'Digit1' });
    expect(s.harness.ui.mobileWindow.value).toBe('tree');
    s.press('1', { ctrl: true, shift: true }, { code: 'Digit1' });
    expect(s.harness.ui.mobileWindow.value).toBeNull();
    s.press('2', { ctrl: true, shift: true }, { code: 'Digit2' });
    expect(s.harness.ui.mobileWindow.value).toBe('layers');
    s.press('Escape', { shift: true });
    expect(s.harness.ui.mobileWindow.value).toBeNull();
  });

  it('Shift+Esc esconde a janela em foco (e sem foco não faz nada)', () => {
    const s = setup();
    showToolWindow('details');
    s.press('Escape', { shift: true });
    expect(isToolWindowOpen('details')).toBe(true);
    const el = document.createElement('section');
    el.className = 'tool-window';
    el.setAttribute('data-window', 'details');
    el.tabIndex = 0;
    document.body.append(el);
    el.focus();
    s.press('Escape', { shift: true });
    expect(isToolWindowOpen('details')).toBe(false);
  });

  it('Ctrl+Shift+setas redimensionam a janela em foco em passos de 16 px', () => {
    const s = setup();
    resetToolWindowSize('right', { width: 1400, height: 800, otherWidth: 0 });
    showToolWindow('details');
    const before = toolWindowSizes.value.right;
    // Sem foco numa janela, nada muda.
    s.press('ArrowLeft', { ctrl: true, shift: true });
    expect(toolWindowSizes.value.right).toBe(before);
    const el = document.createElement('section');
    el.className = 'tool-window';
    el.setAttribute('data-window', 'details');
    el.tabIndex = 0;
    document.body.append(el);
    el.focus();
    s.press('ArrowLeft', { ctrl: true, shift: true });
    expect(toolWindowSizes.value.right).toBe(before + RESIZE_STEP);
    s.press('ArrowRight', { ctrl: true, shift: true });
    expect(toolWindowSizes.value.right).toBe(before);
  });
});

describe('useEditorShortcuts: Alt+N (nova anotação)', () => {
  it('aciona o botão "+ Anotação", mesmo com o foco num campo de texto', () => {
    const s = setup();
    s.harness.ui.selection.value = { kind: 'marking', id: 'M1' };
    const button = document.createElement('button');
    button.setAttribute('data-action', ADD_ANNOTATION_ACTION);
    const click = vi.fn();
    button.addEventListener('click', click);
    const input = document.createElement('input');
    document.body.append(button, input);
    const event = pressOn(input, 'n', { alt: true });
    expect(event.defaultPrevented).toBe(true);
    expect(click).toHaveBeenCalledOnce();
  });

  it('sem marcação selecionada e sem o botão, não faz nada', () => {
    const s = setup();
    s.harness.ui.selection.value = { kind: 'image', id: 'I1' };
    s.press('n', { alt: true });
    expect(s.harness.ui.sheet.value).not.toBe('open');
  });

  it('com a marcação selecionada e Detalhes fechado: abre Detalhes e aciona o botão depois', () => {
    const raf = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      cb(0);
      return 0;
    });
    const s = setup();
    s.harness.ui.selection.value = { kind: 'marking', id: 'M1' };
    const click = vi.fn();
    // O botão só existe depois que Detalhes abre: ele "aparece" quando a janela é mostrada.
    const button = document.createElement('button');
    button.setAttribute('data-action', ADD_ANNOTATION_ACTION);
    button.addEventListener('click', click);
    raf.mockImplementation((cb) => {
      document.body.append(button);
      cb(0);
      return 0;
    });
    s.press('n', { alt: true });
    expect(isToolWindowOpen('details')).toBe(true);
    expect(click).toHaveBeenCalledOnce();
  });

  it('no celular, abre a gaveta de Detalhes', () => {
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 0);
    const s = setup({ desktop: false });
    s.harness.ui.selection.value = { kind: 'marking', id: 'M1' };
    s.press('n', { alt: true });
    expect(s.harness.ui.sheet.value).toBe('open');
  });
});

describe('useEditorShortcuts: quando as teclas não valem', () => {
  it('com um diálogo aberto, o teclado é do diálogo', () => {
    const s = setup();
    s.harness.actions.renameLayer('L1', 'Pintura');
    const dialog = document.createElement('dialog');
    dialog.setAttribute('open', '');
    document.body.append(dialog);
    s.press('z', { ctrl: true });
    s.press('F1');
    expect(s.harness.project().layers[0]?.name).toBe('Pintura');
    expect(s.dialogs.show).not.toHaveBeenCalled();
  });

  it('um evento já tratado (defaultPrevented) é ignorado', () => {
    const s = setup();
    s.harness.actions.renameLayer('L1', 'Pintura');
    window.addEventListener('keydown', (e) => e.preventDefault(), {
      capture: true,
      once: true,
    });
    s.press('z', { ctrl: true });
    expect(s.harness.project().layers[0]?.name).toBe('Pintura');
  });

  it('teclas sem atalho não são interceptadas', () => {
    const s = setup();
    expect(s.press('a').defaultPrevented).toBe(false);
    expect(s.press('Enter').defaultPrevented).toBe(false);
  });

  it('ao desmontar, o listener sai da janela', () => {
    const s = setup();
    s.harness.actions.renameLayer('L1', 'Pintura');
    s.unmount();
    s.press('z', { ctrl: true });
    expect(s.harness.project().layers[0]?.name).toBe('Pintura');
  });

  it('usa sempre a versão atual dos diálogos, sem reinscrever o listener', () => {
    const s = setup();
    const next = {
      current: null,
      show: vi.fn(),
      close: vi.fn(),
      requestDeleteImage: vi.fn(),
      requestDeleteMarking: vi.fn(),
    };
    s.rerender(next as unknown as EditorDialogs);
    s.press('F1');
    expect(next.show).toHaveBeenCalledWith({ kind: 'help' });
    expect(s.dialogs.show).not.toHaveBeenCalled();
  });
});

// Etapa 3a.2: Ctrl+C copia a referência e Ctrl+Alt+C o recorte, sem tirar o copiar nativo
// dos campos de texto nem do texto selecionado na página.
describe('useEditorShortcuts: copiar referência e recorte', () => {
  function mockClipboard(custom = false) {
    const writeText = vi.fn((text: string) => {
      void text;
      return Promise.resolve();
    });
    const write = vi.fn((items: unknown[]) => {
      void items;
      return Promise.resolve();
    });
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText, write },
      configurable: true,
    });
    if (custom) {
      class FakeItem {
        static supports = (type: string) => type === `web ${ITEM_CLIPBOARD_MIME}`;
        constructor(readonly data: Record<string, unknown>) {}
      }
      vi.stubGlobal('ClipboardItem', FakeItem);
    }
    return { writeText, write };
  }

  afterEach(() => {
    vi.unstubAllGlobals();
    Reflect.deleteProperty(navigator, 'clipboard');
    window.getSelection()?.removeAllRanges();
  });

  it('com uma marcação selecionada, copia a referência e avisa', async () => {
    const { writeText } = mockClipboard();
    const s = setup();
    s.harness.ui.selection.value = { kind: 'marking', id: 'M2' };

    expect(s.press('c', { ctrl: true }).defaultPrevented).toBe(true);

    await vi.waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    const text = String(writeText.mock.calls[0]?.[0]);
    expect(text).toBe(
      `mapping://projeto/m/m2 (images/lateral.jpg${t('marking.pathSeparator')}Porta${t('marking.pathSeparator')}Maçaneta)`,
    );
    expect(parseRef(text)).toEqual({ project: 'projeto', kind: 'm', code: 'm2' });
    await vi.waitFor(() =>
      expect(s.harness.ui.toast.value).toBe(t('copy.referenceDone')),
    );
  });

  it('Cmd+C (macOS) também copia', async () => {
    const { writeText } = mockClipboard();
    const s = setup();
    s.harness.ui.selection.value = { kind: 'marking', id: 'M1' };
    expect(s.press('c', { meta: true }).defaultPrevented).toBe(true);
    await vi.waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
  });

  it('imagem selecionada: a referência é do tipo i', async () => {
    const { writeText } = mockClipboard();
    const s = setup();
    s.harness.ui.selection.value = { kind: 'image', id: 'I2' };
    s.press('c', { ctrl: true });
    await vi.waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(parseRef(String(writeText.mock.calls[0]?.[0]))).toMatchObject({
      kind: 'i',
      code: 'i2',
    });
  });

  it('grava também os dados do item, no formato web próprio, quando o navegador deixa', async () => {
    const { write, writeText } = mockClipboard(true);
    const s = setup();
    s.harness.ui.selection.value = { kind: 'marking', id: 'M1' };
    s.press('c', { ctrl: true });
    await vi.waitFor(() => expect(write).toHaveBeenCalledTimes(1));
    expect(writeText).not.toHaveBeenCalled();
    const item = write.mock.calls[0]?.[0][0] as { data: Record<string, Blob> };
    expect(Object.keys(item.data).sort()).toEqual([
      'text/plain',
      `web ${ITEM_CLIPBOARD_MIME}`,
    ]);
    const data = JSON.parse(await item.data[`web ${ITEM_CLIPBOARD_MIME}`]!.text());
    expect(data).toMatchObject({ format: 'mapping-item', kind: 'm', project: 'projeto' });
    expect(data.item.id).toBe('M1');
    expect(await item.data['text/plain']!.text()).toBe(data.ref);
  });

  it('sem nada selecionado, o copiar nativo continua', () => {
    const { writeText } = mockClipboard();
    const s = setup();
    expect(s.press('c', { ctrl: true }).defaultPrevented).toBe(false);
    expect(writeText).not.toHaveBeenCalled();
  });

  it('com o foco num campo de texto, o copiar nativo continua', () => {
    const { writeText } = mockClipboard();
    const s = setup();
    s.harness.ui.selection.value = { kind: 'marking', id: 'M1' };
    const input = document.body.appendChild(document.createElement('input'));
    input.focus();
    expect(pressOn(input, 'c', { ctrl: true }).defaultPrevented).toBe(false);
    expect(writeText).not.toHaveBeenCalled();
  });

  it('com texto selecionado na página, o copiar nativo continua', () => {
    const { writeText } = mockClipboard();
    const s = setup();
    s.harness.ui.selection.value = { kind: 'marking', id: 'M1' };
    const p = document.body.appendChild(document.createElement('p'));
    p.textContent = 'texto da página';
    window.getSelection()?.selectAllChildren(p);
    expect(s.press('c', { ctrl: true }).defaultPrevented).toBe(false);
    expect(writeText).not.toHaveBeenCalled();
  });

  it('com o foco num cartão de anotação (fora dos campos), copia a referência dela', async () => {
    const { writeText } = mockClipboard();
    const s = setup();
    s.harness.ui.selection.value = { kind: 'marking', id: 'M1' };
    const card = document.body.appendChild(document.createElement('div'));
    card.setAttribute('data-annotation', 'A1');
    const button = card.appendChild(document.createElement('button'));
    button.focus();
    expect(pressOn(button, 'c', { ctrl: true }).defaultPrevented).toBe(true);
    await vi.waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    const ref = parseRef(String(writeText.mock.calls[0]?.[0]));
    expect(ref).toMatchObject({ kind: 'a', code: 'a1' });
  });

  it('Ctrl+Alt+C copia o recorte da marcação selecionada como PNG', async () => {
    const { write } = mockClipboard(true);
    const s = setup();
    const png = new Blob(['png'], { type: 'image/png' });
    const crop = vi.spyOn(imageCrop, 'cropToPng').mockResolvedValue(png);
    vi.spyOn(s.harness.context.session, 'readImage').mockResolvedValue(new Blob(['jpg']));
    s.harness.ui.selection.value = { kind: 'marking', id: 'M2' };

    expect(
      s.press('c', { ctrl: true, alt: true }, { code: 'KeyC' }).defaultPrevented,
    ).toBe(true);

    await vi.waitFor(() => expect(write).toHaveBeenCalledTimes(1));
    const item = write.mock.calls[0]?.[0][0] as { data: Record<string, Promise<Blob>> };
    expect(Object.keys(item.data)).toEqual(['image/png']);
    await expect(item.data['image/png']).resolves.toBe(png);
    // O recorte é em pixels da imagem original: o rect da marcação.
    expect(crop).toHaveBeenCalledWith(expect.any(Blob), marking(s.harness, 'M2').rect);
    await vi.waitFor(() => expect(s.harness.ui.toast.value).toBe(t('copy.cropDone')));
  });

  it('o recorte avisa quando a imagem não pode ser lida', async () => {
    const { write } = mockClipboard(true);
    write.mockRejectedValue(new Error('recusado'));
    const s = setup();
    vi.spyOn(s.harness.context.session, 'readImage').mockResolvedValue(null);
    s.harness.ui.selection.value = { kind: 'marking', id: 'M2' };
    s.press('c', { ctrl: true, alt: true });
    await vi.waitFor(() => expect(s.harness.ui.toast.value).toBe(t('copy.cropFailed')));
  });

  it('Ctrl+Alt+C com uma imagem (ou nada) selecionado não faz nada', () => {
    const { write } = mockClipboard(true);
    const s = setup();
    expect(s.press('c', { ctrl: true, alt: true }).defaultPrevented).toBe(false);
    s.harness.ui.selection.value = { kind: 'image', id: 'I1' };
    expect(s.press('c', { ctrl: true, alt: true }).defaultPrevented).toBe(false);
    expect(write).not.toHaveBeenCalled();
  });

  it('se a área de transferência recusar, avisa que não copiou', async () => {
    const { writeText } = mockClipboard();
    writeText.mockRejectedValue(new Error('negado'));
    const s = setup();
    s.harness.ui.selection.value = { kind: 'marking', id: 'M1' };
    s.press('c', { ctrl: true });
    await vi.waitFor(() => expect(s.harness.ui.toast.value).toBe(t('copy.failed')));
  });
});
