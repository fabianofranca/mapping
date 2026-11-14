import { act, cleanup, fireEvent, screen, within } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Change, Proposal, ProposalRevision } from '../../../src/model';
import { locale } from '../../../src/store/settings';
import { ChangePopover } from '../../../src/ui/review/ChangePopover';
import { ReviewPanel } from '../../../src/ui/review/ReviewPanel';
import { NEW_IMAGE_PATH, richScenario } from '../../store/proposalHarness';
import { openReviewHarness, renderInEditor } from './reviewHarness';
import { REVISED_AT, revisedScenario } from './revisedFixture';

// "Before the revision" block in the popover of the revised change (stage #644, CP3): what
// the agent had proposed and the earlier decision; only fields that differ in a creation;
// image file with name and size; nothing for the new change.

beforeEach(() => {
  locale.value = 'en-US';
  localStorage.clear();
});
afterEach(cleanup);

/** Replaces the proposal's revision with the given one (`changed`/`added`), with extra changes. */
function withRevision(
  proposal: Proposal,
  revision: Partial<ProposalRevision>,
  extra: readonly Change[] = [],
): Proposal {
  return {
    ...proposal,
    formatVersion: 5,
    changes: [...proposal.changes, ...extra],
    revisions: [
      {
        at: REVISED_AT,
        baseRevision: 0,
        operations: [],
        changed: {},
        added: [],
        dropped: [],
        ...revision,
      },
    ],
  };
}

async function openPopover(proposal: Proposal, changeId: string, field: string) {
  const h = await openReviewHarness({
    proposals: [proposal],
    files: { [NEW_IMAGE_PATH]: 'image' },
  });
  expect(h.review.open('P1')).toMatchObject({ ok: true });
  const change = proposal.changes.find((c) => c.id === changeId);
  if (!change) throw new Error('unknown change');
  renderInEditor(
    h,
    <ChangePopover subject={{ change, field, part: false }} close={() => {}} />,
  );
  return h;
}

describe('Before the revision: replaced change', () => {
  it('shows what the agent had proposed and "No decision"', async () => {
    const { proposal, changedId } = revisedScenario();
    await openPopover(proposal, changedId, 'name');
    expect(screen.getByText('Before the revision')).toBeTruthy();
    const block = document.querySelector('.revised-before') as HTMLElement;
    expect(within(block).getByText('The agent had proposed')).toBeTruthy();
    // pt-BR kept: shared fixture data (name 'Porta dianteira') asserted by tests/store and tests/components
    expect(within(block).getByText('Porta dianteira')).toBeTruthy();
    expect(within(block).getByText('No decision')).toBeTruthy();
  });

  it('the earlier "rejected" decision becomes "You had rejected"', async () => {
    const { proposal, changedId } = revisedScenario();
    const rejected = withRevision(proposal, {
      changed: { [changedId]: { to: 'Porta dianteira', state: 'rejected' } },
    });
    await openPopover(rejected, changedId, 'name');
    const block = document.querySelector('.revised-before') as HTMLElement;
    expect(within(block).getByText('You had rejected')).toBeTruthy();
    expect(within(block).queryByText('No decision')).toBeNull();
  });

  it('the change new in the revision has no block', async () => {
    const { proposal, addedId } = revisedScenario();
    await openPopover(proposal, addedId, 'name');
    expect(screen.queryByText('Before the revision')).toBeNull();
  });

  it('once decided, the change loses its mark and the block disappears', async () => {
    const { proposal, changedId } = revisedScenario();
    const h = await openPopover(proposal, changedId, 'name');
    expect(screen.getByText('Before the revision')).toBeTruthy();
    await act(async () => {
      await h.review.decide({ level: 'change', id: changedId }, 'accepted');
    });
    expect(screen.queryByText('Before the revision')).toBeNull();
  });
});

describe('Before the revision: creation and image', () => {
  it('in a creation shows only the fields that differ from the current one', async () => {
    const { proposal, ids } = richScenario();
    const created = proposal.changes.find((c) => c.id === ids.marking) as Change;
    const to = created.to as Record<string, unknown>;
    const old = { ...to, name: 'Old button' };
    const revised = withRevision(proposal, {
      changed: { [created.id]: { to: old as never, state: null } },
    });
    await openPopover(revised, created.id, '');
    const block = document.querySelector('.revised-before') as HTMLElement;
    expect(within(block).getByText('The agent had proposed')).toBeTruthy();
    expect(within(block).getByText('Old button')).toBeTruthy();
    // The field equal to the current one is not repeated.
    expect(within(block).queryByText('Position')).toBeNull();
    expect(within(block).getAllByRole('term')).toHaveLength(1);
  });

  it('in an image file swap shows the name and the size; without a size, only the name', async () => {
    const { proposal } = richScenario();
    const swap: Change = {
      id: 'cx',
      kind: 'update',
      entity: 'image',
      entityId: 'I1',
      imageId: 'I1',
      markingId: null,
      field: 'file',
      from: { file: 'images/old.webp', width: 800, height: 600 },
      to: { file: 'images/nova2.webp', width: 1024, height: 768 },
    };
    const withSize = withRevision(
      proposal,
      {
        changed: {
          cx: { to: { file: 'images/v1.webp', width: 640, height: 480 }, state: null },
        },
      },
      [swap],
    );
    await openPopover(withSize, 'cx', 'file');
    const block = document.querySelector('.revised-before') as HTMLElement;
    expect(block.textContent).toContain('images/v1.webp (640 × 480 px)');
    cleanup();
    const noSize = withRevision(
      proposal,
      { changed: { cx: { to: { file: 'images/v1.webp' }, state: null } } },
      [swap],
    );
    await openPopover(noSize, 'cx', 'file');
    const plain = document.querySelector('.revised-before') as HTMLElement;
    expect(plain.textContent).toContain('images/v1.webp');
    expect(plain.textContent).not.toContain('×');
  });
});

describe('Before the revision in the item panel', () => {
  it('the popover of the replaced field opens with the block', async () => {
    const { proposal } = revisedScenario();
    const h = await openReviewHarness({ proposals: [proposal] });
    h.review.open('P1');
    act(() => h.review.select({ level: 'item', id: 'M1' }));
    renderInEditor(h, <ReviewPanel onGoToAnnotation={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /^Name: changed/ }));
    expect(screen.getByText('Before the revision')).toBeTruthy();
  });
});
