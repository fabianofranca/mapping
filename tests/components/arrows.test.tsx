import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EditorDialogs } from '../../src/app/EditorDialogs';
import { useEditorDialogs } from '../../src/app/useEditorDialogs';
import { t } from '../../src/i18n';
import type { Arrow, Marking, Project } from '../../src/model';
import { locale, setShowArrows, showArrows, theme } from '../../src/store/settings';
import { showToolWindow } from '../../src/store/toolWindows';
import { selectItems, selectedItems } from '../../src/store/ui';
import { ArrowPanel } from '../../src/ui/ArrowPanel';
import { crumbsOf } from '../../src/ui/Breadcrumbs';
import { EditorContext } from '../../src/ui/EditorContext';
import { MarkingPanel } from '../../src/ui/MarkingPanel';
import { MarkingTree } from '../../src/ui/MarkingTree';
import { MultiSelectionPanel } from '../../src/ui/MultiSelectionPanel';
import { SettingsBar } from '../../src/ui/SettingsBar';
import { sampleProject } from '../model/fixtures';
import { createHarness, renderLive, type Harness } from './harness';

// Setas na interface (ME4, decisão 14): Detalhes da seta, "Ligar a…", Árvore, exclusão com a
// contagem de setas, seleção múltipla, trilha e o interruptor "Mostrar setas".

beforeEach(() => {
  locale.value = 'pt-BR';
  showToolWindow('tree');
});
afterEach(() => {
  cleanup();
  theme.value = 'system';
});

/** A amostra com uma seta A1 de M1 (Porta) para M4, com uma anotação dela. */
function withArrow(): Harness {
  const harness = createHarness(sampleProject());
  const result = harness.actions.addArrow('M1', 'M4');
  if (!result.ok) throw new Error('addArrow falhou');
  return harness;
}

const arrowOf = (p: Project): Arrow => {
  const arrow = p.arrows[0];
  if (!arrow) throw new Error('sem seta');
  return arrow;
};

function renderArrowPanel(harness: Harness) {
  renderLive(harness, (p) => (
    <ArrowPanel
      project={p}
      arrow={arrowOf(p)}
      readOnly={false}
      onDelete={vi.fn()}
      onGoToAnnotation={vi.fn()}
    />
  ));
  return userEvent.setup();
}

