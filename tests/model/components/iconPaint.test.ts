// Icons file formatVersion 4, phase LG2: the gradient `fill` of an icon path and the icon `clip`
// reach the scene: the paint in `viewBox` units and the group's `clipPath` with the children's matrix.
import { describe, expect, it } from 'vitest';
import { COMPONENT_FORMAT } from '../../../src/model/components/componentFormat';
import type { ComponentFile } from '../../../src/model/components/componentFormat';
import { parseIconsFile } from '../../../src/model/components/icons';
import type { IconSet } from '../../../src/model/components/icons';
import {
  approximateMeasurer,
  instantiate,
} from '../../../src/model/components/instantiate';
import type { GroupNode, PathNode, SceneNode } from '../../../src/model/components/scene';
import { walk } from '../../../src/model/components/scene';

const STOPS = [
  { offset: 0, color: '#ff0000' },
  { offset: 1, color: '#0000ff' },
];

function setOf(icons: unknown, viewBox: [number, number] = [24, 24]): IconSet {
  const result = parseIconsFile({
    format: 'mapping-icons',
    formatVersion: 4,
    viewBox,
    icons,
  });
  if (!result.ok) throw new Error(result.errors.join('; '));
  return result.set;
}

function draw(
  node: Record<string, unknown>,
  icons: IconSet,
  values: Record<string, string> = {},
  size = 48,
): { root: SceneNode; warnings: readonly string[] } {
  const component = {
    format: COMPONENT_FORMAT,
    formatVersion: 4,
    id: 'c',
    name: 'C',
    size: { width: size, height: size },
    template: { type: 'frame', children: [{ type: 'icon', ...node }] },
  } as unknown as ComponentFile;
  return instantiate(
    component,
    values,
    { x: 0, y: 0, width: size, height: size },
    { measure: approximateMeasurer, icons },
  );
}

const paths = (root: SceneNode): PathNode[] =>
  [...walk(root)].filter((n): n is PathNode => n.type === 'path');
const iconGroup = (root: SceneNode): GroupNode | undefined =>
  [...walk(root)].find((n): n is GroupNode => n.type === 'group');

const SQUARE = 'M0 0h24v24H0z';

describe('icon path gradient paint (decisions 4 and 5)', () => {
  it('the linear from/to keeps those points in the path scene', () => {
    const icons = setOf({
      badge: { paths: [{ d: SQUARE, fill: { type: 'linear', from: [0, 0], to: [24, 0], stops: STOPS } }] },
    });
    const { root, warnings } = draw({ name: 'badge' }, icons);
    expect(warnings).toEqual([]);
    expect(paths(root)[0]?.fills).toEqual([
      {
        type: 'linear',
        start: { x: 0, y: 0 },
        end: { x: 24, y: 0 },
        stops: STOPS,
      },
    ]);
  });

  it('angle 90 on a 24 × 24 viewBox runs from (12, 0) to (12, 24)', () => {
    const icons = setOf({
      badge: { paths: [{ d: SQUARE, fill: { type: 'linear', angle: 90, stops: STOPS } }] },
    });
    const [fill] = paths(draw({ name: 'badge' }, icons).root)[0]?.fills ?? [];
    expect(fill?.type).toBe('linear');
    if (fill?.type !== 'linear') return;
    expect(fill.start.x).toBeCloseTo(12);
    expect(fill.start.y).toBeCloseTo(0);
    expect(fill.end.x).toBeCloseTo(12);
    expect(fill.end.y).toBeCloseTo(24);
  });

  it('the box is the icon viewBox: its own wins over the set one', () => {
    const icons = setOf({
      wide: {
        viewBox: [48, 24],
        paths: [{ d: 'M0 0h48v24H0z', fill: { type: 'linear', angle: 0, stops: STOPS } }],
      },
    });
    const [fill] = paths(draw({ name: 'wide' }, icons).root)[0]?.fills ?? [];
    if (fill?.type !== 'linear') throw new Error('expected a linear paint');
    expect(fill.start.x).toBeCloseTo(0);
    expect(fill.end.x).toBeCloseTo(48);
    expect(fill.start.y).toBeCloseTo(12);
  });

  it('the radial center is in fractions of the viewBox and the radius in its units', () => {
    const icons = setOf({
      badge: {
        paths: [
          {
            d: SQUARE,
            fill: { type: 'radial', center: [0.25, 0.75], radius: 4, stops: STOPS },
          },
          { d: SQUARE, fill: { type: 'radial', stops: STOPS } },
        ],
      },
    });
    const [custom, plain] = paths(draw({ name: 'badge' }, icons).root);
    expect(custom?.fills).toEqual([
      { type: 'radial', center: { x: 6, y: 18 }, radius: 4, stops: STOPS },
    ]);
    // the default center is the middle and the radius half the smaller side
    expect(plain?.fills).toEqual([
      { type: 'radial', center: { x: 12, y: 12 }, radius: 12, stops: STOPS },
    ]);
  });

  it('the angular gradient takes its center and start angle in the viewBox', () => {
    const icons = setOf({
      badge: {
        paths: [{ d: SQUARE, fill: { type: 'angular', center: [0.5, 0.5], angle: 30, stops: STOPS } }],
      },
    });
    expect(paths(draw({ name: 'badge' }, icons).root)[0]?.fills).toEqual([
      { type: 'angular', center: { x: 12, y: 12 }, angle: 30, stops: STOPS },
    ]);
  });

  it('the node color does not tint a gradient path; fill true and the default still take it', () => {
    const icons = setOf({
      badge: {
        paths: [
          { d: SQUARE, fill: { type: 'linear', angle: 0, stops: STOPS } },
          { d: SQUARE, fill: true },
          { d: SQUARE },
        ],
      },
    });
    const [gradient, filled, plain] = paths(draw({ name: 'badge', color: '#112233' }, icons).root);
    expect(gradient?.fills).toHaveLength(1);
    expect(gradient?.fills[0]?.type).toBe('linear');
    expect(JSON.stringify(gradient?.fills)).not.toContain('#112233');
    expect(filled?.fills).toEqual([{ type: 'solid', color: '#112233' }]);
    expect(plain?.fills).toEqual([{ type: 'solid', color: '#112233' }]);
  });

  it('a gradient fill can share the path with a stroke, which stays a color', () => {
    const icons = setOf({
      badge: {
        paths: [
          {
            d: SQUARE,
            fill: { type: 'radial', stops: STOPS },
            stroke: '#00ff00',
            width: 2,
          },
        ],
      },
    });
    const [path] = paths(draw({ name: 'badge' }, icons).root);
    expect(path?.fills[0]?.type).toBe('radial');
    expect(path?.stroke?.paints).toEqual([{ type: 'solid', color: '#00ff00' }]);
  });
});

