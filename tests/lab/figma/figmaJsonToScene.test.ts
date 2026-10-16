import { describe, expect, it } from 'vitest';
import { figmaColor, figmaJsonToScene } from '../../../lab/figma/figmaJsonToScene';
import {
  countNodes,
  type FrameNode,
  type GroupNode,
  type Matrix,
  type PathNode,
  type RectNode,
  type SceneNode,
  type TextNode,
} from '../../../lab/scene/scene';

const solid = (r: number, g: number, b: number, a = 1, opacity?: number) => ({
  type: 'SOLID',
  color: { r, g, b, a },
  ...(opacity === undefined ? {} : { opacity }),
});

const rt = (x: number, y: number) => [
  [1, 0, x],
  [0, 1, y],
];

/** Moldura com um exemplo de cada tipo suportado (e alguns não suportados). */
function frameFixture() {
  return {
    id: '1:1',
    name: 'Cartão',
    type: 'FRAME',
    clipsContent: true,
    cornerRadius: 12,
    opacity: 0.9,
    absoluteBoundingBox: { x: 100, y: 200, width: 400, height: 300 },
    relativeTransform: rt(100, 200),
    size: { x: 400, y: 300 },
    fills: [solid(1, 1, 1, 1, 0.5), { ...solid(0, 0, 0), visible: false }],
    effects: [
      {
        type: 'DROP_SHADOW',
        visible: true,
        color: { r: 0, g: 0, b: 0, a: 0.25 },
        offset: { x: 1, y: 4 },
        radius: 8,
        spread: 2,
      },
      {
        type: 'INNER_SHADOW',
        color: { r: 1, g: 0, b: 0, a: 1 },
        offset: { x: 0, y: 1 },
        radius: 3,
      },
      {
        type: 'DROP_SHADOW',
        visible: false,
        color: { r: 0, g: 0, b: 0, a: 1 },
        radius: 1,
      },
    ],
    children: [
      {
        id: '1:2',
        name: 'Botão',
        type: 'RECTANGLE',
        relativeTransform: rt(20, 30),
        size: { x: 120, y: 80 },
        rectangleCornerRadii: [4, 8, 12, 16],
        fills: [
          {
            type: 'GRADIENT_LINEAR',
            gradientHandlePositions: [
              { x: 0, y: 0.5 },
              { x: 1, y: 0.5 },
              { x: 0, y: 1 },
            ],
            gradientStops: [
              { position: 0, color: { r: 1, g: 0, b: 0, a: 1 } },
              { position: 1, color: { r: 0, g: 0, b: 1, a: 0.5 } },
            ],
          },
        ],
        strokes: [solid(0, 0, 0)],
        strokeWeight: 2,
        strokeAlign: 'INSIDE',
      },
      {
        id: '1:3',
        name: 'Título',
        type: 'TEXT',
        relativeTransform: rt(20, 130),
        size: { x: 200, y: 24 },
        characters: 'Olá, mundo',
        fills: [solid(0.2, 0.4, 0.6)],
        style: {
          fontFamily: 'Inter',
          fontPostScriptName: 'Inter-SemiBold',
          fontWeight: 600,
          fontSize: 16,
          lineHeightPx: 24,
          textAlignHorizontal: 'CENTER',
          textAlignVertical: 'TOP',
          textDecoration: 'UNDERLINE',
        },
      },
      {
        id: '1:4',
        name: 'Ícone',
        type: 'VECTOR',
        relativeTransform: rt(240, 20),
        size: { x: 40, y: 40 },
        fills: [solid(0, 1, 0)],
        strokes: [solid(1, 0, 1)],
        strokeWeight: 2,
        fillGeometry: [
          { path: 'M0 0L40 0L40 40Z', windingRule: 'NONZERO' },
          { path: 'M10 10L20 10L20 20Z', windingRule: 'EVENODD' },
        ],
        strokeGeometry: [{ path: 'M0 0L41 0Z', windingRule: 'NONZERO' }],
      },
      {
        id: '1:5',
        name: 'Bolha',
        type: 'ELLIPSE',
        relativeTransform: rt(300, 20),
        size: { x: 60, y: 40 },
        fills: [solid(1, 0.5, 0)],
        effects: [{ type: 'LAYER_BLUR', radius: 4 }],
      },
      {
        id: '1:6',
        name: 'Linha',
        type: 'LINE',
        relativeTransform: rt(20, 240),
        size: { x: 100, y: 0 },
        strokes: [solid(0, 0, 0)],
        strokeWeight: 3,
        strokeDashes: [4, 2],
        strokeCap: 'ROUND',
        strokeJoin: 'BEVEL',
      },
      {
        id: '1:7',
        name: 'Foto',
        type: 'INSTANCE',
        relativeTransform: rt(200, 150),
        size: { x: 100, y: 100 },
        fills: [{ type: 'IMAGE', imageRef: 'abc', scaleMode: 'FILL', opacity: 0.8 }],
        children: [
          {
            id: '1:7a',
            name: 'Oculto',
            type: 'RECTANGLE',
            visible: false,
            relativeTransform: rt(5, 5),
            size: { x: 10, y: 10 },
            fills: [solid(0, 0, 0)],
          },
        ],
      },
      {
        id: '1:8',
        name: 'Grupo girado',
        type: 'GROUP',
        rotation: 45,
        absoluteBoundingBox: { x: 150, y: 300, width: 80, height: 60 },
        children: [
          {
            id: '1:8a',
            name: 'Dentro',
            type: 'RECTANGLE',
            rotation: 10,
            absoluteBoundingBox: { x: 160, y: 310, width: 20, height: 10 },
            fills: [solid(0, 0, 0)],
          },
        ],
      },
      { id: '1:9', name: 'Nota', type: 'STICKY' },
      { id: '1:10', name: 'Fatia', type: 'SLICE' },
    ],
  };
}

