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
  // pt-BR kept: shared fixture data (layers 'Camada A', 'Camada B', 'Só dados' of viewModeFixtures) asserted by tests/canvas and tests/store
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

describe('Show on canvas panel', () => {
  it('brings the sentence, the five elements and starts with everything checked except the outline', () => {
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

  it('checking and unchecking an element changes the choice', () => {
    const { h } = setup(true);
    fireEvent.click(box(t('view.outline')));
    expect(h.ui.viewShow.value.outline).toBe(true);
    fireEvent.click(box(t('view.panelArrows')));
    expect(h.ui.viewShow.value.arrows).toBe(false);
  });

  it('lists only the layers with a drawing; unchecking one stores it as unchecked', () => {
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

  it('without any layer with a drawing, the group does not appear', () => {
    setup(false);
    expect(within(dialog()).queryByText(t('view.groupLayers'))).toBeNull();
    expect(box(t('view.containers'))).toBeTruthy();
  });

  it('Show all checks everything and Only screens unchecks outline, name and arrows', () => {
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

  it('moves focus inside the panel on open', () => {
    setup(true);
    expect(dialog().contains(document.activeElement)).toBe(true);
  });
});
