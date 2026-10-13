import { act, cleanup, fireEvent, screen, within } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { supersedeProposal, type Proposal } from '../../../src/model';
import { locale } from '../../../src/store/settings';
import { ProposalNotices } from '../../../src/ui/review/ProposalNotices';
import { ProposalList } from '../../../src/ui/review/ProposalList';
import { formatWhen } from '../../../src/ui/review/format';
import { StatusBar } from '../../../src/ui/StatusBar';
import { AT, decided } from '../../model/proposalFixtures';
import { diskProposal, richScenario, writeOutside } from '../../store/proposalHarness';
import { openReviewHarness, renderInEditor } from './reviewHarness';

// Janela Propostas fora da revisão (HANDOFF-PROPOSALS 5.1, passo 3 da seção 9): lista,
// estado vazio, a "Nova" que chegou, as aceitas aguardando aplicação e o aviso de
// proposta nova sobre o canvas.

beforeEach(() => {
  locale.value = 'pt-BR';
  localStorage.clear();
});
afterEach(cleanup);

const noop = () => {};

describe('janela Propostas: lista', () => {
  it('estado vazio explica como as propostas chegam', async () => {
    const h = await openReviewHarness();
    const onHelp = vi.fn();
    const onScan = vi.fn();
    renderInEditor(h, <ProposalList onHelp={onHelp} onScan={onScan} />);
    expect(screen.getByRole('heading', { name: 'Nenhuma proposta ainda' })).toBeTruthy();
    fireEvent.click(
      screen.getByRole('button', { name: 'Como o agente envia propostas' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Verificar a pasta agora' }));
    expect(onHelp).toHaveBeenCalled();
    expect(onScan).toHaveBeenCalled();
    expect(screen.getByText(/zips importados também mostram e aplicam/)).toBeTruthy();
  });

  it('proposta que chegou: "Nova", contagens e Revisar como ação principal', async () => {
    const { proposal } = richScenario();
    const h = await openReviewHarness({
      proposals: [{ ...proposal, title: 'Checkout' }],
    });
    renderInEditor(h, <ProposalList onHelp={noop} onScan={noop} />);
    const row = screen.getByRole('listitem');
    expect(within(row).getByText('Checkout')).toBeTruthy();
    expect(within(row).getByText('Nova')).toBeTruthy();
    const action = within(row).getByRole('button', { name: 'Revisar: Checkout' });
    expect(action.className).toContain('button-primary');
    // ○ pendentes, ✓ aceitas, ✕ rejeitadas.
    expect(within(row).getByTitle('sem decisão').textContent).toContain(
      String(proposal.changes.length),
    );
    fireEvent.click(action);
    expect(h.review.proposalId.value).toBe('P1');
  });

  it('em andamento: "Em revisão", Continuar e as aceitas aguardando aplicação', async () => {
    const { base, proposal } = richScenario();
    const accepted = decided(proposal, base, { level: 'image', id: 'I3' }, 'accepted');
    const h = await openReviewHarness({ proposals: [accepted] });
    renderInEditor(h, <ProposalList onHelp={noop} onScan={noop} />);
    const row = screen.getByRole('listitem');
    expect(within(row).getByText('Em revisão')).toBeTruthy();
    expect(within(row).getByText('3 aceitas aguardando aplicação')).toBeTruthy();
    expect(within(row).getByRole('button', { name: /^Continuar/ })).toBeTruthy();
  });

  it('substituída: o que ficou para trás, no grupo das fechadas', async () => {
    const { base, proposal } = richScenario();
    const old = supersedeProposal(
      decided(proposal, base, { level: 'item', id: 'M1' }, 'accepted'),
    );
    const next = {
      ...richScenario('P2').proposal,
      supersedes: 'P1',
      title: 'Nova versão',
    };
    const h = await openReviewHarness({ proposals: [old, next] });
    renderInEditor(h, <ProposalList onHelp={noop} onScan={noop} />);
    expect(screen.getByText('Fechadas')).toBeTruthy();
    expect(screen.getByText('Substituída')).toBeTruthy();
    expect(
      screen.getByText(
        `1 aceitas e ${proposal.changes.length - 1} sem decisão ficaram para trás`,
      ),
    ).toBeTruthy();
    // A fechada não leva "Nova"; a aberta que chegou, sim.
    expect(screen.getAllByText('Nova')).toHaveLength(1);
  });

  // Fase 8.2 (P4, O6 da rodada 4): `rows[].fresh` é a verdade; toda linha `fresh` leva o
  // selo e a ação principal, e a barra de status conta as mesmas.
  it('duas propostas que chegaram juntas: dois selos "Nova", duas ações principais e a barra conta 2', async () => {
    const a = { ...richScenario('P1').proposal, title: 'Checkout' };
    const b = {
      ...richScenario('P2').proposal,
      title: 'Correções',
      createdAt: '2026-10-10T12:00:00.000Z',
    };
    const h = await openReviewHarness({ proposals: [a, b] });
    renderInEditor(
      h,
      <>
        <ProposalList onHelp={noop} onScan={noop} />
        <StatusBar />
      </>,
    );
    expect(screen.getAllByText('Nova')).toHaveLength(2);
    for (const title of ['Checkout', 'Correções']) {
      const action = screen.getByRole('button', { name: `Revisar: ${title}` });
      expect(action.className).toContain('button-primary');
    }
    expect(screen.getByRole('button', { name: '2 proposta(s) nova(s)' })).toBeTruthy();
    // Abrir uma delas tira o selo e a conta dela, e só dela.
    act(() => {
      h.review.open('P2');
      h.review.close();
    });
    expect(screen.getAllByText('Nova')).toHaveLength(1);
    expect(screen.getByRole('button', { name: '1 proposta(s) nova(s)' })).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Revisar: Correções' }).className,
    ).not.toContain('button-primary');
  });

  // Achado 13 (parte da app): a proposta já revisada e aplicada não muda de status ao ser
  // substituída; a linha mostra quem a substituiu e leva à nova.
  it('aplicada e substituída: "Aplicada · substituída por …" e Abrir a nova, sem mudar o arquivo', async () => {
    const { base, proposal } = richScenario();
    const accepted = decided(proposal, base, { level: 'proposal', id: null }, 'accepted');
    const applied: Proposal = {
      ...accepted,
      status: 'applied',
      applied: Object.fromEntries(accepted.changes.map((c) => [c.id, { at: AT }])),
    };
    const next = {
      ...richScenario('P2').proposal,
      supersedes: 'P1',
      title: 'Só a correção',
    };
    const h = await openReviewHarness({ proposals: [applied, next] });
    renderInEditor(h, <ProposalList onHelp={noop} onScan={noop} />);
    const row = screen
      .getAllByRole('listitem')
      .find((r) => r.getAttribute('data-proposal') === 'P1');
    if (!row) throw new Error('linha da P1');
    expect(within(row).getByText('Aplicada')).toBeTruthy();
    expect(within(row).getByText('substituída por Só a correção')).toBeTruthy();
    expect(within(row).getByRole('button', { name: 'Ver: Teste' })).toBeTruthy();
    fireEvent.click(
      within(row).getByRole('button', { name: 'Abrir a nova: Só a correção' }),
    );
    expect(h.review.proposalId.value).toBe('P2');
    expect((await diskProposal(h.root)).status).toBe('applied');
  });

  it('busca por título, origem e autor e filtro Abertas/Fechadas', async () => {
    const a = { ...richScenario('P1').proposal, title: 'Checkout', origin: 'Figma' };
    const b = { ...richScenario('P2').proposal, title: 'Home', author: 'Agente X' };
    const h = await openReviewHarness({ proposals: [a, b] });
    renderInEditor(h, <ProposalList onHelp={noop} onScan={noop} />);
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    fireEvent.input(screen.getByRole('searchbox', { name: 'Buscar propostas' }), {
      target: { value: 'agente' },
    });
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
    expect(screen.getByText('Home')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Fechadas 0' }));
    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
    expect(screen.getByText('Nenhuma proposta com este filtro.')).toBeTruthy();
  });
});

describe('aviso de proposta nova', () => {
  it('aparece quando a pasta traz uma proposta nova, com Revisar', async () => {
    const h = await openReviewHarness({ skipProposals: true });
    renderInEditor(h, <ProposalNotices />);
    expect(screen.queryByRole('status')).toBeNull();
    writeOutside(h.root, { ...richScenario().proposal, title: 'Checkout' });
    await act(async () => {
      await h.session.proposals.scan();
    });
    const notice = screen.getByRole('status');
    expect(within(notice).getByText('Nova proposta')).toBeTruthy();
    expect(within(notice).getByText('Checkout')).toBeTruthy();
    fireEvent.click(within(notice).getByRole('button', { name: 'Revisar' }));
    expect(h.review.proposalId.value).toBe('P1');
    expect(h.session.proposals.notices.value).toEqual([]);
  });

  // Fase 8.2 (P4): abrir a proposta por qualquer caminho tira o aviso dela da fila (ação
  // do store), e ele não volta ao sair da revisão.
  it('some ao abrir a proposta pela janela Propostas e não volta ao sair da revisão', async () => {
    const h = await openReviewHarness({ skipProposals: true });
    renderInEditor(
      h,
      <>
        <ProposalNotices />
        <ProposalList onHelp={noop} onScan={noop} />
      </>,
    );
    writeOutside(h.root, { ...richScenario().proposal, title: 'Checkout' });
    await act(async () => {
      await h.session.proposals.scan();
    });
    expect(screen.getByRole('status')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Revisar: Checkout' }));
    expect(h.review.proposalId.value).toBe('P1');
    expect(screen.queryByRole('status')).toBeNull();
    act(() => h.review.close());
    expect(screen.queryByRole('status')).toBeNull();
    expect(h.session.proposals.notices.value).toEqual([]);
  });
});

describe('formatWhen', () => {
  const now = new Date(2026, 9, 9, 15, 0);
  it('hoje, ontem e data curta', () => {
    expect(formatWhen(new Date(2026, 9, 9, 9, 40).toISOString(), now, 'pt-BR')).toBe(
      'hoje 09:40',
    );
    expect(formatWhen(new Date(2026, 9, 8, 18, 12).toISOString(), now, 'pt-BR')).toBe(
      'ontem 18:12',
    );
    expect(formatWhen(new Date(2026, 9, 6, 8, 0).toISOString(), now, 'pt-BR')).toBe(
      '06/10',
    );
    expect(formatWhen(new Date(2025, 9, 6, 8, 0).toISOString(), now, 'pt-BR')).toBe(
      '06/10/2025',
    );
  });
});
