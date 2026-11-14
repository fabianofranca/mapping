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
