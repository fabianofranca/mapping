import { cleanup, fireEvent, screen, within } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Proposal } from '../../../src/model';
import { locale } from '../../../src/store/settings';
import { decided, propose } from '../../model/proposalFixtures';
import { richScenario } from '../../store/proposalHarness';
import { showReviewPanel } from './reviewHarness';

// Proposta fechada e substituída (fase 9.6, HANDOFF-REVIEW-DETAILS 5.7): a aplicada é só
// para ver (decisões desabilitadas com o motivo, popover sem botões); a substituída mostra
// "Abrir a nova", os selos igual / diferente / não consta e não deixa decidir o que ficou
// sem decisão.

beforeEach(() => {
  locale.value = 'pt-BR';
  localStorage.clear();
});
afterEach(cleanup);

/** A richScenario inteira aceita e aplicada. */
function appliedScenario() {
  const { base, proposal } = richScenario();
  const accepted = decided(proposal, base, { level: 'proposal', id: null }, 'accepted');
  return {
    ...accepted,
    status: 'applied' as const,
    applied: Object.fromEntries(
      proposal.changes.map((c) => [c.id, { at: '2026-10-10T10:00:00.000Z' }]),
    ),
  } satisfies Proposal;
}

describe('proposta aplicada', () => {
  it('só para ver: o aviso, as decisões desabilitadas com o motivo e o popover sem botões', async () => {
    await showReviewPanel(
      { proposals: [appliedScenario()] },
      { level: 'item', id: 'M1' },
    );
    expect(screen.getByText(/^Proposta aplicada em .*Só para ver/)).toBeTruthy();

    const header = screen.getByRole('region', { name: 'Decisão' });
    const accept = within(header).getByRole('button', { name: /^Aceita: Porta$/ });
    expect((accept as HTMLButtonElement).disabled).toBe(true);
    const reason = document.getElementById(accept.getAttribute('aria-describedby') ?? '');
    expect(reason?.textContent).toBe('Esta proposta não recebe mais decisões');

    // O popover mostra a decisão e as datas, sem os botões; o marcador continua focável.
    const mark = screen.getByRole('button', {
      name: /^Nome: alterado, aceito, aplicado\./,
    });
    fireEvent.click(mark);
    const pop = screen.getByRole('dialog');
    expect(within(pop).getByText('Decisão: Aceita')).toBeTruthy();
    expect(within(pop).getByText(/^Aceita em .* e aplicada em /)).toBeTruthy();
    expect(within(pop).queryByRole('button', { name: /^Aceit/ })).toBeNull();
    expect(within(pop).queryByRole('button', { name: /^Rejeit/ })).toBeNull();
    expect(within(pop).getByText('Aplicada')).toBeTruthy();
  });
});

describe('proposta substituída', () => {
  async function superseded() {
    const { base, after } = richScenario();
    const old: Proposal = { ...propose(base, after, { id: 'P1' }), status: 'superseded' };
    const next = propose(base, after, {
      id: 'P2',
      title: 'Checkout v2',
      supersedes: 'P1',
    });
    const h = await showReviewPanel(
      { proposals: [old, next] },
      { level: 'item', id: 'M1' },
    );
    return { h, old, next };
  }

  it('avisa, oferece "Abrir a nova" e mostra o selo igual na nova embaixo do campo', async () => {
    const { h } = await superseded();
    expect(screen.getByText('Esta proposta foi substituída por outra.')).toBeTruthy();
    const open = screen.getByRole('button', { name: 'Abrir a nova: Checkout v2' });
    // O selo embaixo do controle do campo: a nova traz a mesma mudança.
    const below = document.querySelector('.change-below') as HTMLElement;
    expect(within(below).getByText('igual na nova')).toBeTruthy();
    fireEvent.click(open);
    expect(h.review.proposalId.value).toBe('P2');
  });

  it('o que ficou sem decisão não pode ser decidido aqui: botões desabilitados com o motivo', async () => {
    await superseded();
    fireEvent.click(screen.getByRole('button', { name: /^Nome: alterado, pendente/ }));
    const pop = screen.getByRole('dialog');
    const accept = within(pop).getByRole('button', { name: 'Aceitar Nome' });
    expect((accept as HTMLButtonElement).disabled).toBe(true);
    const reason = document.getElementById(accept.getAttribute('aria-describedby') ?? '');
    expect(reason?.textContent).toBe(
      'Sem decisão numa proposta substituída: decida na nova.',
    );
    expect(within(pop).getByText('igual na nova')).toBeTruthy();
  });
});
