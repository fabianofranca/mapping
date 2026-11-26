// Format 4, "drawing extras" stage (DX1): radial and angular gradients on the canvas. The radial one
// uses Konva's radial fill; the angular one is a `createConicGradient` set as the fill, and without it
// the shape takes the first stop's color with the `angular-gradient-unsupported` warning.
import Konva from 'konva';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installFakeCanvas } from '../harness';
import { renderScene } from '../../../src/canvas/components/renderScene';
import { RENDER_WARNING_CODES } from '../../../src/canvas/components/renderWarnings';
import { catalogEnUS, catalogPtBR } from '../../../src/i18n/catalog';
import {
  type FrameNode,
  type Paint,
  type Stroke,
  type Scene,
  baseNode,
} from '../../../src/model/components/scene';

beforeEach(() => installFakeCanvas());
afterEach(() => vi.restoreAllMocks());

const STOPS = [
  { offset: 0, color: '#ff0000' },
  { offset: 0.5, color: '#00ff00' },
  { offset: 1, color: '#0000ff' },
];

function sceneWith(fill: Paint): Scene {
  const node: FrameNode = {
    ...baseNode({ id: 'r', name: 'r', width: 100, height: 40 }),
    type: 'frame',
    clip: false,
    cornerRadius: 0,
    children: [],
    fills: [fill],
  };
  return { root: node, warnings: [] };
}

/** A 100 × 40 ellipse (a Konva ellipse has its origin at its center) with `fill`. */
function ellipseWith(fill: Paint, stroke?: Stroke): Konva.Shape {
  const frame: FrameNode = {
    ...baseNode({ id: 'r', name: 'r', width: 100, height: 40 }),
    type: 'frame',
    clip: false,
    cornerRadius: 0,
    children: [
      {
        ...baseNode({
          id: 'e',
          name: 'e',
          width: 100,
          height: 40,
          fills: [fill],
          stroke,
        }),
        type: 'ellipse',
      },
    ],
  };
  return renderScene({ root: frame, warnings: [] }).root.find(
    'Ellipse',
  )[0] as Konva.Shape;
}

function draw(fill: Paint) {
  const result = renderScene(sceneWith(fill));
  const shape = result.root.find('Shape')[0] as Konva.Rect;
  return { shape, warnings: result.warnings };
}

describe('radial gradient', () => {
  it('uses the radial fill of Konva, with the center, radius and stops', () => {
    const { shape, warnings } = draw({
      type: 'radial',
      center: { x: 30, y: 10 },
      radius: 25,
      stops: STOPS,
    });
    expect(shape.fillPriority()).toBe('radial-gradient');
    expect(shape.fillRadialGradientStartPoint()).toEqual({ x: 30, y: 10 });
    expect(shape.fillRadialGradientEndPoint()).toEqual({ x: 30, y: 10 });
    expect(shape.fillRadialGradientStartRadius()).toBe(0);
    expect(shape.fillRadialGradientEndRadius()).toBe(25);
    expect(shape.fillRadialGradientColorStops()).toEqual([
      0,
      '#ff0000',
      0.5,
      '#00ff00',
      1,
      '#0000ff',
    ]);
    expect(warnings).toEqual([]);
  });
});

describe('angular gradient', () => {
  it('sets a conic gradient as the fill, at the center and start angle (in radians)', () => {
    const { shape, warnings } = draw({
      type: 'angular',
      center: { x: 50, y: 20 },
      angle: 90,
      stops: STOPS,
    });
    const gradient = shape.fill() as unknown as {
      conic: { angle: number; x: number; y: number };
      stops: [number, string][];
    };
    expect(gradient.conic.x).toBe(50);
    expect(gradient.conic.y).toBe(20);
    expect(gradient.conic.angle).toBeCloseTo(Math.PI / 2, 10);
    expect(gradient.stops).toEqual([
      [0, '#ff0000'],
      [0.5, '#00ff00'],
      [1, '#0000ff'],
    ]);
    expect(warnings).toEqual([]);
  });

  it('skips a stop the canvas rejects (an empty color becomes none) instead of throwing', () => {
    const stops: [number, string][] = [];
    const context = {
      createConicGradient: () => ({
        addColorStop(offset: number, color: string) {
          if (color === 'none') throw new SyntaxError('invalid color');
          stops.push([offset, color]);
        },
      }),
    } as unknown as CanvasRenderingContext2D;
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
      (() => context) as unknown as typeof HTMLCanvasElement.prototype.getContext,
    );
    expect(() =>
      draw({
        type: 'angular',
        center: { x: 50, y: 20 },
        angle: 0,
        stops: [
          { offset: 0, color: '#ff0000' },
          { offset: 0.5, color: 'none' },
          { offset: 1, color: '#0000ff' },
        ],
      }),
    ).not.toThrow();
    expect(stops).toEqual([
      [0, '#ff0000'],
      [1, '#0000ff'],
    ]);
  });

  it('without createConicGradient, takes the first stop and warns', () => {
    const noConic = {} as CanvasRenderingContext2D;
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
      (() => noConic) as unknown as typeof HTMLCanvasElement.prototype.getContext,
    );
    const { shape, warnings } = draw({
      type: 'angular',
      center: { x: 50, y: 20 },
      angle: 0,
      stops: STOPS,
    });
    expect(shape.fill()).toBe('#ff0000');
    expect(warnings).toEqual([{ code: 'angular-gradient-unsupported' }]);
  });
});

