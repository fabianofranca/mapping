import { act, cleanup, fireEvent, screen, within } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { renameMarking } from '../../../src/model';
import { locale } from '../../../src/store/settings';
import { ProposalsWindow } from '../../../src/ui/review/ProposalsWindow';
import { sampleProject } from '../../model/fixtures';
import { richScenario } from '../../store/proposalHarness';
import { openReviewHarness, renderInEditor } from './reviewHarness';

// AC1 (#641): o aviso de conflitos novos numa linha, com a frase completa na dica e o X.

beforeEach(() => {
  locale.value = 'pt-BR';
  localStorage.clear();
});
afterEach(cleanup);

async function staleWindow() {
  const { proposal } = richScenario();
  const first = await openReviewHarness({ proposals: [proposal], copyId: 'c' });
  first.review.open('P1');
  first.review.close();
  const edited = renameMarking(sampleProject(), 'M1', 'Porta traseira');
  const h = await openReviewHarness({
    project: edited,
    proposals: [proposal],
    copyId: 'c',
  });
  act(() => {
    h.review.open('P1');
  });
  renderInEditor(h, <ProposalsWindow onHelp={() => {}} />);
  const notice = document.querySelector('.notice-box-line') as HTMLElement;
  return { h, notice };
}

describe('aviso de conflitos novos numa linha', () => {
  it('mostra o texto curto, Ver conflitos e o X; a frase completa fica na dica e para o leitor de tela', async () => {
    const { notice } = await staleWindow();
    expect(within(notice).getByText('1 conflito(s) novo(s)')).toBeTruthy();
    expect(
      within(notice).getByRole('button', { name: 'Ver os conflitos novos (1)' })
        .textContent,
    ).toBe('Ver conflitos');
    expect(within(notice).getByRole('button', { name: 'Dispensar' })).toBeTruthy();
    expect(notice.querySelector('.notice-box-text')?.textContent).toBe(
      '1 conflito(s) novo(s)',
    );
    const phrase = within(notice).getAllByText(
      /O projeto mudou desde a sua última sessão\./,
    );
    expect(phrase.some((n) => n.classList.contains('visually-hidden'))).toBe(true);
    expect(phrase.some((n) => n.getAttribute('data-tooltip') !== null)).toBe(true);
  });

  it('Ver conflitos liga Só conflitos e não fecha o aviso', async () => {
    const { h, notice } = await staleWindow();
    fireEvent.click(
      within(notice).getByRole('button', { name: 'Ver os conflitos novos (1)' }),
    );
    expect(h.review.filters.value.onlyConflicts).toBe(true);
    expect(screen.getByRole('button', { name: /^Filtros · 1/ })).toBeTruthy();
    expect(document.querySelector('.notice-box-line')).toBeTruthy();
  });

  it('o X some com o aviso e o foco vai para a lista da revisão', async () => {
    const { h, notice } = await staleWindow();
    fireEvent.click(within(notice).getByRole('button', { name: 'Dispensar' }));
    expect(document.querySelector('.notice-box-line')).toBeNull();
    expect(h.review.staleNotice.value.size).toBe(0);
    expect(document.activeElement).toBe(screen.getByRole('tree'));
  });
});
