import { cleanup, screen, within } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LAYER_PALETTE, type Project } from '../../src/model';
import { locale, markingDisplay, setMarkingDisplay } from '../../src/store/settings';
import { resolveActiveLayerId } from '../../src/store/ui';
import { LayersDialog } from '../../src/ui/LayersDialog';
import { LayerActions, LayersPanel } from '../../src/ui/LayersPanel';
import { cadastroProject } from '../model/specFixtures';
import { createHarness, renderLive } from './harness';

// Camadas (B3): o conteúdo da janela do desktop e do diálogo do celular é o mesmo
// `LayersPanel`; Nova camada e Mostrar todas vêm de `LayerActions`.

beforeEach(() => {
  locale.value = 'pt-BR';
});
afterEach(cleanup);

function setup(project: Project = cadastroProject(), readOnly = false) {
  const harness = createHarness(project, readOnly);
  renderLive(harness, (p) => (
    <>
      <LayerActions project={p} readOnly={readOnly} variant="icons" />
      <LayersPanel project={p} readOnly={readOnly} />
    </>
  ));
  return { harness, user: userEvent.setup() };
}

const names = (p: Project) => p.layers.map((l) => l.name);

/** Abre o menu de ações (⋯) da camada pelo índice e devolve o item pedido. */
async function menuItem(
  user: ReturnType<typeof userEvent.setup>,
  layerName: string,
  item: string,
) {
  await user.click(
    screen.getByRole('button', { name: `Mais ações da camada ${layerName}` }),
  );
  const menu = screen.getByRole('menu', { name: `Mais ações da camada ${layerName}` });
  return within(menu).getByRole('button', { name: item });
}

