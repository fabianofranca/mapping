// Format 4, "drawing extras" stage (DX1): the radial and angular gradients reach the scene as paints in
// the node's local px, with the stop colors already resolved.
import { describe, expect, it } from 'vitest';
import type { FieldValues } from '../../../src/model/components/componentFormat';
import {
  approximateMeasurer,
  instantiate,
} from '../../../src/model/components/instantiate';
import { parseComponent } from '../../../src/model/components/parseComponent';
import type { FrameNode, Paint } from '../../../src/model/components/scene';
import { resolveTokens } from '../../../src/model/components/tokens';

type Raw = Record<string, unknown>;

const TOKENS = {
  modes: ['light'],
  values: { brand: '#336699', ink: '#112233' },
};

const STOPS = [
  { offset: 0, color: '#ff0000' },
  { offset: 1, color: '#0000ff' },
];

/** A 200×100 frame with a single rect (80×40) whose fill is `fill`. */
function rectPaint(fill: unknown, values: FieldValues = {}): Paint {
  const parsed = parseComponent({
    format: 'mapping-component',
    formatVersion: 4,
    id: 't',
    name: 'T',
    size: { width: 200, height: 100 },
    template: {
      type: 'frame',
      children: [{ type: 'rect', width: 80, height: 40, fill }],
    },
  } satisfies Raw);
  if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
  const tokens = resolveTokens(TOKENS, {}, 'light');
  const { root } = instantiate(
    parsed.component,
    values,
    { x: 0, y: 0, width: 200, height: 100 },
    { measure: approximateMeasurer, tokens },
  );
  const rect = (root as FrameNode).children[0];
  const paint = rect && 'fills' in rect ? rect.fills[0] : undefined;
  if (!paint) throw new Error('no paint');
  return paint;
}

describe('radial gradient in the scene', () => {
  it('defaults the center to the middle of the box and the radius to half the smaller side', () => {
    const paint = rectPaint({ type: 'radial', stops: STOPS });
    expect(paint.type).toBe('radial');
    if (paint.type !== 'radial') return;
    expect(paint.center).toEqual({ x: 40, y: 20 });
    expect(paint.radius).toBe(20);
    expect(paint.stops).toEqual(STOPS);
  });

  it('takes the center as fractions of the box and the radius in px', () => {
    const paint = rectPaint({
      type: 'radial',
      center: [0.25, 1],
      radius: 33,
      stops: STOPS,
    });
    if (paint.type !== 'radial') throw new Error('expected radial');
    expect(paint.center).toEqual({ x: 20, y: 40 });
    expect(paint.radius).toBe(33);
  });
});

describe('angular gradient in the scene', () => {
  it('defaults the center to the middle of the box and the angle to 0', () => {
    const paint = rectPaint({ type: 'angular', stops: STOPS });
    expect(paint.type).toBe('angular');
    if (paint.type !== 'angular') return;
    expect(paint.center).toEqual({ x: 40, y: 20 });
    expect(paint.angle).toBe(0);
    expect(paint.stops).toEqual(STOPS);
  });

  it('keeps the center and the start angle (degrees, clockwise, 0 = right)', () => {
    const paint = rectPaint({
      type: 'angular',
      center: [0, 0.5],
      angle: 90,
      stops: STOPS,
    });
    if (paint.type !== 'angular') throw new Error('expected angular');
    expect(paint.center).toEqual({ x: 0, y: 20 });
    expect(paint.angle).toBe(90);
  });
});

describe('the stop colors', () => {
  it('resolve a $token and a $field expression, in both types', () => {
    const stops = [
      { offset: 0, color: { $token: 'brand' } },
      { offset: 0.5, color: { $field: 'mid', default: '#00ff00' } },
      { offset: 1, color: { $token: 'ink' } },
    ];
    for (const type of ['radial', 'angular']) {
      const paint = rectPaint({ type, stops }, { mid: '#abcdef' });
      if (paint.type === 'solid' || paint.type === 'linear' || paint.type === 'image')
        throw new Error('expected a sweep or radial paint');
      expect(paint.stops).toEqual([
        { offset: 0, color: '#336699' },
        { offset: 0.5, color: '#abcdef' },
        { offset: 1, color: '#112233' },
      ]);
    }
  });

  it('a gradient chosen by $switch reaches the scene as that gradient', () => {
    const fill = {
      $switch: 'kind',
      cases: {
        a: { type: 'angular', stops: STOPS },
        r: { type: 'radial', stops: STOPS },
      },
      default: '#fff',
    };
    expect(rectPaint(fill, { kind: 'a' }).type).toBe('angular');
    expect(rectPaint(fill, { kind: 'r' }).type).toBe('radial');
    expect(rectPaint(fill, { kind: 'zzz' })).toEqual({ type: 'solid', color: '#fff' });
  });
});
