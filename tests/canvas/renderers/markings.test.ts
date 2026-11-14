import Konva from 'konva/lib/Core';
import type { Text as KonvaText } from 'konva/lib/shapes/Text';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Frame } from '../../../src/canvas/frame';
import { MarkingRenderer } from '../../../src/canvas/renderers/markings';
import {
  ALERT_SIZE,
  CORNER_MARGIN,
  REVIEW_BADGE_SIZE,
} from '../../../src/canvas/renderers/metrics';
import {
  createMarking,
  removeMarking,
  setContainerMarkingColor,
  setMarkingFloating,
  type LayerDot,
  type Placement,
  type Project,
} from '../../../src/model';
import { canvasProject, editorFor, frameOf, installFakeCanvas, TOKENS } from '../harness';

beforeAll(installFakeCanvas);
afterAll(() => vi.restoreAllMocks());

const PLACEMENTS: ReadonlyMap<string, Placement> = new Map([
  ['I1', { x: 0, y: 0, scale: 1 }],
  ['I2', { x: 1100, y: 0, scale: 1 }],
]);
/** Screen large enough for the whole M1 (M3, in I2, stays out). */
const SIZE = { width: 1000, height: 800 };

function setup() {
  const layer = new Konva.Layer();
  const renderer = new MarkingRenderer(layer);
  const editor = editorFor();
  const render = (overrides: Partial<Frame> = {}) =>
    renderer.render(frameOf(editor, { size: SIZE, ...overrides }), PLACEMENTS);
  return { layer, renderer, editor, render };
}

function node(renderer: MarkingRenderer, id: string) {
  const n = renderer.node(id);
  if (!n) throw new Error(`no node for ${id}`);
  return n;
}

function textOf(renderer: MarkingRenderer, id: string) {
  const text = node(renderer, id).text;
  if (!text) throw new Error(`no name created for ${id}`);
  return text;
}

function withReview(p: Project, id: string): Project {
  return {
    ...p,
    markings: p.markings.map((m) => (m.id === id ? { ...m, needsReview: true } : m)),
  };
}

