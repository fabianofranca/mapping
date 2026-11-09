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

// Camadas com uma perspectiva aberta (etapa #659, decisão 11): a caixa de visibilidade edita
// as camadas escondidas da perspectiva (com desfazer); na Principal, as da interface.

beforeEach(() => {
  locale.value = 'pt-BR';
});
afterEach(cleanup);

async function setup(withList = false) {
  const harness = await createLocalHarness(cadastroProject());
  const { session } = harness.context;
  const created = session.perspectiveActions.createPerspective({
    name: 'Fluxo A',
    startFrom: 'empty',
    local: false,
  });
  if (!created.ok) throw new Error('perspectiva não criada');
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

describe('Camadas com perspectiva aberta', () => {
  it('a caixa grava hiddenLayers da perspectiva e não mexe em ui.hiddenLayers', async () => {
    const { harness, session, id, hiddenOf, user } = await setup();
    const layer = harness.project().layers[0];
    if (!layer) throw new Error('sem camada');
    act(() => void session.perspective.open(id));
    const box = await screen.findByRole('checkbox', {
      name: `Mostrar a camada ${layer.name}`,
    });
    await user.click(box);
    expect(hiddenOf()).toEqual([layer.id]);
    expect(harness.ui.hiddenLayers.value.size).toBe(0);
    expect((box as HTMLInputElement).checked).toBe(false);
    await user.click(box);
    expect(hiddenOf()).toEqual([]);
  });

  it('a mudança entra no desfazer', async () => {
    const { harness, session, id, hiddenOf, user } = await setup();
    const layer = harness.project().layers[0];
    if (!layer) throw new Error('sem camada');
    act(() => void session.perspective.open(id));
    await user.click(
      await screen.findByRole('checkbox', { name: `Mostrar a camada ${layer.name}` }),
    );
    expect(hiddenOf()).toEqual([layer.id]);
    act(() => void harness.store.undo());
    expect(hiddenOf()).toEqual([]);
  });

  it('"Mostrar todas" limpa as escondidas da perspectiva', async () => {
    const { harness, session, id, hiddenOf, user } = await setup();
    const layer = harness.project().layers[0];
    if (!layer) throw new Error('sem camada');
    session.perspectiveActions.setPerspectiveHiddenLayers(id, [layer.id]);
    act(() => void session.perspective.open(id));
    await user.click(await screen.findByRole('button', { name: 'Mostrar todas' }));
    expect(hiddenOf()).toEqual([]);
  });

  it('na Principal a caixa continua editando ui.hiddenLayers', async () => {
    const { harness, hiddenOf, user } = await setup();
    const layer = harness.project().layers[0];
    if (!layer) throw new Error('sem camada');
    await user.click(
      screen.getByRole('checkbox', { name: `Mostrar a camada ${layer.name}` }),
    );
    expect([...harness.ui.hiddenLayers.value]).toEqual([layer.id]);
    expect(hiddenOf()).toEqual([]);
  });

  it('o checkbox da Lista grava as escondidas da perspectiva e esconde a camada no derivado', async () => {
    const { harness, session, id, hiddenOf, user } = await setup(true);
    const layer = harness.project().layers[0];
    if (!layer) throw new Error('sem camada');
    act(() => void session.perspective.open(id));
    const group = await screen.findByRole('group', { name: 'Camadas visíveis' });
    const box = within(group).getByRole('checkbox', {
      name: `Mostrar a camada ${layer.name}`,
    });
    await user.click(box);
    expect(hiddenOf()).toEqual([layer.id]);
    expect(harness.ui.hiddenLayers.value.size).toBe(0);
    expect(harness.context.derived.visibleLayers.value.map((l) => l.id)).not.toContain(
      layer.id,
    );
  });
});

describe('"Mostrar todas" dos Detalhes com perspectiva aberta (CE4, #956)', () => {
  it('tira as camadas escondidas da perspectiva, numa entrada de desfazer', async () => {
    const harness = await createLocalHarness(cadastroProject());
    const { session } = harness.context;
    const created = session.perspectiveActions.createPerspective({
      name: 'Fluxo A',
      startFrom: 'empty',
      local: false,
    });
    if (!created.ok) throw new Error('perspectiva não criada');
    const all = harness.project().layers.map((l) => l.id);
    const marking = harness.project().markings[0];
    if (!marking) throw new Error('sem marcação');
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
      .click(await screen.findByRole('button', { name: 'Mostrar todas' }));
    expect(hiddenOf()).toEqual([]);
    expect(harness.ui.hiddenLayers.value.size).toBe(0);
    act(() => void harness.store.undo());
    expect(hiddenOf()).toEqual(all);
  });
});
