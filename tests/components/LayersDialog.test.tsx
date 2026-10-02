import { cleanup, screen, within } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LAYER_PALETTE, type Project } from '../../src/model';
import { locale, markingDisplay, setMarkingDisplay } from '../../src/store/settings';
import { resolveActiveLayerId } from '../../src/store/ui';
import { LayersDialog } from '../../src/ui/LayersDialog';
import { cadastroProject } from '../model/specFixtures';
import { createHarness, renderLive } from './harness';

beforeEach(() => {
  locale.value = 'pt-BR';
});
afterEach(cleanup);

function setup(project: Project = cadastroProject(), readOnly = false) {
  const harness = createHarness(project, readOnly);
  const onClose = vi.fn();
  renderLive(harness, (p) => (
    <LayersDialog
      project={p}
      ui={harness.ui}
      actions={harness.actions}
      readOnly={readOnly}
      onClose={onClose}
    />
  ));
  return { harness, onClose, user: userEvent.setup() };
}

const names = (p: Project) => p.layers.map((l) => l.name);

describe('LayersDialog', () => {
  it('lista as camadas na ordem do projeto', () => {
    const { harness } = setup();
    const inputs = screen
      .getAllByLabelText('Nome da camada')
      .map((i) => (i as HTMLInputElement).value);
    expect(inputs).toEqual(names(harness.project()));
  });

  it('nova camada: nome padrão e cor da paleta', async () => {
    const { harness, user } = setup();
    const before = harness.project().layers.length;
    await user.click(screen.getByRole('button', { name: '+ Nova camada' }));
    const layers = harness.project().layers;
    expect(layers).toHaveLength(before + 1);
    expect(layers[before]?.name).toBe(`Camada ${before + 1}`);
    expect(LAYER_PALETTE.map((c) => c.toUpperCase())).toContain(
      layers[before]?.color.toUpperCase(),
    );
  });

  it('renomeia uma camada livre ao confirmar', async () => {
    const { harness, user } = setup();
    const input = screen.getAllByLabelText('Nome da camada')[0];
    if (!input) throw new Error('sem camadas');
    await user.clear(input);
    await user.type(input, 'Modelo{Enter}');
    expect(harness.project().layers[0]?.name).toBe('Modelo');
  });

  it('camadas de especialização não podem ser renomeadas nem excluídas', () => {
    const { harness } = setup();
    const p = harness.project();
    p.layers.forEach((layer, index) => {
      const input = screen.getAllByLabelText('Nome da camada')[index];
      const del = screen.getAllByRole('button', { name: 'Excluir camada' })[index];
      expect(input).toHaveProperty('disabled', layer.spec !== null);
      expect(del).toHaveProperty('disabled', layer.spec !== null);
    });
  });

  it('muda a cor pela paleta', async () => {
    const { harness, user } = setup();
    const layer = harness.project().layers[0];
    if (!layer) throw new Error('sem camadas');
    await user.click(
      screen.getAllByRole('button', { name: `Cor da camada ${layer.name}` })[0]!,
    );
    const palette = screen.getByRole('group', { name: `Cor da camada ${layer.name}` });
    const color = LAYER_PALETTE.find(
      (c) => c.toUpperCase() !== layer.color.toUpperCase(),
    );
    if (!color) throw new Error('paleta sem alternativa');
    await user.click(within(palette).getByRole('button', { name: color }));
    expect(harness.project().layers[0]?.color.toUpperCase()).toBe(color.toUpperCase());
  });

  it('reordena com os botões e desabilita os extremos', async () => {
    const { harness, user } = setup();
    const before = harness.project().layers.map((l) => l.id);
    const up = screen.getAllByRole('button', { name: 'Subir camada' });
    const down = screen.getAllByRole('button', { name: 'Descer camada' });
    expect(up[0]).toHaveProperty('disabled', true);
    expect(down[down.length - 1]).toHaveProperty('disabled', true);
    await user.click(down[0]!);
    const after = harness.project().layers.map((l) => l.id);
    expect(after[0]).toBe(before[1]);
    expect(after[1]).toBe(before[0]);
  });

  it('excluir pede confirmação com a contagem de anotações afetadas', async () => {
    const { harness, user } = setup();
    const free = harness.project().layers.find((l) => l.spec === null);
    if (!free) throw new Error('sem camada livre');
    const index = harness.project().layers.indexOf(free);
    await user.click(screen.getAllByRole('button', { name: 'Excluir camada' })[index]!);
    const heading = await screen.findByRole('heading', { name: 'Excluir camada?' });
    const dialog = heading.closest('dialog');
    if (!dialog) throw new Error('sem diálogo');
    expect(within(dialog).getByText(/anotação/)).toBeTruthy();

    await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    expect(harness.project().layers).toContain(free);

    await user.click(screen.getAllByRole('button', { name: 'Excluir camada' })[index]!);
    const again = (
      await screen.findByRole('heading', { name: 'Excluir camada?' })
    ).closest('dialog');
    await user.click(
      within(again as HTMLElement).getByRole('button', { name: 'Excluir' }),
    );
    expect(harness.project().layers.some((l) => l.id === free.id)).toBe(false);
    // As anotações da camada saem junto.
    expect(harness.project().annotations.some((a) => a.layerId === free.id)).toBe(false);
  });

  it('a última camada não pode ser excluída', () => {
    const { harness } = setup();
    // Projeto de uma camada só.
    cleanup();
    const only = createHarness({
      ...harness.project(),
      layers: harness.project().layers.slice(0, 1),
      annotations: [],
    });
    renderLive(only, (p) => (
      <LayersDialog
        project={p}
        ui={only.ui}
        actions={only.actions}
        readOnly={false}
        onClose={() => undefined}
      />
    ));
    expect(screen.getByRole('button', { name: 'Excluir camada' })).toHaveProperty(
      'disabled',
      true,
    );
  });

  it('camada ativa: tornar ativa e visibilidade', async () => {
    const { harness, user } = setup();
    const p = harness.project();
    const second = p.layers[1];
    if (!second) throw new Error('precisa de duas camadas');
    const makeActive = screen.getAllByRole('button', { name: 'Tornar ativa' });
    await user.click(makeActive[0]!);
    expect(resolveActiveLayerId(p, harness.ui.activeLayer.value)).toBe(second.id);

    // A ativa não pode ser escondida; as outras sim.
    const first = p.layers[0];
    if (!first) throw new Error('sem camada');
    const box = screen.getByLabelText(`Mostrar a camada ${first.name}`);
    expect(box).toHaveProperty('checked', true);
    await user.click(box);
    expect(harness.ui.hiddenLayers.value.has(first.id)).toBe(true);
    await user.click(screen.getByRole('button', { name: 'Mostrar todas' }));
    expect(harness.ui.hiddenLayers.value.size).toBe(0);
  });

  it('o modo de exibição das marcações é guardado nas configurações', async () => {
    const { user } = setup();
    const radios = screen.getAllByRole('radio');
    const other = radios.find((r) => !(r as HTMLInputElement).checked);
    if (!other) throw new Error('sem outro modo');
    await user.click(other);
    expect(markingDisplay.value).toBe((other as HTMLInputElement).value);
    setMarkingDisplay('all');
  });

  it('somente leitura desabilita criar, renomear, mover e excluir', () => {
    setup(cadastroProject(), true);
    expect(screen.getByRole('button', { name: '+ Nova camada' })).toHaveProperty(
      'disabled',
      true,
    );
    for (const input of screen.getAllByLabelText('Nome da camada')) {
      expect(input).toHaveProperty('disabled', true);
    }
    for (const b of screen.getAllByRole('button', { name: 'Excluir camada' })) {
      expect(b).toHaveProperty('disabled', true);
    }
  });
});
