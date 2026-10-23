import { cleanup, render, screen, within } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { t } from '../../src/i18n';
import type { Arrow, Marking } from '../../src/model';
import { locale } from '../../src/store/settings';
import { showToolWindow } from '../../src/store/toolWindows';
import { ArrowPanel } from '../../src/ui/ArrowPanel';
import { crumbsOf } from '../../src/ui/Breadcrumbs';
import { EditorContext } from '../../src/ui/EditorContext';
import { MarkingPicker, markingOptions } from '../../src/ui/MarkingPicker';
import { MarkingTree } from '../../src/ui/MarkingTree';
import { sampleProject } from '../model/fixtures';
import { withNoteInstance } from '../model/notesFixtures';
import { createHarness, renderLive, type Harness } from './harness';

// Instância de componente sem nome (a Paleta cria assim): onde a marcação não tem nome, a
// interface mostra o nome do tipo que ela desenha ("Nota"); nada é gravado.

beforeEach(() => {
  locale.value = 'pt-BR';
  showToolWindow('tree');
});
afterEach(cleanup);

function noteHarness(): Harness {
  return createHarness(withNoteInstance(sampleProject()));
}

describe('Ligar a… com uma nota sem nome', () => {
  it('o título usa o nome do tipo e a busca casa por ele', async () => {
    const harness = noteHarness();
    const project = harness.project();
    const source = project.markings.find((m) => m.id === 'N1') as Marking;
    const onPick = vi.fn();
    render(
      <MarkingPicker
        project={project}
        source={source}
        onClose={vi.fn()}
        onPick={onPick}
      />,
    );
    expect(
      screen.getByRole('heading', { name: t('arrow.pickerTitle', { name: 'Nota' }) }),
    ).toBeTruthy();
  });

  it('a opção da nota tem o nome do tipo e a busca por ele a encontra', async () => {
    const harness = noteHarness();
    const project = harness.project();
    const porta = project.markings.find((m) => m.id === 'M1') as Marking;
    expect(markingOptions(project, 'M1').find((o) => o.marking.id === 'N1')?.label).toBe(
      'Nota',
    );
    const onPick = vi.fn();
    render(
      <MarkingPicker
        project={project}
        source={porta}
        onClose={vi.fn()}
        onPick={onPick}
      />,
    );
    const user = userEvent.setup();
    const input = screen.getByRole('combobox', {
      name: t('arrow.pickerSearch'),
      hidden: true,
    });
    await user.type(input, 'nota');
    const list = await screen.findByRole('listbox', { hidden: true });
    const options = within(list).getAllByRole('option', { hidden: true });
    expect(options).toHaveLength(1);
    await user.keyboard('{Enter}');
    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ id: 'N1' }));
  });
});

describe('Seta, árvore e trilha com a nota sem nome', () => {
  function withNoteArrow(): Harness {
    const harness = noteHarness();
    const result = harness.actions.addArrow('N1', 'M1');
    if (!result.ok) throw new Error('addArrow falhou');
    return harness;
  }

  it('a seção Seta mostra a origem pelo nome do tipo', () => {
    const harness = withNoteArrow();
    renderLive(harness, (p) => (
      <ArrowPanel
        project={p}
        arrow={p.arrows[0] as Arrow}
        readOnly={false}
        onDelete={vi.fn()}
        onGoToAnnotation={vi.fn()}
      />
    ));
    expect(
      screen.getByRole('button', { name: t('arrow.select', { name: 'Nota' }) }),
    ).toBeTruthy();
    expect(
      screen.getByRole('button', { name: t('arrow.select', { name: 'Porta' }) }),
    ).toBeTruthy();
  });

  it('a Árvore mostra o nome do tipo, e a trilha também', () => {
    const harness = withNoteArrow();
    render(
      <EditorContext.Provider value={harness.context}>
        <MarkingTree project={harness.project()} selection={null} onSelect={vi.fn()} />
      </EditorContext.Provider>,
    );
    const labels = [...document.querySelectorAll('.tree-label')].map(
      (l) => l.textContent,
    );
    expect(labels).toContain('Nota');
    expect(
      screen.getByRole('button', { name: t('arrow.treeItem', { name: 'Porta' }) }),
    ).toBeTruthy();
    expect(
      crumbsOf(harness.project(), { kind: 'marking', id: 'N1' }).map((c) => c.name),
    ).toEqual([t('canvas.name'), 'Nota']);
  });
});
