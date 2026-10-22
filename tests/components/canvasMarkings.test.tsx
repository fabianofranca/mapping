import { cleanup, render, screen, waitFor, within } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { t } from '../../src/i18n';
import { addAnnotation, createMarking, type Project } from '../../src/model';
import { locale } from '../../src/store/settings';
import { showToolWindow } from '../../src/store/toolWindows';
import { collapseTree, revealInTree, treeKey } from '../../src/store/ui';
import { Breadcrumbs, crumbsOf } from '../../src/ui/Breadcrumbs';
import { EditorContext } from '../../src/ui/EditorContext';
import { ListView } from '../../src/ui/ListView';
import { IncompleteView } from '../../src/ui/IncompleteView';
import { MarkingPanel } from '../../src/ui/MarkingPanel';
import { MarkingTree } from '../../src/ui/MarkingTree';
import { SelectionPanel } from '../../src/ui/SelectionPanel';
import { sampleProject } from '../model/fixtures';
import { createHarness, renderLive, type Harness } from './harness';

// ME1: a marcação do canvas (`containerId` nulo) na Árvore, na trilha, na Lista, nas
// Incompletas e nos Detalhes. O projeto é o da amostra (I1 › M1 › M2 › M3, I2 › M4) com
// a marcação do canvas "Grupo" em volta dos dois containers e uma nota flutuante.

beforeEach(() => {
  locale.value = 'pt-BR';
  showToolWindow('tree');
});
afterEach(cleanup);

function canvasProject(): Project {
  let p = sampleProject();
  p = createMarking(p, {
    id: 'C1',
    containerId: null,
    name: 'Grupo',
    rect: { x: -20000, y: -20000, width: 60000, height: 60000 },
  });
  p = createMarking(p, {
    id: 'F1',
    containerId: null,
    name: 'Nota',
    floating: true,
    rect: { x: 50000, y: 50000, width: 300, height: 200 },
  });
  return addAnnotation(p, { id: 'AC', markingId: 'C1', layerId: 'L1' });
}

function withContext(harness: Harness, ui: preact.ComponentChildren) {
  return render(
    <EditorContext.Provider value={harness.context}>{ui}</EditorContext.Provider>,
  );
}

const rowOf = (name: string) =>
  screen.getByRole('button', { name: new RegExp(`^${name}`) });

describe('Árvore com a raiz Canvas', () => {
  it('mostra o Canvas com as marcações do canvas e os membros dentro delas', () => {
    const p = canvasProject();
    expect(p.containers.every((c) => c.parentId === 'C1')).toBe(true);
    const harness = createHarness(p);
    withContext(
      harness,
      <MarkingTree project={harness.project()} selection={null} onSelect={vi.fn()} />,
    );
    expect(rowOf('Canvas')).toBeTruthy();
    expect(rowOf('Grupo')).toBeTruthy();
    expect(rowOf('Nota')).toBeTruthy();
    // Os containers membros ficam sob o Grupo, com as marcações deles.
    expect(rowOf('Porta')).toBeTruthy();
    const grupo = rowOf('Grupo').closest('li');
    expect(grupo?.querySelector('.tree-image')).toBeTruthy();
    // A flutuante não tem filhos: nenhum nó para abrir.
    const nota = rowOf('Nota').closest('.tree-row');
    expect(nota?.querySelector('button.tree-toggle')).toBeNull();
  });

  it('containers sem pai ficam no nível da raiz Canvas', () => {
    const p = canvasProject();
    const loose = {
      ...p,
      containers: p.containers.map((c) => ({ ...c, parentId: null })),
    };
    const harness = createHarness(loose);
    const { container } = withContext(
      harness,
      <MarkingTree project={harness.project()} selection={null} onSelect={vi.fn()} />,
    );
    const top = container.querySelectorAll(':scope > ul > li');
    // Canvas + dois containers.
    expect(top).toHaveLength(3);
  });

  it('a raiz Canvas recolhe e abre', async () => {
    const harness = createHarness(canvasProject());
    withContext(
      harness,
      <MarkingTree project={harness.project()} selection={null} onSelect={vi.fn()} />,
    );
    await userEvent.click(
      screen.getByRole('button', { name: t('tree.collapse', { name: 'Canvas' }) }),
    );
    expect(screen.queryByRole('button', { name: /^Grupo/ })).toBeNull();
    expect(harness.ui.collapsedTree.value.has(treeKey('canvas', ''))).toBe(true);
  });

  it('revealInTree abre a cadeia inteira: marcação de container, container, grupo e Canvas', () => {
    const harness = createHarness(canvasProject());
    collapseTree(harness.ui, harness.project());
    const collapsed = harness.ui.collapsedTree.value;
    expect(collapsed.has(treeKey('canvas', ''))).toBe(true);
    expect(collapsed.has(treeKey('marking', 'C1'))).toBe(true);
    expect(
      revealInTree(harness.ui, harness.project(), { kind: 'marking', id: 'M2' }),
    ).toBe(true);
    const open = harness.ui.collapsedTree.value;
    for (const key of [
      treeKey('canvas', ''),
      treeKey('marking', 'C1'),
      treeKey('image', 'I1'),
      treeKey('marking', 'M1'),
    ]) {
      expect(open.has(key)).toBe(false);
    }
  });

  it('o cadeado do container mostra a trava herdada da marcação do canvas', () => {
    const p = canvasProject();
    const locked = {
      ...p,
      markings: p.markings.map((m) => (m.id === 'C1' ? { ...m, locked: true } : m)),
    };
    const harness = createHarness(locked);
    withContext(
      harness,
      <MarkingTree project={harness.project()} selection={null} onSelect={vi.fn()} />,
    );
    const row = rowOf('images/frente').closest('.tree-row');
    expect(row?.querySelector('.tree-lock-inherited')).toBeTruthy();
  });
});

