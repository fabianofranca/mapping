import { describe, expect, it } from 'vitest';
import {
  composingAnchor,
  selectedThreadId,
  selectThread,
  startComposing,
} from '../../src/store/threadUi';
import { createEditorUi } from '../../src/store/ui';
import { sampleProject } from '../model/fixtures';
import { sampleThread } from '../model/threadFixtures';

// Stage #940, decision 3 (item 42): changing the selection forgets the chosen thread and the draft.

const POINT = { kind: 'point', containerId: null, x: 5, y: 6 } as const;

describe('loose point thread and the selection', () => {
  it('the chosen thread does not come back when clicking an item and then the empty area', () => {
    const ui = createEditorUi();
    const project = sampleProject();
    selectThread(ui, project, sampleThread({ id: 'p', anchor: POINT }));
    expect(selectedThreadId(ui)).toBe('p');
    ui.selection.value = { kind: 'marking', id: 'M1' };
    ui.selection.value = null;
    expect(selectedThreadId(ui)).toBeNull();
  });

  it('the new thread draft does not come back, but the text stays in threadDrafts', () => {
    const ui = createEditorUi();
    const project = sampleProject();
    startComposing(ui, project, POINT);
    ui.threadDrafts.value = new Map([[`new:${JSON.stringify(POINT)}`, 'text']]);
    expect(composingAnchor(ui)).toEqual(POINT);
    ui.selection.value = { kind: 'marking', id: 'M1' };
    ui.selection.value = null;
    expect(composingAnchor(ui)).toBeNull();
    expect(ui.threadDrafts.value.get(`new:${JSON.stringify(POINT)}`)).toBe('text');
    startComposing(ui, project, POINT);
    expect(composingAnchor(ui)).toEqual(POINT);
  });
});