describe('LayersPanel', () => {
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
    await user.click(screen.getByRole('button', { name: 'Nova camada' }));
    const layers = harness.project().layers;
    expect(layers).toHaveLength(before + 1);
    expect(layers[before]?.name).toBe(`Camada ${before + 1}`);
    expect(LAYER_PALETTE.map((c) => c.toUpperCase())).toContain(
      layers[before]?.color.toUpperCase(),
    );
  });

  it('renomeia uma camada livre ao confirmar, na própria linha', async () => {
    const { harness, user } = setup();
    const input = screen.getAllByLabelText('Nome da camada')[0];
    if (!input) throw new Error('sem camadas');
    await user.clear(input);
    await user.type(input, 'Modelo{Enter}');
    expect(harness.project().layers[0]?.name).toBe('Modelo');
  });

  it('camadas de especialização não podem ser renomeadas nem excluídas', async () => {
    const { harness, user } = setup();
    const p = harness.project();
    for (const [index, layer] of p.layers.entries()) {
      expect(screen.getAllByLabelText('Nome da camada')[index]).toHaveProperty(
        'disabled',
        layer.spec !== null,
      );
      const del = await menuItem(user, layer.name, 'Excluir camada');
      expect(del).toHaveProperty('disabled', layer.spec !== null);
      await user.keyboard('{Escape}');
    }
  });

  it('muda a cor pela paleta, que abre em popover e fecha ao escolher', async () => {
    const { harness, user } = setup();
    const layer = harness.project().layers[0];
    if (!layer) throw new Error('sem camadas');
    expect(
      screen.queryByRole('group', { name: `Cor da camada ${layer.name}` }),
    ).toBeNull();
    await user.click(screen.getByRole('button', { name: `Cor da camada ${layer.name}` }));
    const palette = screen.getByRole('group', { name: `Cor da camada ${layer.name}` });
    const color = LAYER_PALETTE.find(
      (c) => c.toUpperCase() !== layer.color.toUpperCase(),
    );
    if (!color) throw new Error('paleta sem alternativa');
    await user.click(within(palette).getByRole('button', { name: color }));
    expect(harness.project().layers[0]?.color.toUpperCase()).toBe(color.toUpperCase());
    expect(
      screen.queryByRole('group', { name: `Cor da camada ${layer.name}` }),
    ).toBeNull();
  });

  it('o popover fecha com Esc e devolve o foco ao botão', async () => {
    const { harness, user } = setup();
    const layer = harness.project().layers[0];
    if (!layer) throw new Error('sem camadas');
    const trigger = screen.getByRole('button', { name: `Cor da camada ${layer.name}` });
    await user.click(trigger);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    await user.keyboard('{Escape}');
    expect(
      screen.queryByRole('group', { name: `Cor da camada ${layer.name}` }),
    ).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('o popover fecha com o clique fora', async () => {
    const { harness, user } = setup();
    const layer = harness.project().layers[0];
    if (!layer) throw new Error('sem camadas');
    const trigger = screen.getByRole('button', { name: `Cor da camada ${layer.name}` });
    await user.click(trigger);
    // O listener de fora entra num efeito; o Preact o roda no máximo 100ms depois do
    // desenho (`requestAnimationFrame` com limite), então espera um pouco mais.
    await new Promise((resolve) => setTimeout(resolve, 150));
    await user.click(document.body);
    expect(
      screen.queryByRole('group', { name: `Cor da camada ${layer.name}` }),
    ).toBeNull();
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  });

  it('reordena pelo menu e desabilita os extremos', async () => {
    const { harness, user } = setup();
    const before = harness.project().layers;
    const first = before[0];
    const lastLayer = before[before.length - 1];
    if (!first || !lastLayer) throw new Error('sem camadas');
    expect(await menuItem(user, first.name, 'Subir camada')).toHaveProperty(
      'disabled',
      true,
    );
    await user.keyboard('{Escape}');
    expect(await menuItem(user, lastLayer.name, 'Descer camada')).toHaveProperty(
      'disabled',
      true,
    );
    await user.keyboard('{Escape}');

    await user.click(await menuItem(user, first.name, 'Descer camada'));
    const after = harness.project().layers.map((l) => l.id);
    expect(after[0]).toBe(before[1]?.id);
    expect(after[1]).toBe(first.id);
    // Escolher uma ação fecha o menu.
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('excluir pede confirmação com a contagem de anotações afetadas', async () => {
    const { harness, user } = setup();
    const free = harness.project().layers.find((l) => l.spec === null);
    if (!free) throw new Error('sem camada livre');
    await user.click(await menuItem(user, free.name, 'Excluir camada'));
    const heading = await screen.findByRole('heading', { name: 'Excluir camada?' });
    const dialog = heading.closest('dialog');
    if (!dialog) throw new Error('sem diálogo');
    expect(within(dialog).getByText(/anotação/)).toBeTruthy();

    await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    expect(harness.project().layers).toContain(free);

    await user.click(await menuItem(user, free.name, 'Excluir camada'));
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

  it('a última camada não pode ser excluída', async () => {
    const { harness } = setup();
    cleanup();
    const only = createHarness({
      ...harness.project(),
      layers: harness.project().layers.slice(0, 1),
      annotations: [],
    });
    renderLive(only, (p) => <LayersPanel project={p} readOnly={false} />);
    const user = userEvent.setup();
    const name = only.project().layers[0]?.name ?? '';
    expect(await menuItem(user, name, 'Excluir camada')).toHaveProperty('disabled', true);
  });

  it('camada ativa: tornar ativa e visibilidade', async () => {
    const { harness, user } = setup();
    const p = harness.project();
    const second = p.layers[1];
    const first = p.layers[0];
    if (!first || !second) throw new Error('precisa de duas camadas');
    const makeActive = screen.getAllByRole('button', { name: 'Tornar ativa' });
    await user.click(makeActive[0]!);
    expect(resolveActiveLayerId(p, harness.ui.activeLayer.value)).toBe(second.id);
    // A ativa fica pressionada e a linha dela marcada.
    expect(screen.getAllByRole('button', { name: 'Ativa' })).toHaveLength(1);
    expect(document.querySelectorAll('.layer-row-active')).toHaveLength(1);

    // A ativa não pode ser escondida; as outras sim.
    const box = screen.getByLabelText(`Mostrar a camada ${first.name}`);
    expect(box).toHaveProperty('checked', true);
    await user.click(box);
    expect(harness.ui.hiddenLayers.value.has(first.id)).toBe(true);
    expect(screen.getByLabelText(`Mostrar a camada ${second.name}`)).toHaveProperty(
      'disabled',
      true,
    );
    await user.click(screen.getByRole('button', { name: 'Mostrar todas' }));
    expect(harness.ui.hiddenLayers.value.size).toBe(0);
  });

  it('o modo de exibição das marcações fica no rodapé e é guardado nas configurações', async () => {
    const { user } = setup();
    const select = screen.getByLabelText('Marcações sem anotação');
    await user.selectOptions(select, 'hide');
    expect(markingDisplay.value).toBe('hide');
    await user.selectOptions(select, 'all');
    expect(markingDisplay.value).toBe('all');
    setMarkingDisplay('dim');
  });

  it('somente leitura desabilita criar, renomear, cor, mover e excluir', async () => {
    const { harness, user } = setup(cadastroProject(), true);
    expect(screen.getByRole('button', { name: 'Nova camada' })).toHaveProperty(
      'disabled',
      true,
    );
    for (const input of screen.getAllByLabelText('Nome da camada')) {
      expect(input).toHaveProperty('disabled', true);
    }
    const layer = harness.project().layers[0];
    if (!layer) throw new Error('sem camadas');
    expect(
      screen.getByRole('button', { name: `Cor da camada ${layer.name}` }),
    ).toHaveProperty('disabled', true);
    for (const l of harness.project().layers) {
      expect(await menuItem(user, l.name, 'Excluir camada')).toHaveProperty(
        'disabled',
        true,
      );
      expect(await screen.findByRole('button', { name: 'Subir camada' })).toHaveProperty(
        'disabled',
        true,
      );
      await user.keyboard('{Escape}');
    }
  });
});

describe('LayersDialog (celular)', () => {
  it('reúne a dica, as ações em botões e a lista, e fecha pelo botão', async () => {
    const harness = createHarness(cadastroProject());
    const onClose = vi.fn();
    renderLive(harness, (p) => (
      <LayersDialog project={p} readOnly={false} onClose={onClose} />
    ));
    expect(screen.getByRole('button', { name: '+ Nova camada' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Mostrar todas' })).toBeTruthy();
    expect(screen.getAllByLabelText('Nome da camada')).toHaveLength(
      harness.project().layers.length,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Fechar' }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