describe('icon clip (decision 5)', () => {
  const CIRCLE = 'M12 0a12 12 0 1 0 0 24a12 12 0 1 0 0-24z';
  const withClip = (clip: unknown, mirror?: boolean) =>
    setOf({
      badge: { clip, ...(mirror ? { mirror } : {}), paths: [{ d: SQUARE }] },
      plain: { paths: [{ d: SQUARE }] },
    });

  it('the icon group carries clipPath with d, fillRule and the children transform', () => {
    const icons = withClip({ d: CIRCLE, fillRule: 'evenodd' });
    const group = iconGroup(draw({ name: 'badge' }, icons, {}, 48).root);
    expect(group?.clipPath).toEqual({
      d: CIRCLE,
      fillRule: 'evenodd',
      transform: [2, 0, 0, 2, 0, 0],
    });
    // the same matrix as the path children
    expect(paths(group as SceneNode)[0]?.transform).toEqual(group?.clipPath?.transform);
  });

  it('without a fillRule the clip is nonzero', () => {
    const group = iconGroup(draw({ name: 'badge' }, withClip({ d: CIRCLE })).root);
    expect(group?.clipPath?.fillRule).toBe('nonzero');
  });

  it('the clip mirrors in rtl, like the children', () => {
    const icons = withClip({ d: CIRCLE }, true);
    const group = iconGroup(draw({ name: 'badge', direction: 'rtl' }, icons, {}, 48).root);
    expect(group?.clipPath?.transform).toEqual([-2, 0, 0, 2, 48, 0]);
    expect(paths(group as SceneNode)[0]?.transform).toEqual(group?.clipPath?.transform);
  });

  it('an icon without a clip has no clipPath', () => {
    expect(iconGroup(draw({ name: 'plain' }, withClip({ d: CIRCLE })).root)?.clipPath).toBeUndefined();
  });

  it('an unknown icon has no clipPath (it is the placeholder)', () => {
    const { root, warnings } = draw({ name: 'missing' }, withClip({ d: CIRCLE }));
    const node = [...walk(root)].find((n) => n.name === 'missing');
    expect(node).toBeDefined();
    expect(node && 'clipPath' in node).toBe(false);
    expect(warnings.length).toBeGreaterThan(0);
  });
});
