import type Konva from 'konva/lib/Core';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { CanvasController } from '../../src/canvas/CanvasController';
import type { OverlayRenderer } from '../../src/canvas/renderers/overlay';
import type { ReviewCanvas } from '../../src/canvas/reviewMarks';
import { createCanvasViewState } from '../../src/canvas/viewState';
import {
  addBackgroundContainer,
  addComponentMarking,
  applySpecialization,
  approximateMeasurer,
  loadSpecComponents,
  parseSpec,
  setFieldValue,
  specFiles,
  type ComponentCatalog,
  type Project,
  type Proposal,
  markingTypeName,
  removeMarking,
} from '../../src/model';
import { createEditorDerived } from '../../src/store/derived';
import { createDisplayImages } from '../../src/store/displayImages';
import { setShowComponentsOnPhotos } from '../../src/store/settings';
import { textMeasurer } from '../../src/store/textMeasure';
import { createEditorUi } from '../../src/store/ui';
import {
  COMPONENTS,
  SPEC_FILE,
  SPEC_ID,
  SPEC_JSON,
  packageTexts,
  testCatalog,
} from '../model/componentFixtures';
import { emptyProject } from '../model/fixtures';
import { changeOf, propose } from '../model/proposalFixtures';
import { openHarness } from '../store/proposalHarness';
import { componentSources, installFakeCanvas } from './harness';

// Proposed view with components (PC1): the canvas draws the "how it would look" of the proposal and the
// review marks stay on top. The catalog is the test one, passed directly (the package that the
// proposal itself brings is the store's business).

type Json = Record<string, unknown>;

/** The test specialization with a required `label` on the `text` type (for the incomplete one). */
function requiredSpec(): {
  spec: ReturnType<typeof parseSpec>;
  catalog: ComponentCatalog;
} {
  const json = structuredClone(SPEC_JSON) as unknown as Json;
  const layers = json.layers as { annotationTypes: { id: string; fields: Json[] }[] }[];
  const text = layers[0]?.annotationTypes.find((t) => t.id === 'text');
  const label = text?.fields.find((f) => f.key === 'label');
  if (label) label.required = true;
  const spec = parseSpec(json);
  if (!spec.ok) throw new Error(spec.errors.join('\n'));
  const texts = new Map(
    Object.entries(COMPONENTS).map(([id, c]) => [
      `specs/test/components/${id}.json`,
      JSON.stringify(c),
    ]),
  );
  const loaded = loadSpecComponents(spec.spec, SPEC_FILE, 1, (path) => texts.get(path));
  return { spec, catalog: new Map([[SPEC_ID, loaded]]) };
}

/** Base: blank screen B1 (without a file) and an existing text T1 "Old". */
function baseProject(required = false): { base: Project; catalog: ComponentCatalog } {
  let catalog = testCatalog();
  let spec = parseSpec(SPEC_JSON);
  if (required) {
    const r = requiredSpec();
    spec = r.spec;
    catalog = r.catalog;
  }
  if (!spec.ok) throw new Error(spec.errors.join('\n'));
  let n = 0;
  let p = applySpecialization(emptyProject(), spec.spec, {
    newId: () => `LS${++n}`,
    packageSpecName: 'test.spec.json',
  });
  p = addBackgroundContainer(p, {
    id: 'B1',
    name: 'Screen',
    width: 400,
    height: 600,
    background: '#FFFFFF',
    center: { x: 500, y: 300 },
  });
  p = addText(p, catalog, 'T1', 20, 20, { label: 'Old' });
  return { base: p, catalog };
}

function addText(
  p: Project,
  catalog: ComponentCatalog,
  id: string,
  x: number,
  y: number,
  values?: Record<string, string | number>,
): Project {
  return addComponentMarking(
    p,
    catalog,
    {
      markingId: id,
      annotationId: `A_${id}`,
      containerId: 'B1',
      parentId: null,
      specId: SPEC_ID,
      typeId: 'text',
      rect: { x, y, width: 100, height: 40 },
      ...(values ? { values } : {}),
    },
    approximateMeasurer,
  );
}

