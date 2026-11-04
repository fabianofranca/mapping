import {
  act,
  cleanup,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { locale } from '../../../src/store/settings';
import { ReviewUndoNotice } from '../../../src/ui/review/ProposalNotices';
import { changeOf } from '../../model/proposalFixtures';
import {
  PanelWithShortcuts,
  firstImport,
  openReviewHarness,
  renderInEditor,
} from './reviewHarness';

// R4.5 do docs/TESTING.md (etapa #405, decisão 4): rejeitar a criação de uma marcação, com a
// marcação selecionada, leva a anotação dependente junto. A app mostra DOIS avisos diferentes
// (o do canto do canvas e o do cabeçalho de Detalhes) e a marca "junto" do cartão é só ícone,
// com "decidido junto" no nome acessível; o selo com texto fica na lista da revisão.

beforeEach(() => {
  locale.value = 'pt-BR';
  localStorage.clear();
});
afterEach(cleanup);

describe('R4.5: rejeitar a criação com uma anotação dependente', () => {
  it('mostra o aviso do canto, o do cabeçalho com Desfazer e a marca "junto" do cartão', async () => {
    const { base, proposal } = firstImport();
    const h = await openReviewHarness({ project: base, proposals: [proposal] });
    expect(h.review.open('P1').ok).toBe(true);
    act(() => h.review.select({ level: 'item', id: 'M1' }));
    renderInEditor(
      h,
      <>
        <PanelWithShortcuts />
        <div data-testid="corner">
          <ReviewUndoNotice />
        </div>
      </>,
    );
    const marking = changeOf(proposal, 'marking', 'M1');
    await act(async () => {
      await h.review.decide({ level: 'change', id: marking.id }, 'rejected');
    });

    // Aviso do canto do canvas: `review.undo.rejected` + `review.undo.cascaded`.
    const corner = within(screen.getByTestId('corner'));
    expect(
      corner.getByText(
        /mudança\(s\) rejeitada\(s\)\..*mudou\(aram\) junto, pelas dependências\./,
      ),
    ).toBeTruthy();

    // Aviso do cabeçalho de Detalhes: `review.panel.together.rejected`, com o nome e Desfazer.
    const headerNotice = screen.getByText(/^1 mudança\(s\) rejeitada\(s\) junto: /);
    expect(headerNotice.textContent).toContain('Anotação onClick criada');
    expect(
      within(headerNotice.closest('.notice-box') as HTMLElement).getByRole('button', {
        name: 'Desfazer',
      }),
    ).toBeTruthy();

    // Cartão da anotação: a marca é só ícone; "decidido junto" fica no nome acessível.
    const mark = screen.getByRole('button', {
      name: /^Anotação onClick criada: novo, rejeitado, decidido junto/,
    });
    expect(mark.textContent?.trim()).toBe('');

    fireEvent.click(
      within(headerNotice.closest('.notice-box') as HTMLElement).getByRole('button', {
        name: 'Desfazer',
      }),
    );
    await waitFor(() => expect(screen.queryByText(/rejeitada\(s\) junto/)).toBeNull());
  });
});