describe('Detalhes da seta', () => {
  it('mostra nome, origem, destino, estilo e a trava', () => {
    const harness = withArrow();
    renderArrowPanel(harness);
    expect(screen.getByLabelText(t('arrow.name'))).toBeTruthy();
    expect(
      screen.getByRole('button', { name: t('arrow.select', { name: 'Porta' }) }),
    ).toBeTruthy();
    expect(
      screen.getByRole('button', {
        name: t('arrow.select', { name: t('marking.unnamed') }),
      }),
    ).toBeTruthy();
    const curve = screen.getByRole('button', { name: t('arrow.style.curve') });
    expect(curve.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: t('arrow.lock') })).toBeTruthy();
  });

  it('o nome é editável e vira o rótulo', async () => {
    const harness = withArrow();
    const user = renderArrowPanel(harness);
    const field = screen.getByLabelText(t('arrow.name'));
    await user.type(field, 'Abre a tela{Enter}');
    expect(arrowOf(harness.project()).name).toBe('Abre a tela');
  });

  it('origem e destino selecionam a marcação', async () => {
    const harness = withArrow();
    const user = renderArrowPanel(harness);
    await user.click(
      screen.getByRole('button', { name: t('arrow.select', { name: 'Porta' }) }),
    );
    expect(harness.ui.selection.value).toEqual({ kind: 'marking', id: 'M1' });
  });

  it('troca o estilo em uma entrada de desfazer', async () => {
    const harness = withArrow();
    const user = renderArrowPanel(harness);
    await user.click(screen.getByRole('button', { name: t('arrow.style.elbow') }));
    expect(arrowOf(harness.project()).style).toBe('elbow');
    harness.store.undo();
    expect(arrowOf(harness.project()).style).toBe('curve');
  });

  it('trancada, o estilo e a exclusão ficam desabilitados, mas o nome segue livre', async () => {
    const harness = withArrow();
    const user = renderArrowPanel(harness);
    await user.click(screen.getByRole('button', { name: t('arrow.lock') }));
    expect(arrowOf(harness.project()).locked).toBe(true);
    expect(
      screen.getByRole<HTMLButtonElement>('button', { name: t('arrow.style.straight') })
        .disabled,
    ).toBe(true);
    expect(
      screen.getByRole<HTMLButtonElement>('button', { name: t('arrow.delete') }).disabled,
    ).toBe(true);
    expect(screen.getByLabelText<HTMLInputElement>(t('arrow.name')).disabled).toBe(false);
  });

  it('Excluir chama o pedido de exclusão com a seta', async () => {
    const harness = withArrow();
    const onDelete = vi.fn();
    renderLive(harness, (p) => (
      <ArrowPanel
        project={p}
        arrow={arrowOf(p)}
        readOnly={false}
        onDelete={onDelete}
        onGoToAnnotation={vi.fn()}
      />
    ));
    await userEvent.click(screen.getByRole('button', { name: t('arrow.delete') }));
    expect(onDelete).toHaveBeenCalledWith(arrowOf(harness.project()));
  });

  it('as anotações por camada são as de sempre, com a seta como dona', async () => {
    const harness = withArrow();
    const user = renderArrowPanel(harness);
    const arrow = arrowOf(harness.project());
    const add = screen.getAllByRole('button', {
      name: (name) => name.startsWith(t('annotation.addIn', { layer: '' }).trim()),
    })[0];
    if (!add) throw new Error('sem botão de anotação');
    await user.click(add);
    const created = harness.project().annotations.filter((a) => a.markingId === arrow.id);
    expect(created).toHaveLength(1);
  });
});

describe('Ligar a…', () => {
  function renderMarking(harness: Harness, id: string) {
    renderLive(harness, (p) => {
      const marking = p.markings.find((m) => m.id === id) as Marking;
      const image = p.containers.find((c) => c.id === marking.containerId) ?? null;
      return (
        <MarkingPanel
          project={p}
          marking={marking}
          image={image}
          readOnly={false}
          onDelete={vi.fn()}
          onGoToAnnotation={vi.fn()}
        />
      );
    });
    return userEvent.setup();
  }

  it('o seletor lista marcações sem a própria; escolher cria a seta e a seleciona', async () => {
    const harness = createHarness(sampleProject());
    const user = renderMarking(harness, 'M1');
    await user.click(screen.getByRole('button', { name: t('arrow.linkTo') }));
    const list = await screen.findByRole('listbox', { hidden: true });
    const options = within(list).getAllByRole('option', { hidden: true });
    expect(options).toHaveLength(3);
    expect(options.map((o) => o.textContent).join('|')).not.toMatch(/^Porta/);
    const input = screen.getByRole('combobox', {
      name: t('arrow.pickerSearch'),
      hidden: true,
    });
    await user.type(input, 'Maçaneta');
    await user.keyboard('{Enter}');
    const arrow = arrowOf(harness.project());
    expect(arrow).toMatchObject({ from: 'M1', to: 'M2' });
    expect(harness.ui.selection.value).toEqual({ kind: 'arrow', id: arrow.id });
  });

  it('desabilitado somente leitura', () => {
    const harness = createHarness(sampleProject(), true);
    renderLive(harness, (p) => (
      <MarkingPanel
        project={p}
        marking={p.markings[0] as Marking}
        image={p.containers[0] ?? null}
        readOnly
        onDelete={vi.fn()}
        onGoToAnnotation={vi.fn()}
      />
    ));
    expect(
      screen.getByRole<HTMLButtonElement>('button', { name: t('arrow.linkTo') }).disabled,
    ).toBe(true);
  });
});

