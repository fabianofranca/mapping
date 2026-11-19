import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  arrivalArea,
  perspectiveContentCount,
  projectIndex,
  type Project,
} from '../../src/model';
import type { OpenProject } from '../../src/app/controller';
import {
  perspectiveRootsOnPage,
  projectInPerspective,
} from '../../src/store/perspectiveShown';
import { signal } from '@preact/signals';
import { createThreadDerived } from '../../src/store/threadDerived';
import { createEditorUi } from '../../src/store/ui';
import { createEditorContextValue } from '../../src/ui/EditorContext';
import { sampleThread } from '../model/threadFixtures';
import { pagesProject } from './pageHarness';
import { openHarness } from './proposalHarness';

// The project in view is cut by the open page BEFORE the perspective (stage #883, PG2, decisions 7
// and 16), and everything derived from it follows.

beforeEach(() => localStorage.clear());
afterEach(() => localStorage.clear());

async function setup(project: Project = pagesProject()) {
  const harness = await openHarness({ project });
  const { session } = harness;
  const editor = createEditorContextValue({ session } as unknown as OpenProject);
  const shown = () => editor.review.derived.shownProject.value as Project;
  const ids = (list: readonly { readonly id: string }[]) => list.map((x) => x.id);
  editor.ui.listShowEmpty.value = true;
  const listed = (): string[] =>
    editor.derived.listing.value.flatMap((g) => (g.image ? [g.image.id] : ['canvas']));
  return { ...harness, editor, shown, ids, listed };
}

describe('the shown project', () => {
  it('in the Completa it is only the open page', async () => {
    const { session, shown, ids, editor } = await setup();
    expect(ids(shown().containers)).toEqual(['I1', 'I2']);
    expect(ids(shown().markings)).toEqual(['M1', 'M2', 'M3', 'M4']);
    session.page.open('PG2');
    expect(ids(shown().containers)).toEqual(['I3']);
    expect(ids(shown().markings)).toEqual(['M5', 'K']);
    session.page.open('PG3');
    expect(shown().containers).toEqual([]);
    expect(shown().markings).toEqual([]);
    editor.review.dispose();
  });

  it('a perspective is cut by the open page', async () => {
    const { session, shown, ids, editor } = await setup();
    session.perspective.open('V');
    expect(ids(shown().containers)).toEqual(['I1']);
    session.page.open('PG2');
    expect(ids(shown().containers)).toEqual(['I3']);
    expect(ids(shown().markings)).toEqual(['M5']);
    session.perspective.open('W');
    expect(shown().containers).toEqual([]);
    editor.review.dispose();
  });

  it('is the same object while nothing but the viewport and the selection change', async () => {
    const { session, editor, shown } = await setup();
    session.page.open('PG2');
    const first = shown();
    editor.ui.selection.value = { kind: 'marking', id: 'K' };
    editor.ui.viewMode.value = true;
    expect(shown()).toBe(first);
    editor.review.dispose();
  });

  it('the review stays locked on the Completa but the page is free', async () => {
    const { session, shown, ids, editor } = await setup();
    session.perspective.open('V');
    session.perspective.setLocked(true);
    expect(session.perspective.id.value).toBeNull();
    expect(session.page.open('PG2')).toBe(true);
    expect(ids(shown().containers)).toEqual(['I3']);
    editor.review.dispose();
  });

  it('projectInPerspective takes the page as the third argument', () => {
    const p = pagesProject();
    expect(projectInPerspective(p, null, 'PG2').containers.map((c) => c.id)).toEqual([
      'I3',
    ]);
    expect(projectInPerspective(p, 'V', 'PG1').containers.map((c) => c.id)).toEqual([
      'I1',
    ]);
    // Without a page, as before.
    expect(projectInPerspective(p, null)).toBe(p);
    expect(projectInPerspective(p, 'V').containers.map((c) => c.id)).toEqual([
      'I1',
      'I3',
    ]);
  });
});

describe('derived values see only the open page', () => {
  it('list, annotations, pending items, indicators and layers follow the page', async () => {
    const { session, editor, listed } = await setup();
    const derived = editor.derived;
    expect(listed()).toEqual(['I1', 'I2']);
    expect([...derived.annotationsByMarking.value.keys()].sort()).toEqual(
      ['M1', 'M2', 'M4'].sort(),
    );
    expect(derived.incompleteCount.value).toBeGreaterThanOrEqual(0);
    session.page.open('PG2');
    expect(listed()).toEqual(['canvas', 'I3']);
    expect(derived.annotationsByMarking.value.size).toBe(0);
    expect(derived.layerDots.value.size).toBe(0);
    expect([...derived.markingsBySpace.value.keys()].sort()).toEqual(['I3', null].sort());
    editor.review.dispose();
  });

  it('the count of pending items only counts the open page', async () => {
    const { session, editor } = await setup();
    const onFirst = editor.derived.incompleteCount.value;
    session.page.open('PG2');
    const onSecond = editor.derived.incompleteCount.value;
    session.page.open('PG1');
    expect(editor.derived.incompleteCount.value).toBe(onFirst);
    expect(onSecond).toBe(0);
    editor.review.dispose();
  });
});