describe('CanvasController: Proposed view with components', () => {
  const frames: FrameRequestCallback[] = [];
  const flush = () => {
    while (frames.length > 0) for (const frame of frames.splice(0)) frame(0);
  };

  beforeAll(() => {
    installFakeCanvas();
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      frames.push(cb);
      return frames.length;
    });
    vi.stubGlobal('cancelAnimationFrame', () => undefined);
  });
  afterAll(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });
  beforeEach(() => setShowComponentsOnPhotos(false));
  afterEach(() => {
    textMeasurer.value = approximateMeasurer;
    localStorage.clear();
  });

  /** Opens the proposal in a session and mounts the canvas over it (starts in the Current view). */
  async function setup(
    base: Project,
    catalog: ComponentCatalog,
    proposal: Proposal,
    decide?: (review: Awaited<ReturnType<typeof openHarness>>['review']) => Promise<void>,
    extraFiles: Record<string, string> = {},
  ) {
    const { session, review } = await openHarness({
      project: base,
      proposals: [proposal],
      files: { ...Object.fromEntries(specFiles(base)), ...extraFiles },
    });
    expect(review.open('P1').ok).toBe(true);
    if (decide) await decide(review);
    // With `extraFiles` the catalog is the app one (`review.components`: base + the proposal package).
    const sources = Object.keys(extraFiles).length
      ? review.components
      : componentSources(catalog);
    const ui = createEditorUi();
    const derived = createEditorDerived(
      session.store,
      ui,
      review.derived.shownProject,
      sources,
    );
    const container = document.createElement('div');
    Object.defineProperty(container, 'clientWidth', { value: 380 });
    Object.defineProperty(container, 'clientHeight', { value: 700 });
    document.body.append(container);
    const controller = new CanvasController({
      container,
      store: session.store,
      actions: session.actions,
      display: createDisplayImages<ImageBitmap>(() => new Promise(() => undefined)),
      ui,
      derived,
      view: createCanvasViewState(),
      review,
    });
    const internals = controller as unknown as {
      stage: Konva.Stage;
      reviewCanvas: { readonly value: ReviewCanvas | null };
    };
    const drawing = (id: string) =>
      internals.stage
        .getLayers()[1]
        ?.find((n: Konva.Node) => n.getAttr('markingId') === id)[0];
    const texts = (id: string) =>
      ((drawing(id) as Konva.Container | undefined)?.find('Text') ?? []).map(
        (t: Konva.Node) => String(t.getAttr('text')),
      );
    const show = (view: 'current' | 'proposed') => {
      review.setView(view);
      flush();
    };
    const marks = () => internals.reviewCanvas.value;
    flush();
    return {
      session,
      review,
      derived,
      ui,
      overlay: (controller as unknown as { overlay: OverlayRenderer }).overlay,
      container,
      controller,
      drawing,
      texts,
      show,
      marks,
      whenLoaded: async () => {
        await session.components.whenIdle();
        await review.components.whenIdle();
        flush();
      },
      scenes: () => derived.drawingsOf(review.derived.shownProject.value),
    };
  }

  /** Base + a proposal that creates the text N1 "New" and changes T1 to "Changed". */
  function scenario(required = false) {
    const { base, catalog } = baseProject(required);
    let after = addText(base, catalog, 'N1', 20, 100, { label: 'New' });
    after = setFieldValue(after, 'A_T1', 'label', 'Changed');
    return { base, catalog, proposal: propose(base, after) };
  }

  it('pending, Proposed: the created component is drawn with the proposed values and the created mark', async () => {
    const { base, catalog, proposal } = scenario();
    const t = await setup(base, catalog, proposal);
    t.show('proposed');
    expect(t.container.dataset.components).toBe('2');
    expect(t.drawing('N1')).toBeDefined();
    expect(t.texts('N1')).toContain('New');
    expect(t.marks()?.markings.get('N1')).toEqual({
      line: 'created',
      dim: false,
      badges: ['created'],
    });
    t.controller.destroy();
  });

  it('accepted, Proposed: same as pending', async () => {
    const { base, catalog, proposal } = scenario();
    const pending = await setup(base, catalog, proposal);
    pending.show('proposed');
    const pendingScene = pending.texts('N1');
    const pendingMark = pending.marks()?.markings.get('N1');
    pending.controller.destroy();

    const changeId = changeOf(proposal, 'marking', 'N1').id;
    const t = await setup(base, catalog, proposal, async (review) => {
      await review.decide({ level: 'change', id: changeId }, 'accepted');
    });
    t.show('proposed');
    expect(t.drawing('N1')).toBeDefined();
    expect(t.texts('N1')).toEqual(pendingScene);
    expect(t.marks()?.markings.get('N1')).toEqual(pendingMark);
    expect(t.container.dataset.components).toBe('2');
    t.controller.destroy();
  });

  // Invalid: with the 1 px minimum (decision 24) the 3×3 px creation is valid, and the settling of the
  // hierarchy fixes parent, container and out-of-bounds rectangle; the tampering is the layer of the
  // created annotation, which does not exist in the project (`missing-layer`).
  it('invalid: drawn, with the line and the invalid seal', async () => {
    const { base, catalog, proposal } = scenario();
    const create = changeOf(proposal, 'marking', 'N1');
    const annotation = changeOf(proposal, 'annotation', 'A_N1');
    const tampered: Proposal = {
      ...proposal,
      changes: proposal.changes.map((c) =>
        c.id === annotation.id &&
        typeof c.to === 'object' &&
        c.to !== null &&
        !Array.isArray(c.to)
          ? { ...c, to: { ...c.to, layerId: 'GHOST' } }
          : c,
      ),
    };
    const t = await setup(base, catalog, tampered, async (review) => {
      await review.decide({ level: 'change', id: create.id }, 'accepted');
      await review.decide({ level: 'change', id: annotation.id }, 'accepted');
    });
    t.show('proposed');
    expect(t.review.derived.invalid.value.changeIds.has(annotation.id)).toBe(true);
    expect(t.drawing('N1')).toBeDefined();
    expect(t.marks()?.markings.get('N1')).toMatchObject({
      line: 'invalid',
      badges: expect.arrayContaining(['invalid']),
    });
    t.controller.destroy();
  });

  it('Current: the created component is not drawn and has no mark', async () => {
    const { base, catalog, proposal } = scenario();
    const t = await setup(base, catalog, proposal);
    t.show('current');
    expect(t.drawing('N1')).toBeUndefined();
    expect(t.container.dataset.components).toBe('1');
    expect(t.marks()?.markings.has('N1')).toBe(false);
    t.controller.destroy();
  });

  it('rejected creation: no component drawing and with the ghost in both views', async () => {
    const { base, catalog, proposal } = scenario();
    const changeId = changeOf(proposal, 'marking', 'N1').id;
    // The ghost name is the component type name, as the Tree shows the unnamed instance.
    const typeName = markingTypeName(base, 'T1');
    expect(typeName).toBeTruthy();
    const t = await setup(base, catalog, proposal, async (review) => {
      await review.decide({ level: 'change', id: changeId }, 'rejected');
    });
    for (const view of ['proposed', 'current'] as const) {
      t.show(view);
      expect(t.drawing('N1')).toBeUndefined();
      expect(t.container.dataset.components).toBe('1');
      expect(t.marks()?.markings.has('N1')).toBe(false);
      expect(t.marks()?.ghosts.map((g) => [g.key, g.name, g.badges])).toEqual([
        ['rejected:N1', typeName, ['rejected']],
      ]);
    }
    t.controller.destroy();
  });

  it('rejected removal of the selected one: the strikethrough of the name label disappears in the same frame', async () => {
    const plain = baseProject();
    const { catalog } = plain;
    const base: Project = {
      ...plain.base,
      markings: plain.base.markings.map((m) =>
        m.id === 'T1' ? { ...m, name: 'Old text' } : m,
      ),
    };
    const proposal = propose(base, removeMarking(base, 'T1'));
    const changeId = changeOf(proposal, 'marking', 'T1').id;
    const t = await setup(base, catalog, proposal);
    t.ui.selection.value = { kind: 'marking', id: 'T1' };
    t.show('current');
    const strike = () => t.overlay.nameTag.findOne('.name-tag-strike');
    expect(t.overlay.nameTag.visible()).toBe(true);
    expect(strike()?.visible()).toBe(true);
    await t.review.decide({ level: 'change', id: changeId }, 'rejected');
    flush();
    expect(strike()?.visible()).toBe(false);
    t.controller.destroy();
  });

  it('changed existing component: proposed value and double line in the Proposed view', async () => {
    const { base, catalog, proposal } = scenario();
    const t = await setup(base, catalog, proposal);
    t.show('current');
    expect(t.texts('T1')).toContain('Old');
    t.show('proposed');
    expect(t.texts('T1')).toContain('Changed');
    expect(t.marks()?.markings.get('T1')).toMatchObject({ line: 'changed' });
    t.controller.destroy();
  });

  it('required field missing in a new component: the drawing exists and the marking is incomplete', async () => {
    const { base, catalog } = baseProject(true);
    const after = addText(base, catalog, 'N1', 20, 100, { label: '' });
    const proposal = propose(base, after);
    const t = await setup(base, catalog, proposal);
    t.show('proposed');
    expect(t.drawing('N1')).toBeDefined();
    expect(t.derived.incompleteMarkings.value.has('N1')).toBe(true);
    expect(t.derived.incompleteMarkings.value.has('T1')).toBe(false);
    t.show('current');
    expect(t.derived.incompleteMarkings.value.has('N1')).toBe(false);
    t.controller.destroy();
  });

  it('package that the proposal creates: the component of the new type is drawn in the Proposed view and not in the Current one', async () => {
    const { base, catalog } = baseProject();
    const parsed = parseSpec({ ...SPEC_JSON, id: 'extra', name: 'extra', version: 1 });
    if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
    let n = 0;
    let after = applySpecialization(base, parsed.spec, {
      newId: () => `LX${++n}`,
      packageSpecName: 'extra.spec.json',
    });
    const extraCatalog: ComponentCatalog = new Map(
      [...catalog].map(([, v]) => ['extra', { ...v, specId: 'extra' }]),
    );
    after = addComponentMarking(
      after,
      extraCatalog,
      {
        markingId: 'N1',
        annotationId: 'A_N1',
        containerId: 'B1',
        parentId: null,
        specId: 'extra',
        typeId: 'text',
        rect: { x: 20, y: 100, width: 100, height: 40 },
        values: { label: 'From the package' },
      },
      approximateMeasurer,
    );
    const files: Record<string, string> = {};
    for (const [path, text] of packageTexts()) {
      files[path] = text; // the package of the already applied specialization (T1), in specs/test/
      files[`proposals/P1/${path.replace('specs/test/', 'specs/extra/')}`] = text;
    }
    const t = await setup(base, catalog, propose(base, after), undefined, files);
    t.show('proposed');
    await t.whenLoaded();
    expect(t.drawing('N1')).toBeDefined();
    expect(t.texts('N1')).toContain('From the package');
    expect(t.container.dataset.components).toBe('2');
    expect(t.marks()?.markings.get('N1')).toMatchObject({ line: 'created' });
    t.show('current');
    expect(t.drawing('N1')).toBeUndefined();
    expect(t.container.dataset.components).toBe('1');
    t.controller.destroy();
  });

  describe('cache', () => {
    it('switching views keeps the scenes that the proposal does not change', async () => {
      const start = baseProject();
      const { catalog } = start;
      const base = addText(start.base, catalog, 'T2', 20, 200, { label: 'Two' });
      const after = addText(base, catalog, 'N1', 20, 100, { label: 'New' });
      const t = await setup(base, catalog, propose(base, after));
      const t1 = t.scenes().get('T1');
      const t2 = t.scenes().get('T2');
      expect(t1).toBeDefined();
      t.show('proposed');
      // T2 already exists in the base; only N1 is new.
      expect(t.scenes().get('T1')).toBe(t1);
      expect(t.scenes().get('T2')).toBe(t2);
      expect(t.scenes().has('N1')).toBe(true);
      t.show('current');
      expect(t.scenes().get('T1')).toBe(t1);
      expect(t.scenes().get('T2')).toBe(t2);
      expect(t.scenes().has('N1')).toBe(false);
      t.controller.destroy();
    });

    it('deciding a change does not reinstantiate the others; pan and zoom do not reinstantiate anything', async () => {
      const { base, catalog, proposal } = scenario();
      const t = await setup(base, catalog, proposal);
      t.show('proposed');
      const before = new Map(t.scenes());
      const nodes = { N1: t.drawing('N1'), T1: t.drawing('T1') };
      const changeId = changeOf(proposal, 'marking', 'N1').id;
      await t.review.decide({ level: 'change', id: changeId }, 'accepted');
      flush();
      expect(t.scenes().get('N1')).toBe(before.get('N1'));
      expect(t.scenes().get('T1')).toBe(before.get('T1'));
      expect(t.drawing('N1')).toBe(nodes.N1);
      expect(t.drawing('T1')).toBe(nodes.T1);

      t.controller.zoomBy(1.5);
      flush();
      t.controller.centerOnPoint({ x: 100, y: 100 });
      flush();
      for (const [id, scene] of before) expect(t.scenes().get(id)).toBe(scene);
      expect(t.drawing('N1')).toBe(nodes.N1);
      t.controller.destroy();
    });
  });
});