describe('Árvore com setas', () => {
  function renderTree(harness: Harness, onSelect = vi.fn()) {
    render(
      <EditorContext.Provider value={harness.context}>
        <MarkingTree
          project={harness.project()}
          selection={harness.ui.selection.value}
          onSelect={onSelect}
        />
      </EditorContext.Provider>,
    );
    return onSelect;
  }

  it('a seta aparece sob a origem como "→ destino"; clicar a seleciona', async () => {
    const harness = withArrow();
    const onSelect = renderTree(harness);
    const row = screen.getByRole('button', {
      name: t('arrow.treeItem', { name: t('marking.unnamed') }),
    });
    expect(row.textContent).toContain(`→ ${t('marking.unnamed')}`);
    // Sob a Porta (M1): dentro da lista que a segue.
    expect(row.closest('li')?.parentElement?.closest('li')?.textContent).toContain(
      'Porta',
    );
    await userEvent.click(row);
    expect(onSelect).toHaveBeenCalledWith({
      kind: 'arrow',
      id: arrowOf(harness.project()).id,
    });
  });

  it('o nome da seta substitui o destino', () => {
    const harness = withArrow();
    harness.actions.setArrowName(arrowOf(harness.project()).id, 'Abre');
    renderTree(harness);
    expect(screen.getByText('Abre')).toBeTruthy();
  });

  it('Shift+clique alterna a seta na seleção múltipla', async () => {
    const harness = withArrow();
    const arrowId = arrowOf(harness.project()).id;
    harness.ui.selection.value = { kind: 'marking', id: 'M1' };
    renderTree(harness);
    fireEvent.click(
      screen.getByRole('button', {
        name: t('arrow.treeItem', { name: t('marking.unnamed') }),
      }),
      { shiftKey: true },
    );
    expect(selectedItems(harness.ui)).toEqual([
      { kind: 'marking', id: 'M1' },
      { kind: 'arrow', id: arrowId },
    ]);
  });

  it('o cadeado da linha tranca a seta', async () => {
    const harness = withArrow();
    renderTree(harness);
    await userEvent.click(
      screen.getByRole('button', {
        name: t('lock.treeLock', {
          name: t('arrow.treeItem', { name: t('marking.unnamed') }),
        }),
      }),
    );
    expect(arrowOf(harness.project()).locked).toBe(true);
  });
});

