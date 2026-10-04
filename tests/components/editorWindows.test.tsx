import { cleanup, render, screen, within } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CanvasController } from '../../src/canvas/CanvasController';
import { t } from '../../src/i18n';
import { SCHEMA_VERSION } from '../../src/model';
import {
  hideToolWindow,
  isToolWindowOpen,
  resetToolWindowSize,
  showToolWindow,
} from '../../src/store/toolWindows';
import { Breadcrumbs } from '../../src/ui/Breadcrumbs';
import { EditorContext } from '../../src/ui/EditorContext';
import { LayersWindow } from '../../src/ui/LayersWindow';
import { Minimap } from '../../src/ui/Minimap';
import { StatusBar } from '../../src/ui/StatusBar';
import { ToolStrip } from '../../src/ui/ToolStrip';
import { ToolWindow } from '../../src/ui/ToolWindow';
import { ZoomField } from '../../src/ui/ZoomField';
import { sampleProject } from '../model/fixtures';
import { createHarness, type Harness } from './harness';

// Estrutura do editor no desktop (R4): faixas, janelas, breadcrumbs, barra de status,
// minimapa e campo de zoom.

const SPACE = { width: 1400, height: 800, otherWidth: 0 };

beforeEach(() => {
  showToolWindow('tree');
  showToolWindow('layers');
  showToolWindow('details');
  hideToolWindow('list');
  resetToolWindowSize('left', SPACE);
  resetToolWindowSize('right', SPACE);
});

afterEach(cleanup);

function withContext(harness: Harness, ui: preact.ComponentChildren) {
  return render(
    <EditorContext.Provider value={harness.context}>{ui}</EditorContext.Provider>,
  );
}

function fakeCanvas(harness: Harness) {
  const canvas = {
    focusSelection: vi.fn(),
    zoomTo: vi.fn(),
    centerOnPoint: vi.fn(),
  };
  harness.context.canvas.current = canvas as unknown as CanvasController;
  return canvas;
}

describe('faixas e janelas', () => {
  it('a faixa esquerda abre e esconde a Árvore e a Lista', async () => {
    const harness = createHarness(sampleProject());
    withContext(harness, <ToolStrip side="left" />);
    const user = userEvent.setup();
    const tree = t('panel.treeTitle');
    await user.click(
      screen.getByRole('button', { name: t('window.hide', { name: tree }) }),
    );
    expect(isToolWindowOpen('tree')).toBe(false);
    await user.click(
      screen.getByRole('button', { name: t('window.show', { name: tree }) }),
    );
    expect(isToolWindowOpen('tree')).toBe(true);
    // A faixa da esquerda também abre a janela inferior (Lista).
    await user.click(
      screen.getByRole('button', { name: t('window.show', { name: t('list.title') }) }),
    );
    expect(isToolWindowOpen('list')).toBe(true);
  });

  it('o botão aberto fica pressionado', () => {
    const harness = createHarness(sampleProject());
    withContext(harness, <ToolStrip side="right" />);
    const button = screen.getByRole('button', {
      name: t('window.hide', { name: t('panel.details') }),
    });
    expect(button.getAttribute('aria-pressed')).toBe('true');
  });

  it('a janela mostra o título, a divisória e fecha pelo cabeçalho', async () => {
    const harness = createHarness(sampleProject());
    withContext(
      harness,
      <ToolWindow id="tree">
        <p>conteúdo</p>
      </ToolWindow>,
    );
    const title = t('panel.treeTitle');
    expect(screen.getByRole('heading', { name: title })).toBeTruthy();
    expect(
      screen.getByRole('separator', { name: t('window.resize', { name: title }) }),
    ).toBeTruthy();
    await userEvent.click(
      screen.getByRole('button', { name: t('window.closeWindow', { name: title }) }),
    );
    expect(isToolWindowOpen('tree')).toBe(false);
  });
});

describe('Camadas como janela (B3)', () => {
  it('a faixa esquerda também abre e esconde as Camadas', async () => {
    const harness = createHarness(sampleProject());
    withContext(harness, <ToolStrip side="left" />);
    const name = t('layer.title');
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: t('window.hide', { name }) }));
    expect(isToolWindowOpen('layers')).toBe(false);
    // Esconder as Camadas não esconde a Árvore: elas dividem a coluna da esquerda.
    expect(isToolWindowOpen('tree')).toBe(true);
    await user.click(screen.getByRole('button', { name: t('window.show', { name }) }));
    expect(isToolWindowOpen('layers')).toBe(true);
    expect(isToolWindowOpen('tree')).toBe(true);
  });

  it('a janela traz Nova camada e Mostrar todas no cabeçalho e a lista no corpo', async () => {
    const harness = createHarness(sampleProject());
    withContext(harness, <LayersWindow stacked />);
    const region = screen.getByRole('region', { name: t('layer.title') });
    const head = region.querySelector<HTMLElement>('.tool-window-head');
    if (!head) throw new Error('sem cabeçalho');
    expect(within(head).getByRole('button', { name: t('layer.add') })).toBeTruthy();
    expect(within(head).getByRole('button', { name: t('layer.showAll') })).toBeTruthy();
    expect(screen.getAllByLabelText(t('layer.name'))).toHaveLength(2);
    expect(screen.getByLabelText(t('layer.displayMode'))).toBeTruthy();

    const before = harness.project().layers.length;
    await userEvent.click(within(head).getByRole('button', { name: t('layer.add') }));
    expect(harness.project().layers).toHaveLength(before + 1);
    // A lista acompanha o projeto sem o editor reabrir nada.
    expect(isToolWindowOpen('layers')).toBe(true);
  });

  it('empilhada tem a divisória com a Árvore; sozinha, não', () => {
    const harness = createHarness(sampleProject());
    const { unmount } = withContext(harness, <LayersWindow stacked />);
    const name = t('layer.title');
    const label = t('window.resize', { name });
    // Duas divisórias: a lateral (largura da coluna) e a horizontal (altura).
    expect(screen.getAllByRole('separator', { name: label })).toHaveLength(2);
    expect(
      screen
        .getAllByRole('separator', { name: label })
        .map((s) => s.getAttribute('aria-orientation'))
        .sort(),
    ).toEqual(['horizontal', 'vertical']);
    unmount();
    withContext(harness, <LayersWindow stacked={false} />);
    expect(screen.getAllByRole('separator', { name: label })).toHaveLength(1);
  });

  it('fecha pelo cabeçalho sem tocar na Árvore', async () => {
    const harness = createHarness(sampleProject());
    withContext(harness, <LayersWindow stacked />);
    await userEvent.click(
      screen.getByRole('button', {
        name: t('window.closeWindow', { name: t('layer.title') }),
      }),
    );
    expect(isToolWindowOpen('layers')).toBe(false);
    expect(isToolWindowOpen('tree')).toBe(true);
  });
});

