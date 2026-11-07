// Formato 4, fase CF4: o texto rico (`runs`) vira um KonvaText por pedaço de linha e um KonvaRect
// por caixa em linha (chip), nas posições do `runLayout` da cena.
import Konva from 'konva';
import { beforeAll, describe, expect, it } from 'vitest';
import { installFakeCanvas } from '../harness';
import { canvasFontFamily } from '../../../src/model/components/fontFamily';
import { renderScene } from '../../../src/canvas/components/renderScene';
import type {
  ComponentFile,
  FieldValues,
} from '../../../src/model/components/componentFormat';
import {
  approximateMeasurer,
  instantiate,
} from '../../../src/model/components/instantiate';
import { walk, type Scene, type TextNode } from '../../../src/model/components/scene';

beforeAll(() => installFakeCanvas());

// Fonte 10 / linha 12: no medidor aproximado cada caractere mede 5,5 (6 em negrito).
function file(node: Record<string, unknown>, width = 100, height = 60): ComponentFile {
  return {
    format: 'mapping-component',
    formatVersion: 4,
    id: 'r',
    name: 'R',
    size: { width, height },
    template: {
      type: 'frame',
      layout: { type: 'none' },
      children: [
        {
          type: 'text',
          name: 't',
          anchors: { left: 0, top: 0 },
          width,
          height,
          font: { size: 10, lineHeight: 12, family: 'Roboto' },
          color: '#111111',
          ...node,
        },
      ],
    } as ComponentFile['template'],
  };
}

function build(
  node: Record<string, unknown>,
  values: FieldValues = {},
  width = 100,
  height = 60,
): { scene: Scene; text: TextNode } {
  const { root } = instantiate(
    file(node, width, height),
    values,
    { x: 0, y: 0, width, height },
    { measure: approximateMeasurer },
  );
  const text = [...walk(root)].find((n): n is TextNode => n.type === 'text');
  if (!text) throw new Error('sem nó de texto');
  return { scene: { root, warnings: [] }, text };
}

function drawn(scene: Scene): { texts: Konva.Text[]; rects: Konva.Rect[] } {
  const { root } = renderScene(scene);
  return {
    texts: root.find('Text') as Konva.Text[],
    // O quadro transparente leva uma área clicável invisível: não conta como fundo de chip.
    rects: (root.find('Rect') as Konva.Rect[]).filter((r) => r.fill() !== 'transparent'),
  };
}

const CHIP = { background: '#ffeecc', radius: 4, padding: [2, 4] };

