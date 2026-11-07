import { cleanup, screen, within } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { t } from '../../../src/i18n';
import {
  citationUrl,
  renameMarking,
  type Proposal,
  type Thread,
} from '../../../src/model';
import { locale } from '../../../src/store/settings';
import { selectedThreadId } from '../../../src/store/threadUi';
import { hideToolWindow, isToolWindowOpen } from '../../../src/store/toolWindows';
import { ThreadView } from '../../../src/ui/comments/ThreadView';
import { ProposalList } from '../../../src/ui/review/ProposalList';
import { decided, propose } from '../../model/proposalFixtures';
import { HUMAN, T0, message, sampleThread } from '../../model/threadFixtures';
import { sampleProject } from '../../model/fixtures';
import { richScenario } from '../../store/proposalHarness';
import { openReviewHarness, renderInEditor, type ReviewHarness } from './reviewHarness';

// A proposta ligada a uma conversa (decisão 36): o cartão na conversa e o "da conversa" na
// linha da janela Propostas.

beforeEach(() => {
  localStorage.clear();
  locale.value = 'pt-BR';
});
afterEach(cleanup);

const noop = () => {};

function proposalThread(
  id: string,
  proposalId: string,
  text: string,
  at: string = T0,
): Thread {
  const url = citationUrl('projeto', sampleProject(), [], {
    kind: 'proposal',
    id: proposalId,
  });
  return sampleThread({
    id,
    messages: [
      {
        ...message('m1', at, HUMAN, `${text} [Checkout](${url ?? ''})`),
        proposal: proposalId,
      },
    ],
  });
}

async function open(proposals: readonly Proposal[], threads: readonly Thread[]) {
  const h = await openReviewHarness({ proposals });
  for (const th of threads) await h.session.threads.create(th);
  return h;
}

const card = () => document.querySelector<HTMLElement>('[data-proposal-card]');

describe('cartão da proposta na conversa', () => {
  it('título, "N mudanças para revisar" e Revisar abre a revisão', async () => {
    const { proposal } = richScenario();
    const thread = proposalThread('tp1', 'P1', 'Proposta:');
    const h = await open([{ ...proposal, title: 'Checkout' }], [thread]);
    renderInEditor(h, <ThreadView thread={thread} />);
    const el = card() as HTMLElement;
    expect(within(el).getByText('Checkout')).toBeTruthy();
    expect(
      within(el).getByText(
        t('thread.proposal.changesMany', { count: proposal.changes.length }),
      ),
    ).toBeTruthy();
    await userEvent.click(within(el).getByRole('button', { name: 'Revisar: Checkout' }));
    expect(h.review.proposalId.value).toBe('P1');
  });

  it('uma só mudança: singular', async () => {
    const base = sampleProject();
    const one = propose(base, renameMarking(base, 'M1', 'Porta nova'), {
      id: 'P1',
      title: 'Checkout',
    });
    expect(one.changes).toHaveLength(1);
    const thread = proposalThread('tp1', 'P1', 'Proposta:');
    const h = await open([one], [thread]);
    renderInEditor(h, <ThreadView thread={thread} />);
    expect(screen.getByText(t('thread.proposal.changesOne'))).toBeTruthy();
  });

  it('só conta as mudanças sem decisão', async () => {
    const { base, proposal } = richScenario();
    const accepted = decided(proposal, base, { level: 'image', id: 'I3' }, 'accepted');
    const thread = proposalThread('tp1', 'P1', 'Proposta:');
    const h = await open([accepted], [thread]);
    const undecided = h.review.derived.rows.value[0]?.progress.undecided ?? -1;
    expect(undecided).toBeLessThan(proposal.changes.length);
    renderInEditor(h, <ThreadView thread={thread} />);
    expect(
      screen.getByText(t('thread.proposal.changesMany', { count: undecided })),
    ).toBeTruthy();
  });

  it('proposta aplicada: o estado em texto, sem "para revisar"', async () => {
    const { proposal } = richScenario();
    const thread = proposalThread('tp1', 'P1', 'Proposta:');
    const h = await open([{ ...proposal, status: 'applied' }], [thread]);
    renderInEditor(h, <ThreadView thread={thread} />);
    const el = card() as HTMLElement;
    expect(within(el).getByText(t('proposals.status.applied'))).toBeTruthy();
    expect(within(el).queryByText(/para revisar/)).toBeNull();
  });

  it('proposta que não existe mais: "Proposta removida", sem botão', async () => {
    const thread = proposalThread('tp1', 'P9', 'Proposta:');
    const h = await open([], [thread]);
    renderInEditor(h, <ThreadView thread={thread} />);
    const el = card() as HTMLElement;
    expect(within(el).getByText(t('thread.proposal.removed'))).toBeTruthy();
    expect(within(el).queryByRole('button')).toBeNull();
  });

  it('o texto da mensagem continua legível', async () => {
    const { proposal } = richScenario();
    const thread = proposalThread('tp1', 'P1', 'Mandei a proposta:');
    const h = await open([{ ...proposal, title: 'Checkout' }], [thread]);
    renderInEditor(h, <ThreadView thread={thread} />);
    expect(screen.getByText(/Mandei a proposta:/)).toBeTruthy();
  });

  it('mensagem sem proposta não tem cartão', async () => {
    const h = await open([], []);
    renderInEditor(h, <ThreadView thread={sampleThread()} />);
    expect(card()).toBeNull();
  });
});

describe('"da conversa" na linha da proposta', () => {
  async function mount(threads: readonly Thread[]): Promise<ReviewHarness> {
    const { proposal } = richScenario();
    const h = await open([{ ...proposal, title: 'Checkout' }], threads);
    renderInEditor(h, <ProposalList onHelp={noop} onScan={noop} />);
    return h;
  }

  it('mostra "da conversa" e o chip da conversa que a ligou; clicar abre a conversa', async () => {
    const thread = proposalThread('tp1', 'P1', 'Revisar o checkout');
    const h = await mount([thread]);
    hideToolWindow('details');
    const row = screen.getByRole('listitem');
    expect(within(row).getByText(t('proposals.fromThread'))).toBeTruthy();
    const chip = within(row).getByRole('button', { name: /, citação$/ });
    expect(chip.textContent).toContain('Revisar o checkout');
    await userEvent.click(chip);
    expect(selectedThreadId(h.ui)).toBe('tp1');
    expect(isToolWindowOpen('details')).toBe(true);
  });

  it('proposta sem conversa não mostra a ligação', async () => {
    await mount([]);
    expect(screen.queryByText(t('proposals.fromThread'))).toBeNull();
  });

  it('com duas conversas, vale a primeira que a ligou', async () => {
    const late = proposalThread('tp2', 'P1', 'Segunda');
    const early = proposalThread('tp1', 'P1', 'Primeira', '2026-11-05T09:00:00.000Z');
    await mount([late, early]);
    const row = screen.getByRole('listitem');
    expect(within(row).getByRole('button', { name: /, citação$/ }).textContent).toContain(
      'Primeira',
    );
  });
});
