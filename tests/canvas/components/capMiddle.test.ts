// Formato 4, FX1: o centro pela altura da maiúscula (`verticalAlign: "cap-middle"`) no Konva.
// As métricas da fonte entram injetadas (ascent 10, descent 3, capHeight 8), então a conta é exata.
import Konva from 'konva';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { installFakeCanvas } from '../harness';
import { capMiddleShift } from '../../../src/canvas/components/capMiddle';
import { renderScene } from '../../../src/canvas/components/renderScene';
import type { ComponentFile } from '../../../src/model/components/componentFormat';
import {
  approximateMeasurer,
  instantiate,
} from '../../../src/model/components/instantiate';
import { walk, type Scene } from '../../../src/model/components/scene';

beforeAll(() => installFakeCanvas());
let measureSpy: { mockRestore: () => void } | undefined;
afterEach(() => measureSpy?.mockRestore());

/** ascent 10, descent 3 (a linha de base do Konva fica em (10−3)/2 + lh/2) e `H` com 8 de altura. */
function injectMetrics(): void {
  measureSpy = vi.spyOn(Konva.Text.prototype, 'measureSize').mockImplementation(
    (text: string) =>
      ({
        width: text.length * 6,
        fontBoundingBoxAscent: 10,
        fontBoundingBoxDescent: 3,
        actualBoundingBoxAscent: text === 'H' ? 8 : 9,
        actualBoundingBoxDescent: 0,
      }) as unknown as ReturnType<Konva.Text['measureSize']>,
  );
}

function scene(node: Record<string, unknown>, height = 40): Scene {
  const file: ComponentFile = {
    format: 'mapping-component',
    formatVersion: 4,
    id: 'c',
    name: 'C',
    size: { width: 100, height },
    template: {
      type: 'frame',
      layout: { type: 'none' },
      children: [
        {
          type: 'text',
          name: 't',
          anchors: { left: 0, top: 0 },
          width: 100,
          height,
          font: {
            size: 10,
            lineHeight: 12,
            family: 'Roboto',
            verticalAlign: 'cap-middle',
          },
          color: '#111111',
          ...node,
        },
      ],
    } as ComponentFile['template'],
  };
  const { root } = instantiate(
    file,
    {},
    { x: 0, y: 0, width: 100, height },
    { measure: approximateMeasurer },
  );
  expect([...walk(root)].some((n) => n.type === 'text')).toBe(true);
  return { root, warnings: [] };
}

function texts(s: Scene): Konva.Text[] {
  return renderScene(s).root.find('Text') as Konva.Text[];
}

describe('capMiddleShift (conta pura)', () => {
  it('uma linha: o centro da maiúscula cai no centro da caixa', () => {
    // Linha de base natural (topo) em 9,5; maiúscula 8: o bloco ocupa [1,5 ; 9,5] e deve ir a [16 ; 24].
    const shift = capMiddleShift({
      boxHeight: 40,
      capHeight: 8,
      firstBaseline: 9.5,
      lastBaseline: 9.5,
    });
    expect(shift).toBeCloseTo(16 - 1.5, 9);
    // Depois do deslocamento: topo da maiúscula = 9,5 + 14,5 − 8 = 16; a linha de base, 24.
    expect(9.5 + shift - 8 + 4).toBeCloseTo(20, 9);
  });

  it('o bloco é da maiúscula da primeira linha à base da última', () => {
    const shift = capMiddleShift({
      boxHeight: 100,
      capHeight: 8,
      firstBaseline: 9.5,
      lastBaseline: 9.5 + 12 * 2,
    });
    // bloco = 8 + 24 = 32 → primeira base em (100 − 32)/2 + 8 = 42.
    expect(9.5 + shift).toBeCloseTo(42, 9);
  });
});

describe('cap-middle no texto simples do Konva', () => {
  it('uma linha: a base cai em (altura − capHeight)/2 + capHeight', () => {
    injectMetrics();
    const [text] = texts(scene({ text: 'Ok' }));
    // Konva (top) põe a base em (10 − 3)/2 + 12/2 = 9,5; a desejada é (40 − 8)/2 + 8 = 24.
    expect(text?.verticalAlign()).toBe('top');
    expect(text?.y()).toBeCloseTo(24 - 9.5, 9);
  });

  it('duas linhas: o bloco da maiúscula à base da segunda fica centrado', () => {
    injectMetrics();
    // Largura 70 / 5,5 por letra: duas palavras de 10 letras quebram em duas linhas.
    const [text] = texts(scene({ text: 'abcdefghij abcdefghij', width: 70 }, 60));
    expect(text?.textArr).toHaveLength(2);
    // bloco = 8 + 12; primeira base em (60 − 20)/2 + 8 = 28.
    expect(text?.y()).toBeCloseTo(28 - 9.5, 9);
  });

  it('maxLines cortando: o centro é o das linhas que sobram', () => {
    injectMetrics();
    const long = 'abcdefghij abcdefghij abcdefghij abcdefghij abcdefghij abcdefghij';
    const [text] = texts(
      scene(
        {
          text: long,
          font: {
            size: 10,
            lineHeight: 12,
            family: 'Roboto',
            verticalAlign: 'cap-middle',
            maxLines: 1,
          },
        },
        40,
      ),
    );
    expect(text?.height()).toBe(12);
    expect(text?.y()).toBeCloseTo(24 - 9.5, 9);
  });

  it('o middle não muda: continua o do Konva, sem deslocamento próprio', () => {
    injectMetrics();
    const [text] = texts(
      scene({
        text: 'Ok',
        font: { size: 10, lineHeight: 12, family: 'Roboto', verticalAlign: 'middle' },
      }),
    );
    expect(text?.verticalAlign()).toBe('middle');
    expect(text?.y()).toBe(0);
  });
});

describe('cap-middle nos trechos (runs)', () => {
  it('a base da primeira linha vai a (altura − capHeight)/2 + capHeight', () => {
    injectMetrics();
    const [first] = texts(
      scene({ runs: [{ text: 'Vence em ' }, { text: '3 dias', weight: 700 }] }),
    );
    // Linha única de altura 12 em y 0: base natural em 6 + (10 − 3)/2 = 9,5 → vai a 24.
    expect(first?.y()).toBeCloseTo(24 - 9.5, 9);
  });

  it('duas linhas de trechos: o bloco vai da maiúscula da 1ª à base da 2ª', () => {
    injectMetrics();
    const runs = [{ text: 'abcdefghij abcdefghij' }];
    const shapes = texts(scene({ runs, width: 70 }, 60));
    expect(shapes.length).toBeGreaterThanOrEqual(2);
    // bloco = 8 + 12: primeira base em 28, a segunda em 40.
    expect(shapes[0]?.y()).toBeCloseTo(28 - 9.5, 9);
    expect(shapes[1]?.y()).toBeCloseTo(40 - 9.5, 9);
  });
});
