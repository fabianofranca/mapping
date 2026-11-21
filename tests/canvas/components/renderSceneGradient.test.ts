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

describe('the warning text', () => {
  it('is in the list of codes and has text in both locales', () => {
    expect(RENDER_WARNING_CODES).toContain('angular-gradient-unsupported');
    const key = 'catalog.drawWarning.angular-gradient-unsupported' as const;
    expect(catalogEnUS[key]).toMatch(/angular/i);
    expect(catalogPtBR[key]).toMatch(/angular/i);
  });
});