describe('MarkingRenderer', () => {
  it('border at the marking position; children above parents', () => {
    const { renderer, render } = setup();
    render();
    const m1 = node(renderer, 'M1');
    expect(m1.border.getAttrs()).toMatchObject({
      x: 100,
      y: 100,
      width: 600,
      height: 500,
      stroke: TOKENS.line,
      strokeWidth: 1,
    });
    // Halo on every marking: a stroke 2 px wider (1 px on each side) under the line.
    expect(m1.halo?.getAttrs()).toMatchObject({
      visible: true,
      stroke: TOKENS.halo,
      strokeWidth: 3,
    });
    expect(node(renderer, 'M2').group.zIndex()).toBeGreaterThan(m1.group.zIndex());
  });

  it('selected: line in cv-select, thicker, with halo', () => {
    const { renderer, render } = setup();
    render({
      selection: { kind: 'marking', id: 'M1' },
      viewport: { x: 0, y: 0, scale: 2 },
    });
    const m1 = node(renderer, 'M1');
    // 2 screen px at zoom 2; the halo adds 1 px on each side.
    expect(m1.border.getAttrs()).toMatchObject({ stroke: TOKENS.select, strokeWidth: 1 });
    expect(m1.halo?.getAttrs()).toMatchObject({ stroke: TOKENS.halo, strokeWidth: 2 });
  });

  it('border color chosen for the image', () => {
    const { renderer, render } = setup();
    render({ project: setContainerMarkingColor(canvasProject(), 'I1', '#00ff00') });
    expect(node(renderer, 'M1').border.stroke()).toBe('#00FF00');
  });

  it('off screen or hidden by the display mode: does not appear', () => {
    const { renderer, render } = setup();
    render({ visibility: new Map([['M2', 'hidden' as const]]) });
    expect(node(renderer, 'M1').group.visible()).toBe(true);
    // No node: the node is only born in the first frame where the marking is drawn.
    expect(renderer.node('M2')).toBeUndefined();
    expect(renderer.node('M3')).toBeUndefined();
  });

  it('dimmed and context outline (without indicators)', () => {
    const { renderer, render } = setup();
    render({
      visibility: new Map([
        ['M1', 'outline' as const],
        ['M2', 'dim' as const],
      ]),
    });
    expect(node(renderer, 'M1').group.opacity()).toBe(TOKENS.opacity.ancestor);
    expect(node(renderer, 'M1').alertClip?.visible() ?? false).toBe(false);
    expect(node(renderer, 'M1').text?.group.visible() ?? false).toBe(false);
    expect(node(renderer, 'M2').group.opacity()).toBe(TOKENS.opacity.dimmed);
  });

  it('with annotated layers in the frame, the node has no Circle nor "+N" text', () => {
    const { renderer, render, editor } = setup();
    const layer = editor.store.project.peek()?.layers[0];
    if (!layer) throw new Error('fixture');
    const many: LayerDot[] = Array.from({ length: 6 }, (_, i) => ({
      layer: { ...layer, id: `L${i}` },
    }));
    // The dots channel left the frame: even if a caller still sent it, nothing is drawn.
    render({ dots: new Map([['M1', many]]) } as Partial<Frame>);
    const m1 = node(renderer, 'M1');
    expect(m1.group.find('Circle')).toHaveLength(0);
    const texts = m1.group.find('Text').map((t) => (t as KonvaText).text());
    expect(texts.some((t) => /^\+\d+$/.test(t))).toBe(false);
  });

  describe('semantic zoom name', () => {
    it('in a corner without a badge and without ⚠ it starts at the text margin, at the same header height', () => {
      const { renderer, render } = setup();
      render();
      const header = textOf(renderer, 'M1').header;
      expect(header.visible()).toBe(true);
      expect(header.x()).toBe(100 + 4);
      expect(header.y()).toBe(100 + (14 - TOKENS.type.name.size) / 2);
    });

    it('after the incomplete ⚠', () => {
      const { renderer, render } = setup();
      render({ incomplete: new Set(['M1']) });
      expect(node(renderer, 'M1').text?.header.x()).toBe(100 + ALERT_SIZE + 2);
    });
  });

  describe('incomplete ⚠ in the corner', () => {
    const incomplete = new Set(['M1']);

    it('without the "to review" badge: against the corner, with the margin', () => {
      const { renderer, render } = setup();
      render({ incomplete });
      const m1 = node(renderer, 'M1');
      expect(m1.alertClip?.visible()).toBe(true);
      expect(m1.alert?.visible()).toBe(true);
      expect(m1.alert?.x()).toBe(100 + CORNER_MARGIN);
      expect(m1.alert?.getAttrs()).toMatchObject({
        fill: TOKENS.warning,
        stroke: TOKENS.halo,
      });
      expect(m1.badge?.visible() ?? false).toBe(false);
    });

    it('with the "to review" badge: the badge in the corner and the ⚠ after it', () => {
      const { renderer, render } = setup();
      render({ project: withReview(canvasProject(), 'M1'), incomplete });
      const m1 = node(renderer, 'M1');
      expect(m1.badge?.visible()).toBe(true);
      expect(m1.badge?.x()).toBeLessThan(100 + REVIEW_BADGE_SIZE);
      expect(m1.alert?.x()).toBe(100 + REVIEW_BADGE_SIZE + CORNER_MARGIN);
    });

    it('without a pending item: the alert group is invisible', () => {
      const { renderer, render } = setup();
      render();
      const m1 = node(renderer, 'M1');
      expect(m1.alertClip?.visible() ?? false).toBe(false);
      expect(m1.alert?.visible() ?? false).toBe(false);
    });
  });

  it('incomplete alert and review badge', () => {
    const { renderer, render } = setup();
    render({
      project: withReview(canvasProject(), 'M1'),
      incomplete: new Set(['M1']),
    });
    const m1 = node(renderer, 'M1');
    expect(m1.alert?.visible()).toBe(true);
    expect(m1.alert?.getAttrs()).toMatchObject({
      fill: TOKENS.warning,
      stroke: TOKENS.halo,
    });
    expect(m1.badge?.visible()).toBe(true);
    expect(m1.badge?.fill()).toBe(TOKENS.warning);
    expect(m1.border.dash()).toEqual([6, 4]);
  });

  describe('incomplete ⚠ at low zoom (marking that draws a component)', () => {
    const drawn = new Set(['M1']);
    const SMALL = { x: 0, y: 0, scale: 0.02 };
    const BIG = { x: 0, y: 0, scale: 0.2 };

    it('appears from 24 px on screen; below that, only the border (level of detail)', () => {
      const { renderer, render } = setup();
      const incomplete = new Set(['M1']);
      render({ drawn, incomplete, viewport: SMALL });
      const m1 = node(renderer, 'M1');
      expect(m1.alert?.visible() ?? false).toBe(false);
      render({ drawn, incomplete, viewport: BIG });
      expect(m1.alert?.visible()).toBe(true);
    });
  });

  describe('marking with the drawing in view', () => {
    const drawn = new Set(['M1']);

    it('without hover or selection: no border nor halo and no own mark', () => {
      const { renderer, render } = setup();
      render({ drawn });
      const m1 = node(renderer, 'M1');
      expect(m1.border.visible()).toBe(false);
      expect(m1.halo?.visible() ?? false).toBe(false);
      expect(m1.alertClip?.visible() ?? false).toBe(false);
      expect(m1.alert?.visible() ?? false).toBe(false);
      // The other markings do not change.
      expect(node(renderer, 'M2').border.visible()).toBe(true);
      expect(node(renderer, 'M2').halo?.visible()).toBe(true);
    });

    it('the annotation pending item stays visible without the border', () => {
      const { renderer, render } = setup();
      render({ drawn, incomplete: new Set(['M1']) });
      const m1 = node(renderer, 'M1');
      expect(m1.border.visible()).toBe(false);
      expect(m1.alert?.visible()).toBe(true);
    });

    it('under the mouse or selected: the border and the halo appear', () => {
      const { renderer, render } = setup();
      render({ drawn });
      render({ drawn, hoverMarking: 'M1' });
      expect(node(renderer, 'M1').border.visible()).toBe(true);
      expect(node(renderer, 'M1').halo?.visible()).toBe(true);
      render({ drawn, hoverMarking: null });
      expect(node(renderer, 'M1').border.visible()).toBe(false);
      render({ drawn, selection: { kind: 'marking', id: 'M1' } });
      expect(node(renderer, 'M1').border.visible()).toBe(true);
      expect(node(renderer, 'M1').border.getAttrs()).toMatchObject({
        stroke: TOKENS.select,
        strokeWidth: 2,
      });
    });

    it('semantic zoom: no card nor name; the other markings keep the label', () => {
      const { renderer, render } = setup();
      render();
      expect(node(renderer, 'M1').text?.group.visible()).toBe(true);
      render({ drawn });
      expect(node(renderer, 'M1').text?.group.visible() ?? false).toBe(false);
      // M3 (unnamed, in I2) and the others follow the usual path.
      render({ drawn: new Set(['M2']) });
      expect(node(renderer, 'M1').text?.group.visible()).toBe(true);
      // pt-BR kept: shared fixture data (sampleProject) asserted by tests/model, tests/components
      expect(node(renderer, 'M1').text?.header.text()).toBe('Porta');
    });
  });

  it('pan without changing the marking does not redo the border; zoom does', () => {
    const { renderer, render } = setup();
    render();
    const spy = vi.spyOn(node(renderer, 'M1').border, 'setAttrs');
    render({ viewport: { x: -20, y: -10, scale: 1 } });
    expect(spy).not.toHaveBeenCalled();
    render({ viewport: { x: -20, y: -10, scale: 2 } });
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('semantic zoom: only the name in the header, without an annotations card', () => {
    const { renderer, render } = setup();
    render();
    const text = textOf(renderer, 'M1');
    expect(text.group.visible()).toBe(true);
    // pt-BR kept: shared fixture data (sampleProject) asserted by tests/model, tests/components
    expect(text.header.text()).toBe('Porta');
    expect(text.header.getAttrs()).toMatchObject({
      fill: TOKENS.line,
      stroke: TOKENS.halo,
      fontFamily: TOKENS.fontFamily,
      fontSize: TOKENS.type.name.size,
    });
    // The only text in the group is the name: the annotations stay in the right panel.
    expect(text.group.getChildren()).toEqual([text.header]);
  });

  it('semantic zoom: large marking without children shows only the name', () => {
    const { renderer, render } = setup();
    render({ viewport: { x: -1100, y: -1100, scale: 6 } });
    const text = textOf(renderer, 'M2');
    expect(text.group.visible()).toBe(true);
    // pt-BR kept: shared fixture data (sampleProject) asserted by tests/model, tests/components
    expect(text.header.text()).toBe('Maçaneta');
    expect(text.group.getChildren()).toEqual([text.header]);
  });

  // Stage 6 (6.4), finding 6: child at the same corner as the parent (the parent label over the child name).
  it('semantic zoom: the name of the child at the parent corner moves below its header', () => {
    const { renderer, render, editor } = setup();
    const p = editor.store.committed.value;
    if (!p) throw new Error('no project');
    const project: Project = {
      ...p,
      markings: p.markings.map((m) =>
        m.id === 'M2' ? { ...m, rect: { x: 100, y: 100, width: 200, height: 120 } } : m,
      ),
    };
    render({ project });
    const parent = textOf(renderer, 'M1').header;
    const child = textOf(renderer, 'M2').header;
    expect(parent.visible()).toBe(true);
    expect(child.visible()).toBe(true);
    expect(child.y()).toBeGreaterThanOrEqual(parent.y() + parent.height());
  });

  it('semantic zoom: small marking on screen does not show the name', () => {
    const { renderer, render } = setup();
    render({ viewport: { x: 0, y: 0, scale: 0.1 } });
    expect(node(renderer, 'M1').text?.group.visible() ?? false).toBe(false);
  });

  it('removes the node of a deleted marking', () => {
    const { layer, renderer, render } = setup();
    render();
    render({ project: removeMarking(canvasProject(), 'M2') });
    expect(renderer.node('M2')).toBeUndefined();
    expect(layer.getChildren()).toHaveLength(1);
  });
});

// Canvas and floating markings (Spatial markings stage, ME1).
describe('MarkingRenderer: canvas markings', () => {
  /** A canvas marking C1 around the two images and the floating N1 over the Door. */
  function spatial(): Project {
    const p = createMarking(canvasProject(), {
      id: 'C1',
      containerId: null,
      rect: { x: -100, y: -100, width: 1800, height: 1000 },
    });
    return createMarking(p, {
      id: 'N1',
      containerId: null,
      rect: { x: 400, y: 400, width: 200, height: 100 },
      floating: true,
    });
  }

  function twoParents() {
    const layer = new Konva.Layer();
    const floatingParent = new Konva.Group();
    layer.add(floatingParent);
    const renderer = new MarkingRenderer(layer, floatingParent);
    const editor = editorFor(spatial());
    const render = (overrides: Partial<Frame> = {}) =>
      renderer.render(
        frameOf(editor, { size: { width: 2000, height: 1200 }, ...overrides }),
        PLACEMENTS,
      );
    return { layer, floatingParent, renderer, render };
  }

  it('the canvas marking is drawn in the identity space, with a dashed border and its token', () => {
    const { renderer, render } = twoParents();
    render({ viewport: { x: 0, y: 0, scale: 2 } });
    const c1 = node(renderer, 'C1');
    expect(c1.border.getAttrs()).toMatchObject({
      x: -100,
      y: -100,
      width: 1800,
      height: 1000,
      stroke: TOKENS.canvasMarking,
      dash: [5, 3],
    });
    expect(c1.halo?.dash()).toEqual([5, 3]);
    // The container one is neither dashed nor uses the canvas token.
    expect(node(renderer, 'M1').border.dash()).toEqual([]);
    expect(node(renderer, 'M1').border.stroke()).toBe(TOKENS.line);
  });

  it('selected, the canvas marking uses the selection color and stays dashed', () => {
    const { renderer, render } = twoParents();
    render({ selection: { kind: 'marking', id: 'C1' } });
    expect(node(renderer, 'C1').border.getAttrs()).toMatchObject({
      stroke: TOKENS.select,
      dash: [10, 6],
    });
  });

  it('the floating one stays in the top group and the others in the layer; switching sides moves the node', () => {
    const { layer, floatingParent, renderer, render } = twoParents();
    render();
    expect(node(renderer, 'N1').group.getParent()).toBe(floatingParent);
    expect(node(renderer, 'C1').group.getParent()).toBe(layer);
    expect(node(renderer, 'M1').group.getParent()).toBe(layer);
    // Each stack has its own order (parent before children).
    expect(node(renderer, 'M2').group.zIndex()).toBeGreaterThan(
      node(renderer, 'M1').group.zIndex(),
    );
    expect(node(renderer, 'N1').group.zIndex()).toBe(0);

    // The Door becomes floating: the node changes group.
    const project = setMarkingFloating(spatial(), 'M1', true);
    render({ project });
    expect(node(renderer, 'M1').group.getParent()).toBe(floatingParent);
    render({ project: spatial() });
    expect(node(renderer, 'M1').group.getParent()).toBe(layer);
  });

  it('without a group of its own for the floating ones, everything stays in the same layer (compatible)', () => {
    const layer = new Konva.Layer();
    const renderer = new MarkingRenderer(layer);
    const editor = editorFor(spatial());
    renderer.render(frameOf(editor, { size: { width: 2000, height: 1200 } }), PLACEMENTS);
    expect(node(renderer, 'N1').group.getParent()).toBe(layer);
  });

  it('the canvas marking name appears at semantic zoom like the others', () => {
    const named = createMarking(canvasProject(), {
      id: 'C2',
      containerId: null,
      rect: { x: 2000, y: 100, width: 600, height: 400 },
      name: 'Group',
    });
    const layer = new Konva.Layer();
    const renderer = new MarkingRenderer(layer);
    const editor = editorFor(named);
    renderer.render(
      frameOf(editor, {
        size: { width: 3000, height: 1000 },
        viewport: { x: 0, y: 0, scale: 1 },
      }),
      PLACEMENTS,
    );
    expect(node(renderer, 'C2').text?.header.text()).toBe('Group');
  });
});

describe('level of detail by zoom', () => {
  const LOD_SIZE = { width: 1000, height: 800 };
  /** M1 (600×500) on screen: 18×15 px (only the border). */
  const FAR = { x: 0, y: 0, scale: 0.03 };
  /** M1 on screen: 0.6×0.5 px (does not appear). */
  const FARTHEST = { x: 0, y: 0, scale: 0.001 };
  const fullDetail = (incomplete = new Set(['M1'])) => ({
    project: withReview(canvasProject(), 'M1'),
    incomplete,
    size: LOD_SIZE,
  });

  it('from afar: border visible; halo, double line, badge and ⚠ invisible', () => {
    const { renderer, render } = setup();
    render({ ...fullDetail(), viewport: FAR });
    const m1 = node(renderer, 'M1');
    expect(m1.group.visible()).toBe(true);
    expect(m1.border.visible()).toBe(true);
    expect(m1.halo?.visible() ?? false).toBe(false);
    expect(m1.inner?.visible() ?? false).toBe(false);
    expect(m1.badge?.visible() ?? false).toBe(false);
    expect(m1.alertClip?.visible() ?? false).toBe(false);
    expect(m1.alert?.visible() ?? false).toBe(false);
  });

  it('from afar, with the review mark "changed": the double line stays (full)', () => {
    const { renderer, render } = setup();
    const review = {
      view: 'proposed' as const,
      markings: new Map([['M1', { line: 'changed' as const, dim: false, badges: [] }]]),
      images: new Map(),
      ghosts: [],
      removed: [],
    };
    render({ ...fullDetail(), review, viewport: FAR });
    const m1 = node(renderer, 'M1');
    expect(m1.halo?.visible()).toBe(true);
    expect(m1.inner?.visible()).toBe(true);
    expect(m1.badge?.visible()).toBe(true);
  });

  it('from afar only the group and the border are born; the review mark creates the parts of the small marking', () => {
    const { renderer, render } = setup();
    render({ ...fullDetail(), viewport: FAR });
    const m1 = node(renderer, 'M1');
    expect([m1.halo, m1.inner, m1.badge, m1.alertClip, m1.alert, m1.text]).toEqual(
      Array(6).fill(undefined),
    );
    const review = {
      view: 'proposed' as const,
      markings: new Map([['M1', { line: 'changed' as const, dim: false, badges: [] }]]),
      images: new Map(),
      ghosts: [],
      removed: [],
    };
    render({ ...fullDetail(), review, viewport: FAR });
    expect(m1.halo?.visible()).toBe(true);
    expect(m1.inner?.visible()).toBe(true);
    expect(m1.badge?.visible()).toBe(true);
    expect(m1.alert?.visible()).toBe(true);
  });

  it('below 2 px in both measures: does not get a node', () => {
    const { renderer, render } = setup();
    render({ ...fullDetail(), viewport: FARTHEST });
    expect(renderer.node('M1')).toBeUndefined();
  });

  it('selected, or under the mouse: full at any size, even below 2 px', () => {
    const { renderer, render } = setup();
    render({
      ...fullDetail(),
      viewport: FARTHEST,
      selection: { kind: 'marking', id: 'M1' },
    });
    const m1 = node(renderer, 'M1');
    expect(m1.group.visible()).toBe(true);
    expect(m1.halo?.visible()).toBe(true);
    expect(m1.badge?.visible()).toBe(true);
    expect(m1.alert?.visible()).toBe(true);

    const other = setup();
    other.render({ ...fullDetail(), viewport: FAR, hoverMarking: 'M1' });
    expect(node(other.renderer, 'M1').halo?.visible()).toBe(true);
    expect(node(other.renderer, 'M1').badge?.visible()).toBe(true);
  });

  it('multiple selection: each selected marking appears full', () => {
    const { renderer, render } = setup();
    render({
      ...fullDetail(new Set(['M1', 'M2'])),
      viewport: FAR,
      selection: { kind: 'marking', id: 'M2' },
      items: [
        { kind: 'marking', id: 'M1' },
        { kind: 'marking', id: 'M2' },
      ],
    });
    expect(node(renderer, 'M1').halo?.visible()).toBe(true);
    expect(node(renderer, 'M1').alert?.visible()).toBe(true);
    expect(node(renderer, 'M2').halo?.visible()).toBe(true);
    expect(node(renderer, 'M2').alert?.visible()).toBe(true);
  });

  it('zooming back in, the detail comes back', () => {
    const { renderer, render } = setup();
    render({ ...fullDetail(), viewport: FAR });
    render({ ...fullDetail(), viewport: { x: 0, y: 0, scale: 1 } });
    const m1 = node(renderer, 'M1');
    expect(m1.halo?.visible()).toBe(true);
    expect(m1.badge?.visible()).toBe(true);
    expect(m1.alert?.visible()).toBe(true);
  });
});
