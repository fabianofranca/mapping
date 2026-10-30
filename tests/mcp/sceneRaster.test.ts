import { describe, expect, it, vi } from 'vitest';
import { approximateMeasurer } from '../../src/model';
import { instantiate } from '../../src/model/components/instantiate';
import { parseComponent } from '../../src/model/components/parseComponent';
import {
  baseNode,
  translate,
  type FrameNode,
  type SceneNode,
  type TextNode,
} from '../../src/model/components/scene';
import { createRaster, type Raster } from '../../mcp/image/raster';
import {
  flattenPath,
  paintScene,
  parseColor,
  textBars,
} from '../../mcp/image/sceneRaster';

// Desenho simplificado de uma cena em pixels (get_marking_image num container): formas
// preenchidas, traço, recorte do frame, texto em barras e composição com transparência.

const WHITE = [255, 255, 255, 255];

function canvas(width: number, height: number): Raster {
  const raster = createRaster(width, height);
  raster.data.fill(255);
  return raster;
}

function pixel(raster: Raster, x: number, y: number): number[] {
  const i = (y * raster.width + x) * 4;
  return [...raster.data.subarray(i, i + 4)];
}

function frame(
  children: SceneNode[],
  size: { width: number; height: number },
  extra: Partial<FrameNode> = {},
): FrameNode {
  return {
    ...baseNode({ id: 'root', name: 'root', ...size }),
    type: 'frame',
    clip: false,
    cornerRadius: 0,
    children,
    ...extra,
  };
}

const solid = (color: string, opacity?: number) => ({
  type: 'solid' as const,
  color,
  ...(opacity === undefined ? {} : { opacity }),
});

function paint(raster: Raster, root: SceneNode, scale = 1) {
  paintScene(raster, [{ root }], approximateMeasurer, {
    scaleX: scale,
    scaleY: scale,
    clip: { x: 0, y: 0, width: raster.width, height: raster.height },
  });
}

describe('cor', () => {
  it('lê #rgb, #rrggbb, #rrggbbaa e rgba()', () => {
    expect(parseColor('#f00')).toEqual({ rgb: [255, 0, 0], alpha: 1 });
    expect(parseColor('#336699')).toEqual({ rgb: [0x33, 0x66, 0x99], alpha: 1 });
    expect(parseColor('#00000080')?.alpha).toBeCloseTo(0.5, 2);
    expect(parseColor('rgba(10, 20, 30, 0.25)')).toEqual({
      rgb: [10, 20, 30],
      alpha: 0.25,
    });
    expect(parseColor('transparent')?.alpha).toBe(0);
    expect(parseColor('azul')).toBeNull();
  });
});

describe('caminho SVG', () => {
  it('achata M L H V Z e curvas em segmentos; arco vira linha reta', () => {
    const [square] = flattenPath('M 0 0 H 10 V 10 L 0 10 Z');
    expect(square?.closed).toBe(true);
    expect(square?.points).toEqual([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ]);
    const [curve] = flattenPath(
      'M0 0 C 0 10 10 10 10 0 S 20 -10 20 0 Q 25 5 30 0 T 40 0',
    );
    expect(curve?.points.length).toBeGreaterThan(40);
    expect(curve?.points.at(-1)).toEqual({ x: 40, y: 0 });
    const [arc] = flattenPath('M0 0 a5 5 0 0 1 10 0');
    expect(arc?.points).toEqual([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ]);
    const [relative] = flattenPath('m1 1 l2 0 2 2');
    expect(relative?.points).toEqual([
      { x: 1, y: 1 },
      { x: 3, y: 1 },
      { x: 5, y: 3 },
    ]);
  });
});

