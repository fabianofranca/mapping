import { signal } from '@preact/signals';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { derivedFor } from './threadPageHarness';
import { canvasMenuAt, tapComment } from '../../src/canvas/input/commentPointer';
import { composingAnchor, armComment } from '../../src/store/threadUi';
import { createProjectStore } from '../../src/store/history';
import { createEditorUi } from '../../src/store/ui';
import { sampleThread } from '../model/threadFixtures';
import { pagesProject } from './pageHarness';

// Conversation on an empty canvas spot, with a page (stage #883, PG4, decision 14).

beforeEach(() => localStorage.clear());
afterEach(() => localStorage.clear());

// An empty spot of the canvas of every page (far from I1, I2 and I3).
const EMPTY = { x: 90000, y: 90000 };

describe('pin of a canvas point', () => {
  it('shows only in the Completa of its page', () => {
    const thread = sampleThread({
      id: 'p2',
      anchor: { kind: 'point', containerId: null, x: 5, y: 6, pageId: 'PG2' },
    });
    const page = signal('PG2');
    const { derived } = derivedFor([thread], page);
    expect(derived.threads.pins.value.map((g) => g.threadIds)).toEqual([['p2']]);
    page.value = 'PG1';
    expect(derived.threads.pins.value).toEqual([]);
    page.value = 'PG3';
    expect(derived.threads.pins.value).toEqual([]);
    page.value = 'PG2';
    expect(derived.threads.pins.value).toHaveLength(1);
  });

  it('a version 1 point shows on the first page only', () => {
    const thread = sampleThread({
      id: 'v1',
      anchor: { kind: 'point', containerId: null, x: 5, y: 6 },
    });
    const page = signal('PG1');
    const { derived } = derivedFor([thread], page);
    expect(derived.threads.pins.value).toHaveLength(1);
    page.value = 'PG2';
    expect(derived.threads.pins.value).toEqual([]);
  });
});

describe('Comment here on an empty canvas spot', () => {
  it('the armed Comment click on page 2 creates the point on the open page', () => {
    const store = createProjectStore();
    const project = pagesProject();
    store.load(project, { readOnly: false });
    const ui = createEditorUi();
    const { derived } = derivedFor([], signal('PG2'));
    armComment(ui);
    tapComment(
      {
        ui,
        derived,
        project,
        blocked: false,
        visibility: new Map(),
        arrows: undefined as never,
        titles: undefined,
        pin: null,
        pageId: 'PG2',
      } as never,
      EMPTY,
    );
    expect(composingAnchor(ui)).toEqual({
      kind: 'point',
      containerId: null,
      x: EMPTY.x,
      y: EMPTY.y,
      pageId: 'PG2',
    });
  });

  it('the context menu offers it on any page, with the open page id', () => {
    const menu = canvasMenuAt(pagesProject(), null, EMPTY, { x: 1, y: 2 }, 'PG2');
    expect(menu?.here).toEqual({
      kind: 'point',
      containerId: null,
      x: EMPTY.x,
      y: EMPTY.y,
      pageId: 'PG2',
    });
  });
});
