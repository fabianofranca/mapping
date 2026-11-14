import Konva from 'konva/lib/Core';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { arrowStrokes, visibleArrowShapes } from '../../../src/canvas/arrowGeometry';
import { ArrowRenderer, type ArrowPainter } from '../../../src/canvas/renderers/arrows';
import { setArrowName, setArrowStyle, type Project } from '../../../src/model';
import { arrowProject, withArrow } from '../../model/arrowFixtures';
import { editorFor, frameOf, installFakeCanvas, TOKENS } from '../harness';

beforeAll(installFakeCanvas);
afterAll(() => vi.restoreAllMocks());

const NONE = new Map();

/** Records the paint calls: `[operation, ...arguments]`. */
function recorder() {
  const calls: unknown[][] = [];
  const painter: ArrowPainter = {
    beginPath: () => calls.push(['beginPath']),
    moveTo: (x, y) => calls.push(['moveTo', x, y]),
    lineTo: (x, y) => calls.push(['lineTo', x, y]),
    closePath: () => calls.push(['closePath']),
    stroke: () => calls.push(['stroke']),
    fill: () => calls.push(['fill']),
    setAttr: (attr, value) => calls.push(['set', attr, value]),
  };
  return { calls, painter };
}

/** The recorded values of a context attribute (`lineWidth`, `strokeStyle`, …), in order. */
const attr = (calls: unknown[][], name: string) =>
  calls.filter((c) => c[0] === 'set' && c[1] === name).map((c) => c[2]);

function setup(project: Project = arrowProject()) {
  const layer = new Konva.Layer();
  const renderer = new ArrowRenderer(layer);
  const editor = editorFor(project);
  // The screen is large on purpose: an arrow outside the visible area is not painted (CD3, decision 7).
  const render = (overrides: Parameters<typeof frameOf>[1] = {}) =>
    renderer.render(
      frameOf(editor, { size: { width: 20_000, height: 20_000 }, ...overrides }),
    );
  const paint = () => {
    const r = recorder();
    renderer.paint(r.painter);
    return r.calls;
  };
  return { layer, renderer, editor, render, paint };
}