describe('pintura da cena', () => {
  it('retângulo sólido na posição, com a escala', () => {
    const raster = canvas(40, 40);
    const rect: SceneNode = {
      ...baseNode({
        id: 'r',
        name: 'r',
        width: 10,
        height: 10,
        transform: translate(5, 5),
        fills: [solid('#FF0000')],
      }),
      type: 'rect',
      cornerRadius: 0,
    };
    paint(raster, frame([rect], { width: 40, height: 40 }), 2);
    expect(pixel(raster, 12, 12)).toEqual([255, 0, 0, 255]);
    expect(pixel(raster, 29, 29)).toEqual([255, 0, 0, 255]);
    expect(pixel(raster, 9, 9)).toEqual(WHITE);
    expect(pixel(raster, 31, 31)).toEqual(WHITE);
  });

  it('retângulo com raio de canto deixa o canto no fundo', () => {
    const raster = canvas(30, 30);
    const rect: SceneNode = {
      ...baseNode({
        id: 'r',
        name: 'r',
        width: 30,
        height: 30,
        fills: [solid('#000000')],
      }),
      type: 'rect',
      cornerRadius: 15,
    };
    paint(raster, rect);
    expect(pixel(raster, 15, 15)).toEqual([0, 0, 0, 255]);
    expect(pixel(raster, 0, 0)).toEqual(WHITE);
    expect(pixel(raster, 15, 1)).toEqual([0, 0, 0, 255]);
  });

  it('elipse: centro cheio, canto vazio', () => {
    const raster = canvas(40, 20);
    const ellipse: SceneNode = {
      ...baseNode({
        id: 'e',
        name: 'e',
        width: 40,
        height: 20,
        fills: [solid('#0000FF')],
      }),
      type: 'ellipse',
    };
    paint(raster, ellipse);
    expect(pixel(raster, 20, 10)).toEqual([0, 0, 255, 255]);
    expect(pixel(raster, 1, 1)).toEqual(WHITE);
    expect(pixel(raster, 38, 18)).toEqual(WHITE);
  });

  it('caminho: triângulo preenchido; par-ímpar deixa o furo, não-zero não', () => {
    const triangle: SceneNode = {
      ...baseNode({
        id: 'p',
        name: 'p',
        width: 20,
        height: 20,
        fills: [solid('#00AA00')],
      }),
      type: 'path',
      d: 'M0 20 L10 0 L20 20 Z',
      fillRule: 'nonzero',
    };
    const raster = canvas(20, 20);
    paint(raster, triangle);
    expect(pixel(raster, 10, 15)).toEqual([0, 170, 0, 255]);
    expect(pixel(raster, 1, 2)).toEqual(WHITE);

    const ring = (fillRule: 'nonzero' | 'evenodd'): SceneNode => ({
      ...baseNode({
        id: 'o',
        name: 'o',
        width: 30,
        height: 30,
        fills: [solid('#000000')],
      }),
      type: 'path',
      // Dois quadrados do mesmo sentido: o de dentro só some no par-ímpar.
      d: 'M0 0 H30 V30 H0 Z M10 10 H20 V20 H10 Z',
      fillRule,
    });
    const evenOdd = canvas(30, 30);
    paint(evenOdd, ring('evenodd'));
    expect(pixel(evenOdd, 15, 15)).toEqual(WHITE);
    expect(pixel(evenOdd, 3, 3)).toEqual([0, 0, 0, 255]);
    const nonZero = canvas(30, 30);
    paint(nonZero, ring('nonzero'));
    expect(pixel(nonZero, 15, 15)).toEqual([0, 0, 0, 255]);
  });

  it('linha aberta só tem traço; o traço tem a largura pedida', () => {
    const line: SceneNode = {
      ...baseNode({ id: 'l', name: 'l', width: 40, height: 0 }),
      type: 'line',
      points: [
        { x: 0, y: 10 },
        { x: 40, y: 10 },
      ],
      closed: false,
      stroke: { paints: [solid('#FF00FF')], width: 4, align: 'center' },
    };
    const raster = canvas(40, 20);
    paint(raster, line);
    expect(pixel(raster, 20, 9)).toEqual([255, 0, 255, 255]);
    expect(pixel(raster, 20, 10)).toEqual([255, 0, 255, 255]);
    expect(pixel(raster, 20, 5)).toEqual(WHITE);
    expect(pixel(raster, 20, 15)).toEqual(WHITE);
  });

  it('gradiente vira a cor do primeiro stop e imagem vira reservado cinza', () => {
    const gradient: SceneNode = {
      ...baseNode({
        id: 'g',
        name: 'g',
        width: 10,
        height: 10,
        fills: [
          {
            type: 'linear',
            start: { x: 0, y: 0 },
            end: { x: 10, y: 0 },
            stops: [
              { offset: 0, color: '#FF0000' },
              { offset: 1, color: '#0000FF' },
            ],
          },
        ],
      }),
      type: 'rect',
      cornerRadius: 0,
    };
    const image: SceneNode = {
      ...baseNode({
        id: 'i',
        name: 'i',
        width: 10,
        height: 10,
        transform: translate(10, 0),
        fills: [{ type: 'image' }],
      }),
      type: 'rect',
      cornerRadius: 0,
    };
    const raster = canvas(20, 10);
    paint(raster, frame([gradient, image], { width: 20, height: 10 }));
    expect(pixel(raster, 9, 5)).toEqual([255, 0, 0, 255]);
    const [r, g, b] = pixel(raster, 15, 5);
    expect(r).toBe(g);
    expect(g).toBe(b);
    expect(r).toBeLessThan(255);
    expect(r).toBeGreaterThan(150);
  });

  it('transparência: opacidade do nó e do preenchimento se compõem sobre o fundo', () => {
    const rect = (opacity: number, paintOpacity?: number): SceneNode => ({
      ...baseNode({
        id: 'r',
        name: 'r',
        width: 10,
        height: 10,
        opacity,
        fills: [solid('#000000', paintOpacity)],
      }),
      type: 'rect',
      cornerRadius: 0,
    });
    const half = canvas(10, 10);
    paint(half, rect(0.5));
    const [v] = pixel(half, 5, 5);
    expect(v).toBeGreaterThanOrEqual(127);
    expect(v).toBeLessThanOrEqual(128);
    const quarter = canvas(10, 10);
    paint(quarter, rect(0.5, 0.5));
    expect(pixel(quarter, 5, 5)[0]).toBeGreaterThanOrEqual(191);
    expect(pixel(quarter, 5, 5)[0]).toBeLessThanOrEqual(192);
    // Fundo transparente: a cor sai e a opacidade fica no canal alfa.
    const clear = createRaster(10, 10);
    paint(clear, rect(0.5));
    expect(pixel(clear, 5, 5)).toEqual([0, 0, 0, 128]);
  });

  it('nó invisível não é pintado e o frame com clip recorta os filhos', () => {
    const hidden: SceneNode = {
      ...baseNode({
        id: 'h',
        name: 'h',
        width: 10,
        height: 10,
        visible: false,
        fills: [solid('#FF0000')],
      }),
      type: 'rect',
      cornerRadius: 0,
    };
    const big: SceneNode = {
      ...baseNode({
        id: 'b',
        name: 'b',
        width: 40,
        height: 40,
        fills: [solid('#FF0000')],
      }),
      type: 'rect',
      cornerRadius: 0,
    };
    const raster = canvas(40, 40);
    paint(raster, frame([hidden], { width: 40, height: 40 }));
    expect(pixel(raster, 5, 5)).toEqual(WHITE);
    const clipped = frame([big], { width: 10, height: 10 }, { clip: true });
    paint(raster, clipped);
    expect(pixel(raster, 5, 5)).toEqual([255, 0, 0, 255]);
    expect(pixel(raster, 20, 20)).toEqual(WHITE);
  });

  it('só pinta dentro da região (clip) e ignora a cena que não a cruza', () => {
    const rect: SceneNode = {
      ...baseNode({
        id: 'r',
        name: 'r',
        width: 40,
        height: 40,
        fills: [solid('#FF0000')],
      }),
      type: 'rect',
      cornerRadius: 0,
    };
    const raster = canvas(40, 40);
    paintScene(raster, [{ root: rect }], approximateMeasurer, {
      scaleX: 1,
      scaleY: 1,
      clip: { x: 10, y: 10, width: 10, height: 10 },
    });
    expect(pixel(raster, 15, 15)).toEqual([255, 0, 0, 255]);
    expect(pixel(raster, 5, 5)).toEqual(WHITE);
    expect(pixel(raster, 25, 25)).toEqual(WHITE);
    const away = canvas(40, 40);
    paintScene(
      away,
      [{ root: { ...rect, transform: translate(100, 100) } }],
      approximateMeasurer,
      {
        scaleX: 1,
        scaleY: 1,
        clip: { x: 0, y: 0, width: 40, height: 40 },
      },
    );
    expect(pixel(away, 20, 20)).toEqual(WHITE);
  });
});