function nodesResponse() {
  return {
    name: 'arquivo',
    nodes: { '1:1': { document: frameFixture(), components: {} } },
  };
}

const kid = (node: SceneNode, index: number): SceneNode => {
  if (node.type !== 'frame' && node.type !== 'group') throw new Error('sem filhos');
  const child = node.children[index];
  if (!child) throw new Error(`sem filho ${index}`);
  return child;
};

const expectMatrix = (actual: Matrix, expected: Matrix) =>
  expected.forEach((v, i) => expect(actual[i]).toBeCloseTo(v, 6));

describe('figmaColor', () => {
  it('arredonda os canais para 0..255 e o alfa para 3 casas', () => {
    expect(figmaColor({ r: 1, g: 0.5, b: 0, a: 0.12345 })).toBe(
      'rgba(255, 128, 0, 0.123)',
    );
  });

  it('assume alfa 1 e multiplica pelo alfa extra', () => {
    expect(figmaColor({ r: 0, g: 0, b: 0 })).toBe('rgba(0, 0, 0, 1)');
    expect(figmaColor({ r: 0, g: 0, b: 0, a: 0.5 }, 0.5)).toBe('rgba(0, 0, 0, 0.25)');
  });
});

describe('figmaJsonToScene: resposta de /nodes', () => {
  const scene = figmaJsonToScene(nodesResponse());
  const root = scene.root as FrameNode;

  it('um nó vira a raiz, na origem', () => {
    expect(scene.source).toBe('figma-json');
    expect(root.type).toBe('frame');
    expect(root.id).toBe('1:1');
    expect(root.name).toBe('Cartão');
    expectMatrix(root.transform, [1, 0, 0, 1, 0, 0]);
    expect([root.width, root.height]).toEqual([400, 300]);
  });

  it('moldura: recorte, raio, opacidade, fundo e sombras', () => {
    expect(root.clip).toBe(true);
    expect(root.cornerRadius).toBe(12);
    expect(root.opacity).toBe(0.9);
    expect(root.fills).toEqual([
      { type: 'solid', color: figmaColor({ r: 1, g: 1, b: 1 }), opacity: 0.5 },
    ]);
    expect(root.effects).toEqual([
      { color: 'rgba(0, 0, 0, 0.25)', offset: { x: 1, y: 4 }, blur: 8, spread: 2 },
      { color: 'rgba(255, 0, 0, 1)', offset: { x: 0, y: 1 }, blur: 3, inner: true },
    ]);
  });

  it('mantém os filhos na ordem, pula SLICE e converte o tipo não suportado', () => {
    expect(root.children.map((c) => [c.id, c.type])).toEqual([
      ['1:2', 'rect'],
      ['1:3', 'text'],
      ['1:4', 'group'],
      ['1:5', 'ellipse'],
      ['1:6', 'line'],
      ['1:7', 'frame'],
      ['1:8', 'group'],
      ['1:9', 'unknown'],
    ]);
    expect(kid(root, 7)).toMatchObject({ type: 'unknown', sourceType: 'STICKY' });
    expect(countNodes(root)).toBe(14);
  });

  it('retângulo: raios por canto, gradiente linear em px e traço por dentro', () => {
    const rect = kid(root, 0) as RectNode;
    expectMatrix(rect.transform, [1, 0, 0, 1, 20, 30]);
    expect([rect.width, rect.height]).toEqual([120, 80]);
    expect(rect.cornerRadius).toEqual([4, 8, 12, 16]);
    expect(rect.fills).toEqual([
      {
        type: 'linear',
        start: { x: 0, y: 40 },
        end: { x: 120, y: 40 },
        stops: [
          { offset: 0, color: figmaColor({ r: 1, g: 0, b: 0 }) },
          { offset: 1, color: figmaColor({ r: 0, g: 0, b: 1, a: 0.5 }) },
        ],
        opacity: 1,
      },
    ]);
    expect(rect.stroke).toEqual({
      paints: [{ type: 'solid', color: 'rgba(0, 0, 0, 1)', opacity: 1 }],
      width: 2,
      align: 'inside',
    });
  });

  it('texto: conteúdo, estilo e preenchimento', () => {
    const text = kid(root, 1) as TextNode;
    expectMatrix(text.transform, [1, 0, 0, 1, 20, 130]);
    expect(text.text).toBe('Olá, mundo');
    expect(text.style).toEqual({
      fontFamily: 'Inter',
      fontSize: 16,
      fontWeight: 600,
      italic: false,
      lineHeight: 24,
      align: 'center',
      verticalAlign: 'top',
      decoration: 'underline',
    });
    expect(text.fills).toEqual([
      { type: 'solid', color: figmaColor({ r: 0.2, g: 0.4, b: 0.6 }), opacity: 1 },
    ]);
  });

  it('vetor com fill e stroke geometry: grupo com os caminhos, regra de preenchimento e cores', () => {
    const group = kid(root, 2) as GroupNode;
    expectMatrix(group.transform, [1, 0, 0, 1, 240, 20]);
    expect(group.name).toBe('Ícone');
    expect(group.stroke).toBeUndefined();
    const paths = group.children as PathNode[];
    expect(paths.map((p) => [p.type, p.d, p.fillRule])).toEqual([
      ['path', 'M0 0L40 0L40 40Z', 'nonzero'],
      ['path', 'M10 10L20 10L20 20Z', 'evenodd'],
      ['path', 'M0 0L41 0Z', 'nonzero'],
    ]);
    for (const p of paths) expectMatrix(p.transform, [1, 0, 0, 1, 0, 0]);
    expect(paths[0]?.fills).toEqual([
      { type: 'solid', color: figmaColor({ r: 0, g: 1, b: 0 }), opacity: 1 },
    ]);
    // O traço já vem contornado: vira preenchimento, sem `stroke`.
    expect(paths[2]?.fills).toEqual([
      { type: 'solid', color: figmaColor({ r: 1, g: 0, b: 1 }), opacity: 1 },
    ]);
    expect(paths.every((p) => p.stroke === undefined)).toBe(true);
  });

  it('elipse com efeito de desfoque ignorado', () => {
    const ellipse = kid(root, 3);
    expect(ellipse.type).toBe('ellipse');
    expect(ellipse.effects).toEqual([]);
    expectMatrix(ellipse.transform, [1, 0, 0, 1, 300, 20]);
  });

  it('linha: pontos locais, só traço, pontas e junção', () => {
    const line = kid(root, 4);
    expect(line).toMatchObject({
      type: 'line',
      points: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ],
      closed: false,
      fills: [],
    });
    expect(line.stroke).toEqual({
      paints: [{ type: 'solid', color: 'rgba(0, 0, 0, 1)', opacity: 1 }],
      width: 3,
      align: 'center',
      dash: [4, 2],
      cap: 'round',
      join: 'bevel',
    });
  });

  it('instância com imagem, e filho invisível continua na árvore', () => {
    const inst = kid(root, 5) as FrameNode;
    expect(inst.clip).toBe(false);
    expect(inst.fills).toEqual([{ type: 'image', opacity: 0.8 }]);
    expect(inst.children).toHaveLength(1);
    expect(inst.children[0]).toMatchObject({ id: '1:7a', visible: false, type: 'rect' });
  });

  it('sem relativeTransform: usa a caixa menos a do pai (rotação ignorada)', () => {
    const group = kid(root, 6) as GroupNode;
    expectMatrix(group.transform, [1, 0, 0, 1, 50, 100]);
    expect([group.width, group.height]).toEqual([80, 60]);
    expectMatrix(kid(group, 0).transform, [1, 0, 0, 1, 10, 10]);
  });

  it('avisos exatos, sem repetição e na ordem em que aparecem', () => {
    expect(scene.warnings).toEqual([
      'efeito não suportado: LAYER_BLUR',
      'sem relativeTransform, rotações foram ignoradas; exporte com geometry=paths',
      'tipo não suportado: STICKY',
      '1 preenchimento(s) de imagem sem os pixels (imageRef): desenhados como reservado',
    ]);
  });
});

