// CF7: the `icon` node reaches Konva as paths with the node color, the cap and the viewBox scale.
import Konva from 'konva';
import { beforeAll, describe, expect, it } from 'vitest';
import { installFakeCanvas } from '../harness';
import { renderScene } from '../../../src/canvas/components/renderScene';
import { COMPONENT_FORMAT } from '../../../src/model/components/componentFormat';
import type { ComponentFile } from '../../../src/model/components/componentFormat';
import type { IconSet } from '../../../src/model/components/icons';
import {
  approximateMeasurer,
  instantiate,
} from '../../../src/model/components/instantiate';

beforeAll(() => installFakeCanvas());

const icons: IconSet = {
  viewBox: [24, 24],
  icons: {
    clipped: {
      clip: { d: 'M0 0h12v24H0z' },
      paths: [{ d: 'M0 0h24v24H0z', fill: true }],
    },
    holed: {
      clip: { d: 'M0 0h24v24H0zM8 8h8v8H8z', fillRule: 'evenodd' },
      paths: [{ d: 'M0 0h24v24H0z', fill: true }],
    },
    check: {
      paths: [
        { d: 'M5 12l5 5L20 7', stroke: true, width: 2, cap: 'round', join: 'round' },
      ],
    },
    dot: { paths: [{ d: 'M12 8a4 4 0 1 0 0 8a4 4 0 1 0 0-8z', fill: true }] },
  },
};

const component = (children: unknown[]): ComponentFile =>
  ({
    format: COMPONENT_FORMAT,
    formatVersion: 4,
    id: 'c',
    name: 'C',
    size: { width: 48, height: 48 },
    template: { type: 'frame', clip: false, children },
  }) as unknown as ComponentFile;

function render(children: unknown[], values = {}) {
  const { root, warnings } = instantiate(
    component(children),
    values,
    { x: 0, y: 0, width: 48, height: 48 },
    { measure: approximateMeasurer, icons },
  );
  return renderScene({ root, warnings }).root;
}

const pathsOf = (group: Konva.Group): Konva.Path[] => group.find('Path') as Konva.Path[];

describe('renderScene: icon node', () => {
  it('draws the stroke with the node color, round cap and join and the icon width', () => {
    const [path] = pathsOf(
      render([{ type: 'icon', name: 'check', color: '#0a7', width: 48, height: 48 }]),
    );
    expect(path?.data()).toBe('M5 12l5 5L20 7');
    expect(path?.stroke()).toBe('#0a7');
    expect(path?.lineCap()).toBe('round');
    expect(path?.lineJoin()).toBe('round');
    expect(path?.strokeWidth()).toBe(2);
    const holder = path?.getParent();
    expect(holder?.scaleX()).toBe(2);
    expect(holder?.scaleY()).toBe(2);
  });

  it('fills the path with the node color when fill is requested', () => {
    const [path] = pathsOf(render([{ type: 'icon', name: 'dot', color: '#c00' }]));
    expect(path?.fill()).toBe('#c00');
  });

  it('unknown name: only the dashed placeholder, without a repeated drawing warning', () => {
    const { root, warnings } = instantiate(
      component([{ type: 'icon', name: { $field: 'icon' }, width: 24, height: 24 }]),
      { icon: 'missing' },
      { x: 0, y: 0, width: 48, height: 48 },
      { measure: approximateMeasurer, icons },
    );
    expect(warnings).toEqual(['unknown icon: missing']);
    const rendered = renderScene({ root, warnings });
    expect(pathsOf(rendered.root)).toEqual([]);
    const boxes = rendered.root.find('Rect') as Konva.Rect[];
    expect(boxes.some((box) => (box.dash() ?? []).length > 0)).toBe(true);
    expect(rendered.warnings).toEqual([]);
  });
});

describe('renderScene: icon clip (icons file formatVersion 4)', () => {
  /** Runs the group's clipFunc on a recording context and returns the calls and the returned args. */
  function clipOf(group: Konva.Group) {
    const calls: [string, ...number[]][] = [];
    const record =
      (name: string) =>
      (...args: number[]) => {
        calls.push([name, ...args]);
      };
    const ctx = {
      beginPath: record('beginPath'),
      closePath: record('closePath'),
      moveTo: record('moveTo'),
      lineTo: record('lineTo'),
      rect: record('rect'),
      bezierCurveTo: record('bezierCurveTo'),
      quadraticCurveTo: record('quadraticCurveTo'),
      arc: record('arc'),
      ellipse: record('ellipse'),
      arcTo: record('arcTo'),
      save: record('save'),
      restore: record('restore'),
      transform: record('transform'),
    };
    const fn = group.clipFunc() as unknown as
      ((c: Konva.Context, g: Konva.Group) => unknown) | undefined;
    const returned = fn?.(ctx as unknown as Konva.Context, group);
    return { calls, returned, has: fn !== undefined };
  }

  const icon = (name: string) =>
    render([{ type: 'icon', name, color: '#0a7', width: 48, height: 48 }]);
  const iconGroup = (name: string): Konva.Group => {
    const [path] = pathsOf(icon(name));
    return path!.getParent()!.getParent() as Konva.Group;
  };

  it('the icon group gets a clipFunc that draws the path with the viewBox transform', () => {
    const { calls, has } = clipOf(iconGroup('clipped'));
    expect(has).toBe(true);
    // 48 / 24 = 2: the transform of the children is applied to the clip path.
    const names = calls.map((c) => c[0]);
    expect(names).toContain('transform');
    expect(calls.find((c) => c[0] === 'transform')).toEqual([
      'transform',
      2,
      0,
      0,
      2,
      0,
      0,
    ]);
    expect(names).toContain('moveTo');
    expect(names.indexOf('transform')).toBeLessThan(names.indexOf('moveTo'));
    // The matrix is restored: it must not leak into the clip call that Konva makes afterwards.
    expect(names.lastIndexOf('restore')).toBeGreaterThan(names.indexOf('moveTo'));
  });

  it('passes the fill rule to the clip (nonzero by default, evenodd when asked)', () => {
    expect(clipOf(iconGroup('clipped')).returned).toEqual(['nonzero']);
    expect(clipOf(iconGroup('holed')).returned).toEqual(['evenodd']);
  });

  it('a group without clipPath has no clipFunc', () => {
    expect(iconGroup('check').clipFunc()).toBeUndefined();
    expect(iconGroup('dot').clipFunc()).toBeUndefined();
  });
});
