import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CanvasController } from '../../../src/canvas/CanvasController';
import { t } from '../../../src/i18n';
import {
  addAnnotation,
  appendMessage,
  createMarking,
  openThread,
  setMarkingRect,
  type Proposal,
  type Thread,
} from '../../../src/model';
import { locale } from '../../../src/store/settings';
import { showToolWindow } from '../../../src/store/toolWindows';
import { QuickReviewBar } from '../../../src/ui/review/QuickReviewBar';
import { sampleProject } from '../../model/fixtures';
import { propose } from '../../model/proposalFixtures';
import { AGENT, HUMAN } from '../../model/threadFixtures';
import { openReviewHarness, renderInEditor } from './reviewHarness';

// The quick review bar (stage #1932, QR3, decisions 14 to 19): place, content, peek, keyboard,
// Accept, Reject and Review….

beforeEach(() => {
  localStorage.clear();
  locale.value = 'en-US';
});
afterEach(cleanup);

const base = sampleProject();
const BOX = { x: 100, y: 100, width: 120, height: 60 };

function creation(id = 'P1', markingId = 'M9'): Proposal {
  let after = createMarking(base, {
    id: markingId,
    containerId: 'I1',
    rect: { x: 10, y: 10, width: 100, height: 50 },
    name: 'Button',
  });
  after = addAnnotation(after, { id: `A-${id}`, markingId, layerId: 'L1' });
  return { ...propose(base, after, { id }), title: 'Add a button' };
}

function conversation(): Thread {
  const opened = openThread({
    id: 'T1',
    anchor: { kind: 'point', containerId: 'I1', x: 10, y: 10 },
    author: HUMAN,
    text: 'put a button here',
    at: '2026-11-19T10:00:00.000Z',
    messageId: 'm0',
  });
  return appendMessage(opened, {
    id: 'm1',
    author: AGENT,
    at: '2026-11-19T10:01:00.000Z',
    text: 'here it is',
    proposal: 'P1',
  });
}

async function open() {
  const h = await openReviewHarness({ proposals: [creation()] });
  await h.session.threads.create(conversation());
  const centerOnPoint = vi.fn();
  h.context.canvas.current = {
    centerOnPoint,
    centerSelection: vi.fn(),
  } as unknown as CanvasController;
  act(() => {
    h.ui.conversation.value = { kind: 'thread', id: 'T1' };
    showToolWindow('conversation');
    h.context.view.quickReviewBox.value = BOX;
    h.context.view.size.value = { width: 800, height: 600 };
  });
  renderInEditor(h, <QuickReviewBar />);
  return { ...h, centerOnPoint };
}

const group = () => screen.queryByRole('group', { name: /Quick review/ });

