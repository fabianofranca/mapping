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

// Perspectivas no derivado (etapa #659, PE2, frente C): o projeto à vista segue a perspectiva
// aberta, as camadas escondidas são as dela e a revisão abre a Principal.

/** `canvasProject` (I1 em 0,0 com M1/M2; I2 em 1100,0 com M3) + L2 + a perspectiva V (só I2, em 0,2000, sem L1). */
function projectWithView(): Project {
  let p = addLayer(canvasProject(), { id: 'L2', name: 'Pintura', color: '#00AA00' });
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

describe('o projeto à vista', () => {
  it('a Principal mostra o projeto; abrir uma perspectiva mostra só as raízes dela, deslocadas', async () => {
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

  it('o derivado exporta a perspectiva aberta (null na Principal)', async () => {
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

  it('o projeto à vista é o mesmo objeto enquanto o projeto e a perspectiva não mudam', async () => {
    const { editor, perspective } = await setup();
    perspective.open('V');
    const first = editor.review.derived.shownProject.value;
    editor.ui.selection.value = { kind: 'marking', id: 'M3' };
    editor.ui.viewMode.value = true;
    expect(editor.review.derived.shownProject.value).toBe(first);
    editor.review.dispose();
  });
});

describe('camadas visíveis', () => {
  it('a perspectiva aberta esconde as dela; a Principal fica com as da interface', async () => {
    const { editor, perspective } = await setup();
    const ids = () => editor.derived.visibleLayers.value.map((l) => l.id);
    expect(ids()).toEqual(['L1', 'L2']);

    toggleLayerVisible(editor.ui, 'L2'); // A Principal esconde a L2.
    expect(ids()).toEqual(['L1']);

    perspective.open('V'); // V esconde a L1 e mostra a L2.
    expect(ids()).toEqual(['L2']);

    perspective.open(null);
    expect(ids()).toEqual(['L1']);
    editor.review.dispose();
  });
});

describe('revisão', () => {
  it('abrir a revisão abre a Principal e trava a troca; sair destrava sem reabrir a anterior', async () => {
    const base = projectWithView();
    const proposal = propose(base, renameMarking(base, 'M3', 'Botão'), { id: 'P1' });
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
