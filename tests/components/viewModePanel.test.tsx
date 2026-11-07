import { signal } from '@preact/signals';
import { act, cleanup, fireEvent, screen, within } from '@testing-library/preact';
import { afterEach, describe, expect, it } from 'vitest';
import { t } from '../../src/i18n';
import { createEditorDerived } from '../../src/store/derived';
import { setViewMode } from '../../src/store/ui';
import { VIEW_SHOW_START } from '../../src/store/viewMode';
import { EditorContext } from '../../src/ui/EditorContext';
import { ViewModePanel } from '../../src/ui/ViewModePanel';
import { sampleProject } from '../model/fixtures';
import { viewCatalog, viewLayerIds, viewProject } from '../store/viewModeFixtures';
import { createHarness, renderLive } from './harness';

afterEach(cleanup);

function setup(withDrawing: boolean) {
  const project = withDrawing ? viewProject() : sampleProject();
  const h = createHarness(project);
  const context = withDrawing
    ? {
        ...h.context,
        derived: createEditorDerived(h.store, h.ui, undefined, {
          catalog: signal(viewCatalog()),
          fontsEpoch: signal(0),
        }),
      }
    : h.context;
  renderLive(h, () => (
    <EditorContext.Provider value={context}>
      <ViewModePanel />
    </EditorContext.Provider>
  ));
  act(() => setViewMode(h.ui, true));
  return { h, project };
}

const dialog = () => screen.getByRole('dialog', { name: t('view.panelTitle') });
const box = (name: string) =>
  within(dialog()).getByRole('checkbox', { name: new RegExp(name) });

describe('painel Mostrar no canvas', () => {
  it('traz a frase, os cinco elementos e começa com tudo marcado menos o contorno', () => {
    setup(true);
    expect(within(dialog()).getByText(t('view.panelHint'))).toBeTruthy();
    for (const key of [
      'view.containers',
      'view.images',
      'view.outline',
      'view.names',
      'view.panelArrows',
    ] as const) {
      expect(box(t(key)), key).toBeTruthy();
    }
    expect((box(t('view.containers')) as HTMLInputElement).checked).toBe(true);
    expect((box(t('view.images')) as HTMLInputElement).checked).toBe(true);
    expect((box(t('view.outline')) as HTMLInputElement).checked).toBe(false);
    expect((box(t('view.names')) as HTMLInputElement).checked).toBe(true);
    expect((box(t('view.panelArrows')) as HTMLInputElement).checked).toBe(true);
  });

  it('marcar e desmarcar um elemento muda a escolha', () => {
    const { h } = setup(true);
    fireEvent.click(box(t('view.outline')));
    expect(h.ui.viewShow.value.outline).toBe(true);
    fireEvent.click(box(t('view.panelArrows')));
    expect(h.ui.viewShow.value.arrows).toBe(false);
  });

  it('lista só as camadas com desenho; desmarcar uma a guarda como desmarcada', () => {
    const { h, project } = setup(true);
    const ids = viewLayerIds(project);
    expect(box('Camada A')).toBeTruthy();
    expect(box('Camada B')).toBeTruthy();
    expect(within(dialog()).queryByRole('checkbox', { name: /Só dados/ })).toBeNull();
    expect((box('Camada A') as HTMLInputElement).checked).toBe(true);
    fireEvent.click(box('Camada A'));
    expect([...h.ui.viewShow.value.hiddenDrawingLayers]).toEqual([ids.a]);
    expect((box('Camada A') as HTMLInputElement).checked).toBe(false);
  });

  it('sem nenhuma camada com desenho, o grupo não aparece', () => {
    setup(false);
    expect(within(dialog()).queryByText(t('view.groupLayers'))).toBeNull();
    expect(box(t('view.containers'))).toBeTruthy();
  });

  it('Mostrar tudo marca tudo e Só as telas desmarca contorno, nome e setas', () => {
    const { h } = setup(true);
    fireEvent.click(within(dialog()).getByRole('button', { name: t('view.showAll') }));
    expect(h.ui.viewShow.value).toEqual({
      ...VIEW_SHOW_START,
      outline: true,
    });
    fireEvent.click(box('Camada B'));
    fireEvent.click(
      within(dialog()).getByRole('button', { name: t('view.onlyScreens') }),
    );
    expect(h.ui.viewShow.value).toEqual({
      ...VIEW_SHOW_START,
      names: false,
      arrows: false,
    });
  });

  it('leva o foco para dentro do painel ao abrir', () => {
    setup(true);
    expect(dialog().contains(document.activeElement)).toBe(true);
  });
});
