import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  addLayer,
  addPerspective,
  renameMarking,
  type Project,
  type Proposal,
} from '../../src/model';
import { createEditorContextValue } from '../../src/ui/EditorContext';
import { toggleLayerVisible } from '../../src/store/ui';
import { canvasProject } from '../canvas/harness';
import { propose } from '../model/proposalFixtures';
import { openHarness } from './proposalHarness';
import { viewOf } from './perspectiveHarness';
import type { OpenProject } from '../../src/app/controller';

// Perspectives in the derived state (stage #659, PE2, front C): the shown project follows the open
// perspective, the hidden layers are its own and the review opens the Main one.

/** `canvasProject` (I1 at 0,0 with M1/M2; I2 at 1100,0 with M3) + L2 + the perspective V (only I2, at 0,2000, without L1). */
function projectWithView(): Project {
  let p = addLayer(canvasProject(), { id: 'L2', name: 'Painting', color: '#00AA00' });
  p = addPerspective(p, viewOf(p, { root: 'I2', at: { x: 0, y: 2000 }, hide: ['L1'] }));
  return p;
}

beforeEach(() => localStorage.clear());
afterEach(() => localStorage.clear());

async function setup(project: Project = projectWithView(), proposals: Proposal[] = []) {
  const harness = await openHarness({ project, proposals });
  const { session } = harness;
  const editor = createEditorContextValue({ session } as unknown as OpenProject);
  return { ...harness, session, perspective: session.perspective, editor };
}

describe('the shown project', () => {
  it('the Main one shows the project; opening a perspective shows only its roots, shifted', async () => {
    const { editor, perspective, session } = await setup();
    const shown = editor.review.derived.shownProject;
    const project = session.store.committed.value;
    expect(shown.value).toBe(project);

    expect(perspective.open('V')).toBe(true);
    const view = shown.value;
    expect(view).not.toBe(project);
    expect(view?.containers.map((c) => c.id)).toEqual(['I2']);
    expect(view?.containers[0]?.placement).toMatchObject({ x: 0, y: 2000 });
    expect(view?.markings.map((m) => m.id)).toEqual(['M3']);

    perspective.open(null);
    expect(shown.value).toBe(project);
    editor.review.dispose();
  });

  it('the derived state exports the open perspective (null on the Main one)', async () => {
    const { editor, perspective, session } = await setup();
    expect(editor.derived.perspective.value).toBeNull();
    perspective.open('V');
    expect(editor.derived.perspective.value).toBe(
      session.store.committed.value?.perspectives[0],
    );
    perspective.open(null);
    expect(editor.derived.perspective.value).toBeNull();
    editor.review.dispose();
  });

  it('the shown project is the same object while the project and the perspective do not change', async () => {
    const { editor, perspective } = await setup();
    perspective.open('V');
    const first = editor.review.derived.shownProject.value;
    editor.ui.selection.value = { kind: 'marking', id: 'M3' };
    editor.ui.viewMode.value = true;
    expect(editor.review.derived.shownProject.value).toBe(first);
    editor.review.dispose();
  });
});

describe('visible layers', () => {
  it('the open perspective hides its own; the Main one keeps the interface ones', async () => {
    const { editor, perspective } = await setup();
    const ids = () => editor.derived.visibleLayers.value.map((l) => l.id);
    expect(ids()).toEqual(['L1', 'L2']);

    toggleLayerVisible(editor.ui, 'L2'); // The Main one hides L2.
    expect(ids()).toEqual(['L1']);

    perspective.open('V'); // V hides L1 and shows L2.
    expect(ids()).toEqual(['L2']);

    perspective.open(null);
    expect(ids()).toEqual(['L1']);
    editor.review.dispose();
  });
});

describe('review', () => {
  it('opening the review opens the Main one and locks switching; leaving unlocks without reopening the previous one', async () => {
    const base = projectWithView();
    const proposal = propose(base, renameMarking(base, 'M3', 'Button'), { id: 'P1' });
    const { editor, perspective } = await setup(base, [proposal]);
    expect(perspective.open('V')).toBe(true);

    expect(editor.review.open('P1').ok).toBe(true);
    expect(perspective.id.value).toBeNull();
    expect(perspective.locked.value).toBe(true);
    expect(perspective.open('V')).toBe(false);
    expect(editor.review.derived.shownProject.value?.containers.map((c) => c.id)).toEqual(
      ['I1', 'I2'],
    );

    editor.review.close();
    expect(perspective.locked.value).toBe(false);
    expect(perspective.id.value).toBeNull();
    expect(perspective.open('V')).toBe(true);
    editor.review.dispose();
  });
});
