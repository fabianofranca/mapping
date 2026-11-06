import { act, cleanup, fireEvent, screen, within } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { locale } from '../../../src/store/settings';
import { ProposalsWindow } from '../../../src/ui/review/ProposalsWindow';
import { NEW_IMAGE_PATH, richScenario } from '../../store/proposalHarness';
import { openReviewHarness, renderInEditor } from './reviewHarness';
import { revisedScenario } from './revisedFixture';

// Marca "Revisada" na janela Propostas (etapa #644, CP3): o selo na linha da mudança e no
// item, o filtro "Só revisadas" e a leitura do cabeçalho.

beforeEach(() => {
  locale.value = 'pt-BR';
  localStorage.clear();
});
afterEach(cleanup);

async function openRevised() {
  const s = revisedScenario();
  const h = await openReviewHarness({
    proposals: [s.proposal],
    files: { [NEW_IMAGE_PATH]: 'imagem' },
  });
  expect(h.review.open('P1').ok).toBe(true);
  return { h, ...s };
}

const rowOf = (key: string) =>
  document.querySelector(`[data-row="${key}"]`) as HTMLElement;

describe('selo Revisada na linha', () => {
  it('a mudança trocada e a nova levam o selo, com a dica e o nome acessível', async () => {
    const { h, changedId, addedId } = await openRevised();
    renderInEditor(h, <ProposalsWindow onHelp={() => {}} />);
    act(() => h.review.select({ level: 'change', id: changedId }));
    act(() => h.review.select({ level: 'change', id: addedId }));
    const changed = rowOf(`change:${changedId}`);
    expect(within(changed).getByText('Revisada')).toBeTruthy();
    // A dica do Tooltip e o texto para o leitor de tela.
    expect(within(changed).getAllByText(/O agente trocou esta mudança em /)).toHaveLength(
      2,
    );
    expect(changed.getAttribute('aria-label')).toBe('Nome, Revisada');
    const added = rowOf(`change:${addedId}`);
    expect(within(added).getByText('Nova na revisão')).toBeTruthy();
    expect(
      within(added).getAllByText(/O agente acrescentou esta mudança em /),
    ).toHaveLength(2);
    expect(added.getAttribute('aria-label')).toMatch(/, Nova na revisão$/);
    // Uma mudança que a revisão não tocou não leva o selo.
    const other = [
      ...document.querySelectorAll<HTMLElement>('[data-row^="change:"]'),
    ].find(
      (el) =>
        ![`change:${changedId}`, `change:${addedId}`].includes(el.dataset.row ?? ''),
    );
    if (!other) throw new Error('sem outra mudança na lista');
    expect(within(other).queryByText('Revisada')).toBeNull();
  });

  it('o item que contém a mudança revisada leva o selo; decidir a mudança tira a marca', async () => {
    const { h, changedId, addedId } = await openRevised();
    renderInEditor(h, <ProposalsWindow onHelp={() => {}} />);
    act(() => h.review.select({ level: 'change', id: changedId }));
    const item = rowOf('item:M1');
    expect(within(item).getByText('Revisada')).toBeTruthy();
    // O agente deixou a hint para o leitor de tela dentro do próprio selo.
    expect(
      within(item).getAllByText(
        'O agente revisou esta mudança. Confira antes de decidir.',
      ),
    ).toHaveLength(2);
    let result: unknown;
    await act(async () => {
      result = await h.review.decide({ level: 'change', id: changedId }, 'accepted');
    });
    expect(result).toMatchObject({ ok: true });
    expect([...h.review.derived.revisedIds.value]).toEqual([addedId]);
    // A nova na revisão ainda está no item; decidida também, o selo sai.
    expect(within(rowOf('item:M1')).queryByText('Revisada')).toBeTruthy();
    await act(async () => {
      await h.review.decide({ level: 'change', id: addedId }, 'accepted');
    });
    expect(within(rowOf('item:M1')).queryByText('Revisada')).toBeNull();
    expect(within(rowOf(`change:${changedId}`)).queryByText('Revisada')).toBeNull();
  });
});

describe('filtro Só revisadas', () => {
  const trigger = () => screen.getByRole('button', { name: /^Filtros/ });

  it('aparece ao lado de Só conflitos com a contagem e liga o filtro', async () => {
    const { h, changedId, addedId } = await openRevised();
    renderInEditor(h, <ProposalsWindow onHelp={() => {}} />);
    fireEvent.click(trigger());
    const box = screen.getByRole('checkbox', { name: 'Só revisadas (2)' });
    fireEvent.click(box);
    expect(h.review.filters.value.onlyRevised).toBe(true);
    expect(h.review.derived.visibleIds.value).toEqual([changedId, addedId]);
    expect(trigger().textContent).toBe('Filtros · 1');
  });

  it('sem mudança revisada e com o filtro desligado, a opção não existe', async () => {
    const s = revisedScenario();
    const h = await openReviewHarness({ proposals: [richScenario().proposal] });
    h.review.open('P1');
    renderInEditor(h, <ProposalsWindow onHelp={() => {}} />);
    fireEvent.click(trigger());
    expect(screen.queryByRole('checkbox', { name: /^Só revisadas/ })).toBeNull();
    expect(s.proposal.revisions).toHaveLength(1);
  });

  it('com o filtro ligado e nenhuma revisada, a opção continua para poder desligar', async () => {
    const { h, changedId } = await openRevised();
    renderInEditor(h, <ProposalsWindow onHelp={() => {}} />);
    act(() => h.review.setFilters({ onlyRevised: true }));
    await act(async () => {
      await h.review.decide({ level: 'change', id: changedId }, 'accepted');
    });
    await act(async () => {
      const added = h.review.derived.revisedIds.value;
      for (const id of added) await h.review.decide({ level: 'change', id }, 'accepted');
    });
    expect(h.review.derived.counts.value.revised).toBe(0);
    fireEvent.click(trigger());
    const box = screen.getByRole('checkbox', { name: 'Só revisadas (0)' });
    fireEvent.click(box);
    expect(h.review.filters.value.onlyRevised).toBe(false);
  });
});
