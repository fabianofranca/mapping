import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { addLayer, addPerspective, type Project } from '../../src/model';
import { createEditorContextValue } from '../../src/ui/EditorContext';
import { goToAnnotation } from '../../src/store/ui';
import { canvasProject } from '../canvas/harness';
import { openHarness } from './proposalHarness';
import { viewOf } from './perspectiveHarness';
import type { OpenProject } from '../../src/app/controller';

// Visibilidade de camada que conhece a perspectiva (etapa #956, CE2, decisões 4 e 5): com uma
// perspectiva aberta, alternar, mostrar e ir até uma anotação mudam as escondidas dela (com
// desfazer); na Principal, as da interface.

function projectWithView(): Project {
  let p = addLayer(canvasProject(), { id: 'L2', name: 'Pintura', color: '#00AA00' });
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

describe('com uma perspectiva aberta', () => {
  it('alternar grava as escondidas da perspectiva, com desfazer, e não mexe em ui.hiddenLayers', async () => {
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

  it('mostrar tira a camada das escondidas da perspectiva, com desfazer; camada visível não grava nada', async () => {
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

  it('mostrar todas limpa as escondidas da perspectiva', async () => {
    const { session, editor, hiddenOfV } = await setup();
    session.perspective.open('V');
    editor.layers.showAll();
    expect(hiddenOfV()).toEqual([]);
    editor.review.dispose();
  });

  it('ir até uma anotação numa camada escondida pela perspectiva a mostra, com desfazer', async () => {
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

describe('na Principal', () => {
  it('alternar e mostrar mexem em ui.hiddenLayers e não no projeto', async () => {
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
