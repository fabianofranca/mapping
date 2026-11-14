import {
  act,
  cleanup,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renameMarking, type DecisionState } from '../../../src/model';
import { locale } from '../../../src/store/settings';
import { sampleProject } from '../../model/fixtures';
import { changeOf, propose } from '../../model/proposalFixtures';
import { richScenario } from '../../store/proposalHarness';
import { firstImport, showReviewPanel, type ReviewHarness } from './reviewHarness';

// Deciding in the field popover (phase 9.6, HANDOFF-REVIEW-DETAILS 5.3, 6 and 7): Accept,
// Reject and Clear write at once and the popover stays open; in a conflict the buttons state
// the effect; focusing the marker selects the change, so A, R and Backspace decide the field.
// pt-BR kept: shared fixture data asserted by tests/store (names Porta and Porta dianteira from richScenario)

beforeEach(() => {
  locale.value = 'en-US';
  localStorage.clear();
});
afterEach(() => {
  vi.restoreAllMocks();
  cleanup();
});

const stateOf = (h: ReviewHarness, changeId: string): DecisionState | null =>
  h.review.derived.proposal.value?.decisions[changeId]?.state ?? null;

/**
 * Chrome fires `blur` on the focused element when it leaves the DOM; jsdom does not. Rejecting
 * the creation swaps the annotation card (with the popover and the note field inside), so the
 * suggested note must survive that `blur` (defect from the manual rounds of R5.3), and the
 * focus, which falls to the body, goes back to the equivalent control of the new card
 * (keyboard decision).
 */
function blurOnRemoval(): void {
  const original = Node.prototype.removeChild;
  vi.spyOn(Node.prototype, 'removeChild').mockImplementation(function <T extends Node>(
    this: Node,
    child: T,
  ): T {
    const active = document.activeElement;
    if (active instanceof HTMLElement && child.contains(active)) {
      // `blur()` fires the event and moves focus to the body, like Chrome on removal.
      active.blur();
    }
    return original.call(this, child) as T;
  });
}

const nameMark = () => screen.getByRole('button', { name: /^Name: changed/ });