describe('figmaJsonToScene: vários nós', () => {
  const a = {
    id: '2:1',
    name: 'A',
    type: 'FRAME',
    absoluteBoundingBox: { x: 100, y: 50, width: 200, height: 100 },
  };
  const b = {
    id: '2:2',
    name: 'B',
    type: 'RECTANGLE',
    absoluteBoundingBox: { x: 400, y: 20, width: 50, height: 80 },
    relativeTransform: rt(9999, 9999),
    size: { x: 50, y: 80 },
  };

  it('agrupa em "nodes" posicionando pela menor origem e pela caixa união', () => {
    const scene = figmaJsonToScene({
      nodes: { '2:1': { document: a }, '2:2': { document: b } },
    });
    const root = scene.root as GroupNode;
    expect(root).toMatchObject({ type: 'group', name: 'nodes', width: 350, height: 130 });
    expectMatrix(root.transform, [1, 0, 0, 1, 0, 0]);
    expectMatrix(kid(root, 0).transform, [1, 0, 0, 1, 0, 30]);
    expectMatrix(kid(root, 1).transform, [1, 0, 0, 1, 300, 0]);
    expect(kid(root, 1)).toMatchObject({ width: 50, height: 80 });
  });

  it('mantém a rotação do relativeTransform e só reposiciona', () => {
    const rotated = {
      id: '2:3',
      name: 'R',
      type: 'RECTANGLE',
      absoluteBoundingBox: { x: 10, y: 10, width: 10, height: 10 },
      size: { x: 10, y: 10 },
      // 90 graus em torno da origem do nó: ocupa x de -10 a 0 no pai.
      relativeTransform: [
        [0, -1, 500],
        [1, 0, 500],
      ],
    };
    const scene = figmaJsonToScene([a, rotated]);
    const child = kid(scene.root, 1);
    // Cantos locais: x de -10 a 0 e y de 0 a 10; a caixa de destino começa em (0, 0).
    expectMatrix(child.transform, [0, 1, -1, 0, 10, 0]);
  });

  it('SLICE de nível superior é descartado; sobrando um só, ele é a raiz', () => {
    const scene = figmaJsonToScene([a, { id: '2:9', name: 's', type: 'SLICE' }]);
    expect(scene.root.id).toBe('2:1');
    expectMatrix(scene.root.transform, [1, 0, 0, 1, 0, 0]);
  });

  it('nó null em "nodes" vira aviso; todos null é erro', () => {
    const scene = figmaJsonToScene({ nodes: { '2:1': { document: a }, '9:9': null } });
    expect(scene.root.id).toBe('2:1');
    expect(scene.warnings).toEqual(['o nó 9:9 não veio na resposta e foi ignorado']);
    expect(() => figmaJsonToScene({ nodes: { '9:9': null } })).toThrow(
      /^JSON do Figma inválido: /,
    );
  });

  it('forma de lista de nós', () => {
    const scene = figmaJsonToScene([a, b]);
    const root = scene.root as GroupNode;
    expect(root.children.map((c) => c.id)).toEqual(['2:1', '2:2']);
    expect([root.width, root.height]).toEqual([350, 130]);
  });
});

