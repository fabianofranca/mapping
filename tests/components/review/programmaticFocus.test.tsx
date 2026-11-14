import { cleanup, render, screen } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  TOOL_WINDOWS,
  hideToolWindow,
  openWindowOf,
  openWindowsOf,
  showToolWindow,
  type ToolWindowId,
} from '../../../src/store/toolWindows';
import { locale } from '../../../src/store/settings';
import { EditorContext } from '../../../src/ui/EditorContext';
import { ToolStrip } from '../../../src/ui/ToolStrip';
import { ToolWindow } from '../../../src/ui/ToolWindow';
import { closeToolWindow } from '../../../src/ui/toolWindowLayout';
import { useReviewCommands } from '../../../src/ui/review/useReviewCommands';
import { useShowProblem } from '../../../src/ui/review/useReview';
import { richScenario } from '../../store/proposalHarness';
import { openReviewHarness, type ReviewHarness } from './reviewHarness';

// Stage #323 (FC1): whoever opens the review from code (list button, notice, status bar,
// "show the problem") keeps the origin focus, like the strip and the shortcut. Closing
// Details or Proposals returns focus to whoever opened it → strip button, never the body.

function Shell({ extra }: { readonly extra: preact.ComponentChildren }) {
  const windows = [...openWindowsOf('left'), ...openWindowsOf('right')];
  const bottom = openWindowOf('bottom');
  if (bottom) windows.push(bottom);
  return (
    <>
      <ToolStrip side="left" />
      <main data-canvas-area tabIndex={-1} aria-label="canvas">
        {extra}
      </main>
      {windows.map((id) => (
        <ToolWindow key={id} id={id}>
          <button type="button">control {id}</button>
        </ToolWindow>
      ))}
      <ToolStrip side="right" />
    </>
  );
}

function Openers() {
  const { openReview } = useReviewCommands();
  const showProblem = useShowProblem();
  return (
    <>
      <button type="button" onClick={() => openReview('P1')}>
        open review
      </button>
      <button type="button" onClick={showProblem}>
        show problem
      </button>
    </>
  );
}

const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
const active = () => document.activeElement;
const stripButton = (id: ToolWindowId) =>
  document.querySelector<HTMLElement>(`[data-strip-window="${id}"]`);
const control = (id: ToolWindowId) =>
  screen.getByRole('button', { name: `control ${id}` });
const opener = (name: string) => screen.getByRole('button', { name });

async function mount(): Promise<ReviewHarness> {
  const { proposal } = richScenario();
  const h = await openReviewHarness({ proposals: [proposal] });
  render(
    <EditorContext.Provider value={h.context}>
      <Shell extra={<Openers />} />
    </EditorContext.Provider>,
  );
  return h;
}

/** Clicks the button (focus on it), runs `act` and redraws the Shell with the windows open. */
function press(h: ReviewHarness, name: string) {
  const button = opener(name);
  button.focus();
  button.click();
  return button;
}

function remount(h: ReviewHarness, extra = <Openers />) {
  cleanup();
  render(
    <EditorContext.Provider value={h.context}>
      <Shell extra={extra} />
    </EditorContext.Provider>,
  );
}

beforeEach(() => {
  locale.value = 'en-US';
  localStorage.clear();
  for (const id of TOOL_WINDOWS) hideToolWindow(id);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('review opened from code returns focus on closing', () => {
  it.each(['details', 'proposals'] as const)(
    'opening the review via the button, focusing in %s and closing → the button that opened it',
    async (id) => {
      const h = await mount();
      const button = press(h, 'open review');
      remount(h);
      const again = opener('open review');
      expect(again).not.toBe(button);
      // The stored origin is the button of the first mount; it left the DOM, so the
      // fallback return is the strip button.
      control(id).focus();
      closeToolWindow(id);
      await settle();
      expect(active()).toBe(stripButton(id));
    },
  );

  it('with the button still in the DOM, focus returns to it', async () => {
    const h = await mount();
    const button = press(h, 'open review');
    await settle();
    control('details').focus();
    closeToolWindow('details');
    await settle();
    expect(active()).toBe(button);
    control('proposals').focus();
    closeToolWindow('proposals');
    await settle();
    expect(active()).toBe(button);
  });

  it('useShowProblem: Proposals and Details return focus to whoever opened them', async () => {
    const h = await mount();
    h.review.open('P1');
    const first = h.review.derived.proposal.peek()?.changes[0];
    if (!first) throw new Error('no change');
    vi.spyOn(h.review.derived.invalid, 'peek').mockReturnValue({
      changeIds: new Set([first.id]),
      related: new Set<string>(),
    });
    for (const id of ['details', 'proposals'] as const) {
      for (const other of TOOL_WINDOWS) hideToolWindow(other);
      remount(h);
      const button = opener('show problem');
      button.focus();
      button.click();
      await settle();
      control(id).focus();
      closeToolWindow(id);
      await settle();
      expect(active()).toBe(button);
    }
  });

  it('opening the review from the List swaps the List for Proposals and focus goes to the active tab', async () => {
    const h = await mount();
    showToolWindow('list');
    remount(h);
    // Focus inside the List at the time of the call (the command comes from its content).
    control('list').focus();
    opener('open review').click();
    await settle();
    expect(active()).not.toBe(document.body);
    expect(active()?.getAttribute('role')).toBe('tab');
    expect(active()?.getAttribute('aria-selected')).toBe('true');
  });
});
