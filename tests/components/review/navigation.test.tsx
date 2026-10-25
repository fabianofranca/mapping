import {
  act,
  cleanup,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addAnnotation, updateEntry, type Project } from '../../../src/model';
import { locale } from '../../../src/store/settings';
import { ReviewLevels } from '../../../src/ui/review/ReviewLevels';
import { sampleProject } from '../../model/fixtures';
import { changeOf, propose } from '../../model/proposalFixtures';
import { richScenario } from '../../store/proposalHarness';
import { PanelWithShortcuts, openReviewHarness, renderInEditor } from './reviewHarness';

// Navegação a partir da janela Propostas (fase 9.6, HANDOFF-REVIEW-DETAILS 6): a mudança
// selecionada abre a seção, a camada e a anotação que a escondem, rola até o campo e o
// destaca (`aria-current`); clique ou Enter na linha levam o foco ao marcador e abrem o
// popover; as setas só rolam e destacam, o foco fica na lista.

const scrollIntoView = vi.fn();

beforeEach(() => {
  locale.value = 'pt-BR';
  localStorage.clear();
  scrollIntoView.mockClear();
  Object.defineProperty(Element.prototype, 'scrollIntoView', {
    configurable: true,
    value: scrollIntoView,
  });
});
afterEach(() => {
  cleanup();
  Reflect.deleteProperty(Element.prototype, 'scrollIntoView');
});

/** M1 com o par E3 da anotação A2 (camada Vidros) alterado. */
function pairScenario(): { base: Project; after: Project } {
  const base = sampleProject();
  return { base, after: updateEntry(base, 'A2', 'E3', { key: 'tipo', value: 'quebra' }) };
}

