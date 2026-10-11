import { act, cleanup, render, screen } from '@testing-library/preact';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { EditorScreen } from '../../src/app/Editor';
import { t } from '../../src/i18n';
import { locale } from '../../src/store/settings';
import { EditorContext } from '../../src/ui/EditorContext';
import { installFakeCanvas } from '../canvas/harness';
import { sampleProject } from '../model/fixtures';
import { createHarness } from './harness';

// Fase 5.8: a app é só desktop. Abaixo da largura mínima (900px) o editor dá lugar a
// um aviso, sem desmontar nada: ao alargar a janela, a seleção, o viewport e o próprio
// canvas continuam os mesmos.

/** `matchMedia` com a largura da janela controlada pelo teste (o jsdom não tem). */
function stubWindowWidth(initial: number) {
  let width = initial;
  const lists = new Set<{ query: string; listeners: Set<() => void> }>();
  const matches = (query: string) => {
    const min = /min-width:\s*(\d+)px/.exec(query);
    const max = /max-width:\s*(\d+)px/.exec(query);
    return (!min || width >= Number(min[1])) && (!max || width <= Number(max[1]));
  };
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
  return (next: number) => {
    width = next;
    for (const entry of lists) for (const fn of entry.listeners) fn();
  };
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
    const resize = stubWindowWidth(width);
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
});
