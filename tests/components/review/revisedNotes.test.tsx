import { act, cleanup, screen } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Proposal } from '../../../src/model';
import { locale } from '../../../src/store/settings';
import { ReviewDetails } from '../../../src/ui/review/ReviewDetails';
import { richScenario } from '../../store/proposalHarness';
import { openReviewHarness, renderInEditor } from './reviewHarness';
import { REVISED_AT } from './revisedFixture';

// Nota que subiu de uma mudança retirada (etapa #644, CP3): mostra de onde veio.

beforeEach(() => {
  locale.value = 'pt-BR';
  localStorage.clear();
});
afterEach(cleanup);

/** A mudança `rect` foi retirada numa revisão e a nota dela subiu ao nível da proposta. */
function withDroppedNote(): Proposal {
  const { proposal, ids } = richScenario();
  const dropped = proposal.changes.find((c) => c.id === ids.rect);
  if (!dropped) throw new Error('sem a mudança de posição');
  return {
    ...proposal,
    formatVersion: 5,
    changes: proposal.changes.filter((c) => c.id !== ids.rect),
    notes: [
      {
        id: 'n1',
        target: { level: 'proposal', id: null },
        text: 'Mantenha a posição antiga',
        at: REVISED_AT,
      },
      {
        id: 'n2',
        target: { level: 'proposal', id: null },
        text: 'Nota comum',
        at: REVISED_AT,
      },
    ],
    revisions: [
      {
        at: REVISED_AT,
        baseRevision: 0,
        operations: [],
        changed: {},
        added: [],
        dropped: [{ change: dropped, state: null, notes: ['n1'] }],
      },
    ],
  };
}

describe('nota que veio de uma mudança retirada', () => {
  it('mostra "Da mudança retirada: <resumo>" antes do texto, só na nota que subiu', async () => {
    const h = await openReviewHarness({ proposals: [withDroppedNote()] });
    expect(h.review.open('P1')).toMatchObject({ ok: true });
    act(() => h.review.select({ level: 'proposal', id: null }));
    renderInEditor(h, <ReviewDetails />);
    const origin = screen.getByText(/^Da mudança retirada: /);
    expect(origin.textContent).toContain('Posição');
    const [first, second] = screen.getAllByRole('textbox', {
      name: 'Nota para o agente',
    });
    expect((first as HTMLTextAreaElement).value).toBe('Mantenha a posição antiga');
    expect(
      origin.compareDocumentPosition(first as Node) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect((second as HTMLTextAreaElement).value).toBe('Nota comum');
    expect(screen.getAllByText(/^Da mudança retirada: /)).toHaveLength(1);
  });
});
