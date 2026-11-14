import { act, cleanup, screen } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Proposal } from '../../../src/model';
import { locale } from '../../../src/store/settings';
import { ReviewDetails } from '../../../src/ui/review/ReviewDetails';
import { richScenario } from '../../store/proposalHarness';
import { openReviewHarness, renderInEditor } from './reviewHarness';
import { REVISED_AT } from './revisedFixture';

// Note that moved up from a withdrawn change (stage #644, CP3): shows where it came from.

beforeEach(() => {
  locale.value = 'en-US';
  localStorage.clear();
});
afterEach(cleanup);

/** The `rect` change was withdrawn in a revision and its note moved up to the proposal level. */
function withDroppedNote(): Proposal {
  const { proposal, ids } = richScenario();
  const dropped = proposal.changes.find((c) => c.id === ids.rect);
  if (!dropped) throw new Error('no position change');
  return {
    ...proposal,
    formatVersion: 5,
    changes: proposal.changes.filter((c) => c.id !== ids.rect),
    notes: [
      {
        id: 'n1',
        target: { level: 'proposal', id: null },
        text: 'Keep the old position',
        at: REVISED_AT,
      },
      {
        id: 'n2',
        target: { level: 'proposal', id: null },
        text: 'Ordinary note',
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

describe('note that came from a withdrawn change', () => {
  it('shows "From the withdrawn change: <summary>" before the text, only on the note that moved up', async () => {
    const h = await openReviewHarness({ proposals: [withDroppedNote()] });
    expect(h.review.open('P1')).toMatchObject({ ok: true });
    act(() => h.review.select({ level: 'proposal', id: null }));
    renderInEditor(h, <ReviewDetails />);
    const origin = screen.getByText(/^From the withdrawn change: /);
    expect(origin.textContent).toContain('Position');
    const [first, second] = screen.getAllByRole('textbox', {
      name: 'Note for the agent',
    });
    expect((first as HTMLTextAreaElement).value).toBe('Keep the old position');
    expect(
      origin.compareDocumentPosition(first as Node) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect((second as HTMLTextAreaElement).value).toBe('Ordinary note');
    expect(screen.getAllByText(/^From the withdrawn change: /)).toHaveLength(1);
  });
});
