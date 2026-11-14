import { act, cleanup, screen, waitFor, within } from '@testing-library/preact';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { CanvasController } from '../../../src/canvas/CanvasController';
import { createCanvasViewState } from '../../../src/canvas/viewState';
import { t } from '../../../src/i18n';
import { removeMarking } from '../../../src/model';
import { createEditorDerived } from '../../../src/store/derived';
import { createDisplayImages } from '../../../src/store/displayImages';
import { locale } from '../../../src/store/settings';
import { createEditorUi } from '../../../src/store/ui';
import { ProposalsWindow } from '../../../src/ui/review/ProposalsWindow';
import { ReviewBar } from '../../../src/ui/review/ReviewBar';
import { ReviewPanel } from '../../../src/ui/review/ReviewPanel';
import { installFakeCanvas } from '../../canvas/harness';
import { sampleProject } from '../../model/fixtures';
import { propose } from '../../model/proposalFixtures';
import {
  firstImport,
  openReviewHarness,
  renderInEditor,
  type ReviewHarness,
} from './reviewHarness';

// Return from the 8.2 gate (finding 7; R5.4a and R5.6 of the guide): between `store.apply`
// and the publication of `proposal.json` with `applied`, the review re-evaluated the
// accepted changes against a project that already had them. The screen showed "Apply
// blocked" with the raw id of the newly created layer and "The project changed since your
// last session". Here the write of `proposal.json` is held to look at the screen in the
// middle of the apply.

const frames: FrameRequestCallback[] = [];
const flushFrames = () => {
  while (frames.length > 0) for (const frame of frames.splice(0)) frame(0);
};

beforeAll(() => {
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    frames.push(cb);
    return frames.length;
  });
  vi.stubGlobal('cancelAnimationFrame', () => undefined);
});
afterAll(() => {
  vi.unstubAllGlobals();
});
beforeEach(() => {
  // On every test: the `vi.restoreAllMocks()` of `afterEach` undoes the fake 2D context.
  installFakeCanvas();
  locale.value = 'en-US';
  localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/** Holds the next write of `proposal.json` until `release()`. */
function holdProposalWrite(h: ReviewHarness) {
  const original = h.storage.writeProposal.bind(h.storage);
  let release: () => void = () => undefined;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let reachedNow: () => void = () => undefined;
  const reached = new Promise<void>((resolve) => {
    reachedNow = resolve;
  });
  vi.spyOn(h.storage, 'writeProposal').mockImplementationOnce(async (id, text) => {
    reachedNow();
    await held;
    return original(id, text);
  });
  return { reached, release };
}

/** Neither of the two false warnings on screen. */
function expectNoFalseWarnings() {
  expect(screen.queryByText(t('review.issue.title'))).toBeNull();
  expect(screen.queryByText(t('review.stale.title'))).toBeNull();
}

function renderReview(h: ReviewHarness) {
  renderInEditor(
    h,
    <>
      <ReviewBar onExit={() => {}} />
      <ReviewPanel onGoToAnnotation={() => {}} />
      <ProposalsWindow onHelp={() => {}} />
    </>,
  );
}

/** Clicks "Apply accepted" and waits for the write of `proposal.json` to start. */
async function applyAndHold(h: ReviewHarness) {
  const hold = holdProposalWrite(h);
  const bar = screen.getByRole('region', { name: 'Proposal review' });
  const button = within(bar).getByRole('button', { name: /Apply accepted · 1/ });
  act(() => button.click());
  await act(async () => {
    await hold.reached;
  });
  return { hold, bar };
}

describe('applying accepted changes without false warnings (return from the 8.2 gate)', () => {
  it('R5.4a: accept the Project group and apply; in the middle and at the end, without "Apply blocked" or "The project changed"', async () => {
    const { base, proposal } = firstImport();
    const h = await openReviewHarness({ project: base, proposals: [proposal] });
    expect(h.review.open('P1').ok).toBe(true);
    await h.review.decide({ level: 'project', id: null }, 'accepted');
    act(() => h.review.select({ level: 'project', id: null }));
    renderReview(h);
    expectNoFalseWarnings();

    const { hold, bar } = await applyAndHold(h);
    // The project already has the layer; the proposal does not yet say it was applied.
    // pt-BR kept: shared fixture data asserted by tests/components/review (layer name from firstImport)
    expect(h.session.store.committed.value?.layers.map((l) => l.name)).toContain(
      'Eventos',
    );
    expect(h.review.derived.proposal.value?.applied).toEqual({});
    expectNoFalseWarnings();
    // While applying, the button does not apply again and says why.
    const busy = within(bar).getByRole('button', { name: /Apply accepted/ });
    expect((busy as HTMLButtonElement).disabled).toBe(true);
    expect(busy.getAttribute('title')).toContain('Applying the accepted changes…');

    await act(async () => {
      hold.release();
      await h.session.proposals.settled();
    });
    await waitFor(() =>
      expect(Object.keys(h.review.derived.proposal.value?.applied ?? {})).toHaveLength(1),
    );
    expectNoFalseWarnings();
    // pt-BR kept: shared fixture data asserted by tests/components/review (layer name from firstImport)
    expect(h.session.store.committed.value?.layers.map((l) => l.name)).toContain(
      'Eventos',
    );
  });

  it('removal: the snapshot cites an item that already left the project; panel, levels and canvas draw without throwing', async () => {
    const base = sampleProject();
    const proposal = propose(base, removeMarking(base, 'M3'), {
      id: 'P1',
      title: 'Remove the lock',
    });
    const h = await openReviewHarness({ project: base, proposals: [proposal] });
    expect(h.review.open('P1').ok).toBe(true);
    await h.review.decide({ level: 'proposal', id: null }, 'accepted');
    act(() => h.review.select({ level: 'item', id: 'M3' }));
    renderReview(h);

    const ui = createEditorUi();
    const view = createCanvasViewState();
    const container = document.createElement('div');
    Object.defineProperty(container, 'clientWidth', { value: 380 });
    Object.defineProperty(container, 'clientHeight', { value: 700 });
    document.body.append(container);
    const controller = new CanvasController({
      container,
      store: h.session.store,
      actions: h.session.actions,
      display: createDisplayImages<ImageBitmap>(() => new Promise(() => undefined)),
      ui,
      derived: createEditorDerived(h.session.store, ui, h.review.derived.shownProject),
      view,
      review: h.review,
    });
    flushFrames();
    // Before applying: the panel of the marking that goes away, from the current project (Proposed view).
    expect(screen.getAllByText('Will be removed').length).toBeGreaterThan(0);

    const { hold } = await applyAndHold(h);
    // The marking already left the live project (and the preview): Details fall back to the
    // change panel ("Other changes") and the levels stay up.
    expect(h.session.store.committed.value?.markings.some((m) => m.id === 'M3')).toBe(
      false,
    );
    expect(() => flushFrames()).not.toThrow();
    expectNoFalseWarnings();
    expect(screen.getByRole('region', { name: 'Other changes' })).toBeTruthy();
    expect(screen.getByRole('tree', { name: 'Proposal levels' })).toBeTruthy();

    await act(async () => {
      hold.release();
      await h.session.proposals.settled();
    });
    await waitFor(() => expect(h.review.derived.proposal.value?.status).toBe('applied'));
    expect(() => flushFrames()).not.toThrow();
    expectNoFalseWarnings();
    controller.destroy();
    container.remove();
  });
});