describe('navegação até a mudança selecionada', () => {
  it('abre a seção, a camada e a anotação recolhidas, rola até o campo e o destaca', async () => {
    const { base, after } = pairScenario();
    const proposal = propose(base, after);
    const h = await openReviewHarness({ project: base, proposals: [proposal] });
    expect(h.review.open('P1').ok).toBe(true);
    act(() => h.review.select({ level: 'item', id: 'M1' }));
    renderInEditor(h, <PanelHost />);
    // A pessoa recolheu tudo depois de chegar ao item.
    act(() => {
      h.ui.collapsed.value = new Set(['annotations', 'layer:L2', 'annotation:A2']);
    });
    expect(screen.queryByRole('button', { name: /^tipo · / })).toBeNull();

    const change = proposal.changes[0];
    if (!change) throw new Error('fixture');
    act(() => h.review.select({ level: 'change', id: change.id }));
    const entry = await screen.findByRole('button', { name: /^tipo · .*: alterado/ });
    expect(h.ui.collapsed.value.has('annotations')).toBe(false);
    expect(h.ui.collapsed.value.has('layer:L2')).toBe(false);
    expect(h.ui.collapsed.value.has('annotation:A2')).toBe(false);
    expect(entry.getAttribute('aria-current')).toBe('true');
    expect(scrollIntoView).toHaveBeenCalled();
    // Selecionar não move o foco nem abre o popover (só o clique e o Enter).
    expect(document.activeElement).not.toBe(entry);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('o resumo da linha da mudança leva o texto inteiro no title', async () => {
    const { base, after } = pairScenario();
    const proposal = propose(base, after);
    const h = await openReviewHarness({ project: base, proposals: [proposal] });
    expect(h.review.open('P1').ok).toBe(true);
    act(() => h.review.select({ level: 'item', id: 'M1' }));
    renderInEditor(h, <PanelHost />);
    const change = proposal.changes[0];
    if (!change) throw new Error('fixture');
    const row = document.querySelector(`[data-row="change:${change.id}"]`) as HTMLElement;
    const text = row.querySelector('.review-row-text') as HTMLElement;
    expect(text.textContent).not.toBe('');
    expect(text.getAttribute('title')).toBe(text.textContent);
  });

  it('a coluna da marca da grade Chave/Valor segue o idioma', async () => {
    const { base, after } = pairScenario();
    const proposal = propose(base, after);
    const h = await openReviewHarness({ project: base, proposals: [proposal] });
    expect(h.review.open('P1').ok).toBe(true);
    act(() => h.review.select({ level: 'item', id: 'M1' }));
    renderInEditor(h, <PanelHost />);
    const heads = () =>
      [...document.querySelectorAll('[role="columnheader"].visually-hidden')].map(
        (e) => e.textContent,
      );
    expect(heads()).toContain('Mudança');
    act(() => {
      locale.value = 'en-US';
    });
    await waitFor(() => expect(heads()).toContain('Change'));
    expect(heads()).not.toContain('Mudança');
  });

  it('o clique ou Enter na lista leva o foco ao marcador e abre o popover', async () => {
    const { base, after } = pairScenario();
    const proposal = propose(base, after);
    const h = await openReviewHarness({ project: base, proposals: [proposal] });
    expect(h.review.open('P1').ok).toBe(true);
    act(() => h.review.select({ level: 'item', id: 'M1' }));
    renderInEditor(h, <PanelHost />);
    const change = proposal.changes[0];
    if (!change) throw new Error('fixture');

    // A linha da mudança na lista (clique).
    const row = document.querySelector(`[data-row="change:${change.id}"]`) as HTMLElement;
    fireEvent.click(row);
    const entry = await screen.findByRole('button', { name: /^tipo · .*: alterado/ });
    await waitFor(() => expect(document.activeElement).toBe(entry));
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(h.review.markRequest.value).toBeNull();
    expect(h.review.selected.value).toEqual({ level: 'change', id: change.id });
  });

  it('pelas setas só rola e destaca: o foco fica na lista', async () => {
    const { proposal } = richScenario();
    const h = await openReviewHarness({ proposals: [proposal] });
    expect(h.review.open('P1').ok).toBe(true);
    act(() => h.review.select({ level: 'proposal', id: null }));
    renderInEditor(h, <PanelHost />);
    const user = userEvent.setup();
    const tree = screen.getByRole('tree', { name: 'Níveis da proposta' });
    tree.focus();
    // Desce até a mudança do nome de M1 (a primeira mudança com campo no painel).
    const name = changeOf(proposal, 'marking', 'M1', 'name');
    for (let i = 0; i < 20 && h.review.selected.value?.id !== name.id; i++) {
      await user.keyboard('{ArrowDown}');
    }
    expect(h.review.selected.value).toEqual({ level: 'change', id: name.id });
    const nameMark = await screen.findByRole('button', { name: /^Nome: alterado/ });
    expect(nameMark.getAttribute('aria-current')).toBe('true');
    expect(document.activeElement).toBe(tree);
    expect(screen.queryByRole('dialog')).toBeNull();
    // Enter na mudança selecionada leva o foco ao marcador e abre o popover.
    await user.keyboard('{Enter}');
    await waitFor(() => expect(document.activeElement).toBe(nameMark));
    expect(screen.getByRole('dialog', { name: 'Nome · alterado' })).toBeTruthy();
  });

  it('item grande: abre a camada recolhida e o que passa do "Mostrar mais"', async () => {
    const base = sampleProject();
    let after = base;
    for (let i = 1; i <= 15; i++) {
      after = addAnnotation(after, {
        id: `N${i}`,
        markingId: 'M4',
        layerId: 'L1',
        name: `n${i}`,
      });
    }
    const proposal = propose(base, after);
    const h = await openReviewHarness({ project: base, proposals: [proposal] });
    expect(h.review.open('P1').ok).toBe(true);
    act(() => h.review.select({ level: 'item', id: 'M4' }));
    renderInEditor(h, <PanelHost />);
    // Camada recolhida e só os 12 primeiros cabeçalhos.
    expect(h.ui.collapsed.value.has('layer:L1')).toBe(true);
    act(() => {
      h.ui.collapsed.value = new Set(
        [...h.ui.collapsed.value].filter((k) => k !== 'layer:L1'),
      );
    });
    expect(document.querySelectorAll('[data-layer="L1"] [data-annotation]')).toHaveLength(
      12,
    );
    expect(
      screen.getByRole('button', { name: 'Mostrar mais 3 anotação(ões)' }),
    ).toBeTruthy();

    // A 15ª (além do limite) abre sozinha ao ser selecionada.
    const last = changeOf(proposal, 'annotation', 'N15');
    act(() => h.review.select({ level: 'change', id: last.id }));
    await waitFor(() =>
      expect(document.querySelector('[data-annotation="N15"]')).not.toBeNull(),
    );
    expect(h.ui.collapsed.value.has('annotation:N15')).toBe(false);
    const card = document.querySelector('[data-annotation="N15"]') as HTMLElement;
    expect(
      within(card).getByRole('button', { name: /^Anotação n15 criada: novo/ }),
    ).toBeTruthy();
  });

  it('N e C andam pelas pendentes e abrem o que as esconde', async () => {
    const { base, after } = pairScenario();
    const proposal = propose(base, after);
    const h = await openReviewHarness({ project: base, proposals: [proposal] });
    expect(h.review.open('P1').ok).toBe(true);
    act(() => h.review.select({ level: 'item', id: 'M1' }));
    renderInEditor(h, <PanelHost />);
    act(() => {
      h.ui.collapsed.value = new Set(['annotations', 'layer:L2', 'annotation:A2']);
    });
    const user = userEvent.setup();
    await user.keyboard('n');
    const change = proposal.changes[0];
    expect(h.review.selected.value).toEqual({ level: 'change', id: change?.id });
    const entry = await screen.findByRole('button', { name: /^tipo · .*: alterado/ });
    expect(entry.getAttribute('aria-current')).toBe('true');
    expect(h.ui.collapsed.value.has('layer:L2')).toBe(false);
  });
});

/** A janela Propostas (níveis) e os Detalhes, lado a lado. */
function PanelHost() {
  return (
    <>
      <ReviewLevels />
      <PanelWithShortcuts />
    </>
  );
}
