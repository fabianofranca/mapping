import { act, cleanup, screen, within } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { locale } from '../../../src/store/settings';
import { ProposalList } from '../../../src/ui/review/ProposalList';
import { richScenario } from '../../store/proposalHarness';
import { openReviewHarness, renderInEditor } from './reviewHarness';
import { revisedScenario } from './revisedFixture';

// Linha da janela Propostas com marca à vista (etapa #644, CP3): "Revisada · N para conferir".

beforeEach(() => {
  locale.value = 'pt-BR';
  localStorage.clear();
});
afterEach(cleanup);

const noop = () => {};

describe('linha da proposta revisada', () => {
  it('diz "Revisada · 2 para conferir" e mantém Revisar; `fresh` não muda', async () => {
    const { proposal } = revisedScenario();
    const h = await openReviewHarness({ proposals: [proposal] });
    renderInEditor(h, <ProposalList onHelp={noop} onScan={noop} />);
    const row = screen.getByRole('listitem');
    expect(within(row).getByText('Revisada · 2 para conferir')).toBeTruthy();
    expect(within(row).getByRole('button', { name: 'Revisar: Checkout' })).toBeTruthy();
    expect(h.review.derived.rows.value[0]?.revised).toBe(2);
    // Chegou revisada e ninguém abriu: continua "Nova" e na contagem da barra.
    expect(h.review.derived.rows.value[0]?.fresh).toBe(true);
    expect(within(row).getByText('Nova')).toBeTruthy();
  });

  it('decidir uma mudança revisada baixa a contagem; todas decididas, a linha some', async () => {
    const { proposal, changedId, addedId } = revisedScenario();
    const h = await openReviewHarness({ proposals: [proposal] });
    h.review.open('P1');
    renderInEditor(h, <ProposalList onHelp={noop} onScan={noop} />);
    await act(async () => {
      await h.review.decide({ level: 'change', id: changedId }, 'accepted');
    });
    expect(screen.getByText('Revisada · 1 para conferir')).toBeTruthy();
    await act(async () => {
      await h.review.decide({ level: 'change', id: addedId }, 'rejected');
    });
    expect(screen.queryByText(/^Revisada ·/)).toBeNull();
  });

  it('proposta sem revisão não leva o texto', async () => {
    const { proposal } = richScenario();
    const h = await openReviewHarness({ proposals: [proposal] });
    renderInEditor(h, <ProposalList onHelp={noop} onScan={noop} />);
    expect(screen.queryByText(/^Revisada ·/)).toBeNull();
    expect(h.review.derived.rows.value[0]?.revised).toBe(0);
  });
});
