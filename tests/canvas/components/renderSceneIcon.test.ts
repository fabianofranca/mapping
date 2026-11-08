// CF7: o nó `icon` chega ao Konva como caminhos com a cor do nó, a ponta e a escala do viewBox.
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

describe('renderScene: nó icon', () => {
  it('desenha o traço com a cor do nó, ponta e canto redondos e a largura do ícone', () => {
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

  it('preenche o caminho com a cor do nó quando pede fill', () => {
    const [path] = pathsOf(render([{ type: 'icon', name: 'dot', color: '#c00' }]));
    expect(path?.fill()).toBe('#c00');
  });

  it('nome desconhecido: só o reservado tracejado, sem aviso repetido do desenho', () => {
    const { root, warnings } = instantiate(
      component([{ type: 'icon', name: { $field: 'icone' }, width: 24, height: 24 }]),
      { icone: 'nuvem' },
      { x: 0, y: 0, width: 48, height: 48 },
      { measure: approximateMeasurer, icons },
    );
    expect(warnings).toEqual(['ícone desconhecido: nuvem']);
    const rendered = renderScene({ root, warnings });
    expect(pathsOf(rendered.root)).toEqual([]);
    const boxes = rendered.root.find('Rect') as Konva.Rect[];
    expect(boxes.some((box) => (box.dash() ?? []).length > 0)).toBe(true);
    expect(rendered.warnings).toEqual([]);
  });
});