describe('texto rico no Konva', () => {
  it('um KonvaText por pedaço, com a fonte, o peso e a cor do trecho', () => {
    const { scene } = build({
      runs: [
        { text: 'Vence em ' },
        { text: '3 dias', weight: 700, color: '#ff0000', italic: true },
      ],
    });
    const { texts, rects } = drawn(scene);
    expect(rects).toHaveLength(0);
    expect(texts.map((t) => t.text())).toEqual(['Vence em ', '3 dias']);
    expect(texts[0]?.fill()).toBe('#111111');
    expect(texts[0]?.fontStyle()).toBe('normal');
    expect(texts[1]?.fill()).toBe('#ff0000');
    expect(texts[1]?.fontStyle()).toBe('italic bold');
    expect(texts[1]?.fontFamily()).toBe(canvasFontFamily('Roboto'));
    expect(texts[1]?.fontSize()).toBe(10);
  });

  it('cada pedaço é uma linha sem largura nem quebra (wrap none) e cai na posição do layout', () => {
    const { scene, text } = build({
      runs: [{ text: 'Vence em ' }, { text: '3 dias', weight: 700, size: 14 }],
    });
    const { texts } = drawn(scene);
    const pieces = text.runLayout?.lines[0]?.pieces ?? [];
    expect(texts).toHaveLength(2);
    texts.forEach((shape, i) => {
      expect(shape.wrap()).toBe('none');
      expect(shape.attrs.width).toBeUndefined();
      expect(shape.attrs.height).toBeUndefined();
      expect(shape.x()).toBeCloseTo(pieces[i]?.x ?? NaN, 6);
    });
    // O pedaço maior (14) tem linha de 16,8 e o menor, de 12, centrado nela.
    expect(texts[0]?.fontSize()).toBe(10);
    expect(texts[1]?.fontSize()).toBe(14);
    expect(texts[1]?.lineHeight()).toBeCloseTo(1.2, 6);
    expect(texts[0]?.y()).toBeCloseTo((16.8 - 12) / 2, 6);
    expect(texts[1]?.y()).toBeCloseTo(0, 6);
  });

  it('decoração do trecho e espaçamento entre letras do nó chegam ao Konva', () => {
    const { scene } = build({
      font: { size: 10, lineHeight: 12, letterSpacing: 1 },
      runs: [{ text: 'a ' }, { text: 'riscado', decoration: 'line-through' }],
    });
    const { texts } = drawn(scene);
    expect(texts[0]?.textDecoration()).toBe('');
    expect(texts[1]?.textDecoration()).toBe('line-through');
    expect(texts.every((t) => t.letterSpacing() === 1)).toBe(true);
  });

  it('o traço do nó vale para cada pedaço de texto', () => {
    const { scene } = build({
      stroke: { color: '#00ff00', width: 1 },
      runs: [{ text: 'a ' }, { text: 'b', color: '#ff0000' }],
    });
    const { texts } = drawn(scene);
    expect(texts).toHaveLength(2);
    expect(texts.every((t) => t.stroke() === '#00ff00' && t.strokeWidth() === 1)).toBe(
      true,
    );
    expect(texts[1]?.fill()).toBe('#ff0000');
  });

  it('o chip vira um KonvaRect com fundo, raio e a caixa do layout; o texto fica padding[1] para dentro', () => {
    const { scene, text } = build({
      runs: [{ text: 'Status ' }, { text: 'ok', ...CHIP }],
    });
    const { texts, rects } = drawn(scene);
    const chip = text.runLayout?.lines[0]?.pieces[1];
    expect(chip?.chip).toBe(true);
    expect(rects).toHaveLength(1);
    expect(rects[0]?.fill()).toBe('#ffeecc');
    expect(rects[0]?.cornerRadius()).toBe(4);
    expect(rects[0]?.x()).toBeCloseTo(chip?.x ?? NaN, 6);
    expect(rects[0]?.width()).toBeCloseTo(chip?.width ?? NaN, 6);
    expect(rects[0]?.height()).toBeCloseTo(chip?.height ?? NaN, 6);
    // Linha de 16 (12 + 2·2): o chip ocupa a linha toda e o texto cai 2 abaixo do topo dele.
    expect(rects[0]?.y()).toBeCloseTo(0, 6);
    expect(texts[1]?.text()).toBe('ok');
    expect(texts[1]?.x()).toBeCloseTo((chip?.x ?? NaN) + 4, 6);
    expect(texts[1]?.y()).toBeCloseTo(2, 6);
    // O fundo é desenhado antes do texto do chip.
    const order = renderScene(scene).root.find('Shape') as Konva.Shape[];
    const kinds = order.map((shape) => shape.className);
    expect(kinds.slice(-2)).toEqual(['Rect', 'Text']);
  });

  it('chip no começo da linha: o texto " novo" mantém o espaço e começa em x 0', () => {
    // "aaaa bbbb cccc" ocupa 77 de 100; o chip " novo" (27,5 + 8) não cabe no resto.
    const { scene, text } = build({
      runs: [{ text: 'aaaa bbbb cccc' }, { text: ' novo', ...CHIP }],
    });
    expect(text.runLayout?.lines).toHaveLength(2);
    const { texts, rects } = drawn(scene);
    const second = text.runLayout?.lines[1];
    expect(second?.pieces[0]).toMatchObject({ text: ' novo', x: 0, chip: true });
    expect(rects).toHaveLength(1);
    expect(rects[0]?.x()).toBe(0);
    expect(rects[0]?.y()).toBeCloseTo(second?.y ?? NaN, 6);
    const novo = texts.find((t) => t.text().includes('novo'));
    expect(novo?.text()).toBe(' novo');
    // O Konva só apaga espaço do começo quando ele mesmo quebra a linha: aqui não quebra.
    expect(novo?.textArr[0]?.text).toBe(' novo');
    expect(novo?.x()).toBeCloseTo(4, 6);
  });

  it('verticalAlign middle e bottom deslocam os pedaços pela folga da caixa', () => {
    const runs = [{ text: 'Vence em ' }, { text: 'ok', ...CHIP }];
    const top = build({ runs });
    const middle = build({
      font: { size: 10, lineHeight: 12, verticalAlign: 'middle' },
      runs,
    });
    const bottom = build({
      font: { size: 10, lineHeight: 12, verticalAlign: 'bottom' },
      runs,
    });
    const height = top.text.runLayout?.height ?? NaN;
    const free = 60 - height;
    expect(free).toBeGreaterThan(0);
    const yOf = (s: Scene): number[] => drawn(s).texts.map((t) => t.y());
    const rectY = (s: Scene): number => drawn(s).rects[0]?.y() ?? NaN;
    yOf(middle.scene).forEach((y, i) =>
      expect(y).toBeCloseTo(yOf(top.scene)[i]! + free / 2, 6),
    );
    yOf(bottom.scene).forEach((y, i) =>
      expect(y).toBeCloseTo(yOf(top.scene)[i]! + free, 6),
    );
    expect(rectY(middle.scene)).toBeCloseTo(rectY(top.scene) + free / 2, 6);
  });

  it('o nó sem runs não muda: um KonvaText com a largura e a altura do nó', () => {
    const { scene } = build({ text: 'olá mundo' });
    const { texts, rects } = drawn(scene);
    expect(rects).toHaveLength(0);
    expect(texts).toHaveLength(1);
    expect(texts[0]?.text()).toBe('olá mundo');
    expect(texts[0]?.wrap()).toBe('word');
    expect(texts[0]?.width()).toBe(100);
  });
});