describe('figmaJsonToScene: arquivo, nó solto e wrappers', () => {
  const rect = {
    id: '3:1',
    name: 'Solto',
    type: 'RECTANGLE',
    absoluteBoundingBox: { x: 5, y: 6, width: 30, height: 20 },
    fills: [solid(1, 0, 0)],
  };

  it('nó solto: raiz na origem, tamanho da caixa', () => {
    const scene = figmaJsonToScene(rect);
    expect(scene.root).toMatchObject({ type: 'rect', id: '3:1', width: 30, height: 20 });
    expectMatrix(scene.root.transform, [1, 0, 0, 1, 0, 0]);
    expect(scene.warnings).toEqual([]);
  });

  it('wrapper { document: nó }', () => {
    expect(figmaJsonToScene({ document: rect }).root.id).toBe('3:1');
  });

  it('arquivo completo: usa a primeira página e avisa das demais', () => {
    const file = {
      document: {
        id: '0:0',
        type: 'DOCUMENT',
        children: [
          {
            id: '0:1',
            name: 'Página 1',
            type: 'CANVAS',
            children: [
              {
                ...rect,
                id: '3:1',
                absoluteBoundingBox: { x: 0, y: 0, width: 10, height: 10 },
              },
              {
                ...rect,
                id: '3:2',
                absoluteBoundingBox: { x: 20, y: 0, width: 10, height: 10 },
              },
            ],
          },
          { id: '0:2', name: 'Página 2', type: 'CANVAS', children: [rect] },
        ],
      },
    };
    const scene = figmaJsonToScene(file);
    const root = scene.root as GroupNode;
    expect(root.name).toBe('nodes');
    expect(root.children.map((c) => c.id)).toEqual(['3:1', '3:2']);
    expect(root.width).toBe(30);
    expect(scene.warnings).toEqual([
      'o arquivo tem 2 páginas; só a primeira (Página 1) foi convertida',
    ]);
  });

  it('página com um só nó: ele é a raiz', () => {
    const scene = figmaJsonToScene({
      document: {
        type: 'DOCUMENT',
        children: [{ type: 'CANVAS', name: 'P', children: [rect] }],
      },
    });
    expect(scene.root.id).toBe('3:1');
    expect(scene.warnings).toEqual([]);
  });
});

