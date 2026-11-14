import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { addLayer, addPerspective, type Project } from '../../src/model';
import { createEditorContextValue } from '../../src/ui/EditorContext';
import { goToAnnotation } from '../../src/store/ui';
import { canvasProject } from '../canvas/harness';
import { openHarness } from './proposalHarness';
import { viewOf } from './perspectiveHarness';
import type { OpenProject } from '../../src/app/controller';

// Layer visibility that knows the perspective (stage #956, CE2, decisions 4 and 5): with a
// perspective open, toggling, showing and going to an annotation change its hidden ones (with
// undo); on the Main one, the interface ones.

function projectWithView(): Project {
  let p = addLayer(canvasProject(), { id: 'L2', name: 'Painting', color: '#00AA00' });
  p = addPerspective(p, viewOf(p, { root: 'I2', at: { x: 0, y: 2000 }, hide: ['L1'] }));
  return p;
}

beforeEach(() => localStorage.clear());
afterEach(() => localStorage.clear());

async function setup() {
  const harness = await openHarness({ project: projectWithView(), proposals: [] });
  const { session } = harness;
  const editor = createEditorContextValue({ session } as unknown as OpenProject);
  const hiddenOfV = () =>
    session.store.committed.value?.perspectives.find((x) => x.id === 'V')?.hiddenLayers ??
    [];
  const visible = () => editor.derived.visibleLayers.value.map((l) => l.id);
  return { session, editor, hiddenOfV, visible };
}

describe('with a perspective open', () => {
  it('toggling writes the perspective hidden ones, with undo, and does not touch ui.hiddenLayers', async () => {
    const { session, editor, hiddenOfV, visible } = await setup();
    session.perspective.open('V');
    editor.layers.toggle('L2');
    expect(hiddenOfV()).toEqual(['L1', 'L2']);
    expect(editor.ui.hiddenLayers.value.size).toBe(0);
    expect(visible()).toEqual([]);
    expect(editor.layers.hidden().has('L2')).toBe(true);
    session.store.undo();
    expect(hiddenOfV()).toEqual(['L1']);
    editor.review.dispose();
  });

  it('showing removes the layer from the perspective hidden ones, with undo; a visible layer writes nothing', async () => {
    const { session, editor, hiddenOfV, visible } = await setup();
    session.perspective.open('V');
    editor.layers.show('L1');
    expect(hiddenOfV()).toEqual([]);
    expect(visible()).toEqual(['L1', 'L2']);
    expect(editor.ui.hiddenLayers.value.size).toBe(0);
    const canUndo = session.store.canUndo.value;
    editor.layers.show('L2');
    expect(session.store.canUndo.value).toBe(canUndo);
    session.store.undo();
    expect(hiddenOfV()).toEqual(['L1']);
    editor.review.dispose();
  });

  it('show all clears the perspective hidden ones', async () => {
    const { session, editor, hiddenOfV } = await setup();
    session.perspective.open('V');
    editor.layers.showAll();
    expect(hiddenOfV()).toEqual([]);
    editor.review.dispose();
  });

  it('going to an annotation in a layer hidden by the perspective shows it, with undo', async () => {
    const { session, editor, hiddenOfV, visible } = await setup();
    session.perspective.open('V');
    goToAnnotation(
      editor.ui,
      { id: 'A1', markingId: 'M3', layerId: 'L1' },
      null,
      null,
      editor.layers.show,
    );
    expect(hiddenOfV()).toEqual([]);
    expect(visible()).toContain('L1');
    expect(editor.ui.hiddenLayers.value.size).toBe(0);
    session.store.undo();
    expect(hiddenOfV()).toEqual(['L1']);
    editor.review.dispose();
  });
});

describe('on the Main one', () => {
  it('toggling and showing touch ui.hiddenLayers and not the project', async () => {
    const { session, editor, hiddenOfV } = await setup();
    editor.layers.toggle('L2');
    expect([...editor.ui.hiddenLayers.value]).toEqual(['L2']);
    expect(hiddenOfV()).toEqual(['L1']);
    editor.layers.show('L2');
    expect(editor.ui.hiddenLayers.value.size).toBe(0);
    editor.layers.toggle('L1');
    editor.layers.showAll();
    expect(editor.ui.hiddenLayers.value.size).toBe(0);
    expect(session.store.canUndo.value).toBe(false);
    editor.review.dispose();
  });
});
