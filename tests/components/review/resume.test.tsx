import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renameMarking, supersedeProposal } from '../../../src/model';
import { locale } from '../../../src/store/settings';
import {
  ExitReviewDialog,
  needsExitReminder,
} from '../../../src/ui/review/ExitReviewDialog';
import { ProposalsWindow } from '../../../src/ui/review/ProposalsWindow';
import { sampleProject } from '../../model/fixtures';
import { decided } from '../../model/proposalFixtures';
import { diskProposal, richScenario } from '../../store/proposalHarness';
import { openReviewHarness, renderInEditor } from './reviewHarness';

// Retomar a revisão (HANDOFF-PROPOSALS 5.3, passo 7 da seção 9): o lembrete ao sair, os
// conflitos novos depois de uma edição entre sessões e a proposta substituída.

beforeEach(() => {
  locale.value = 'pt-BR';
  localStorage.clear();
});
afterEach(cleanup);

describe('lembrete ao sair', () => {
  it('só pergunta com aceitas aguardando aplicação numa proposta aplicável', () => {
    expect(needsExitReminder('open', 0)).toBe(false);
    expect(needsExitReminder('open', 3)).toBe(true);
    expect(needsExitReminder('superseded', 1)).toBe(true);
    expect(needsExitReminder('applied', 2)).toBe(false);
  });

  it('Sair mesmo assim fecha sem perder as decisões', async () => {
    const { base, proposal } = richScenario();
    const accepted = decided(proposal, base, { level: 'item', id: 'M1' }, 'accepted');
    const h = await openReviewHarness({ proposals: [accepted] });
    h.review.open('P1');
    const onClose = vi.fn();
    renderInEditor(h, <ExitReviewDialog onClose={onClose} />);
    expect(
      screen.getByText(
        'Há 1 mudança(s) aceita(s) que ainda não foram aplicadas ao projeto.',
      ),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Aplicar agora · 1' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Sair mesmo assim' }));
    expect(onClose).toHaveBeenCalled();
    expect(h.review.proposalId.value).toBeNull();
    const disk = await diskProposal(h.root);
    expect(Object.values(disk.decisions).map((d) => d.state)).toEqual(['accepted']);
  });

  it('Aplicar agora aplica as aceitas e sai', async () => {
    const { base, proposal } = richScenario();
    const accepted = decided(proposal, base, { level: 'item', id: 'M1' }, 'accepted');
    const h = await openReviewHarness({ proposals: [accepted] });
    h.review.open('P1');
    renderInEditor(h, <ExitReviewDialog onClose={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar agora · 1' }));
    await waitFor(() => expect(h.review.proposalId.value).toBeNull());
    expect(
      h.session.store.committed.value?.markings.find((m) => m.id === 'M1')?.name,
    ).toBe('Porta dianteira');
  });
});

describe('ao reabrir', () => {
  it('conflitos novos depois de uma edição entre sessões: aviso e "Ver os novos"', async () => {
    const { proposal } = richScenario();
    // Primeira sessão: abre e sai (o dispositivo passa a conhecer a proposta).
    const first = await openReviewHarness({ proposals: [proposal] });
    first.review.open('P1');
    first.review.close();
    // O projeto foi editado por fora: o nome de M1 mudou.
    const edited = renameMarking(sampleProject(), 'M1', 'Porta traseira');
    const h = await openReviewHarness({ project: edited, proposals: [proposal] });
    act(() => {
      h.review.open('P1');
    });
    renderInEditor(h, <ProposalsWindow onHelp={() => {}} />);
    expect(screen.getByText('O projeto mudou desde a sua última sessão.')).toBeTruthy();
    expect(screen.getByText('Conflito novo')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Ver os conflitos novos (1)' }));
    expect(h.review.filters.value.onlyConflicts).toBe(true);
    expect(h.review.selected.value?.level).toBe('change');
  });

  it('proposta substituída: o que ficou para trás agrupado, as pendentes sem decisão', async () => {
    const { base, proposal } = richScenario();
    const old = supersedeProposal(
      decided(proposal, base, { level: 'item', id: 'M1' }, 'accepted'),
    );
    const next = { ...richScenario('P2').proposal, supersedes: 'P1', title: 'Nova' };
    const h = await openReviewHarness({ proposals: [old, next] });
    h.review.open('P1');
    renderInEditor(h, <ProposalsWindow onHelp={() => {}} />);
    expect(screen.getByText('Esta proposta foi substituída por outra.')).toBeTruthy();
    expect(screen.getByText('Aceitas sem aplicar')).toBeTruthy();
    expect(screen.getByText('Sem decisão')).toBeTruthy();
    // Cada mudança diz como está na nova (as duas propostas são iguais aqui).
    expect(screen.getAllByText('igual na nova').length).toBe(proposal.changes.length);
    // As pendentes não podem mais ser decididas.
    const accept = screen.getAllByRole('button', { name: /^Aceitar / })[0];
    expect((accept as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Abrir a nova: Nova' }));
    expect(h.review.proposalId.value).toBe('P2');
  });
});