describe('figmaJsonToScene: padrões e casos de borda', () => {
  it('aplica os padrões de id, nome, visibilidade e opacidade', () => {
    const scene = figmaJsonToScene({
      type: 'GROUP',
      children: [{ type: 'ELLIPSE' }, { type: 'ELLIPSE' }],
    });
    expect(scene.root).toMatchObject({
      id: 'figma-1',
      name: 'group',
      visible: true,
      opacity: 1,
      width: 0,
      height: 0,
    });
    expect(kid(scene.root, 0)).toMatchObject({ id: 'figma-2', name: 'ellipse' });
    expect(kid(scene.root, 1).id).toBe('figma-3');
  });

  it('texto com padrões, itálico e estilos por trecho', () => {
    const scene = figmaJsonToScene({
      id: 't',
      name: 't',
      type: 'TEXT',
      characters: 'x',
      characterStyleOverrides: [0, 1, 1],
      style: {
        fontPostScriptName: 'Roboto-BoldItalic',
        letterSpacing: 0.5,
        textDecoration: 'STRIKETHROUGH',
        textAlignHorizontal: 'JUSTIFIED',
        textAlignVertical: 'BOTTOM',
      },
    });
    expect((scene.root as TextNode).style).toEqual({
      fontFamily: 'sans-serif',
      fontSize: 14,
      fontWeight: 400,
      italic: true,
      letterSpacing: 0.5,
      align: 'justify',
      verticalAlign: 'bottom',
      decoration: 'line-through',
    });
    expect(scene.warnings).toEqual([
      'estilos por trecho de texto foram ignorados; vale o estilo do primeiro caractere',
    ]);
    const plain = figmaJsonToScene({
      id: 't',
      type: 'TEXT',
      characters: '',
      characterStyleOverrides: [],
    });
    expect((plain.root as TextNode).style).toMatchObject({
      fontFamily: 'sans-serif',
      fontSize: 14,
    });
    expect(plain.warnings).toEqual([]);
  });

  it('vetor com um só caminho é o próprio nó; fillRule EVENODD', () => {
    const scene = figmaJsonToScene({
      id: 'v',
      name: 'v',
      type: 'STAR',
      opacity: 0.4,
      size: { x: 10, y: 10 },
      fills: [solid(0, 0, 0)],
      fillGeometry: [{ path: 'M0 0L1 1Z', windingRule: 'EVENODD' }],
    });
    expect(scene.root).toMatchObject({
      type: 'path',
      id: 'v',
      name: 'v',
      opacity: 0.4,
      fillRule: 'evenodd',
      d: 'M0 0L1 1Z',
    });
  });

  it('vetor sem geometria vira unknown com aviso', () => {
    const scene = figmaJsonToScene({
      id: 'v',
      name: 'v',
      type: 'BOOLEAN_OPERATION',
      children: [],
    });
    expect(scene.root).toMatchObject({
      type: 'unknown',
      sourceType: 'BOOLEAN_OPERATION',
    });
    expect(scene.warnings).toEqual([
      'vetores sem fillGeometry: exporte com geometry=paths',
    ]);
  });

  it('elipse parcial, gradientes radial/angular, espessuras por lado e mesclagem', () => {
    const stops = [{ position: 0, color: { r: 0, g: 0, b: 0, a: 1 } }];
    const scene = figmaJsonToScene({
      id: 'e',
      name: 'e',
      type: 'ELLIPSE',
      blendMode: 'MULTIPLY',
      size: { x: 100, y: 50 },
      arcData: { startingAngle: 0, endingAngle: 3, innerRadius: 0 },
      fills: [
        {
          type: 'GRADIENT_RADIAL',
          gradientHandlePositions: [
            { x: 0.5, y: 0.5 },
            { x: 1, y: 0.5 },
          ],
          gradientStops: stops,
          blendMode: 'OVERLAY',
        },
        { type: 'GRADIENT_ANGULAR', gradientStops: stops },
        { type: 'VIDEO' },
      ],
      strokes: [solid(0, 0, 0)],
      strokeWeight: 1,
      individualStrokeWeights: { top: 1, right: 4, bottom: 2, left: 0 },
      strokeCap: 'ARROW_LINES',
    });
    const root = scene.root;
    expect(root.fills[0]).toMatchObject({
      type: 'radial',
      center: { x: 50, y: 25 },
      radius: 50,
    });
    expect(root.fills[1]).toMatchObject({ type: 'radial' });
    expect(root.fills).toHaveLength(2);
    expect(root.stroke).toMatchObject({ width: 4, cap: 'butt' });
    expect(scene.warnings).toEqual([
      'modos de mesclagem foram ignorados',
      'gradiente angular aproximado como radial',
      'tipo de preenchimento não suportado: VIDEO',
      'espessuras de traço por lado foram ignoradas; vale a maior',
      'pontas de seta no traço foram ignoradas',
      'arcos de elipse foram desenhados como elipses inteiras',
    ]);
  });

  it('seção não recorta; moldura sem clipsContent também não', () => {
    expect(
      (
        figmaJsonToScene({ id: 's', type: 'SECTION', clipsContent: true })
          .root as FrameNode
      ).clip,
    ).toBe(false);
    expect((figmaJsonToScene({ id: 'f', type: 'FRAME' }).root as FrameNode).clip).toBe(
      false,
    );
  });

  it('agrupa o aviso de imagens e conta cada preenchimento', () => {
    const scene = figmaJsonToScene({
      id: 'f',
      type: 'FRAME',
      fills: [{ type: 'IMAGE' }, { type: 'IMAGE' }],
      children: [{ id: 'r', type: 'RECTANGLE', fills: [{ type: 'IMAGE' }] }],
    });
    expect(scene.warnings).toEqual([
      '3 preenchimento(s) de imagem sem os pixels (imageRef): desenhados como reservado',
    ]);
  });

  it('transform vem do relativeTransform, inclusive com rotação', () => {
    const c = Math.cos(Math.PI / 6);
    const s = Math.sin(Math.PI / 6);
    const scene = figmaJsonToScene({
      id: 'f',
      type: 'FRAME',
      children: [
        {
          id: 'r',
          type: 'RECTANGLE',
          size: { x: 10, y: 10 },
          relativeTransform: [
            [c, -s, 7],
            [s, c, 8],
          ],
        },
      ],
    });
    expectMatrix(kid(scene.root, 0).transform, [c, s, -s, c, 7, 8]);
    expect(scene.warnings).toEqual([]);
  });
});