describe('ArrowRenderer', () => {
  it('all arrows are a single node, between the layer and the labels', () => {
    const { layer, renderer, render } = setup(
      withArrow(arrowProject(), 'r2', 'a3', 'b2'),
    );
    render();
    expect(renderer.size).toBe(2);
    expect(layer.getChildren()).toHaveLength(2); // the arrows node and the labels group
    expect(layer.getChildren()[0]).toBe(renderer.node);
    expect(renderer.node.listening()).toBe(false);
  });

  it('paints the halo, the stroke and the head with the theme colors', () => {
    const { render, paint } = setup();
    render();
    const calls = paint();
    // Halo (stroke and head), then the stroke and the head in the arrow color.
    expect(attr(calls, 'strokeStyle')).toEqual([
      TOKENS.halo,
      TOKENS.halo,
      TOKENS.arrow.stroke,
    ]);
    expect(attr(calls, 'fillStyle')).toEqual([TOKENS.halo, TOKENS.arrow.stroke]);
    expect(attr(calls, 'lineCap')).toEqual(['round']);
    const widths = attr(calls, 'lineWidth') as number[];
    expect(widths[2]).toBe(TOKENS.arrow.width);
    expect(widths[0]).toBeGreaterThan(widths[2] as number);
    // The head is a closed triangle whose tip is at the arrival anchor (600, 700).
    const closes = calls.filter((c) => c[0] === 'closePath');
    expect(closes).toHaveLength(2);
    expect(calls).toContainEqual(['moveTo', 600, 700]);
    // The stroke ends before the head: no stroke lineTo goes past x = 600.
    const firstStroke = calls.findIndex((c) => c[0] === 'stroke');
    const body = calls.slice(0, firstStroke).filter((c) => c[0] === 'lineTo');
    expect(Math.max(...body.map((c) => c[1] as number))).toBeLessThan(600);
  });

  it('thickness, halo and head have screen size: they divide by the zoom', () => {
    const { render, paint } = setup();
    render({ viewport: { x: 0, y: 0, scale: 2 } });
    const calls = paint();
    expect((attr(calls, 'lineWidth') as number[])[2]).toBe(TOKENS.arrow.width / 2);
    // The head (10 screen px) is 5 canvas units long.
    const strokes = arrowStrokes(visibleArrowShapes(arrowProject(), NONE), 2, 10);
    const head = strokes.heads[0] as number[];
    const baseX = ((head[2] as number) + (head[4] as number)) / 2;
    expect(Math.abs(baseX - (head[0] as number))).toBeCloseTo(5, 0);
    render({ viewport: { x: 0, y: 0, scale: 0.5 } });
    expect((attr(paint(), 'lineWidth') as number[])[2]).toBe(TOKENS.arrow.width / 0.5);
  });

  it('without arrows (or without a theme), it paints nothing', () => {
    const { render, paint } = setup();
    expect(paint()).toEqual([]);
    render({ arrows: [] });
    expect(paint()).toEqual([]);
  });

  it('the drawing is computed once per zoom: repainting (pan) reuses it', () => {
    const { render, paint, renderer } = setup();
    render();
    const first = paint();
    const spy = vi.spyOn(
      (renderer as unknown as { strokes: { get(...args: unknown[]): unknown } }).strokes,
      'get',
    );
    render({ viewport: { x: -300, y: 40, scale: 1 } }); // pan
    expect(paint()).toEqual(first);
    expect(spy).toHaveBeenCalledTimes(1);
    render({ viewport: { x: 0, y: 0, scale: 1.5 } });
    expect(paint()).not.toEqual(first);
  });

  it('only the arrows in the frame; the set changes, the drawing changes', () => {
    const project = withArrow(arrowProject(), 'r2', 'a3', 'b2');
    const { renderer, render, paint } = setup(project);
    render();
    const both = paint().filter((c) => c[0] === 'closePath').length;
    expect(both).toBe(4);
    // Head hidden by the display mode: the arrow is not drawn.
    render({ arrows: visibleArrowShapes(project, new Map([['b2', 'hidden']])) });
    expect(renderer.size).toBe(1);
    expect(paint().filter((c) => c[0] === 'closePath')).toHaveLength(2);
    // No arrows in view ("Show arrows" off, Clean view): nothing.
    render({ arrows: [] });
    expect(renderer.size).toBe(0);
  });

  it('curve: many samples in the stroke; straight and corner: the route points', () => {
    const curve = setup();
    curve.render();
    const curvePoints = curve.paint().filter((c) => c[0] === 'lineTo').length;
    expect(curvePoints).toBeGreaterThan(20);
    const straight = setup(setArrowStyle(arrowProject(), 'r1', 'straight'));
    straight.render();
    // Two points on the route: the stroke (one lineTo) and two lineTo for the head, on each pass.
    const lines = straight.paint().filter((c) => c[0] === 'lineTo').length;
    expect(lines).toBeLessThan(curvePoints);
    // The corner has four points on the route (three segments): two more lineTo than the straight one per pass.
    const elbow = setup(setArrowStyle(arrowProject(), 'r1', 'elbow'));
    elbow.render();
    const elbowLines = elbow.paint().filter((c) => c[0] === 'lineTo').length;
    expect(elbowLines).toBeGreaterThan(lines);
    expect(elbowLines).toBeLessThan(curvePoints);
  });

  it('the corner is stroked with a miter join (sharp corners); the curve and the straight one, round', () => {
    const joins = (project: Project) => {
      const { render, paint } = setup(project);
      render();
      return attr(paint(), 'lineJoin');
    };
    expect(joins(arrowProject())).toEqual(['round', 'round']);
    // Halo and stroke with a miter join, going back to the round join for the heads.
    expect(joins(setArrowStyle(arrowProject(), 'r1', 'elbow'))).toEqual([
      'round',
      'miter',
      'round',
      'round',
      'miter',
      'round',
    ]);
  });
});

describe('ArrowRenderer: label', () => {
  it('in the middle of the stroke when there is a name, centered, at screen size', () => {
    const named = setArrowName(arrowProject(), 'r1', 'Opens');
    const { renderer, render } = setup(named);
    render();
    const label = renderer.label('r1');
    if (!label) throw new Error('no label');
    expect(label.text.text()).toBe('Opens');
    expect(label.text.fill()).toBe(TOKENS.arrow.label);
    expect(label.box.fill()).toBe(TOKENS.arrow.labelBg);
    const width = label.box.width();
    expect(label.group.x() + width / 2).toBeCloseTo(500, 0);
    expect(label.group.y() + label.box.height() / 2).toBeCloseTo(475, 0);
    render({ viewport: { x: 0, y: 0, scale: 2 } });
    expect(label.group.scaleX()).toBe(0.5);
    // Centered on the same point with the zoom: half the screen width is half on the canvas.
    expect(label.group.x() + width / 2 / 2).toBeCloseTo(500, 0);
  });

  it('without a name there is no label; the label disappears with the arrow or with the name', () => {
    const named = setArrowName(withArrow(arrowProject(), 'r2', 'a3', 'b2'), 'r2', 'Goes');
    const { renderer, render, editor } = setup(named);
    render();
    expect(renderer.label('r1')).toBeUndefined();
    expect(renderer.label('r2')).toBeDefined();
    editor.actions.setArrowName('r2', null);
    render();
    expect(renderer.label('r2')).toBeUndefined();
    editor.actions.setArrowName('r2', 'Other');
    render();
    expect(renderer.label('r2')?.text.text()).toBe('Other');
    render({ arrows: [] });
    expect(renderer.label('r2')).toBeUndefined();
  });

  it('the same frame does not redo the label', () => {
    const { renderer, render } = setup(setArrowName(arrowProject(), 'r1', 'Opens'));
    render();
    const group = renderer.label('r1')?.group;
    const x = group?.x();
    render();
    expect(renderer.label('r1')?.group).toBe(group);
    expect(group?.x()).toBe(x);
  });
});