describe('decision in the field popover', () => {
  it('Accept, Reject and Clear write at once; the popover stays open and the marker changes', async () => {
    const { proposal, ids } = richScenario();
    const h = await showReviewPanel(
      { proposals: [proposal] },
      { level: 'item', id: 'M1' },
    );
    fireEvent.click(nameMark());
    const pop = screen.getByRole('dialog');

    const accept = within(pop).getByRole('button', { name: 'Accept: Name' });
    expect(accept.getAttribute('aria-keyshortcuts')).toBe('A');
    expect(
      within(pop)
        .getByRole('button', { name: 'Reject: Name' })
        .getAttribute('aria-keyshortcuts'),
    ).toBe('R');
    expect(within(pop).queryByRole('button', { name: 'Clear' })).toBeNull();

    fireEvent.click(accept);
    await waitFor(() => expect(stateOf(h, ids.name)).toBe('accepted'));
    // The same popover, now showing the decision; the marker changed.
    expect(screen.getByRole('dialog')).toBe(pop);
    expect(within(pop).getByText('Decision: Accepted')).toBeTruthy();
    expect(nameMark().getAttribute('data-state')).toBe('accepted');
    expect(nameMark().getAttribute('aria-label')).toMatch(/^Name: changed, accepted\./);
    expect(
      within(pop)
        .getByRole('button', { name: 'Accept: Name' })
        .getAttribute('aria-pressed'),
    ).toBe('true');
    // The `status` region announces the decision.
    await waitFor(() =>
      expect(within(pop).getByRole('status').textContent).toBe('Name: accepted'),
    );

    fireEvent.click(within(pop).getByRole('button', { name: 'Reject: Name' }));
    await waitFor(() => expect(stateOf(h, ids.name)).toBe('rejected'));
    expect(nameMark().getAttribute('data-state')).toBe('rejected');
    await waitFor(() =>
      expect(within(pop).getByRole('status').textContent).toBe('Name: rejected'),
    );

    // Clear goes back to "undecided" and focus goes to Accept (Clear leaves the DOM).
    const clear = within(pop).getByRole('button', { name: 'Clear' });
    clear.focus();
    fireEvent.click(clear);
    await waitFor(() => expect(stateOf(h, ids.name)).toBeNull());
    expect(nameMark().getAttribute('data-state')).toBe('undecided');
    expect(document.activeElement).toBe(
      within(pop).getByRole('button', { name: 'Accept: Name' }),
    );
  });

  it('in a conflict the buttons state the effect: Overwrite and Keep current', async () => {
    const { proposal, ids } = richScenario();
    const edited = renameMarking(sampleProject(), 'M1', 'Top');
    const h = await showReviewPanel(
      { project: edited, proposals: [proposal] },
      { level: 'item', id: 'M1' },
    );
    fireEvent.click(
      screen.getByRole('button', { name: /^Name: changed, pending, in conflict/ }),
    );
    const pop = screen.getByRole('dialog');
    const describedBy = (el: HTMLElement) =>
      document.getElementById(el.getAttribute('aria-describedby') ?? '')?.textContent;
    const overwrite = within(pop).getByRole('button', { name: 'Overwrite: Name' });
    expect(describedBy(overwrite)).toBe('Accept: overwrites Top with Porta dianteira');
    expect(overwrite.textContent).toBe('Overwrite');
    const keep = within(pop).getByRole('button', { name: 'Keep current: Name' });
    expect(describedBy(keep)).toBe('Reject: keeps Top');
    expect(keep.textContent).toBe('Keep current');
    fireEvent.click(overwrite);
    await waitFor(() => expect(stateOf(h, ids.name)).toBe('accepted'));
    // The conflict stays marked after being decided.
    expect(
      screen
        .getByRole('button', { name: /^Name: changed, accepted, in conflict/ })
        .classList.contains('is-conflict'),
    ).toBe(true);
  });

  it('focusing the marker selects the change and A, R and Backspace decide the focused field', async () => {
    const { proposal, ids } = richScenario();
    const h = await showReviewPanel(
      { proposals: [proposal] },
      { level: 'item', id: 'M1' },
    );
    const user = userEvent.setup();
    expect(nameMark().getAttribute('aria-keyshortcuts')).toBe('A R Backspace');
    act(() => nameMark().focus());
    expect(h.review.selected.value).toEqual({ level: 'change', id: ids.name });
    expect(nameMark().getAttribute('aria-current')).toBe('true');

    await user.keyboard('a');
    await waitFor(() => expect(stateOf(h, ids.name)).toBe('accepted'));
    await user.keyboard('r');
    await waitFor(() => expect(stateOf(h, ids.name)).toBe('rejected'));
    await user.keyboard('{Backspace}');
    await waitFor(() => expect(stateOf(h, ids.name)).toBeNull());
    // Only the field change changed: the rest of the proposal stayed as it was.
    expect(Object.keys(h.review.derived.proposal.value?.decisions ?? {})).toEqual([]);
  });

  it('rejecting with the mouse suggests the note (empty, with focus; it disappears if left empty)', async () => {
    const { proposal, ids } = richScenario();
    const h = await showReviewPanel(
      { proposals: [proposal] },
      { level: 'item', id: 'M1' },
    );
    const user = userEvent.setup();
    await user.click(nameMark());
    const pop = screen.getByRole('dialog');
    await user.click(within(pop).getByRole('button', { name: 'Reject: Name' }));
    await waitFor(() => expect(stateOf(h, ids.name)).toBe('rejected'));
    const box = within(pop).getByRole('textbox', { name: 'Note for the agent' });
    expect(document.activeElement).toBe(box);
    // Empty, it disappears on leaving.
    await user.tab();
    expect(screen.queryByRole('textbox', { name: 'Note for the agent' })).toBeNull();
    expect(h.review.derived.notes.value.size).toBe(0);
  });

  it('rejecting the created annotation with the mouse (the card becomes "Creation rejected") opens the note with focus', async () => {
    blurOnRemoval();
    const { base, proposal } = firstImport();
    const h = await showReviewPanel(
      { project: base, proposals: [proposal] },
      { level: 'item', id: 'M1' },
    );
    const created = changeOf(proposal, 'annotation', 'A1');
    const card = () => document.querySelector('[data-annotation="A1"]') as HTMLElement;
    const user = userEvent.setup();
    await user.click(
      within(card()).getByRole('button', { name: /^Annotation onClick created: new/ }),
    );
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Reject: Annotation onClick created',
      }),
    );
    await waitFor(() => expect(stateOf(h, created.id)).toBe('rejected'));
    expect(within(card()).getByText('Creation rejected')).toBeTruthy();
    const box = await screen.findByRole('textbox', { name: 'Note for the agent' });
    await waitFor(() => expect(document.activeElement).toBe(box));
    // Empty, it disappears on leaving and focus does not fall to the body.
    await user.tab();
    expect(screen.queryByRole('textbox', { name: 'Note for the agent' })).toBeNull();
    expect(document.activeElement).not.toBe(document.body);
  });

  it('rejecting with the mouse through the ✕ of the created annotation card opens the note with focus; with the keyboard it does not', async () => {
    blurOnRemoval();
    const { base, proposal } = firstImport();
    const h = await showReviewPanel(
      { project: base, proposals: [proposal] },
      { level: 'item', id: 'M1' },
    );
    const created = changeOf(proposal, 'annotation', 'A1');
    const card = () => document.querySelector('[data-annotation="A1"]') as HTMLElement;
    const user = userEvent.setup();
    // Via keyboard (Enter on the ✕): the rejection neither moves focus nor opens the note.
    const reject = () =>
      within(card()).getByRole('button', { name: /^Reject Annotation onClick created$/ });
    act(() => reject().focus());
    await user.keyboard('{Enter}');
    await waitFor(() => expect(stateOf(h, created.id)).toBe('rejected'));
    expect(screen.queryByRole('textbox', { name: 'Note for the agent' })).toBeNull();
    // The card was swapped and the focused ✕ left the DOM: focus goes back to the ✕ of the
    // new card (now pressed), never to the body, and Enter again clears the decision.
    const pressed = () =>
      within(card()).getByRole('button', {
        name: /^Rejected: Annotation onClick created$/,
      });
    await waitFor(() => expect(document.activeElement).toBe(pressed()));
    await user.keyboard('{Enter}');
    await waitFor(() => expect(stateOf(h, created.id)).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(reject()));
    await user.keyboard('{Enter}');
    await waitFor(() => expect(stateOf(h, created.id)).toBe('rejected'));
    await user.click(
      within(card()).getByRole('button', { name: /^Accept Annotation onClick created$/ }),
    );
    await waitFor(() => expect(stateOf(h, created.id)).toBe('accepted'));
    // With the mouse: the card becomes "Creation rejected" and the empty note gets focus.
    await user.click(reject());
    await waitFor(() => expect(stateOf(h, created.id)).toBe('rejected'));
    expect(within(card()).getByText('Creation rejected')).toBeTruthy();
    const box = await screen.findByRole('textbox', { name: 'Note for the agent' });
    await waitFor(() => expect(document.activeElement).toBe(box));
    // Empty, it disappears on leaving and focus does not fall to the body.
    await user.tab();
    expect(screen.queryByRole('textbox', { name: 'Note for the agent' })).toBeNull();
    expect(document.activeElement).not.toBe(document.body);
  });

  it('a click without `detail` (browser extension, element.click()) counts as mouse: opens the note in both paths', async () => {
    blurOnRemoval();
    const { base, proposal } = firstImport();
    const h = await showReviewPanel(
      { project: base, proposals: [proposal] },
      { level: 'item', id: 'M1' },
    );
    const created = changeOf(proposal, 'annotation', 'A1');
    const card = () => document.querySelector('[data-annotation="A1"]') as HTMLElement;
    const box = () => screen.queryByRole('textbox', { name: 'Note for the agent' });
    // Via the card ✕: `fireEvent.click` comes with `detail === 0`, like the synthetic click.
    fireEvent.click(
      within(card()).getByRole('button', { name: /^Reject Annotation onClick created$/ }),
    );
    await waitFor(() => expect(stateOf(h, created.id)).toBe('rejected'));
    await waitFor(() => expect(document.activeElement).toBe(box()));
    expect(box()).not.toBeNull();
    // Empty, it disappears on leaving; undoes the decision and repeats via the popover Reject.
    act(() => (document.activeElement as HTMLElement).blur());
    await waitFor(() => expect(box()).toBeNull());
    fireEvent.click(
      within(card().querySelector('.decision-control') as HTMLElement).getByRole(
        'button',
        { name: 'Accept Annotation onClick created' },
      ),
    );
    await waitFor(() => expect(stateOf(h, created.id)).toBe('accepted'));
    fireEvent.click(
      within(card()).getByRole('button', { name: /^Annotation onClick created: new/ }),
    );
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Reject: Annotation onClick created',
      }),
    );
    await waitFor(() => expect(stateOf(h, created.id)).toBe('rejected'));
    await waitFor(() => expect(document.activeElement).toBe(box()));
    expect(box()).not.toBeNull();
  });

  it('Enter and Space on the popover Reject are keyboard: they do not open the note', async () => {
    const { proposal, ids } = richScenario();
    const h = await showReviewPanel(
      { proposals: [proposal] },
      { level: 'item', id: 'M1' },
    );
    const user = userEvent.setup();
    act(() => nameMark().focus());
    await user.tab();
    await user.tab();
    const reject = within(screen.getByRole('dialog')).getByRole('button', {
      name: 'Reject: Name',
    });
    expect(document.activeElement).toBe(reject);
    await user.keyboard(' ');
    await waitFor(() => expect(stateOf(h, ids.name)).toBe('rejected'));
    expect(document.activeElement).toBe(reject);
    expect(screen.queryByRole('textbox', { name: 'Note for the agent' })).toBeNull();
    // A mouse click after the keyboard counts as mouse again (the mark is worth one click).
    await user.keyboard(' ');
    await waitFor(() => expect(stateOf(h, ids.name)).toBeNull());
    await user.click(reject);
    await waitFor(() => expect(stateOf(h, ids.name)).toBe('rejected'));
    expect(screen.getByRole('textbox', { name: 'Note for the agent' })).toBeTruthy();
  });

  it('rejecting a changed field with the mouse moves focus to the note and, if empty, back to the marker', async () => {
    const { proposal, ids } = richScenario();
    const h = await showReviewPanel(
      { proposals: [proposal] },
      { level: 'item', id: 'M1' },
    );
    const user = userEvent.setup();
    await user.click(nameMark());
    const pop = screen.getByRole('dialog');
    await user.click(within(pop).getByRole('button', { name: 'Reject: Name' }));
    await waitFor(() => expect(stateOf(h, ids.name)).toBe('rejected'));
    const box = within(pop).getByRole('textbox', { name: 'Note for the agent' });
    expect(document.activeElement).toBe(box);
    // Typing and leaving with the first Tab saves the note and takes focus out of the field.
    await user.type(box, 'The old name stays.');
    await user.tab();
    expect(document.activeElement).not.toBe(box);
    await waitFor(() =>
      expect(h.review.derived.notes.value.get(`change:${ids.name}`)?.[0]?.text).toBe(
        'The old name stays.',
      ),
    );
  });

  it('the change note stays in the proposal, shows below the field and in the marker name', async () => {
    const { proposal, ids } = richScenario();
    const h = await showReviewPanel(
      { proposals: [proposal] },
      { level: 'item', id: 'M1' },
    );
    const user = userEvent.setup();
    await user.click(nameMark());
    const pop = screen.getByRole('dialog');
    await user.click(within(pop).getByRole('button', { name: 'Reject: Name' }));
    const box = within(pop).getByRole('textbox', { name: 'Note for the agent' });
    await user.type(box, 'The old name was right.');
    await user.tab();
    await waitFor(() =>
      expect(h.review.derived.notes.value.get(`change:${ids.name}`)?.[0]?.text).toBe(
        'The old name was right.',
      ),
    );
    expect(nameMark().getAttribute('aria-label')).toMatch(/, with a note\./);
    // One line below the field, in the panel.
    const row = document.querySelector('.change-note-line') as HTMLElement;
    expect(row.textContent).toBe('The old name was right.');
  });

  it('rejecting via keyboard does not move focus: the note opens with Enter on the note button', async () => {
    const { proposal, ids } = richScenario();
    const h = await showReviewPanel(
      { proposals: [proposal] },
      { level: 'item', id: 'M1' },
    );
    const user = userEvent.setup();
    act(() => nameMark().focus());
    await user.tab();
    await user.tab();
    const reject = within(screen.getByRole('dialog')).getByRole('button', {
      name: 'Reject: Name',
    });
    expect(document.activeElement).toBe(reject);
    await user.keyboard('{Enter}');
    await waitFor(() => expect(stateOf(h, ids.name)).toBe('rejected'));
    expect(document.activeElement).toBe(reject);
    expect(screen.queryByRole('textbox', { name: 'Note for the agent' })).toBeNull();
    // The note opens via the note button (after Clear), with focus on the field.
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Clear' }));
    await user.tab();
    await user.keyboard('{Enter}');
    expect(document.activeElement).toBe(
      screen.getByRole('textbox', { name: 'Note for the agent' }),
    );
  });

  it('in the Current view the popover is the same and decides the same', async () => {
    const base = sampleProject();
    const proposal = propose(base, renameMarking(base, 'M1', 'Porta dianteira'));
    const h = await showReviewPanel(
      { project: base, proposals: [proposal] },
      { level: 'item', id: 'M1' },
    );
    act(() => h.review.setView('current'));
    fireEvent.click(nameMark());
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Accept: Name' }),
    );
    const id = proposal.changes[0]?.id ?? '';
    await waitFor(() => expect(stateOf(h, id)).toBe('accepted'));
  });
});
