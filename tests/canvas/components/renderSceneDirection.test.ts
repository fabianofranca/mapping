// R1 (#1096): a direção de leitura no Konva. O nó `Text` recebe `direction: 'rtl'` só em rtl, e a
// matriz espelhada (scaleX negativo) dos nós `icon`/`path` com `mirror` sai certa pelo `decompose`:
// o caminho espelhado ocupa a mesma caixa que ocuparia sem espelho.
import Konva from 'konva';
import { beforeAll, describe, expect, it } from 'vitest';
import { installFakeCanvas } from '../harness';
import { decompose, renderScene } from '../../../src/canvas/components/renderScene';
import { COMPONENT_FORMAT } from '../../../src/model/components/componentFormat';
import type { ComponentFile } from '../../../src/model/components/componentFormat';
import type { IconSet } from '../../../src/model/components/icons';
import {
  approximateMeasurer,
  instantiate,
} from '../../../src/model/components/instantiate';
import { baseNode, type TextNode } from '../../../src/model/components/scene';

beforeAll(() => installFakeCanvas());

const icons = {
  viewBox: [24, 24],
  icons: {
    back: { mirror: true, paths: [{ d: 'M15 5l-7 7 7 7', fill: true }] },
  },
} as unknown as IconSet;

const component = (children: unknown[]): ComponentFile =>
  ({
    format: COMPONENT_FORMAT,
    formatVersion: 4,
    id: 'c',
    name: 'C',
    size: { width: 100, height: 40 },
    template: { type: 'row', width: 100, height: 40, children },
  }) as unknown as ComponentFile;

function render(children: unknown[], direction?: 'rtl') {
  const { root, warnings } = instantiate(
    component(children),
    {},
    { x: 0, y: 0, width: 100, height: 40 },
    { measure: approximateMeasurer, icons, ...(direction ? { direction } : {}) },
  );
  return renderScene({ root, warnings }).root;
}

const paths = (g: Konva.Group) => g.find('Path') as Konva.Path[];
const textOf = (style: Partial<TextNode['style']>): TextNode => ({
  ...baseNode({
    id: 't',
    name: 't',
    width: 80,
    height: 20,
    fills: [{ type: 'solid', color: '#000' }],
  }),
  type: 'text',
  text: 'abc',
  style: {
    fontFamily: 'sans-serif',
    fontSize: 10,
    fontWeight: 400,
    italic: false,
    lineHeight: 14,
    align: 'right',
    verticalAlign: 'top',
    ...style,
  },
});
const konvaText = (n: TextNode): Konva.Text =>
  (renderScene({ root: n, warnings: [] }).root.find('Text') as Konva.Text[])[0]!;

describe('renderScene: direção', () => {
  it('Text leva direction rtl só quando o estilo pede', () => {
    expect(konvaText(textOf({ direction: 'rtl' })).direction()).toBe('rtl');
    expect(konvaText(textOf({})).direction()).not.toBe('rtl');
    expect(konvaText(textOf({ direction: 'rtl', align: 'left' })).align()).toBe('left');
  });

  it('o decompose de uma matriz com scaleX negativo reconstrói a mesma matriz', () => {
    const m = [-2, 0, 0, 2, 30, 4] as const;
    const group = new Konva.Group(decompose(m));
    const got = group.getTransform().m.map((v) => Math.round(v * 1e6) / 1e6 + 0);
    expect(got).toEqual([...m]);
  });

  it('o ícone espelhado em rtl ocupa a mesma caixa que ocuparia em ltr', () => {
    const box = (d?: 'rtl') => {
      const g = render([{ type: 'icon', name: 'back', width: 24, height: 24 }], d);
      const [p] = paths(g);
      return p!.getClientRect({ relativeTo: g.getLayer() ?? undefined, skipStroke: true });
    };
    expect(box('rtl').width).toBeCloseTo(box().width, 6);
    expect(box('rtl').height).toBeCloseTo(box().height, 6);
  });
});
