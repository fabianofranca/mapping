import { act, cleanup, render, screen } from '@testing-library/preact';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { EditorScreen } from '../../src/app/Editor';
import { t } from '../../src/i18n';
import { locale } from '../../src/store/settings';
import { isToolWindowOpen, showToolWindow } from '../../src/store/toolWindows';
import { EditorContext } from '../../src/ui/EditorContext';
import { installFakeCanvas } from '../canvas/harness';
import { sampleProject } from '../model/fixtures';
import { createHarness } from './harness';

// Fase 5.8: a app é só desktop. Abaixo da largura mínima (900px) ou da altura mínima (860px) o editor dá lugar a
// um aviso, sem desmontar nada: ao alargar a janela, a seleção, o viewport e o próprio
// canvas continuam os mesmos.

/** `matchMedia` com a janela (largura e altura) controlada pelo teste (o jsdom não tem). */
function stubWindowSize(initial: number, initialHeight = 1000) {
  let width = initial;
  let height = initialHeight;
  const lists = new Set<{ query: string; listeners: Set<() => void> }>();
  const one = (query: string) => {
    const min = /min-width:\s*(\d+)px/.exec(query);
    const max = /max-width:\s*(\d+)px/.exec(query);
    const maxH = /max-height:\s*(\d+)px/.exec(query);
    return (
      (!min || width >= Number(min[1])) &&
      (!max || width <= Number(max[1])) &&
      (!maxH || height <= Number(maxH[1]))
    );
  };
  // Uma lista separada por vírgula casa se qualquer parte casar.
  const matches = (query: string) => query.split(',').some((part) => one(part.trim()));
  vi.stubGlobal('matchMedia', (query: string) => {
    const entry = { query, listeners: new Set<() => void>() };
    lists.add(entry);
    return {
      get matches() {
        return matches(query);
      },
      media: query,
      addEventListener: (_: string, fn: () => void) => entry.listeners.add(fn),
      removeEventListener: (_: string, fn: () => void) => entry.listeners.delete(fn),
    };
  });
  const notify = () => {
    for (const entry of lists) for (const fn of entry.listeners) fn();
  };
  const resize = (next: number) => {
    width = next;
    notify();
  };
  resize.height = (next: number) => {
    height = next;
    notify();
  };
  return resize;
}

describe('janela estreita', () => {
  beforeAll(() => {
    installFakeCanvas();
    vi.stubGlobal('requestAnimationFrame', () => 0);
    vi.stubGlobal('cancelAnimationFrame', () => undefined);
  });
  beforeEach(() => {
    locale.value = 'pt-BR';
  });
  afterEach(cleanup);
  afterAll(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function mount(width: number) {
    const resize = stubWindowSize(width);
    const harness = createHarness(sampleProject());
    const view = render(
      <EditorContext.Provider value={harness.context}>
        <EditorScreen />
      </EditorContext.Provider>,
    );
    return { harness, view, resize };
  }

  it('abaixo do mínimo mostra o aviso no lugar do editor', () => {
    const { view } = mount(600);
    expect(screen.getByText(t('narrow.title'))).toBeTruthy();
    const editor = view.container.querySelector<HTMLElement>('.editor');
    expect(editor?.hidden).toBe(true);
  });

  it('acima do mínimo não mostra o aviso', () => {
    const { view } = mount(1280);
    expect(screen.queryByText(t('narrow.title'))).toBeNull();
    const editor = view.container.querySelector<HTMLElement>('.editor');
    expect(editor?.hidden).toBe(false);
  });

  it('abaixo da altura mínima mostra o aviso, sem desmontar, e volta ao crescer', () => {
    const { view, resize } = mount(1280);
    const host = view.container.querySelector('.canvas-host');
    act(() => resize.height(859));
    expect(screen.getByText(t('narrow.title'))).toBeTruthy();
    expect(view.container.querySelector<HTMLElement>('.editor')?.hidden).toBe(true);
    act(() => resize.height(860));
    expect(screen.queryByText(t('narrow.title'))).toBeNull();
    expect(view.container.querySelector('.canvas-host')).toBe(host);
  });

  it('volta ao editor ao alargar sem perder seleção, viewport nem o canvas', () => {
    const { harness, view, resize } = mount(1280);
    const { ui, canvas, view: viewState } = harness.context;
    const markingId = harness.project().markings[0]?.id;
    if (!markingId) throw new Error('fixture');
    act(() => {
      ui.selection.value = { kind: 'marking', id: markingId };
      canvas.current?.zoomTo(2);
    });
    const controller = canvas.current;
    const host = view.container.querySelector('.canvas-host');
    const viewport = viewState.viewport.value;
    expect(controller).not.toBeNull();
    expect(viewport.scale).toBe(2);

    act(() => resize(600));
    expect(screen.getByText(t('narrow.title'))).toBeTruthy();

    act(() => resize(1280));
    expect(screen.queryByText(t('narrow.title'))).toBeNull();
    expect(view.container.querySelector<HTMLElement>('.editor')?.hidden).toBe(false);
    expect(ui.selection.value).toEqual({ kind: 'marking', id: markingId });
    expect(canvas.current).toBe(controller);
    expect(view.container.querySelector('.canvas-host')).toBe(host);
    expect(viewState.viewport.value).toEqual(viewport);
  });

  // Etapa #515 (FN1, #446): estreitar de 1280 para 900 px encolhe as janelas laterais, não
  // as fecha. Só abrir já compacto (< 1200 px) começa com Detalhes recolhido (B2).
  it('estreitar de 1280 para 900 px, três vezes, mantém Detalhes aberta', () => {
    const { resize } = mount(1280);
    act(() => showToolWindow('details'));
    for (let i = 0; i < 3; i++) {
      act(() => resize(900));
      expect(isToolWindowOpen('details')).toBe(true);
      act(() => resize(1280));
      expect(isToolWindowOpen('details')).toBe(true);
    }
  });
});
