import { act, cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CommentButton, PinsButton } from '../../src/app/EditorTools';
import { t } from '../../src/i18n';
import type { Thread } from '../../src/model';
import { clearIdentity, setIdentity } from '../../src/store/identity';
import { locale } from '../../src/store/settings';
import { composingAnchor } from '../../src/store/threadUi';
import { CanvasContextMenu } from '../../src/ui/CanvasContextMenu';
import { EditorContext } from '../../src/ui/EditorContext';
import { sampleProject } from '../model/fixtures';
import { AGENT, HUMAN, T0, T1, message, sampleThread } from '../model/threadFixtures';
import { createHarness, type Harness } from './harness';

// Threads and Comment buttons and the Comment / Comment here menu items (CM4, decisions 24 and 25).

const WAITING_HUMAN: Thread = sampleThread({
  id: 'h',
  anchor: { kind: 'marking', id: 'M1' },
  messages: [message('h1', T0, HUMAN, 'hi'), message('h2', T1, AGENT, 'and then?')],
});

async function setup(threads: readonly Thread[] = [], readOnly = false) {
  const h = createHarness(sampleProject(), readOnly);
  for (const th of threads) await h.context.session.threads.create(th);
  return h;
}

function mount(h: Harness, ui: preact.ComponentChildren) {
  return render(<EditorContext.Provider value={h.context}>{ui}</EditorContext.Provider>);
}

beforeEach(() => {
  localStorage.clear();
  clearIdentity();
  setIdentity('Marina Alves', 'marina@example.com');
  locale.value = 'en-US';
});
afterEach(cleanup);

describe('Threads button', () => {
  it('turns the pins on and off, with aria-pressed', async () => {
    const h = await setup();
    mount(h, <PinsButton />);
    const button = screen.getByRole('button', { name: t('comments.pins') });
    expect(button.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(button);
    expect(h.ui.commentPins.value).toBe(true);
    expect(button.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(button);
    expect(h.ui.commentPins.value).toBe(false);
  });

  it('when off, shows the count of threads awaiting a human', async () => {
    const h = await setup([WAITING_HUMAN]);
    const { container } = mount(h, <PinsButton />);
    expect(container.querySelector('.icon-button-badge')?.textContent).toBe('1');
    // When on, the count disappears (the pins already show it).
    act(() => {
      h.ui.commentPins.value = true;
    });
    expect(container.querySelector('.icon-button-badge')).toBeNull();
  });

  it('with no thread waiting, shows no count', async () => {
    const h = await setup();
    const { container } = mount(h, <PinsButton />);
    expect(container.querySelector('.icon-button-badge')).toBeNull();
  });
});

describe('Comment button', () => {
  it('turns the pins on and arms the click; again, disarms', async () => {
    const h = await setup();
    mount(h, <CommentButton />);
    const button = screen.getByRole('button', { name: t('comments.add') });
    fireEvent.click(button);
    expect(h.ui.commentPins.value).toBe(true);
    expect(h.ui.commentArm.value).not.toBeNull();
    expect(button.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(button);
    expect(h.ui.commentArm.value).toBeNull();
  });

  it('is disabled in read-only', async () => {
    const h = await setup([], true);
    mount(h, <CommentButton />);
    expect(
      screen.getByRole('button', { name: t('comments.add') }).hasAttribute('disabled'),
    ).toBe(true);
  });

  it('is disabled in view mode', async () => {
    const h = await setup();
    h.ui.viewMode.value = true;
    mount(h, <CommentButton />);
    expect(
      screen.getByRole('button', { name: t('comments.add') }).hasAttribute('disabled'),
    ).toBe(true);
  });
});

describe('canvas context menu', () => {
  it('Comment here, on an empty spot, opens the draft at the point without saving', async () => {
    const h = await setup();
    const here = { kind: 'point', containerId: null, x: 5, y: 6 } as const;
    h.ui.canvasMenu.value = { x: 10, y: 10, target: null, comment: null, here };
    mount(h, <CanvasContextMenu />);
    fireEvent.click(screen.getByRole('menuitem', { name: t('comments.here') }));
    expect(composingAnchor(h.ui)).toEqual(here);
    expect(h.ui.commentPins.value).toBe(true);
    expect(h.ui.canvasMenu.value).toBeNull();
    expect(h.context.session.threads.list.peek()).toHaveLength(0);
  });

  it('Comment, on an item, opens the draft anchored to it', async () => {
    const h = await setup();
    h.ui.canvasMenu.value = {
      x: 10,
      y: 10,
      target: { kind: 'm', id: 'M1' },
      comment: { kind: 'marking', id: 'M1' },
      here: null,
    };
    mount(h, <CanvasContextMenu />);
    expect(screen.queryByRole('menuitem', { name: t('comments.here') })).toBeNull();
    fireEvent.click(screen.getByRole('menuitem', { name: t('comments.comment') }));
    expect(composingAnchor(h.ui)).toEqual({ kind: 'marking', id: 'M1' });
  });

  it('the items are disabled in read-only', async () => {
    const h = await setup([], true);
    h.ui.canvasMenu.value = {
      x: 10,
      y: 10,
      target: null,
      comment: null,
      here: { kind: 'point', containerId: null, x: 1, y: 2 },
    };
    mount(h, <CanvasContextMenu />);
    expect(
      screen.getByRole('menuitem', { name: t('comments.here') }).hasAttribute('disabled'),
    ).toBe(true);
  });
});