describe('breadcrumbs', () => {
  it('mostra o caminho e escolher um nível seleciona o item', async () => {
    const harness = createHarness(sampleProject());
    const onSelect = vi.fn();
    harness.ui.selection.value = { kind: 'marking', id: 'M2' };
    withContext(harness, <Breadcrumbs onSelect={onSelect} />);
    const crumbs = screen.getAllByRole('button');
    // Imagem › Porta › Maçaneta: o último é o item selecionado.
    expect(crumbs).toHaveLength(3);
    expect(crumbs[2]?.getAttribute('aria-current')).toBe('location');
    await userEvent.click(crumbs[1]!);
    expect(onSelect).toHaveBeenCalledWith({ kind: 'marking', id: 'M1' });
  });

  it('sem seleção avisa que não há nada selecionado', () => {
    const harness = createHarness(sampleProject());
    withContext(harness, <Breadcrumbs onSelect={vi.fn()} />);
    expect(screen.getByText(t('panel.nothingSelected'))).toBeTruthy();
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });
});

describe('barra de status', () => {
  it('mostra salvamento, destino, seleção, cursor, zoom, schema e canal', () => {
    const harness = createHarness(sampleProject());
    harness.ui.selection.value = { kind: 'marking', id: 'M1' };
    harness.context.view.cursor.value = { imageId: 'I1', x: 120, y: 48 };
    harness.context.view.viewport.value = { x: 0, y: 0, scale: 0.5 };
    withContext(harness, <StatusBar />);
    expect(screen.getByText(t('status.saved'))).toBeTruthy();
    expect(screen.getByText(t('status.targetFolder'))).toBeTruthy();
    expect(screen.getByText('Porta')).toBeTruthy();
    expect(screen.getByText('120, 48')).toBeTruthy();
    expect(screen.getByText('50%')).toBeTruthy();
    expect(
      screen.getByText(t('status.schema', { version: SCHEMA_VERSION })),
    ).toBeTruthy();
    expect(screen.getByText(t('status.channelMain'))).toBeTruthy();
  });

  it('fora de uma imagem o cursor fica vazio', () => {
    const harness = createHarness(sampleProject());
    withContext(harness, <StatusBar />);
    expect(screen.getByText(t('status.empty'))).toBeTruthy();
  });

  it('somente leitura aparece no lugar do salvamento', () => {
    const harness = createHarness(sampleProject(), true);
    withContext(harness, <StatusBar />);
    expect(screen.getByText(t('status.readOnly'))).toBeTruthy();
    expect(screen.queryByText(t('status.saved'))).toBeNull();
  });
});

describe('zoom e minimapa', () => {
  it('o campo de zoom mostra a porcentagem e volta a 100%', async () => {
    const harness = createHarness(sampleProject());
    const canvas = fakeCanvas(harness);
    harness.context.view.viewport.value = { x: 0, y: 0, scale: 0.42 };
    withContext(harness, <ZoomField />);
    await userEvent.click(
      screen.getByRole('button', { name: t('zoom.reset', { percent: 42 }) }),
    );
    expect(canvas.zoomTo).toHaveBeenCalledWith(1);
  });

  it('o minimapa aparece com as imagens e o clique move a vista', async () => {
    const harness = createHarness(sampleProject());
    const canvas = fakeCanvas(harness);
    const { view } = harness.context;
    view.bounds.value = { x: 0, y: 0, width: 1000, height: 800 };
    view.size.value = { width: 400, height: 300 };
    view.viewport.value = { x: 0, y: 0, scale: 1 };
    withContext(harness, <Minimap />);
    await userEvent.click(screen.getByRole('button', { name: t('minimap.label') }));
    expect(canvas.centerOnPoint).toHaveBeenCalledOnce();
  });

  it('sem imagens não há minimapa', () => {
    const harness = createHarness(sampleProject());
    harness.context.view.size.value = { width: 400, height: 300 };
    withContext(harness, <Minimap />);
    expect(screen.queryByRole('button', { name: t('minimap.label') })).toBeNull();
  });
});