describe('figmaJsonToScene: entradas inválidas', () => {
  it.each([
    ['null', null],
    ['número', 42],
    ['texto', 'frame'],
    ['objeto vazio', {}],
    ['lista vazia', []],
    ['lista sem nós', [1, 'a', {}]],
    ['nodes vazio', { nodes: {} }],
    ['document sem tipo', { document: { children: [] } }],
    ['documento sem páginas', { document: { type: 'DOCUMENT', children: [] } }],
    ['página vazia', { type: 'CANVAS', children: [] }],
    ['só fatias', { id: 's', type: 'SLICE' }],
  ])('lança erro para %s', (_label, input) => {
    expect(() => figmaJsonToScene(input)).toThrow(/^JSON do Figma inválido: /);
  });
});

describe('filhos de grupo com relativeTransform relativo ao contêiner', () => {
  it('corrige a translação pela absoluteBoundingBox e avisa uma vez', () => {
    const frame = {
      id: '1:1',
      name: 'Frame',
      type: 'FRAME',
      absoluteBoundingBox: { x: 100, y: 100, width: 200, height: 200 },
      size: { x: 200, y: 200 },
      relativeTransform: [
        [1, 0, 100],
        [0, 1, 100],
      ],
      children: [
        {
          id: '1:2',
          name: 'Group',
          type: 'GROUP',
          absoluteBoundingBox: { x: 150, y: 160, width: 50, height: 40 },
          size: { x: 50, y: 40 },
          relativeTransform: [
            [1, 0, 50],
            [0, 1, 60],
          ],
          children: [
            {
              id: '1:3',
              name: 'Rect',
              type: 'RECTANGLE',
              // Relativo ao quadro (como o painel do Figma mostra), não ao grupo.
              absoluteBoundingBox: { x: 150, y: 160, width: 50, height: 40 },
              size: { x: 50, y: 40 },
              relativeTransform: [
                [1, 0, 50],
                [0, 1, 60],
              ],
              fills: [],
            },
            {
              id: '1:4',
              name: 'Ok',
              type: 'RECTANGLE',
              // Relativo ao grupo: bate com a caixa e fica como veio.
              absoluteBoundingBox: { x: 160, y: 170, width: 10, height: 10 },
              size: { x: 10, y: 10 },
              relativeTransform: [
                [1, 0, 10],
                [0, 1, 10],
              ],
              fills: [],
            },
          ],
        },
      ],
    };
    const scene = figmaJsonToScene(frame);
    const group = scene.root as { children: readonly { transform: readonly number[] }[] };
    const [rect, ok] = (
      group.children[0] as unknown as {
        children: readonly { transform: readonly number[] }[];
      }
    ).children;
    expect(rect?.transform.slice(4)).toEqual([0, 0]);
    expect(ok?.transform.slice(4)).toEqual([10, 10]);
    expect(
      scene.warnings.filter((w) => w.startsWith('relativeTransform não batia')),
    ).toHaveLength(1);
  });
});
