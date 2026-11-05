import { cleanup, fireEvent, screen, waitFor } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { EditorDialogs } from '../../../src/app/useEditorDialogs';
import { useExitReview } from '../../../src/app/useExitReview';
import { locale } from '../../../src/store/settings';
import { useDialogSlot } from '../../../src/ui/focus';
import { ExitReviewDialog } from '../../../src/ui/review/ExitReviewDialog';
import { ProposalList } from '../../../src/ui/review/ProposalList';
import { ProposalsWindow } from '../../../src/ui/review/ProposalsWindow';
import { ReviewBar } from '../../../src/ui/review/ReviewBar';
import { decided } from '../../model/proposalFixtures';
import { richScenario } from '../../store/proposalHarness';
import { openReviewHarness, renderInEditor } from './reviewHarness';

// Etapa #515 (FN1, #497 parte 1): sair da revisão tira o botão clicado da tela. O foco vai
// ao botão da proposta na janela Propostas (o que abriu a revisão), ou ao canvas se a
// janela não estiver aberta; nunca ao body.

beforeEach(() => {
  locale.value = 'pt-BR';
  localStorage.clear();
});
afterEach(cleanup);

const noop = () => {};

// A janela real troca a árvore da revisão pela lista quando a revisão fecha: a lista só
// entra no DOM depois da renderização seguinte ao `review.close()` (achado 1 da FN1).
function RealShell() {
  const dialogs = useDialogSlot<{ readonly kind: 'exitReview' }>();
  const exit = useExitReview(dialogs as unknown as EditorDialogs);
  return (
    <>
      <main data-canvas-area tabIndex={-1} aria-label="canvas" />
      <ReviewBar onExit={exit} />
      <ProposalsWindow onHelp={noop} />
    </>
  );
}

function Shell({ withList }: { readonly withList: boolean }) {
  const dialogs = useDialogSlot<{ readonly kind: 'exitReview' }>();
  const exit = useExitReview(dialogs as unknown as EditorDialogs);
  return (
    <>
      <main data-canvas-area tabIndex={-1} aria-label="canvas">
        <button type="button">controle do canvas</button>
      </main>
      <ReviewBar onExit={exit} />
      {withList && <ProposalList onHelp={noop} onScan={noop} />}
      {dialogs.current && <ExitReviewDialog onClose={dialogs.close} />}
    </>
  );
}

async function mount(options: { accepted: boolean; withList: boolean }) {
  const { base, proposal } = richScenario();
  const p = options.accepted
    ? decided(proposal, base, { level: 'item', id: 'M1' }, 'accepted')
    : proposal;
  const h = await openReviewHarness({ proposals: [p] });
  h.review.open('P1');
  renderInEditor(h, <Shell withList={options.withList} />);
  return h;
}

const canvas = () => document.querySelector('[data-canvas-area]');
const rowAction = () =>
  document.querySelector('[data-proposal="P1"] [data-proposal-action]');

describe('Sair da revisão: o foco não vai ao body', () => {
  it('pelo botão, com Propostas aberta → o botão da proposta (Continuar/Revisar)', async () => {
    const h = await mount({ accepted: false, withList: true });
    const exit = screen.getByRole('button', { name: 'Sair da revisão' });
    exit.focus();
    fireEvent.click(exit);
    await waitFor(() => expect(h.review.proposalId.value).toBeNull());
    expect(rowAction()).not.toBeNull();
    expect(document.activeElement).toBe(rowAction());
  });

  it('pelo botão, sem a janela Propostas → o canvas', async () => {
    const h = await mount({ accepted: false, withList: false });
    const exit = screen.getByRole('button', { name: 'Sair da revisão' });
    exit.focus();
    fireEvent.click(exit);
    await waitFor(() => expect(h.review.proposalId.value).toBeNull());
    expect(document.activeElement).toBe(canvas());
  });

  it('pelo diálogo (Sair mesmo assim), com Propostas aberta → o botão da proposta', async () => {
    const h = await mount({ accepted: true, withList: true });
    const exit = screen.getByRole('button', { name: 'Sair da revisão' });
    exit.focus();
    fireEvent.click(exit);
    const confirm = await screen.findByRole('button', { name: 'Sair mesmo assim' });
    confirm.focus();
    fireEvent.click(confirm);
    await waitFor(() => expect(h.review.proposalId.value).toBeNull());
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(document.activeElement).toBe(rowAction());
  });

  it('pelo diálogo, sem a janela Propostas → o canvas', async () => {
    const h = await mount({ accepted: true, withList: false });
    const exit = screen.getByRole('button', { name: 'Sair da revisão' });
    exit.focus();
    fireEvent.click(exit);
    const confirm = await screen.findByRole('button', { name: 'Sair mesmo assim' });
    confirm.focus();
    fireEvent.click(confirm);
    await waitFor(() => expect(h.review.proposalId.value).toBeNull());
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(document.activeElement).toBe(canvas());
  });

  it('pelo botão, com a janela Propostas real (troca a árvore pela lista) → o botão da proposta', async () => {
    const { base, proposal } = richScenario();
    void base;
    const h = await openReviewHarness({ proposals: [proposal] });
    h.review.open('P1');
    renderInEditor(h, <RealShell />);
    const exit = screen.getByRole('button', { name: 'Sair da revisão' });
    exit.focus();
    fireEvent.click(exit);
    await waitFor(() => expect(rowAction()).not.toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(rowAction()));
  });
});
