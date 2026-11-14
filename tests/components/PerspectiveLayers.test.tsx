import 'fake-indexeddb/auto';
import { act, cleanup, screen, within } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { locale } from '../../src/store/settings';
import { AnnotationsPanel } from '../../src/ui/AnnotationsPanel';
import { LayerActions, LayersPanel } from '../../src/ui/LayersPanel';
import { ListView } from '../../src/ui/ListView';
import { cadastroProject } from '../model/specFixtures';
import { renderLive } from './harness';
import { createLocalHarness } from './perspectiveUiHarness';

// Layers with a perspective open (stage #659, decision 11): the visibility box edits
// the perspective's hidden layers (with undo); on Main, those of the interface.

beforeEach(() => {
  locale.value = 'en-US';
});
afterEach(cleanup);

async function setup(withList = false) {
  const harness = await createLocalHarness(cadastroProject());
  const { session } = harness.context;
  const created = session.perspectiveActions.createPerspective({
    name: 'Flow A',
    startFrom: 'empty',
    local: false,
  });
  if (!created.ok) throw new Error('perspective not created');
  renderLive(harness, (p) => (
    <>
      <LayerActions project={p} readOnly={false} />
      <LayersPanel project={p} readOnly={false} />
      {withList && <ListView onSelect={() => undefined} />}
    </>
  ));
  const hiddenOf = () =>
    harness.project().perspectives.find((x) => x.id === created.value)?.hiddenLayers ??
    [];
  return { harness, session, id: created.value, hiddenOf, user: userEvent.setup() };
}

describe('Layers with a perspective open', () => {
  it("the box saves the perspective's hiddenLayers and does not touch ui.hiddenLayers", async () => {
    const { harness, session, id, hiddenOf, user } = await setup();
    const layer = harness.project().layers[0];
    if (!layer) throw new Error('no layer');
    act(() => void session.perspective.open(id));
    const box = await screen.findByRole('checkbox', {
      name: `Show layer ${layer.name}`,
    });
    await user.click(box);
    expect(hiddenOf()).toEqual([layer.id]);
    expect(harness.ui.hiddenLayers.value.size).toBe(0);
    expect((box as HTMLInputElement).checked).toBe(false);
    await user.click(box);
    expect(hiddenOf()).toEqual([]);
  });

  it('the change goes into undo', async () => {
    const { harness, session, id, hiddenOf, user } = await setup();
    const layer = harness.project().layers[0];
    if (!layer) throw new Error('no layer');
    act(() => void session.perspective.open(id));
    await user.click(
      await screen.findByRole('checkbox', { name: `Show layer ${layer.name}` }),
    );
    expect(hiddenOf()).toEqual([layer.id]);
    act(() => void harness.store.undo());
    expect(hiddenOf()).toEqual([]);
  });

  it('"Show all" clears the perspective\'s hidden ones', async () => {
    const { harness, session, id, hiddenOf, user } = await setup();
    const layer = harness.project().layers[0];
    if (!layer) throw new Error('no layer');
    session.perspectiveActions.setPerspectiveHiddenLayers(id, [layer.id]);
    act(() => void session.perspective.open(id));
    await user.click(await screen.findByRole('button', { name: 'Show all' }));
    expect(hiddenOf()).toEqual([]);
  });

  it('on Main the box still edits ui.hiddenLayers', async () => {
    const { harness, hiddenOf, user } = await setup();
    const layer = harness.project().layers[0];
    if (!layer) throw new Error('no layer');
    await user.click(screen.getByRole('checkbox', { name: `Show layer ${layer.name}` }));
    expect([...harness.ui.hiddenLayers.value]).toEqual([layer.id]);
    expect(hiddenOf()).toEqual([]);
  });

  it("the List checkbox saves the perspective's hidden ones and hides the layer in the derived state", async () => {
    const { harness, session, id, hiddenOf, user } = await setup(true);
    const layer = harness.project().layers[0];
    if (!layer) throw new Error('no layer');
    act(() => void session.perspective.open(id));
    const group = await screen.findByRole('group', { name: 'Visible layers' });
    const box = within(group).getByRole('checkbox', {
      name: `Show layer ${layer.name}`,
    });
    await user.click(box);
    expect(hiddenOf()).toEqual([layer.id]);
    expect(harness.ui.hiddenLayers.value.size).toBe(0);
    expect(harness.context.derived.visibleLayers.value.map((l) => l.id)).not.toContain(
      layer.id,
    );
  });
});

describe('Read-only layers with a perspective open (CR #954, item 19)', () => {
  it('the box and "Show all" are disabled and nothing changes in the DOM', async () => {
    const harness = await createLocalHarness(cadastroProject());
    const { session } = harness.context;
    const created = session.perspectiveActions.createPerspective({
      name: 'Flow A',
      startFrom: 'empty',
      local: false,
    });
    if (!created.ok) throw new Error('perspective not created');
    const layer = harness.project().layers[0];
    if (!layer) throw new Error('no layer');
    act(() => void session.perspective.open(created.value));
    renderLive(harness, (p) => (
      <>
        <LayerActions project={p} readOnly />
        <LayersPanel project={p} readOnly />
      </>
    ));
    const box = await screen.findByRole('checkbox', {
      name: `Show layer ${layer.name}`,
    });
    expect(box).toHaveProperty('disabled', true);
    expect(screen.getByRole('button', { name: 'Show all' })).toHaveProperty(
      'disabled',
      true,
    );
    await userEvent.setup().click(box);
    expect((box as HTMLInputElement).checked).toBe(true);
  });

  it('on Main the visibility, which is only of the interface, stays enabled', async () => {
    const harness = await createLocalHarness(cadastroProject());
    const layer = harness.project().layers[0];
    if (!layer) throw new Error('no layer');
    renderLive(harness, (p) => <LayersPanel project={p} readOnly />);
    const box = screen.getByRole('checkbox', { name: `Show layer ${layer.name}` });
    expect(box).toHaveProperty('disabled', false);
    await userEvent.setup().click(box);
    expect([...harness.ui.hiddenLayers.value]).toEqual([layer.id]);
  });
});

describe('"Show all" of the Details with a perspective open (CE4, #956)', () => {
  it("removes the perspective's hidden layers, in one undo entry", async () => {
    const harness = await createLocalHarness(cadastroProject());
    const { session } = harness.context;
    const created = session.perspectiveActions.createPerspective({
      name: 'Flow A',
      startFrom: 'empty',
      local: false,
    });
    if (!created.ok) throw new Error('perspective not created');
    const all = harness.project().layers.map((l) => l.id);
    const marking = harness.project().markings[0];
    if (!marking) throw new Error('no marking');
    session.perspectiveActions.setPerspectiveHiddenLayers(created.value, all);
    act(() => void session.perspective.open(created.value));
    renderLive(harness, (p) => (
      <AnnotationsPanel
        project={p}
        marking={marking}
        layers={[]}
        readOnly={false}
        onShowLayer={() => undefined}
        onGoToAnnotation={() => undefined}
        focusAnnotation={null}
        onFocusDone={() => undefined}
      />
    ));
    const hiddenOf = () =>
      harness.project().perspectives.find((x) => x.id === created.value)?.hiddenLayers ??
      [];
    expect(hiddenOf()).toEqual(all);
    await userEvent
      .setup()
      .click(await screen.findByRole('button', { name: 'Show all' }));
    expect(hiddenOf()).toEqual([]);
    expect(harness.ui.hiddenLayers.value.size).toBe(0);
    act(() => void harness.store.undo());
    expect(hiddenOf()).toEqual(all);
  });
});