describe('texto em barras', () => {
  const text = (extra: Partial<TextNode> = {}, width = 100): TextNode => ({
    ...baseNode({
      id: 't',
      name: 't',
      width,
      height: 40,
      fills: [solid('#112233')],
    }),
    type: 'text',
    text: 'Entrar agora',
    style: {
      fontFamily: 'Roboto',
      fontSize: 10,
      fontWeight: 400,
      italic: false,
      lineHeight: 20,
      align: 'left',
      verticalAlign: 'top',
    },
    ...extra,
  });

  it('uma barra por linha medida, com 60% da altura da linha', () => {
    // 0,55 × 10 px por caractere: "Entrar agora" (12) tem 66 px e cabe em 100.
    const one = textBars(text(), approximateMeasurer);
    expect(one).toHaveLength(1);
    expect(one[0]).toMatchObject({ x: 0, width: 66, height: 12 });
    expect(one[0]!.y).toBeCloseTo(4, 5);
    // Em 40 px quebra por palavras: "Entrar" (33) e "agora" (27,5).
    const two = textBars(text({}, 40), approximateMeasurer);
    expect(two).toHaveLength(2);
    expect(two[1]!.y).toBeCloseTo(24, 5);
  });

  it('alinhamento horizontal e vertical', () => {
    const centered = textBars(
      text({
        style: {
          ...text().style,
          align: 'center',
          verticalAlign: 'middle',
        },
      }),
      approximateMeasurer,
    );
    expect(centered[0]!.x).toBeCloseTo(17, 5);
    expect(centered[0]!.y).toBeCloseTo(14, 5);
    const right = textBars(
      text({ style: { ...text().style, align: 'right' } }),
      approximateMeasurer,
    );
    expect(right[0]!.x).toBeCloseTo(34, 5);
  });

  it('pinta a barra na cor do texto e deixa o resto do fundo', () => {
    const raster = canvas(100, 40);
    paint(raster, text());
    expect(pixel(raster, 30, 10)).toEqual([0x11, 0x22, 0x33, 255]);
    expect(pixel(raster, 30, 18)).toEqual(WHITE);
    expect(pixel(raster, 80, 10)).toEqual(WHITE);
  });
});

describe('imagem remota de um componente', () => {
  it('um componente com o nó image desenha a cor do reservado, sem rede', () => {
    const parsed = parseComponent({
      format: 'mapping-component',
      formatVersion: 3,
      id: 'foto',
      name: 'Foto',
      size: { width: 20, height: 10 },
      template: {
        type: 'frame',
        children: [{ type: 'image', src: { $field: 'foto' } }],
      },
    });
    if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
    const { root } = instantiate(
      parsed.component,
      { foto: 'https://cdn.exemplo.com/a.png' },
      { x: 0, y: 0, width: 20, height: 10 },
      { measure: approximateMeasurer },
    );
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const raster = canvas(20, 10);
    paint(raster, root);
    const [r, g, b] = pixel(raster, 10, 5);
    expect(r).toBe(g);
    expect(g).toBe(b);
    expect(r).toBeLessThan(255);
    expect(r).toBeGreaterThan(150);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
