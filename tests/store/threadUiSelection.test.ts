import { beforeEach, describe, expect, it } from 'vitest';
import {
  activatePin,
  composingAnchor,
  placeComment,
  selectedThreadId,
  selectThread,
  startComposing,
} from '../../src/store/threadUi';
import { hideToolWindow, isToolWindowOpen } from '../../src/store/toolWindows';
import { createEditorUi } from '../../src/store/ui';
import { sampleProject } from '../model/fixtures';
import { sampleThread } from '../model/threadFixtures';

// Stage #1881, CV2 (decisions 6 and 7): `ui.conversation` is the Conversation window's own
// state. The opening functions set it and open the window; the selection does not change it.

const POINT = { kind: 'point', containerId: null, x: 5, y: 6 } as const;
const MARKING = { kind: 'marking', id: 'M1' } as const;

beforeEach(() => hideToolWindow('conversation'));

describe('opening a conversation', () => {
  it('selectThread sets the conversation and opens the window', () => {
    const ui = createEditorUi();
    selectThread(ui, sampleProject(), sampleThread({ id: 'p', anchor: POINT }));
    expect(ui.conversation.value).toEqual({ kind: 'thread', id: 'p' });
    expect(selectedThreadId(ui)).toBe('p');
    expect(isToolWindowOpen('conversation')).toBe(true);
  });

  it('startComposing sets a new-conversation target and opens the window', () => {
    const ui = createEditorUi();
    startComposing(ui, sampleProject(), POINT);
    expect(ui.conversation.value).toEqual({ kind: 'new', anchor: POINT });
    expect(composingAnchor(ui)).toEqual(POINT);
    expect(isToolWindowOpen('conversation')).toBe(true);
  });

  it('placeComment opens the draft in the window', () => {
    const ui = createEditorUi();
    placeComment(ui, sampleProject(), MARKING);
    expect(composingAnchor(ui)).toEqual(MARKING);
    expect(isToolWindowOpen('conversation')).toBe(true);
  });

  it('activatePin with one conversation opens it; with several, leaves the window alone', () => {
    const ui = createEditorUi();
    const project = sampleProject();
    const a = sampleThread({ id: 'a', anchor: MARKING });
    const b = sampleThread({ id: 'b', anchor: MARKING });
    activatePin(ui, project, [a, b]);
    expect(ui.conversation.value).toBeNull();
    expect(isToolWindowOpen('conversation')).toBe(false);
    activatePin(ui, project, [a]);
    expect(selectedThreadId(ui)).toBe('a');
    expect(isToolWindowOpen('conversation')).toBe(true);
  });
});

describe('the window does not follow the selection', () => {
  it('the conversation stays when the selection changes', () => {
    const ui = createEditorUi();
    selectThread(ui, sampleProject(), sampleThread({ id: 'p', anchor: POINT }));
    ui.selection.value = { kind: 'marking', id: 'M1' };
    ui.selection.value = null;
    expect(selectedThreadId(ui)).toBe('p');
  });

  it('the new draft and its text stay when the selection changes', () => {
    const ui = createEditorUi();
    startComposing(ui, sampleProject(), POINT);
    ui.threadDrafts.value = new Map([[`new:${JSON.stringify(POINT)}`, 'text']]);
    ui.selection.value = { kind: 'marking', id: 'M1' };
    ui.selection.value = null;
    expect(composingAnchor(ui)).toEqual(POINT);
    expect(ui.threadDrafts.value.get(`new:${JSON.stringify(POINT)}`)).toBe('text');
  });

  it('asking again for the same anchor creates a new target object (focus request)', () => {
    const ui = createEditorUi();
    startComposing(ui, sampleProject(), POINT);
    const first = ui.conversation.value;
    startComposing(ui, sampleProject(), POINT);
    expect(ui.conversation.value).not.toBe(first);
  });
});
