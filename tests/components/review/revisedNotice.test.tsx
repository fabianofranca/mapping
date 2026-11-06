import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { locale } from '../../../src/store/settings';
import { ProposalNotices } from '../../../src/ui/review/ProposalNotices';
import { ReviewDetails } from '../../../src/ui/review/ReviewDetails';
import { richScenario, writeOutside } from '../../store/proposalHarness';
import { openReviewHarness, renderInEditor } from './reviewHarness';
import { revisedScenario } from './revisedFixture';

// Aviso de revisão nova e recusa por revisão (etapa #644, CP3): "O agente revisou <título>:
// …" com Revisar, e a mensagem da recusa `revised` ao decidir sobre a versão antiga.

beforeEach(() => {
  locale.value = 'pt-BR';
  localStorage.clear();
});
afterEach(cleanup);

/** A app leu a proposta; o agente a revisa por fora e a app percebe. */
async function revisedOutside() {
  const { proposal } = richScenario();
  const s = revisedScenario();
  const h = await openReviewHarness({ proposals: [{ ...proposal, title: 'Checkout' }] });
  writeOutside(h.root, s.proposal);
  return { h, ...s };
}

describe('aviso de revisão nova', () => {
  it('mostra o texto com as contagens (sem as zeradas) e o botão Revisar que abre a revisão', async () => {
    const { h } = await revisedOutside();
    renderInEditor(h, <ProposalNotices />);
    await act(async () => {
      await h.session.proposals.scan();
    });
    expect(
      screen.getByText('O agente revisou Checkout: 1 trocada(s), 1 nova(s).'),
    ).toBeTruthy();
    fireEvent.click(
      screen.getByRole('button', { name: 'Revisar Checkout, revisada pelo agente' }),
    );
    expect(h.review.proposalId.value).toBe('P1');
    expect(h.session.proposals.notices.value).toEqual([]);
  });

  it('com a revisão dela aberta, o botão não aparece', async () => {
    const { h } = await revisedOutside();
    h.review.open('P1');
    renderInEditor(h, <ProposalNotices />);
    await act(async () => {
      await h.session.proposals.scan();
    });
    expect(screen.getByText(/^O agente revisou Checkout:/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Revisar Checkout/ })).toBeNull();
  });

  it('outro tipo de aviso continua sem o botão Revisar', async () => {
    const { proposal } = richScenario();
    const h = await openReviewHarness({
      proposals: [{ ...proposal, title: 'Checkout' }],
    });
    writeOutside(h.root, {
      ...proposal,
      title: 'Outro',
      revision: proposal.revision + 1,
    });
    renderInEditor(h, <ProposalNotices />);
    await act(async () => {
      await h.session.proposals.scan();
    });
    expect(screen.getByText('Proposta alterada fora da app: Outro')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /revisada pelo agente/ })).toBeNull();
  });
});

describe('recusa por revisão', () => {
  it('Aceitar tudo sobre a versão antiga mostra "O agente revisou esta proposta enquanto você olhava"', async () => {
    const { h } = await revisedOutside();
    h.review.open('P1');
    act(() => h.review.select({ level: 'proposal', id: null }));
    renderInEditor(h, <ReviewDetails />);
    fireEvent.click(screen.getByRole('button', { name: /^Aceitar tudo/ }));
    await waitFor(() =>
      expect(h.ui.toast.value).toBe(
        'O agente revisou esta proposta enquanto você olhava. Confira antes de decidir.',
      ),
    );
  });
});
