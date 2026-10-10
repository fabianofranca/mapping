import { act, cleanup, fireEvent, screen, within } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { supersedeProposal } from '../../../src/model';
import { locale } from '../../../src/store/settings';
import { ProposalNotices } from '../../../src/ui/review/ProposalNotices';
import { ProposalList } from '../../../src/ui/review/ProposalList';
import { formatWhen } from '../../../src/ui/review/format';
import { decided } from '../../model/proposalFixtures';
import { richScenario, writeOutside } from '../../store/proposalHarness';
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
    // Só uma "Nova" por janela.
    expect(screen.getAllByText('Nova')).toHaveLength(1);
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
