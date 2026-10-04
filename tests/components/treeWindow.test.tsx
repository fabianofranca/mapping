import { cleanup, render, screen, waitFor } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { t } from '../../src/i18n';
import { locale } from '../../src/store/settings';
import { showToolWindow } from '../../src/store/toolWindows';
import { collapseTree, treeKey } from '../../src/store/ui';
import { EditorContext } from '../../src/ui/EditorContext';
import { MarkingTree } from '../../src/ui/MarkingTree';
import { TreeWindow } from '../../src/ui/TreeWindow';
import { sampleProject } from '../model/fixtures';
import { createHarness, type Harness } from './harness';

// Janela Árvore (R6): nós que recolhem, bolinhas das camadas na linha, Localizar e
// Recolher tudo. O projeto é o da amostra: I1 › M1 › M2 › M3 e I2 › M4.

beforeEach(() => {
  locale.value = 'pt-BR';
  showToolWindow('tree');
});
afterEach(cleanup);

function withContext(harness: Harness, ui: preact.ComponentChildren) {
  return render(
    <EditorContext.Provider value={harness.context}>{ui}</EditorContext.Provider>,
  );
}

const rowOf = (name: string) =>
  screen.getByRole('button', { name: new RegExp(`^${name}`) });

describe('janela Árvore', () => {
  it('mostra o título, as ações e as linhas', () => {
    const harness = createHarness(sampleProject());
    withContext(harness, <TreeWindow onSelect={vi.fn()} />);
    expect(screen.getByRole('heading', { name: t('panel.treeTitle') })).toBeTruthy();
    expect(screen.getByRole('button', { name: t('tree.locate') })).toBeTruthy();
    expect(screen.getByRole('button', { name: t('tree.collapseAll') })).toBeTruthy();
    expect(rowOf('Porta')).toBeTruthy();
    expect(rowOf('Maçaneta')).toBeTruthy();
  });

  it('escolher uma linha seleciona o item', async () => {
    const harness = createHarness(sampleProject());
    const onSelect = vi.fn();
    withContext(harness, <TreeWindow onSelect={onSelect} />);
    await userEvent.click(rowOf('Porta'));
    expect(onSelect).toHaveBeenCalledWith({ kind: 'marking', id: 'M1' });
  });

  it('o nó recolhe e abre, e esconde as filhas', async () => {
    const harness = createHarness(sampleProject());
    withContext(harness, <TreeWindow onSelect={vi.fn()} />);
    const user = userEvent.setup();
    await user.click(
      screen.getByRole('button', { name: t('tree.collapse', { name: 'Porta' }) }),
    );
    expect(screen.queryByRole('button', { name: /^Maçaneta/ })).toBeNull();
    expect(harness.ui.collapsedTree.value.has(treeKey('marking', 'M1'))).toBe(true);
    const toggle = screen.getByRole('button', {
      name: t('tree.expand', { name: 'Porta' }),
    });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    await user.click(toggle);
    expect(rowOf('Maçaneta')).toBeTruthy();
  });

  it('Recolher tudo deixa só as imagens e não mexe no projeto', async () => {
    const harness = createHarness(sampleProject());
    const before = harness.project();
    withContext(harness, <TreeWindow onSelect={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: t('tree.collapseAll') }));
    expect(screen.queryByRole('button', { name: /^Porta/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Maçaneta/ })).toBeNull();
    expect(
      screen.queryAllByRole('button', { name: /lateral|frente/ }).length,
    ).toBeGreaterThan(0);
    // É estado de UI: o projeto e o desfazer ficam como estavam.
    expect(harness.project()).toBe(before);
    expect(harness.store.canUndo.value).toBe(false);
  });

  it('Localizar abre os ancestrais da seleção e leva o foco à linha', async () => {
    const harness = createHarness(sampleProject());
    collapseTree(harness.ui, harness.project());
    harness.ui.selection.value = { kind: 'marking', id: 'M2' };
    withContext(harness, <TreeWindow onSelect={vi.fn()} />);
    // A seleção também abre os ancestrais sozinha; recolher de novo isola o botão.
    await waitFor(() => expect(rowOf('Maçaneta')).toBeTruthy());
    collapseTree(harness.ui, harness.project());
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /^Maçaneta/ })).toBeNull(),
    );
    await userEvent.click(screen.getByRole('button', { name: t('tree.locate') }));
    await waitFor(() => expect(document.activeElement).toBe(rowOf('Maçaneta')));
  });

  it('Localizar fica desabilitado sem seleção', () => {
    const harness = createHarness(sampleProject());
    withContext(harness, <TreeWindow onSelect={vi.fn()} />);
    expect(screen.getByRole('button', { name: t('tree.locate') })).toHaveProperty(
      'disabled',
      true,
    );
  });

  it('a linha selecionada fica marcada e aria-current', () => {
    const harness = createHarness(sampleProject());
    harness.ui.selection.value = { kind: 'marking', id: 'M1' };
    withContext(harness, <TreeWindow onSelect={vi.fn()} />);
    expect(rowOf('Porta').getAttribute('aria-current')).toBe('true');
    expect(rowOf('Porta').closest('.tree-row')?.className).toContain('tree-row-current');
    expect(rowOf('Maçaneta').getAttribute('aria-current')).toBeNull();
  });
});