describe('trilha', () => {
  it('container dentro de uma marcação do canvas: Canvas › grupo › container', () => {
    const p = canvasProject();
    const crumbs = crumbsOf(p, { kind: 'image', id: 'I1' });
    expect(crumbs.map((c) => c.name)).toEqual(['Canvas', 'Grupo', expect.any(String)]);
    expect(crumbs[0]?.selection).toBeNull();
  });

  it('marcação de container: Canvas › grupo › container › marcações', () => {
    const p = canvasProject();
    const names = crumbsOf(p, { kind: 'marking', id: 'M2' }).map((c) => c.name);
    expect(names).toEqual(['Canvas', 'Grupo', expect.any(String), 'Porta', 'Maçaneta']);
  });

  it('marcação do canvas: Canvas › marcação', async () => {
    const harness = createHarness(canvasProject());
    const onSelect = vi.fn();
    harness.ui.selection.value = { kind: 'marking', id: 'C1' };
    withContext(harness, <Breadcrumbs onSelect={onSelect} />);
    expect(screen.getByLabelText(t('crumbs.canvas'))).toBeTruthy();
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(1);
    expect(buttons[0]?.getAttribute('aria-current')).toBe('location');
  });
});

describe('Lista e Incompletas', () => {
  it('a Lista tem o grupo Canvas com a marcação do canvas', () => {
    const harness = createHarness(canvasProject());
    withContext(harness, <ListView onSelect={vi.fn()} />);
    const header = screen.getByRole('columnheader', { name: t('canvas.name') });
    expect(header).toBeTruthy();
    expect(
      screen.getByRole('button', { name: t('list.select', { name: 'Grupo' }) }),
    ).toBeTruthy();
  });

  it('as Incompletas agrupam as pendências do canvas sob Canvas', () => {
    const harness = createHarness(canvasProject());
    withContext(harness, <IncompleteView onGoToAnnotation={vi.fn()} />);
    // A anotação sem tipo da amostra é uma pendência; a do canvas cai no grupo Canvas.
    const headers = screen.queryAllByRole('columnheader', { name: t('canvas.name') });
    const incomplete = harness.context.derived.incompleteList.value;
    expect(headers.length).toBe(incomplete.some((g) => g.image === null) ? 1 : 0);
  });
});

describe('Detalhes', () => {
  function renderPanel(markingId: string) {
    const harness = createHarness(canvasProject());
    renderLive(harness, (p) => {
      const marking = p.markings.find((m) => m.id === markingId);
      if (!marking) return null;
      const image = p.containers.find((i) => i.id === marking.containerId) ?? null;
      return (
        <MarkingPanel
          project={p}
          marking={marking}
          image={image}
          readOnly={false}
          onDelete={() => undefined}
          onGoToAnnotation={() => undefined}
        />
      );
    });
    return { harness, user: userEvent.setup() };
  }

  it('marcação do canvas: Container: Canvas, "Pertence a" só leitura e interruptor Flutuante', async () => {
    const { harness, user } = renderPanel('C1');
    expect(screen.getAllByText(t('marking.container')).length).toBeGreaterThan(0);
    expect(screen.getAllByText(t('canvas.name')).length).toBeGreaterThan(0);
    expect(screen.getAllByText(t('marking.parent')).length).toBeGreaterThan(0);
    // "Pertence a" não é mais um campo editável.
    const section = screen.getByRole('region', { name: t('marking.section') });
    expect(within(section).queryByRole('combobox')).toBeNull();
    const floating = screen.getByRole<HTMLInputElement>('checkbox', {
      name: t('marking.floating'),
    });
    expect(floating.checked).toBe(false);
    await user.click(floating);
    await waitFor(() =>
      expect(harness.project().markings.find((m) => m.id === 'C1')?.floating).toBe(true),
    );
  });

  it('marcação de container: mostra o pai assentado e não tem o interruptor', () => {
    renderPanel('M2');
    expect(screen.getByText('Porta', { selector: '.props-text' })).toBeTruthy();
    expect(screen.queryByRole('checkbox', { name: t('marking.floating') })).toBeNull();
    // x/y/w/h continuam editáveis.
    expect(screen.getByLabelText('X')).toBeTruthy();
  });

  it('o container mostra a marcação do canvas a que pertence', () => {
    const harness = createHarness(canvasProject());
    renderLive(harness, (p) => (
      <SelectionPanel
        image={p.containers[0] ?? null}
        project={p}
        display={undefined}
        readOnly={false}
        busy={false}
        onReplace={() => undefined}
        onDelete={() => undefined}
      />
    ));
    expect(screen.getAllByText(t('marking.parent')).length).toBeGreaterThan(0);
    expect(screen.getByText('Grupo', { selector: '.props-text' })).toBeTruthy();
  });
});