describe('exclusão com setas', () => {
  function Probe({
    run,
  }: {
    readonly run: (d: ReturnType<typeof useEditorDialogs>) => void;
  }) {
    const dialogs = useEditorDialogs();
    return (
      <>
        <button type="button" onClick={() => run(dialogs)}>
          ir
        </button>
        <EditorDialogs dialogs={dialogs} />
      </>
    );
  }
  const dialog = () => document.querySelector('dialog') as HTMLElement;

  it('excluir uma marcação sem filhas nem anotações, mas com seta, pede confirmação com a contagem', async () => {
    const harness = createHarness(sampleProject());
    harness.actions.addArrow('M3', 'M4');
    const user = userEvent.setup();
    render(
      <EditorContext.Provider value={harness.context}>
        <Probe
          run={(d) =>
            d.requestDeleteMarking(
              harness.project().markings.find((m) => m.id === 'M3') as Marking,
            )
          }
        />
      </EditorContext.Provider>,
    );
    await user.click(screen.getByRole('button', { name: 'ir' }));
    expect(dialog().textContent).toContain(t('marking.deleteArrows', { arrows: 1 }));
    await user.click(
      within(dialog()).getByRole('button', { name: t('common.delete'), hidden: true }),
    );
    expect(harness.project().arrows).toHaveLength(0);
  });

  it('a confirmação da seção mostra as anotações que saem com a seta', async () => {
    const harness = withArrow();
    const arrow = arrowOf(harness.project());
    harness.actions.addAnnotation(arrow.id, 'L1');
    const user = userEvent.setup();
    render(
      <EditorContext.Provider value={harness.context}>
        <Probe run={(d) => d.requestDeleteArrow(arrowOf(harness.project()))} />
      </EditorContext.Provider>,
    );
    await user.click(screen.getByRole('button', { name: 'ir' }));
    expect(dialog().textContent).toContain(
      t('arrow.deleteMessage', {
        name: 'Porta → ' + t('marking.unnamed'),
        annotations: 1,
      }),
    );
    await user.click(
      within(dialog()).getByRole('button', { name: t('common.delete'), hidden: true }),
    );
    expect(harness.project().arrows).toHaveLength(0);
    expect(harness.project().annotations.some((a) => a.markingId === arrow.id)).toBe(
      false,
    );
  });

  it('a seta sem anotação é excluída direto; a trancada não faz nada', async () => {
    const harness = withArrow();
    const user = userEvent.setup();
    render(
      <EditorContext.Provider value={harness.context}>
        <Probe run={(d) => d.requestDeleteArrow(arrowOf(harness.project()))} />
      </EditorContext.Provider>,
    );
    harness.actions.setArrowLocked(arrowOf(harness.project()).id, true);
    await user.click(screen.getByRole('button', { name: 'ir' }));
    expect(harness.project().arrows).toHaveLength(1);
    harness.actions.setArrowLocked(arrowOf(harness.project()).id, false);
    await user.click(screen.getByRole('button', { name: 'ir' }));
    expect(harness.project().arrows).toHaveLength(0);
  });

  it('a exclusão da seleção conta as setas ligadas', async () => {
    const harness = withArrow();
    const user = userEvent.setup();
    render(
      <EditorContext.Provider value={harness.context}>
        <Probe run={(d) => d.requestDeleteItems([{ kind: 'marking', id: 'M4' }])} />
      </EditorContext.Provider>,
    );
    await user.click(screen.getByRole('button', { name: 'ir' }));
    expect(dialog().textContent).toContain(t('multi.deleteArrows', { arrows: 1 }));
  });
});

describe('seleção múltipla e trilha', () => {
  it('o painel conta as setas e tranca todas', async () => {
    const harness = withArrow();
    const arrowId = arrowOf(harness.project()).id;
    const items = [
      { kind: 'marking', id: 'M1' },
      { kind: 'arrow', id: arrowId },
    ] as const;
    renderLive(harness, (p) => (
      <MultiSelectionPanel
        project={p}
        items={items}
        readOnly={false}
        onDelete={vi.fn()}
      />
    ));
    expect(screen.getByText(t('multi.arrows', { count: 1 }))).toBeTruthy();
    expect(screen.getByText(t('multi.markings', { count: 1 }))).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: t('multi.lock') }));
    expect(arrowOf(harness.project()).locked).toBe(true);
    act(() => selectItems(harness.ui, []));
  });

  it('a trilha da seta é "Canvas › Origem → Destino"', () => {
    const harness = withArrow();
    const arrow = arrowOf(harness.project());
    const crumbs = crumbsOf(harness.project(), { kind: 'arrow', id: arrow.id });
    expect(crumbs.map((c) => c.name)).toEqual([
      t('canvas.name'),
      `Porta → ${t('marking.unnamed')}`,
    ]);
    expect(crumbs[1]?.selection).toEqual({ kind: 'arrow', id: arrow.id });
  });
});

describe('Mostrar setas', () => {
  it('o interruptor liga e desliga a preferência', async () => {
    localStorage.clear();
    setShowArrows(true);
    render(<SettingsBar />);
    const box = screen.getByRole<HTMLInputElement>('checkbox', {
      name: new RegExp(t('view.arrows')),
    });
    expect(box.checked).toBe(true);
    await userEvent.click(box);
    expect(showArrows.value).toBe(false);
    expect(box.checked).toBe(false);
    await userEvent.click(box);
    expect(showArrows.value).toBe(true);
  });
});