describe('perspectives and pages', () => {
  it('perspectiveRootsOnPage counts the roots of the perspective on the page', () => {
    const p = pagesProject();
    const v = p.perspectives.find((x) => x.id === 'V')!;
    const w = p.perspectives.find((x) => x.id === 'W')!;
    expect(perspectiveRootsOnPage(p, v, 'PG1')).toBe(1);
    expect(perspectiveRootsOnPage(p, v, 'PG2')).toBe(1);
    expect(perspectiveRootsOnPage(p, v, 'PG3')).toBe(0);
    expect(perspectiveRootsOnPage(p, w, 'PG2')).toBe(0);
    const content = perspectiveContentCount(p, v, 'PG1');
    expect(content.containers + content.markings).toBe(1);
  });

  it('the picker count per perspective follows the open page', async () => {
    const { session } = await setup();
    expect(Object.fromEntries(session.page.perspectiveCounts.value)).toEqual({
      V: 1,
      W: 1,
    });
    session.page.open('PG2');
    expect(Object.fromEntries(session.page.perspectiveCounts.value)).toEqual({
      V: 1,
      W: 0,
    });
  });

  it('the page picker count is the roots of each page in the Completa', async () => {
    const { session } = await setup();
    expect(Object.fromEntries(session.page.rootCounts.value)).toEqual({
      PG1: 2,
      PG2: 2,
      PG3: 0,
    });
    session.actions.moveRootsToPage(['I2'], 'PG3');
    expect(Object.fromEntries(session.page.rootCounts.value)).toEqual({
      PG1: 1,
      PG2: 2,
      PG3: 1,
    });
  });

  it('knows when the open perspective has nothing on the open page', async () => {
    const { session } = await setup();
    expect(session.page.perspectiveEmpty.value).toBe(false); // the Completa
    session.perspective.open('W');
    expect(session.page.perspectiveEmpty.value).toBe(false); // I2 is on PG1
    session.page.open('PG2');
    expect(session.page.perspectiveEmpty.value).toBe(true);
    session.perspective.open('V');
    expect(session.page.perspectiveEmpty.value).toBe(false);
    session.page.open('PG3');
    expect(session.page.perspectiveEmpty.value).toBe(true);
    session.perspective.open(null);
    expect(session.page.perspectiveEmpty.value).toBe(false);
  });

  it('"Start from: Completa" takes the roots of ALL pages', async () => {
    const { session } = await setup();
    session.page.open('PG2');
    const created = session.perspectiveActions.createPerspective({
      name: 'Everything',
      startFrom: null,
      local: false,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const perspective = (session.store.committed.peek() as Project).perspectives.find(
      (x) => x.id === created.value,
    );
    expect(perspective?.items.map((i) => i.root).sort()).toEqual(
      ['I1', 'I2', 'I3', 'K'].sort(),
    );
  });

  it('a root created in a perspective arrives in the Completa of ITS page', async () => {
    const { session } = await setup();
    session.perspective.open('V');
    session.page.open('PG2');
    const result = session.actions.addBackgroundContainer({
      name: null,
      width: 100,
      height: 100,
      background: '#FFFFFF',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const p = session.store.committed.peek() as Project;
    expect(projectIndex(p).pageOf.get(result.value)).toBe('PG2');
    expect(session.perspective.arrivals.value.map((a) => a.root)).toEqual([result.value]);
    expect(arrivalArea(p, 'PG2')).not.toBeNull();
    expect(arrivalArea(p, 'PG1')).toBeNull();
    // It is also in the perspective, on that page.
    const v = p.perspectives.find((x) => x.id === 'V')!;
    expect(v.items.some((i) => i.root === result.value)).toBe(true);
  });

  it('a perspective gesture only looks at the containers of its own page', async () => {
    // I1 (PG1) and I3 (PG2) sit at the same place in V: moving I3 must not collide with I1.
    const { session } = await setup();
    session.perspective.open('V');
    session.page.open('PG2');
    const placement = { x: 20, y: 0, scale: 1 };
    const moved = session.actions.setContainerPlacement('I3', placement);
    expect(moved.ok).toBe(true);
  });
});

describe('conversations and pages', () => {
  it('anchors resolve across pages while the pins only draw the open page', async () => {
    const { session, editor } = await setup();
    const onOther = sampleThread({ anchor: { kind: 'marking', id: 'M5' } });
    const ui = createEditorUi();
    ui.commentPins.value = true;
    const derived = createThreadDerived(editor.review.derived.shownProject, ui, {
      threads: signal([onOther]),
      copyId: null,
      identity: signal(null),
      project: editor.review.derived.shownAcrossPages,
    });
    // On PG1 (the open page) the conversation is on PG2 (M5): found, not an orphan, but no pin yet.
    expect(derived.entries.value[0]?.resolution.orphan).toBe(false);
    expect(derived.rows.value).toHaveLength(1);
    expect(derived.pins.value).toEqual([]);
    session.page.open('PG2');
    expect(derived.pins.value).toHaveLength(1);
    // Without the project, as before: what is not in view is an orphan.
    const cut = createThreadDerived(
      editor.review.derived.shownProject,
      createEditorUi(),
      {
        threads: signal([onOther]),
        copyId: null,
        identity: signal(null),
      },
    );
    session.page.open('PG1');
    expect(cut.entries.value[0]?.resolution.orphan).toBe(true);
    editor.review.dispose();
  });
});