describe('on an ellipse (whose Konva origin is its center)', () => {
  it('the gradients keep their coordinates in the box, as the raster reads them', () => {
    const radial = ellipseWith({
      type: 'radial',
      center: { x: 50, y: 20 },
      radius: 20,
      stops: STOPS,
    });
    expect(radial.fillRadialGradientStartPoint()).toEqual({ x: 0, y: 0 });
    expect(radial.fillRadialGradientEndPoint()).toEqual({ x: 0, y: 0 });
    const angular = ellipseWith({
      type: 'angular',
      center: { x: 50, y: 20 },
      angle: 0,
      stops: STOPS,
    });
    const gradient = angular.fill() as unknown as { conic: { x: number; y: number } };
    expect(gradient.conic).toMatchObject({ x: 0, y: 0 });
    const linear = ellipseWith({
      type: 'linear',
      start: { x: 0, y: 0 },
      end: { x: 100, y: 0 },
      stops: STOPS,
    });
    expect(linear.fillLinearGradientStartPoint()).toEqual({ x: -50, y: -20 });
    expect(linear.fillLinearGradientEndPoint()).toEqual({ x: 50, y: -20 });
  });
});

describe('a linear stroke gradient', () => {
  const LINEAR: Paint = {
    type: 'linear',
    start: { x: 0, y: 0 },
    end: { x: 100, y: 0 },
    stops: STOPS,
  };
  const STROKE: Stroke = { width: 2, align: 'center', paints: [LINEAR] };

  it('on an ellipse is converted like the fill (the Konva origin is the center)', () => {
    const strokeShape = (
      ellipseWith({ type: 'solid', color: '#000000' }, STROKE).getParent() as Konva.Group
    ).find('Ellipse')[1] as Konva.Shape;
    expect(strokeShape.strokeLinearGradientStartPoint()).toEqual({ x: -50, y: -20 });
    expect(strokeShape.strokeLinearGradientEndPoint()).toEqual({ x: 50, y: -20 });
  });

  it('on a rect keeps the points in the box', () => {
    const node: FrameNode = {
      ...baseNode({ id: 'r', name: 'r', width: 100, height: 40 }),
      type: 'frame',
      clip: false,
      cornerRadius: 0,
      children: [],
      stroke: STROKE,
    };
    const rect = renderScene({ root: node, warnings: [] }).root.find(
      'Rect',
    )[0] as Konva.Rect;
    expect(rect.strokeLinearGradientStartPoint()).toEqual({ x: 0, y: 0 });
    expect(rect.strokeLinearGradientEndPoint()).toEqual({ x: 100, y: 0 });
  });

  /** The stroke `Rect` of a 100 × 40 frame with `stroke`. */
  function strokeRect(stroke: Stroke): Konva.Rect {
    const node: FrameNode = {
      ...baseNode({ id: 'r', name: 'r', width: 100, height: 40 }),
      type: 'frame',
      clip: false,
      cornerRadius: 0,
      children: [],
      stroke,
    };
    return renderScene({ root: node, warnings: [] }).root.find('Rect')[0] as Konva.Rect;
  }

  it.each([
    ['inside', { width: 4, align: 'inside' }, { x: -2, y: -2 }, { x: 98, y: -2 }],
    ['outside', { width: 4, align: 'outside' }, { x: 2, y: 2 }, { x: 102, y: 2 }],
    [
      'center with an offset',
      { width: 2, align: 'center', offset: 3 },
      { x: 3, y: 3 },
      { x: 103, y: 3 },
    ],
  ] as const)(
    'on a rect, the %s stroke follows the scene points',
    (_name, shape, start, end) => {
      const rect = strokeRect({ ...shape, paints: [LINEAR] });
      expect(rect.strokeLinearGradientStartPoint()).toEqual(start);
      expect(rect.strokeLinearGradientEndPoint()).toEqual(end);
      expect(rect.x() + rect.strokeLinearGradientStartPoint().x).toBe(0);
      expect(rect.x() + rect.strokeLinearGradientEndPoint().x).toBe(100);
    },
  );
});

describe('the warning text', () => {
  it('is in the list of codes and has text in both locales', () => {
    expect(RENDER_WARNING_CODES).toContain('angular-gradient-unsupported');
    const key = 'catalog.drawWarning.angular-gradient-unsupported' as const;
    expect(catalogEnUS[key]).toMatch(/angular/i);
    expect(catalogPtBR[key]).toMatch(/angular/i);
  });
});
