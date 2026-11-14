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

// Stage #515 (FN1, #497 part 1): leaving the review removes the clicked button from the
// screen. Focus goes to the proposal button in the Proposals window (the one that opened the
// review), or to the canvas if the window is not open; never to the body.

beforeEach(() => {
  locale.value = 'en-US';
  localStorage.clear();
});
afterEach(cleanup);

const noop = () => {};

// The real window swaps the review tree for the list when the review closes: the list only
// enters the DOM after the render following `review.close()` (FN1 finding 1).
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
        <button type="button">canvas control</button>
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

describe('Exiting the review: focus does not go to the body', () => {
  it('via the button, with Proposals open → the proposal button (Continue/Review)', async () => {
    const h = await mount({ accepted: false, withList: true });
    const exit = screen.getByRole('button', { name: 'Exit review' });
    exit.focus();
    fireEvent.click(exit);
    await waitFor(() => expect(h.review.proposalId.value).toBeNull());
    expect(rowAction()).not.toBeNull();
    expect(document.activeElement).toBe(rowAction());
  });

  it('via the button, without the Proposals window → the canvas', async () => {
    const h = await mount({ accepted: false, withList: false });
    const exit = screen.getByRole('button', { name: 'Exit review' });
    exit.focus();
    fireEvent.click(exit);
    await waitFor(() => expect(h.review.proposalId.value).toBeNull());
    expect(document.activeElement).toBe(canvas());
  });

  it('via the dialog (Exit anyway), with Proposals open → the proposal button', async () => {
    const h = await mount({ accepted: true, withList: true });
    const exit = screen.getByRole('button', { name: 'Exit review' });
    exit.focus();
    fireEvent.click(exit);
    const confirm = await screen.findByRole('button', { name: 'Exit anyway' });
    confirm.focus();
    fireEvent.click(confirm);
    await waitFor(() => expect(h.review.proposalId.value).toBeNull());
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(document.activeElement).toBe(rowAction());
  });

  it('via the dialog, without the Proposals window → the canvas', async () => {
    const h = await mount({ accepted: true, withList: false });
    const exit = screen.getByRole('button', { name: 'Exit review' });
    exit.focus();
    fireEvent.click(exit);
    const confirm = await screen.findByRole('button', { name: 'Exit anyway' });
    confirm.focus();
    fireEvent.click(confirm);
    await waitFor(() => expect(h.review.proposalId.value).toBeNull());
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(document.activeElement).toBe(canvas());
  });

  it('via the button, with the real Proposals window (swaps the tree for the list) → the proposal button', async () => {
    const { base, proposal } = richScenario();
    void base;
    const h = await openReviewHarness({ proposals: [proposal] });
    h.review.open('P1');
    renderInEditor(h, <RealShell />);
    const exit = screen.getByRole('button', { name: 'Exit review' });
    exit.focus();
    fireEvent.click(exit);
    await waitFor(() => expect(rowAction()).not.toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(rowAction()));
  });
});
