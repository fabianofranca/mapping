import { signal } from '@preact/signals';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Thread } from '../../src/model';
import { createEditorDerived } from '../../src/store/derived';
import { createProjectStore } from '../../src/store/history';
import { createEditorUi } from '../../src/store/ui';
import {
  armComment,
  cancelComment,
  composingAnchor,
  placeComment,
  selectThread,
  startComposing,
} from '../../src/store/threadUi';
import { sampleProject } from '../model/fixtures';
import { AGENT, HUMAN, T0, T1, message, sampleThread } from '../model/threadFixtures';

// Pin visibility and the Comment button (CM4, decisions 24 and 25): UI-only state.

const NOW = '2026-11-06T12:00:00.000Z';
const OPEN: Thread = sampleThread({
  id: 'a',
  anchor: { kind: 'marking', id: 'M1' },
  messages: [message('a1', T0, HUMAN, 'oi'), message('a2', T1, AGENT, 'ok')],
});
const OTHER: Thread = sampleThread({
  id: 'b',
  anchor: { kind: 'marking', id: 'M2' },
  messages: [message('b1', T0, HUMAN, 'and now?')],
});
const DONE: Thread = sampleThread({
  id: 'r',
  anchor: { kind: 'marking', id: 'M4' },
  resolved: { by: { name: 'Marina', email: 'marina@example.com' }, at: T1 },
});

function setup(threads: readonly Thread[]) {
  const store = createProjectStore({ now: () => NOW });
  const project = sampleProject();
  store.load(project, { readOnly: false });
  const ui = createEditorUi();
  const derived = createEditorDerived(store, ui, undefined, undefined, {
    threads: signal(threads),
    copyId: null,
    identity: signal(null),
  });
  return { store, project, ui, derived };
}

beforeEach(() => localStorage.clear());
afterEach(() => localStorage.clear());

describe('pin visibility', () => {
  it('is born off, without arming anything, and is never saved', () => {
    const { ui, derived } = setup([OPEN, OTHER]);
    expect(ui.commentPins.value).toBe(false);
    expect(ui.commentArm.value).toBeNull();
    expect(derived.threads.pins.value).toEqual([]);
    ui.commentPins.value = true;
    expect(localStorage.length).toBe(0);
  });

  it('on, shows the pin of each item with an open conversation; the resolved one stays out', () => {
    const { ui, derived } = setup([OPEN, OTHER, DONE]);
    ui.commentPins.value = true;
    const hosts = derived.threads.pins.value.map((g) => g.hostKey).sort();
    expect(hosts).toEqual(['marking:M1', 'marking:M2']);
  });

  it('off, the selected conversation shows only its own pin', () => {
    const { ui, project, derived } = setup([OPEN, OTHER]);
    selectThread(ui, project, OPEN);
    expect(derived.threads.pins.value.map((g) => g.hostKey)).toEqual(['marking:M1']);
  });

  it('the selected resolved one has a pin, even with the pins off', () => {
    const { ui, project, derived } = setup([OPEN, DONE]);
    selectThread(ui, project, DONE);
    expect(derived.threads.pins.value.map((g) => g.hostKey)).toEqual(['marking:M4']);
    expect(derived.threads.pins.value[0]?.color).toBe('resolved');
  });

  it('the unread dot enters the group', () => {
    const store = createProjectStore({ now: () => NOW });
    store.load(sampleProject(), { readOnly: false });
    const ui = createEditorUi();
    const derived = createEditorDerived(store, ui, undefined, undefined, {
      threads: signal([OPEN]),
      copyId: 'copy',
      identity: signal({ name: 'Marina', email: 'marina@example.com' }),
    });
    ui.commentPins.value = true;
    // The last message is from the agent and was never read on this device.
    expect(derived.threads.pins.value[0]?.hasUnread).toBe(true);
  });

  it('New conversation (draft) turns on the visibility', () => {
    const { ui, project } = setup([]);
    startComposing(ui, project, { kind: 'marking', id: 'M1' });
    expect(ui.commentPins.value).toBe(true);
  });
});

describe('Comment button: arm, place and cancel', () => {
  it('arming turns on the visibility, keeps the previous tool and goes back to Navigate', () => {
    const { ui } = setup([]);
    ui.mode.value = 'draw';
    armComment(ui);
    expect(ui.commentPins.value).toBe(true);
    expect(ui.commentArm.value).toEqual({ mode: 'draw' });
    expect(ui.mode.value).toBe('navigate');
  });

  it('Esc cancels: goes back to the previous tool and keeps the visibility', () => {
    const { ui } = setup([]);
    ui.mode.value = 'draw';
    armComment(ui);
    expect(cancelComment(ui)).toBe(true);
    expect(ui.commentArm.value).toBeNull();
    expect(ui.mode.value).toBe('draw');
    expect(cancelComment(ui)).toBe(false);
  });

  it('the click opens the draft on the item and goes back to the previous tool', () => {
    const { ui, project } = setup([]);
    ui.mode.value = 'draw';
    armComment(ui);
    placeComment(ui, project, { kind: 'marking', id: 'M2' });
    expect(composingAnchor(ui)).toEqual({ kind: 'marking', id: 'M2' });
    expect(ui.selection.value).toEqual({ kind: 'marking', id: 'M2' });
    expect(ui.commentArm.value).toBeNull();
    expect(ui.mode.value).toBe('draw');
  });

  it('on an empty spot, the draft stays at a point and nothing is saved', () => {
    const { ui, project } = setup([]);
    armComment(ui);
    const point = { kind: 'point', containerId: 'I1', x: 10, y: 20 } as const;
    placeComment(ui, project, point);
    expect(composingAnchor(ui)).toEqual(point);
    expect(ui.selection.value).toBeNull();
    expect(localStorage.length).toBe(0);
  });
});
