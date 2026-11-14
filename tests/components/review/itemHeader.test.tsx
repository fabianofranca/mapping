import {
  act,
  cleanup,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  removeLayer,
  removeMarking,
  renameLayer,
  setMarkingLocked,
  type DecisionState,
} from '../../../src/model';
import { locale } from '../../../src/store/settings';
import { sampleProject } from '../../model/fixtures';
import { changeOf, propose } from '../../model/proposalFixtures';
import { richScenario } from '../../store/proposalHarness';
import { firstImport, showReviewPanel, type ReviewHarness } from './reviewHarness';

// The item header (phase 9.6, HANDOFF-REVIEW-DETAILS 5.4): the three-state decision with the
// text of each kind of item, the creation ("+ N annotations created"), the removal (what goes
// along), the "together" with Undo, the locked item and the invalid set with both exits.
// pt-BR kept: shared fixture data asserted by tests/store and tests/model (names Porta, Maçaneta, Vidros, Formulário from richScenario, sampleProject and firstImport)

beforeEach(() => {
  locale.value = 'en-US';
  localStorage.clear();
});
afterEach(cleanup);

const stateOf = (h: ReviewHarness, changeId: string): DecisionState | null =>
  h.review.derived.proposal.value?.decisions[changeId]?.state ?? null;

const header = () => screen.getByRole('region', { name: 'Decision' });