describe('QuickReviewBar', () => {
  it('exists only while there is a quick review', async () => {
    const h = await open();
    expect(group()).not.toBeNull();
    act(() => {
      h.context.view.quickReviewBox.value = null;
    });
    expect(group()).toBeNull();
  });

  it('shows the header, the agent, the counts and the hint', async () => {
    await open();
    const bar = group() as HTMLElement;
    expect(bar.textContent).toContain(t('review.quick.title'));
    expect(bar.textContent).toContain('Claude Code');
    expect(bar.textContent).toContain('1 marking created');
    expect(bar.textContent).toContain(t('review.quick.hint'));
  });

  it('puts the buttons in the order Show on the canvas, Reject, Review…, Accept', async () => {
    await open();
    const names = [...(group() as HTMLElement).querySelectorAll('button')].map(
      (b) => b.getAttribute('aria-label') ?? b.textContent,
    );
    expect(names).toEqual(['Show on the canvas', 'Reject', 'Review…', 'Accept']);
  });

  it('is placed below the box with the style object, inside the canvas area', async () => {
    await open();
    const bar = group() as HTMLElement;
    expect(bar.getAttribute('style')).toContain('left');
    expect(bar.style.top).not.toBe('');
  });

  it('peeks while the pointer or the focus is inside, and stops on leaving', async () => {
    const h = await open();
    const bar = group() as HTMLElement;
    fireEvent.pointerEnter(bar);
    expect(h.ui.quickPeek.value).toBe(true);
    expect(screen.getByText(t('review.quick.hintPeek'))).toBeTruthy();
    fireEvent.pointerLeave(bar);
    expect(h.ui.quickPeek.value).toBe(false);
    act(() => screen.getByRole('button', { name: 'Accept' }).focus());
    expect(h.ui.quickPeek.value).toBe(true);
    act(() => screen.getByRole('button', { name: 'Accept' }).blur());
    expect(h.ui.quickPeek.value).toBe(false);
  });

  it('the tag names the marking, and says how it looks during the peek', async () => {
    const h = await open();
    expect(screen.getByText('+ Button · proposal')).toBeTruthy();
    act(() => {
      h.ui.quickPeek.value = true;
    });
    expect(screen.getByText(t('review.quick.tagPeek'))).toBeTruthy();
  });

  it('Show on the canvas centers the view on the box', async () => {
    const h = await open();
    await userEvent.click(screen.getByRole('button', { name: 'Show on the canvas' }));
    expect(h.centerOnPoint).toHaveBeenCalledTimes(1);
  });

  it('has a polite live region that says the proposal is on the canvas', async () => {
    await open();
    expect(screen.getByRole('status').textContent).toBe(
      'Proposal on the canvas: Add a button',
    );
  });

  it('Reject hides the ghost and focuses the composer', async () => {
    const field = document.createElement('div');
    field.tabIndex = 0;
    field.setAttribute('data-composer-field', '');
    const win = document.createElement('div');
    win.setAttribute('data-window', 'conversation');
    win.append(field);
    document.body.append(win);
    const h = await open();
    await userEvent.click(screen.getByRole('button', { name: 'Reject' }));
    expect(h.ui.quickDismissed.value.get('P1')).toBe(0);
    await waitFor(() => expect(document.activeElement).toBe(field));
    win.remove();
  });

  it('Esc with the focus in the bar rejects', async () => {
    const h = await open();
    screen.getByRole('button', { name: 'Accept' }).focus();
    await userEvent.keyboard('{Escape}');
    expect(h.ui.quickDismissed.value.has('P1')).toBe(true);
  });

  it('Enter on Reject only rejects, it never accepts', async () => {
    const h = await open();
    screen.getByRole('button', { name: 'Reject' }).focus();
    await userEvent.keyboard('{Enter}');
    expect(h.ui.quickDismissed.value.has('P1')).toBe(true);
    expect(h.session.store.committed.peek()?.markings.some((m) => m.id === 'M9')).toBe(
      false,
    );
  });

  it('Accept applies the proposal and shows the toast', async () => {
    const h = await open();
    await userEvent.click(screen.getByRole('button', { name: 'Accept' }));
    await waitFor(() =>
      expect(h.session.store.committed.peek()?.markings.some((m) => m.id === 'M9')).toBe(
        true,
      ),
    );
    expect(h.ui.toast.value).toBe('Proposal applied: “Add a button”. Undo with Ctrl+Z.');
  });

  it('Review… opens the proposal in the review', async () => {
    const h = await open();
    await userEvent.click(screen.getByRole('button', { name: 'Review…' }));
    expect(h.review.proposalId.value).toBe('P1');
  });

  it('a blocked quick review offers only Show on the canvas and Review…, with the reason', async () => {
    const moved = setMarkingRect(base, 'M2', {
      x: 1210,
      y: 1210,
      width: 400,
      height: 200,
    });
    const h = await openReviewHarness({
      proposals: [{ ...propose(base, moved, { id: 'P1' }), title: 'Move' }],
    });
    await h.session.threads.create(conversation());
    act(() => {
      h.ui.conversation.value = { kind: 'thread', id: 'T1' };
      showToolWindow('conversation');
      h.context.view.quickReviewBox.value = BOX;
    });
    act(() => {
      h.session.actions.setMarkingLocked('M2', true);
    });
    renderInEditor(h, <QuickReviewBar />);
    const names = [...(group() as HTMLElement).querySelectorAll('button')].map(
      (b) => b.getAttribute('aria-label') ?? b.textContent,
    );
    expect(names).toEqual(['Show on the canvas', 'Review…']);
    expect(screen.getByText(t('review.quick.block.locked'))).toBeTruthy();
  });
});