describe('árvore: seleção por fora', () => {
  function Tree({ harness }: { readonly harness: Harness }) {
    // Ler o signal aqui re-renderiza a árvore quando a seleção muda por fora.
    return (
      <MarkingTree
        project={harness.project()}
        selection={harness.ui.selection.value}
        onSelect={vi.fn()}
      />
    );
  }

  it('selecionar uma marcação escondida abre os ancestrais dela', async () => {
    const harness = createHarness(sampleProject());
    collapseTree(harness.ui, harness.project());
    withContext(harness, <Tree harness={harness} />);
    expect(screen.queryByRole('button', { name: /^Porta/ })).toBeNull();
    harness.ui.selection.value = { kind: 'marking', id: 'M2' };
    await waitFor(() => expect(rowOf('Maçaneta')).toBeTruthy());
    expect(rowOf('Maçaneta').getAttribute('aria-current')).toBe('true');
    expect(harness.ui.collapsedTree.value.has(treeKey('image', 'I1'))).toBe(false);
    expect(harness.ui.collapsedTree.value.has(treeKey('marking', 'M1'))).toBe(false);
    // As outras imagens continuam recolhidas.
    expect(harness.ui.collapsedTree.value.has(treeKey('image', 'I2'))).toBe(true);
  });
});

describe('bolinhas das camadas na linha', () => {
  it('cada marcação mostra as camadas visíveis que chegam a ela', () => {
    const harness = createHarness(sampleProject());
    withContext(harness, <TreeWindow onSelect={vi.fn()} />);
    const dots = (name: string) =>
      [...(rowOf(name).querySelectorAll<HTMLElement>('.tree-dot') ?? [])].map(
        (d) => d.title,
      );
    // A1 (M1/L1) e A2 (M1/L2); A3 (M2/L1).
    expect(dots('Porta')).toEqual(['Camada Lataria', 'Camada Vidros']);
    expect(dots('Maçaneta')).toEqual(['Camada Lataria']);
  });

  it('esconder uma camada tira a bolinha dela', () => {
    const harness = createHarness(sampleProject());
    harness.ui.hiddenLayers.value = new Set(['L2']);
    withContext(harness, <TreeWindow onSelect={vi.fn()} />);
    const titles = [...rowOf('Porta').querySelectorAll<HTMLElement>('.tree-dot')].map(
      (d) => d.title,
    );
    expect(titles).toEqual(['Camada Lataria']);
  });

  it('a imagem não tem bolinhas', () => {
    const harness = createHarness(sampleProject());
    withContext(harness, <TreeWindow onSelect={vi.fn()} />);
    const image = screen.getAllByRole('button', { name: /lateral/ })[0];
    expect(image?.querySelectorAll('.tree-dot')).toHaveLength(0);
  });
});