describe('item header', () => {
  it('changed marking: decides the whole item, with the text "Accept marking" and the counts', async () => {
    const { proposal, ids } = richScenario();
    const h = await showReviewPanel(
      { proposals: [proposal] },
      { level: 'item', id: 'M1' },
    );
    expect(within(header()).getByText('Marking changed')).toBeTruthy();
    const accept = within(header()).getByRole('button', {
      name: 'Accept marking: Porta',
    });
    expect(accept.textContent).toBe('Accept marking');
    expect(
      within(header()).getByRole('button', { name: 'Reject marking: Porta' })
        .textContent,
    ).toBe('Reject marking');
    expect(
      within(header()).getByText('0 accepted, 0 rejected, 1 undecided'),
    ).toBeTruthy();
    fireEvent.click(accept);
    await waitFor(() => expect(stateOf(h, ids.name)).toBe('accepted'));
    expect(
      within(header()).getByText('1 accepted, 0 rejected, 0 undecided'),
    ).toBeTruthy();
    // The field marker follows.
    expect(
      screen.getByRole('button', { name: /^Name: changed, accepted\./ }),
    ).toBeTruthy();
    // Pressing the marked button again goes back to "undecided".
    fireEvent.click(
      within(header()).getByRole('button', { name: /^Accept marking: / }),
    );
    await waitFor(() => expect(stateOf(h, ids.name)).toBeNull());
  });

  it('partial item: shows the state and the counts', async () => {
    const { base, proposal } = firstImport();
    const h = await showReviewPanel(
      { project: base, proposals: [proposal] },
      { level: 'item', id: 'M1' },
    );
    const annotation = changeOf(proposal, 'annotation', 'A1');
    await h.review.decide({ level: 'change', id: annotation.id }, 'rejected');
    await waitFor(() =>
      expect(h.review.derived.levels.value.get('item:M1')?.state).toBe('partial'),
    );
    expect(
      within(header()).getByText('0 accepted, 1 rejected, 1 undecided'),
    ).toBeTruthy();
    // Partial: neither of the two item buttons is pressed.
    expect(
      within(header())
        .getByRole('button', { name: 'Accept marking: Formulário' })
        .getAttribute('aria-pressed'),
    ).toBe('false');
    expect(
      within(header())
        .getByRole('button', { name: 'Reject marking: Formulário' })
        .getAttribute('aria-pressed'),
    ).toBe('false');
  });

  it('creation: "+ N annotations created", the help and the "Created by the proposal" seal', async () => {
    const { base, proposal } = firstImport();
    await showReviewPanel(
      { project: base, proposals: [proposal] },
      { level: 'item', id: 'M1' },
    );
    expect(within(header()).getByText('Marking created')).toBeTruthy();
    expect(within(header()).getByText('+ 1 annotation(s) created')).toBeTruthy();
    expect(
      within(header()).getByText(
        'Creating is one change: the fields marked + come in together.',
      ),
    ).toBeTruthy();
    expect(screen.getByText('Created by the proposal')).toBeTruthy();
    expect(
      within(header()).getByRole('button', { name: 'Accept marking: Formulário' })
        .textContent,
    ).toBe('Accept marking');
  });

  it('the created annotation has ✓ ✕ in its own header; rejected, it comes back as a card with the decision there', async () => {
    const { base, proposal } = firstImport();
    const h = await showReviewPanel(
      { project: base, proposals: [proposal] },
      { level: 'item', id: 'M1' },
    );
    const annotation = changeOf(proposal, 'annotation', 'A1');
    const card = () => document.querySelector('[data-annotation="A1"]') as HTMLElement;
    fireEvent.click(
      within(card()).getByRole('button', { name: /^Reject Annotation onClick created$/ }),
    );
    await waitFor(() => expect(stateOf(h, annotation.id)).toBe('rejected'));
    // The Proposed view does not have the rejected annotation: the card takes its place.
    expect(within(card()).getByText('Creation rejected')).toBeTruthy();
    expect(
      within(card()).getByRole('button', {
        name: /^Annotation onClick created: new, rejected/,
      }),
    ).toBeTruthy();
    // The marking was not decided together: the annotation only depends on it, not the other way around.
    expect(stateOf(h, changeOf(proposal, 'marking', 'M1').id)).toBeNull();
    // And the decision goes back to the annotation (the ✓ of the header; the click without
    // `detail` opened the suggested note in the popover, which also has an Accept).
    fireEvent.click(
      within(card().querySelector('.decision-control') as HTMLElement).getByRole(
        'button',
        { name: /^Accept Annotation onClick created$/ },
      ),
    );
    await waitFor(() => expect(stateOf(h, annotation.id)).toBe('accepted'));
    expect(within(card()).queryByText('Creation rejected')).toBeNull();
  });

  it('rejecting a creation takes the dependents along: "together" on the marker and the notice with Undo', async () => {
    const { base, proposal } = firstImport();
    const h = await showReviewPanel(
      { project: base, proposals: [proposal] },
      { level: 'item', id: 'M1' },
    );
    const marking = changeOf(proposal, 'marking', 'M1');
    const annotation = changeOf(proposal, 'annotation', 'A1');
    await act(async () => {
      await h.review.decide({ level: 'change', id: marking.id }, 'rejected');
    });
    expect(stateOf(h, annotation.id)).toBe('rejected');
    const notice = screen.getByText(/^1 change\(s\) rejected together: /);
    expect(notice.textContent).toContain('Annotation onClick created');
    expect(
      screen.getByRole('button', {
        name: /^Annotation onClick created: new, rejected, decided together/,
      }),
    ).toBeTruthy();
    fireEvent.click(
      within(notice.closest('.notice-box') as HTMLElement).getByRole('button', {
        name: 'Undo',
      }),
    );
    await waitFor(() => expect(stateOf(h, annotation.id)).toBeNull());
    expect(stateOf(h, marking.id)).toBeNull();
    expect(screen.queryByText(/rejected together/)).toBeNull();
  });

  it('removal: the name goes struck through, the header lists what goes along and rejecting brings the name back', async () => {
    const base = sampleProject();
    const proposal = propose(base, removeMarking(base, 'M1'));
    const h = await showReviewPanel(
      { project: base, proposals: [proposal] },
      { level: 'item', id: 'M1' },
    );
    expect(within(header()).getByText('Marking removed')).toBeTruthy();
    expect(document.querySelector('del.identity-name')?.textContent).toBe('Porta');
    expect(screen.getAllByText('Will be removed').length).toBeGreaterThan(0);
    // What goes along: the children (with a link) and the annotations per layer.
    expect(within(header()).getByText('Accepting also removes:')).toBeTruthy();
    fireEvent.click(within(header()).getByRole('button', { name: 'Maçaneta' }));
    expect(h.review.selected.value).toEqual({ level: 'item', id: 'M2' });
    act(() => h.review.select({ level: 'item', id: 'M1' }));
    expect(within(header()).getByText(/Vidros/)).toBeTruthy();
    expect(
      within(header()).getByRole('button', { name: 'Reject removal: Porta' })
        .textContent,
    ).toBe('Reject removal');

    // Rejected, the removal does not apply: the name is no longer struck through.
    fireEvent.click(
      within(header()).getByRole('button', { name: 'Reject removal: Porta' }),
    );
    await waitFor(() => expect(document.querySelector('del.identity-name')).toBeNull());
    expect(document.querySelector('strong.identity-name')?.textContent).toBe('Porta');
  });

  it('locked item: the seal, the notice and accepting is still allowed', async () => {
    const base = setMarkingLocked(sampleProject(), 'M4', true);
    const { proposal } = richScenario();
    await showReviewPanel(
      { project: base, proposals: [proposal] },
      { level: 'item', id: 'M4' },
    );
    expect(within(header()).getByText('Locked item')).toBeTruthy();
    expect(
      within(document.querySelector('.identity-flags') as HTMLElement).getByText(
        'Locked',
      ),
    ).toBeTruthy();
    expect(
      (
        within(header()).getByRole('button', {
          name: 'Accept marking: Unnamed marking',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false);
  });

  it('invalid set: the notice has both exits, the identity has the "Blocks applying" seal and the marker has the ring', async () => {
    const base = sampleProject();
    const proposal = propose(base, renameLayer(base, 'L2', 'Windows'));
    const h = await showReviewPanel(
      { project: removeLayer(base, 'L2'), proposals: [proposal] },
      { level: 'proposal', id: null },
    );
    await h.review.decide({ level: 'proposal', id: null }, 'accepted');
    const alert = await screen.findByRole('alert');
    expect(
      within(alert).getByText(
        'The target of this change (layer) no longer exists in the current project.',
      ),
    ).toBeTruthy();
    expect(screen.getByText('Blocks applying')).toBeTruthy();
    // One change on each side: the exits say which.
    const reject = within(alert).getByRole('button', { name: /^Reject: / });
    fireEvent.click(reject);
    await waitFor(() => expect(h.review.derived.validation.value?.ok).toBe(true));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('the marker of a field involved in the invalid set has the ring and says so in its name', async () => {
    const base = sampleProject();
    const proposal = propose(base, renameLayer(base, 'L2', 'Windows'));
    const h = await showReviewPanel(
      { project: removeLayer(base, 'L2'), proposals: [proposal] },
      { level: 'project', id: null },
    );
    await h.review.decide({ level: 'project', id: null }, 'accepted');
    const mark = await screen.findByRole('button', {
      name: /involved in the invalid set/,
    });
    expect(mark.classList.contains('is-invalid')).toBe(true);
  });
});
