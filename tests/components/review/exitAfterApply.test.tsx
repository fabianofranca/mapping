import { cleanup, fireEvent, screen, waitFor } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { EditorDialogs } from '../../../src/app/useEditorDialogs';
import { useExitReview } from '../../../src/app/useExitReview';
import { locale } from '../../../src/store/settings';
import { useDialogSlot } from '../../../src/ui/focus';
import { ExitReviewDialog } from '../../../src/ui/review/ExitReviewDialog';
import { ReviewBar } from '../../../src/ui/review/ReviewBar';
import { decided } from '../../model/proposalFixtures';
import { richScenario } from '../../store/proposalHarness';
import { openReviewHarness, renderInEditor } from './reviewHarness';

// Achado da rodada da #898 (R25): sair da revisão logo após aplicar abria "Sair da revisão?"
// com "0 aceita(s) aguardando aplicação" e "Aplicar bloqueado". O clique decidia pelo estado
// de antes de a aplicação terminar; o diálogo, já aberto, via o estado de depois.

beforeEach(() => {
  locale.value = 'pt-BR';
  localStorage.clear();
});
afterEach(cleanup);

function Shell() {
  const dialogs = useDialogSlot<{ readonly kind: 'exitReview' }>();
  const exit = useExitReview(dialogs as unknown as EditorDialogs);
  return (
    <>
      <main data-canvas-area tabIndex={-1} aria-label="canvas" />
      <ReviewBar onExit={exit} />
      {dialogs.current && <ExitReviewDialog onClose={dialogs.close} />}
    </>
  );
}

describe('Sair da revisão logo após aplicar', () => {
  it('não deixa o diálogo contraditório (0 aguardando) aberto: sai direto', async () => {
    const { base, proposal } = richScenario();
    const p = decided(proposal, base, { level: 'item', id: 'M1' }, 'accepted');
    const h = await openReviewHarness({ proposals: [p] });
    h.review.open('P1');
    renderInEditor(h, <Shell />);
    const applying = h.review.apply();
    fireEvent.click(screen.getByRole('button', { name: 'Sair da revisão' }));
    await applying;
    await waitFor(() => expect(h.review.proposalId.value).toBeNull());
    expect(screen.queryByText(/0 aceita/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Sair mesmo assim' })).toBeNull();
  });
});
