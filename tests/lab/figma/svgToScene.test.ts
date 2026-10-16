import { describe, expect, it } from 'vitest';
import {
  countNodes,
  walk,
  type Matrix,
  type Scene,
  type SceneNode,
} from '../../../lab/figma/scene';
import { svgToScene } from '../../../lab/figma/svgToScene';

const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

const NS =
  'xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"';

/** Embrulha o conteúdo num `<svg>` simples. */
const wrap = (inner: string, attrs = 'width="100" height="100"'): string =>
  `<svg ${attrs} ${NS}>${inner}</svg>`;

type NodeOf<T extends SceneNode['type']> = Extract<SceneNode, { type: T }>;

function find(scene: Scene, id: string): SceneNode {
  for (const node of walk(scene.root)) if (node.id === id) return node;
  throw new Error(`nó não encontrado: ${id}`);
}

function findAs<T extends SceneNode['type']>(
  scene: Scene,
  id: string,
  type: T,
): NodeOf<T> {
  const node = find(scene, id);
  if (node.type !== type) throw new Error(`${id} é ${node.type}, esperado ${type}`);
  return node as NodeOf<T>;
}

/** Primeiro filho da raiz, já estreitado. */
function firstChild(scene: Scene): SceneNode {
  const root = scene.root;
  if (root.type !== 'frame') throw new Error('raiz não é frame');
  const child = root.children[0];
  if (!child) throw new Error('raiz sem filhos');
  return child;
}

function expectMatrix(actual: Matrix, expected: Matrix): void {
  expected.forEach((value, i) => expect(actual[i]).toBeCloseTo(value, 6));
}

const FIXTURE = `
<svg width="320" height="200" viewBox="0 0 320 200" fill="none" ${NS}>
  <rect id="card" x="10" y="12" width="100" height="60" rx="8" fill="#FF0000"/>
  <g id="shadowed" filter="url(#filter0_d)">
    <rect id="shadowed-rect" x="130" y="12" width="80" height="50" rx="4" fill="white"/>
  </g>
  <path id="wave" d="M10 100 L110 100 L110 150 L10 150 Z" fill="url(#paint0_linear)"/>
  <g id="rotated" transform="translate(10 20) rotate(90)">
    <circle id="dot" cx="30" cy="40" r="20" stroke="#0000FF" stroke-width="3" stroke-dasharray="4 2" stroke-linecap="round"/>
  </g>
  <text id="label" x="150" y="100" fill="#222" font-family="'Inter', sans-serif" font-size="14" font-weight="600" font-style="italic" letter-spacing="0.5" text-anchor="middle" text-decoration="underline">Hello <tspan>world</tspan></text>
  <image id="pic" x="240" y="10" width="40" height="30" xlink:href="${PNG}"/>
  <mask id="mask0" style="mask-type:alpha" maskUnits="userSpaceOnUse" x="0" y="0" width="10" height="10">
    <rect width="10" height="10" fill="#D9D9D9"/>
  </mask>
  <g id="masked" mask="url(#mask0)">
    <rect id="masked-rect" x="0" y="0" width="10" height="10" fill="#000"/>
  </g>
  <rect id="patterned" x="200" y="120" width="100" height="60" fill="url(#pattern0)"/>
  <line id="divider" x1="20" y1="180" x2="120" y2="180" stroke="#00FF00" stroke-width="2"/>
  <polygon id="tri" points="200 190 220 190 210 170"/>
  <defs>
    <filter id="filter0_d" x="126" y="10" width="90" height="60" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
      <feFlood flood-opacity="0" result="BackgroundImageFix"/>
      <feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha"/>
      <feOffset dx="2" dy="4"/>
      <feGaussianBlur stdDeviation="2"/>
      <feComposite in2="hardAlpha" operator="out"/>
      <feColorMatrix type="matrix" values="0 0 0 0 0.2 0 0 0 0 0.4 0 0 0 0 0.6 0 0 0 0.5 0"/>
      <feBlend mode="normal" in2="BackgroundImageFix" result="effect1_dropShadow"/>
      <feBlend mode="normal" in="SourceGraphic" in2="effect1_dropShadow" result="shape"/>
    </filter>
    <linearGradient id="paint0_linear" x1="10" y1="100" x2="110" y2="150" gradientUnits="userSpaceOnUse">
      <stop stop-color="#FF0000"/>
      <stop offset="1" stop-color="#0000FF" stop-opacity="0.5"/>
    </linearGradient>
    <pattern id="pattern0" patternContentUnits="objectBoundingBox" width="1" height="1">
      <use xlink:href="#image0_1" transform="scale(0.01 0.0166667)"/>
    </pattern>
    <image id="image0_1" width="100" height="60" xlink:href="${PNG}"/>
  </defs>
</svg>`;

describe('svgToScene: fixture no estilo do Figma', () => {
  const scene = svgToScene(FIXTURE);

  it('cria o frame raiz com o tamanho do SVG', () => {
    expect(scene.source).toBe('svg');
    expect(scene.root.type).toBe('frame');
    expect(scene.root.name).toBe('svg');
    expect(scene.root.width).toBe(320);
    expect(scene.root.height).toBe(200);
    expectMatrix(scene.root.transform, [1, 0, 0, 1, 0, 0]);
  });

  it('monta a árvore esperada', () => {
    expect(countNodes(scene.root)).toBe(14);
    const types = [...walk(scene.root)].map((n) => `${n.type}:${n.name}`);
    expect(types).toEqual([
      'frame:svg',
      'rect:card',
      'group:shadowed',
      'rect:shadowed-rect',
      'path:wave',
      'group:rotated',
      'ellipse:dot',
      'text:label',
      'rect:pic',
      'group:masked',
      'rect:masked-rect',
      'rect:patterned',
      'line:divider',
      'line:tri',
    ]);
  });

  it('retângulo: raio, tinta sólida e transformação', () => {
    const card = findAs(scene, 'card', 'rect');
    expect(card.cornerRadius).toBe(8);
    expect(card.width).toBe(100);
    expect(card.height).toBe(60);
    expect(card.fills).toEqual([{ type: 'solid', color: '#ff0000' }]);
    expectMatrix(card.transform, [1, 0, 0, 1, 10, 12]);
    expect(card.stroke).toBeUndefined();
  });

  it('sombra do Figma vira Shadow no grupo', () => {
    const group = findAs(scene, 'shadowed', 'group');
    expect(group.effects).toEqual([
      { color: 'rgba(51, 102, 153, 0.5)', offset: { x: 2, y: 4 }, blur: 4 },
    ]);
    expect(findAs(scene, 'shadowed-rect', 'rect').fills).toEqual([
      { type: 'solid', color: '#ffffff' },
    ]);
  });

  it('caminho com gradiente linear em espaço do usuário', () => {
    const wave = findAs(scene, 'wave', 'path');
    expect(wave.d).toBe('M10 100 L110 100 L110 150 L10 150 Z');
    expect(wave.width).toBe(100);
    expect(wave.height).toBe(50);
    expect(wave.fillRule).toBe('nonzero');
    expect(wave.fills).toHaveLength(1);
    const paint = wave.fills[0];
    expect(paint?.type).toBe('linear');
    if (paint?.type !== 'linear') return;
    expect(paint.start).toEqual({ x: 10, y: 100 });
    expect(paint.end).toEqual({ x: 110, y: 150 });
    expect(paint.stops).toEqual([
      { offset: 0, color: '#ff0000' },
      { offset: 1, color: 'rgba(0, 0, 255, 0.5)' },
    ]);
  });

  it('grupo com translate + rotate e círculo com traço', () => {
    const group = findAs(scene, 'rotated', 'group');
    expectMatrix(group.transform, [0, 1, -1, 0, 10, 20]);
    const dot = findAs(scene, 'dot', 'ellipse');
    expectMatrix(dot.transform, [1, 0, 0, 1, 10, 20]);
    expect(dot.width).toBe(40);
    expect(dot.height).toBe(40);
    expect(dot.fills).toEqual([]);
    expect(dot.stroke).toEqual({
      paints: [{ type: 'solid', color: '#0000ff' }],
      width: 3,
      align: 'center',
      dash: [4, 2],
      cap: 'round',
    });
  });

  it('texto: estilo, alinhamento e posição pela linha de base', () => {
    const label = findAs(scene, 'label', 'text');
    expect(label.text).toBe('Hello world');
    expect(label.style).toEqual({
      fontFamily: 'Inter',
      fontSize: 14,
      fontWeight: 600,
      italic: true,
      letterSpacing: 0.5,
      align: 'center',
      verticalAlign: 'top',
      decoration: 'underline',
    });
    expectMatrix(label.transform, [1, 0, 0, 1, 150, 86]);
    expect(label.width).toBe(0);
    expect(label.height).toBeCloseTo(16.8, 6);
    expect(label.fills).toEqual([{ type: 'solid', color: '#222222' }]);
  });

  it('imagem com data: vira retângulo com tinta de imagem', () => {
    const pic = findAs(scene, 'pic', 'rect');
    expect(pic.fills).toEqual([{ type: 'image', src: PNG }]);
    expect(pic.width).toBe(40);
    expect(pic.height).toBe(30);
    expectMatrix(pic.transform, [1, 0, 0, 1, 240, 10]);
  });

  it('padrão com <use> e <image> vira tinta de imagem', () => {
    const patterned = findAs(scene, 'patterned', 'rect');
    expect(patterned.fills).toEqual([{ type: 'image', src: PNG }]);
  });

  it('linha: pontos locais e traço (sem preenchimento)', () => {
    const divider = findAs(scene, 'divider', 'line');
    expect(divider.points).toEqual([
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ]);
    expect(divider.closed).toBe(false);
    expect(divider.fills).toEqual([]);
    expect(divider.stroke).toEqual({
      paints: [{ type: 'solid', color: '#00ff00' }],
      width: 2,
      align: 'center',
    });
    expectMatrix(divider.transform, [1, 0, 0, 1, 20, 180]);
  });

  it('polígono é fechado e usa a origem no menor x/y', () => {
    const tri = findAs(scene, 'tri', 'line');
    expect(tri.closed).toBe(true);
    expect(tri.points).toEqual([
      { x: 0, y: 20 },
      { x: 20, y: 20 },
      { x: 10, y: 0 },
    ]);
    expectMatrix(tri.transform, [1, 0, 0, 1, 200, 170]);
  });

  it('avisa sobre máscara e transformação do padrão, sem duplicatas', () => {
    expect(scene.warnings).toContain('máscara não suportada: #mask0');
    expect(scene.warnings).toContain(
      'transformação do padrão de imagem ignorada: #pattern0',
    );
    expect(new Set(scene.warnings).size).toBe(scene.warnings.length);
    expect(scene.warnings.some((w) => w.startsWith('filtro não suportado'))).toBe(false);
  });
});

describe('svgToScene: erros', () => {
  it('lança em XML malformado', () => {
    expect(() => svgToScene('<svg><rect></svg>')).toThrow(/^SVG inválido/);
    expect(() => svgToScene('isto não é xml')).toThrow(/^SVG inválido/);
    expect(() => svgToScene('')).toThrow(/^SVG inválido/);
  });

  it('lança quando a raiz não é <svg>', () => {
    expect(() => svgToScene('<html xmlns="http://www.w3.org/1999/xhtml"/>')).toThrow(
      /^SVG inválido/,
    );
  });
});

describe('svgToScene: tintas e herança', () => {
  it('sem fill, o padrão do SVG é preto; fill="none" não tem preenchimento', () => {
    const scene = svgToScene(
      wrap(
        '<rect id="a" width="10" height="10"/><rect id="b" width="10" height="10" fill="none"/>',
      ),
    );
    expect(findAs(scene, 'a', 'rect').fills).toEqual([
      { type: 'solid', color: '#000000' },
    ]);
    expect(findAs(scene, 'b', 'rect').fills).toEqual([]);
  });

  it('herda fill, opacidade e traço de <g>; o filho pode sobrescrever', () => {
    const scene = svgToScene(
      wrap(
        `<g fill="#0000ff" fill-opacity="0.5" stroke="red" stroke-width="3" opacity="0.4">
           <rect id="a" width="10" height="10"/>
           <rect id="b" width="10" height="10" fill="green" opacity="0.8"/>
         </g>`,
      ),
    );
    const a = findAs(scene, 'a', 'rect');
    expect(a.fills).toEqual([{ type: 'solid', color: '#0000ff', opacity: 0.5 }]);
    expect(a.stroke?.paints).toEqual([{ type: 'solid', color: '#ff0000' }]);
    expect(a.stroke?.width).toBe(3);
    // `opacity` não é herdada: é do próprio nó.
    expect(a.opacity).toBe(1);
    const b = findAs(scene, 'b', 'rect');
    expect(b.fills).toEqual([{ type: 'solid', color: '#008000', opacity: 0.5 }]);
    expect(b.opacity).toBeCloseTo(0.8, 6);
    expect(scene.root.type === 'frame' && scene.root.children[0]?.opacity).toBeCloseTo(
      0.4,
      6,
    );
  });

  it('style="" vence os atributos', () => {
    const scene = svgToScene(
      wrap(
        '<rect id="a" width="10" height="10" fill="red" style="fill:#0f0; stroke: rgb(0, 0, 255); stroke-width:4; opacity:0.5"/>',
      ),
    );
    const a = findAs(scene, 'a', 'rect');
    expect(a.fills).toEqual([{ type: 'solid', color: '#00ff00' }]);
    expect(a.stroke?.paints).toEqual([{ type: 'solid', color: '#0000ff' }]);
    expect(a.stroke?.width).toBe(4);
    expect(a.opacity).toBe(0.5);
  });

  it('cores com alfa: #rrggbbaa, rgba() e transparent', () => {
    const scene = svgToScene(
      wrap(
        `<rect id="a" width="1" height="1" fill="#ff000080"/>
         <rect id="b" width="1" height="1" fill="rgba(0,0,255,0.25)"/>
         <rect id="c" width="1" height="1" fill="transparent"/>
         <rect id="d" width="1" height="1" fill="currentColor"/>`,
      ),
    );
    expect(findAs(scene, 'a', 'rect').fills).toEqual([
      { type: 'solid', color: 'rgba(255, 0, 0, 0.502)' },
    ]);
    expect(findAs(scene, 'b', 'rect').fills).toEqual([
      { type: 'solid', color: 'rgba(0, 0, 255, 0.25)' },
    ]);
    expect(findAs(scene, 'c', 'rect').fills).toEqual([
      { type: 'solid', color: 'rgba(0, 0, 0, 0)' },
    ]);
    expect(findAs(scene, 'd', 'rect').fills).toEqual([
      { type: 'solid', color: '#000000' },
    ]);
  });

  it('cor desconhecida vira aviso e nenhuma tinta', () => {
    const scene = svgToScene(
      wrap('<rect id="a" width="1" height="1" fill="papayawhip"/>'),
    );
    expect(findAs(scene, 'a', 'rect').fills).toEqual([]);
    expect(scene.warnings).toContain('cor não suportada: papayawhip');
  });

  it('display:none e visibility:hidden deixam o nó invisível', () => {
    const scene = svgToScene(
      wrap(
        `<rect id="a" width="1" height="1" display="none"/>
         <rect id="b" width="1" height="1" style="display:none"/>
         <g visibility="hidden"><rect id="c" width="1" height="1"/></g>
         <rect id="d" width="1" height="1"/>`,
      ),
    );
    expect(find(scene, 'a').visible).toBe(false);
    expect(find(scene, 'b').visible).toBe(false);
    expect(find(scene, 'c').visible).toBe(false);
    expect(find(scene, 'd').visible).toBe(true);
  });

  it('opções de traço: junção, extremidade e dasharray none', () => {
    const scene = svgToScene(
      wrap(
        `<path id="a" d="M0 0 L10 10" fill="none" stroke="black" stroke-linejoin="bevel" stroke-linecap="square" stroke-dasharray="none"/>
         <path id="b" d="M0 0 L10 10" fill="none" stroke="black" stroke-width="0"/>`,
      ),
    );
    expect(findAs(scene, 'a', 'path').stroke).toEqual({
      paints: [{ type: 'solid', color: '#000000' }],
      width: 1,
      align: 'center',
      cap: 'square',
      join: 'bevel',
    });
    expect(findAs(scene, 'b', 'path').stroke).toBeUndefined();
  });

  it('fill-rule evenodd', () => {
    const scene = svgToScene(
      wrap('<path id="a" d="M0 0 H10 V10 Z" fill-rule="evenodd"/>'),
    );
    expect(findAs(scene, 'a', 'path').fillRule).toBe('evenodd');
  });
});

describe('svgToScene: gradientes', () => {
  it('aplica gradientTransform e subtrai a origem do nó', () => {
    const scene = svgToScene(
      wrap(
        `<rect id="a" x="50" y="20" width="100" height="40" fill="url(#g)"/>
         <defs>
           <linearGradient id="g" x1="0" y1="0" x2="1" y2="0" gradientUnits="userSpaceOnUse" gradientTransform="translate(50 20) scale(100 40)">
             <stop stop-color="white"/><stop offset="50%" stop-color="black"/><stop offset="1" stop-color="red"/>
           </linearGradient>
         </defs>`,
      ),
    );
    const paint = findAs(scene, 'a', 'rect').fills[0];
    expect(paint?.type).toBe('linear');
    if (paint?.type !== 'linear') return;
    expect(paint.start.x).toBeCloseTo(0, 6);
    expect(paint.start.y).toBeCloseTo(0, 6);
    expect(paint.end.x).toBeCloseTo(100, 6);
    expect(paint.end.y).toBeCloseTo(0, 6);
    expect(paint.stops.map((s) => s.offset)).toEqual([0, 0.5, 1]);
  });

  it('objectBoundingBox multiplica pela caixa do nó', () => {
    const scene = svgToScene(
      wrap(
        `<rect id="a" x="10" y="10" width="100" height="50" fill="url(#g)"/>
         <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="100%">
           <stop offset="0" stop-color="#000"/><stop offset="1" stop-color="#fff"/>
         </linearGradient></defs>`,
      ),
    );
    const paint = findAs(scene, 'a', 'rect').fills[0];
    if (paint?.type !== 'linear') throw new Error('esperado linear');
    expect(paint.start).toEqual({ x: 0, y: 0 });
    expect(paint.end).toEqual({ x: 0, y: 50 });
  });

  it('radial do Figma: centro e raio depois da transformação', () => {
    const scene = svgToScene(
      wrap(
        `<rect id="a" x="100" y="20" width="100" height="100" fill="url(#r)"/>
         <defs><radialGradient id="r" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(150 70) rotate(90) scale(30)">
           <stop stop-color="#fff"/><stop offset="1" stop-color="#000" stop-opacity="0"/>
         </radialGradient></defs>`,
      ),
    );
    const paint = findAs(scene, 'a', 'rect').fills[0];
    if (paint?.type !== 'radial') throw new Error('esperado radial');
    expect(paint.center.x).toBeCloseTo(50, 6);
    expect(paint.center.y).toBeCloseTo(50, 6);
    expect(paint.radius).toBeCloseTo(30, 6);
    expect(paint.stops[1]?.color).toBe('rgba(0, 0, 0, 0)');
    expect(scene.warnings).toEqual([]);
  });

  it('herda paradas e atributos por href entre gradientes; stop-color via style', () => {
    const scene = svgToScene(
      wrap(
        `<rect id="a" width="10" height="10" fill="url(#child)"/>
         <defs>
           <linearGradient id="base" x2="1">
             <stop offset="0" style="stop-color:#ff0000;stop-opacity:0.5"/><stop offset="1" stop-color="#00f"/>
           </linearGradient>
           <linearGradient id="child" xlink:href="#base" x1="0.5"/>
         </defs>`,
      ),
    );
    const paint = findAs(scene, 'a', 'rect').fills[0];
    if (paint?.type !== 'linear') throw new Error('esperado linear');
    expect(paint.stops[0]?.color).toBe('rgba(255, 0, 0, 0.5)');
    expect(paint.start.x).toBeCloseTo(5, 6);
    expect(paint.end.x).toBeCloseTo(10, 6);
  });

  it('fill-opacity vira a opacidade da tinta; referência inexistente avisa', () => {
    const scene = svgToScene(
      wrap(
        `<rect id="a" width="10" height="10" fill="url(#g)" fill-opacity="0.3"/>
         <rect id="b" width="10" height="10" fill="url(#nada)"/>
         <defs><linearGradient id="g"><stop stop-color="#000"/><stop offset="1" stop-color="#fff"/></linearGradient></defs>`,
      ),
    );
    expect(findAs(scene, 'a', 'rect').fills[0]?.opacity).toBe(0.3);
    expect(findAs(scene, 'b', 'rect').fills).toEqual([]);
    expect(scene.warnings).toContain('tinta não encontrada: #nada');
  });
});

describe('svgToScene: viewBox e transformações', () => {
  it('viewBox com deslocamento e escala', () => {
    const scene = svgToScene(
      wrap(
        '<rect id="a" x="0" y="0" width="10" height="10"/>',
        'width="200" height="100" viewBox="-10 -20 100 50"',
      ),
    );
    expect(scene.root.width).toBe(200);
    expect(scene.root.height).toBe(100);
    expectMatrix(find(scene, 'a').transform, [2, 0, 0, 2, 20, 40]);
  });

  it('sem width/height usa o tamanho do viewBox', () => {
    const scene = svgToScene(wrap('', 'viewBox="5 5 30 20"'));
    expect(scene.root.width).toBe(30);
    expect(scene.root.height).toBe(20);
  });

  it('preserveAspectRatio padrão centraliza (meet)', () => {
    const scene = svgToScene(
      wrap(
        '<rect id="a" width="1" height="1"/>',
        'width="200" height="100" viewBox="0 0 50 50"',
      ),
    );
    expectMatrix(find(scene, 'a').transform, [2, 0, 0, 2, 50, 0]);
  });

  it('suporta matrix, scale, rotate com centro, skewX e skewY', () => {
    const scene = svgToScene(
      wrap(
        `<rect id="a" width="1" height="1" transform="matrix(1 2 3 4 5 6)"/>
         <rect id="b" width="1" height="1" transform="scale(2)"/>
         <rect id="c" width="1" height="1" transform="rotate(90 10 10)"/>
         <rect id="d" width="1" height="1" transform="skewX(45) skewY(45)"/>
         <rect id="e" width="1" height="1" transform="translate(10) scale(2 3)"/>`,
      ),
    );
    expectMatrix(find(scene, 'a').transform, [1, 2, 3, 4, 5, 6]);
    expectMatrix(find(scene, 'b').transform, [2, 0, 0, 2, 0, 0]);
    expectMatrix(find(scene, 'c').transform, [0, 1, -1, 0, 20, 0]);
    expectMatrix(find(scene, 'd').transform, [2, 1, 1, 1, 0, 0]);
    expectMatrix(find(scene, 'e').transform, [2, 0, 0, 3, 10, 0]);
  });

  it('elipse e círculo usam a origem no canto superior esquerdo', () => {
    const scene = svgToScene(
      wrap(
        '<ellipse id="a" cx="50" cy="40" rx="30" ry="10"/><circle id="b" cx="20" cy="20" r="5" transform="translate(1 1)"/>',
      ),
    );
    const a = findAs(scene, 'a', 'ellipse');
    expect([a.width, a.height]).toEqual([60, 20]);
    expectMatrix(a.transform, [1, 0, 0, 1, 20, 30]);
    expectMatrix(find(scene, 'b').transform, [1, 0, 0, 1, 16, 16]);
  });

  it('<svg> aninhado vira grupo com translate(x, y)', () => {
    const scene = svgToScene(
      wrap(
        '<svg id="inner" x="10" y="20" width="50" height="50"><rect id="a" x="1" y="2" width="3" height="3"/></svg>',
      ),
    );
    const inner = findAs(scene, 'inner', 'group');
    expectMatrix(inner.transform, [1, 0, 0, 1, 10, 20]);
    expectMatrix(find(scene, 'a').transform, [1, 0, 0, 1, 1, 2]);
  });
});

describe('svgToScene: grupos, clip, use e ids', () => {
  it('clip-path com um <rect> vira frame com clip e filhos reposicionados', () => {
    const scene = svgToScene(
      wrap(
        `<g id="clipped" clip-path="url(#c)" transform="translate(100 0)">
           <rect id="a" x="15" y="25" width="10" height="10"/>
         </g>
         <defs><clipPath id="c"><rect x="10" y="20" width="50" height="40" rx="3"/></clipPath></defs>`,
      ),
    );
    const frame = findAs(scene, 'clipped', 'frame');
    expect(frame.clip).toBe(true);
    expect(frame.cornerRadius).toBe(3);
    expect([frame.width, frame.height]).toEqual([50, 40]);
    expectMatrix(frame.transform, [1, 0, 0, 1, 110, 20]);
    expectMatrix(find(scene, 'a').transform, [1, 0, 0, 1, 5, 5]);
  });

  it('clip-path que não é um único <rect> vira grupo com aviso', () => {
    const scene = svgToScene(
      wrap(
        `<g id="g" clip-path="url(#c)"><rect width="1" height="1"/></g>
         <defs><clipPath id="c"><circle cx="5" cy="5" r="5"/></clipPath></defs>`,
      ),
    );
    expect(find(scene, 'g').type).toBe('group');
    expect(scene.warnings).toContain('clip-path não suportado: #c');
  });

  it('<use> converte o elemento referenciado no lugar, com translate(x, y)', () => {
    const scene = svgToScene(
      wrap(
        `<defs><rect id="r1" width="10" height="10" fill="red"/></defs>
         <use id="u" href="#r1" x="5" y="6" transform="translate(1 1)"/>
         <use xlink:href="#nada"/>`,
      ),
    );
    const u = findAs(scene, 'u', 'rect');
    expectMatrix(u.transform, [1, 0, 0, 1, 6, 7]);
    expect(u.fills).toEqual([{ type: 'solid', color: '#ff0000' }]);
    const unknown = [...walk(scene.root)].find((n) => n.type === 'unknown');
    expect(unknown?.type === 'unknown' && unknown.sourceType).toBe('use');
    expect(scene.warnings.some((w) => w.includes('#nada'))).toBe(true);
  });

  it('ids e nomes: usa o id quando existe, senão svg-<n> e o nome da tag', () => {
    const scene = svgToScene(
      wrap(
        '<rect width="1" height="1"/><g id="meu-grupo"><circle r="1"/></g><path d="M0 0"/>',
      ),
    );
    const nodes = [...walk(scene.root)];
    expect(nodes.map((n) => n.name)).toEqual([
      'svg',
      'rect',
      'meu-grupo',
      'ellipse'.replace('ellipse', 'circle'),
      'path',
    ]);
    expect(nodes.map((n) => n.id)).toEqual([
      'svg-1',
      'svg-2',
      'meu-grupo',
      'svg-3',
      'svg-4',
    ]);
    expect(new Set(nodes.map((n) => n.id)).size).toBe(nodes.length);
  });

  it('o id do <svg> nomeia o frame raiz', () => {
    const scene = svgToScene(wrap('', 'id="Tela" width="10" height="10"'));
    expect(scene.root.id).toBe('Tela');
    expect(scene.root.name).toBe('Tela');
  });
});

describe('svgToScene: texto, imagens e filtros', () => {
  it('tspans em linhas diferentes viram texto multilinha com lineHeight', () => {
    const scene = svgToScene(
      wrap(
        `<text id="t" font-size="10" text-anchor="end" font-weight="bold">
           <tspan x="5" y="20">Linha 1</tspan>
           <tspan x="5" y="34">Linha 2</tspan>
         </text>`,
      ),
    );
    const t = findAs(scene, 't', 'text');
    expect(t.text).toBe('Linha 1\nLinha 2');
    expect(t.style.lineHeight).toBe(14);
    expect(t.style.align).toBe('right');
    expect(t.style.fontWeight).toBe(700);
    expect(t.style.fontFamily).toBe('sans-serif');
    expectMatrix(t.transform, [1, 0, 0, 1, 5, 10]);
    expect(t.height).toBe(28);
  });

  it('textLength define a largura; font-size padrão é 16', () => {
    const scene = svgToScene(wrap('<text id="t" x="0" y="16" textLength="80">Oi</text>'));
    const t = findAs(scene, 't', 'text');
    expect(t.width).toBe(80);
    expect(t.style.fontSize).toBe(16);
    expect(t.style.fontWeight).toBe(400);
    expect(t.style.italic).toBe(false);
    expect(t.style.align).toBe('left');
    expectMatrix(t.transform, [1, 0, 0, 1, 0, 0]);
  });

  it('imagem externa não faz rede: tinta sem src e aviso', () => {
    const scene = svgToScene(
      wrap('<image id="i" width="10" height="10" href="https://exemplo.com/a.png"/>'),
    );
    expect(findAs(scene, 'i', 'rect').fills).toEqual([{ type: 'image' }]);
    expect(scene.warnings.some((w) => w.startsWith('imagem externa ignorada'))).toBe(
      true,
    );
  });

  it('feDropShadow vira Shadow; filtro desconhecido avisa e é ignorado', () => {
    const scene = svgToScene(
      wrap(
        `<g id="a" filter="url(#f1)"><rect width="1" height="1"/></g>
         <g id="b" filter="url(#f2)"><rect width="1" height="1"/></g>
         <defs>
           <filter id="f1"><feDropShadow dx="1" dy="3" stdDeviation="1.5" flood-color="#ff0000" flood-opacity="0.5"/></filter>
           <filter id="f2"><feGaussianBlur stdDeviation="4"/></filter>
         </defs>`,
      ),
    );
    expect(find(scene, 'a').effects).toEqual([
      { color: 'rgba(255, 0, 0, 0.5)', offset: { x: 1, y: 3 }, blur: 3 },
    ]);
    expect(find(scene, 'b').effects).toEqual([]);
    expect(scene.warnings).toContain('filtro não suportado: #f2');
  });

  it('sombra interna do Figma marca inner', () => {
    const scene = svgToScene(
      wrap(
        `<g id="a" filter="url(#f)"><rect width="1" height="1"/></g>
         <defs><filter id="f">
           <feColorMatrix in="SourceAlpha" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha"/>
           <feOffset dy="2"/><feGaussianBlur stdDeviation="1"/>
           <feComposite in2="hardAlpha" operator="arithmetic" k2="-1" k3="1"/>
           <feColorMatrix values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.25 0"/>
         </filter></defs>`,
      ),
    );
    expect(find(scene, 'a').effects).toEqual([
      { color: 'rgba(0, 0, 0, 0.25)', offset: { x: 0, y: 2 }, blur: 2, inner: true },
    ]);
  });
});

describe('svgToScene: elementos não suportados e unidades', () => {
  it('foreignObject, symbol, marker, switch e elementos desconhecidos viram unknown', () => {
    const scene = svgToScene(
      wrap(
        `<foreignObject id="f" x="1" y="2" width="30" height="40"/>
         <symbol id="s"/><marker id="m"/><switch id="sw"/><blink id="b"/>`,
      ),
    );
    const unknowns = [...walk(scene.root)].filter((n) => n.type === 'unknown');
    expect(unknowns.map((n) => n.type === 'unknown' && n.sourceType)).toEqual([
      'foreignObject',
      'symbol',
      'marker',
      'switch',
      'blink',
    ]);
    const f = find(scene, 'f');
    expect([f.width, f.height]).toEqual([30, 40]);
    expectMatrix(f.transform, [1, 0, 0, 1, 1, 2]);
    expect(scene.warnings).toContain('elemento não suportado: <foreignObject>');
  });

  it('elementos de outro namespace viram unknown', () => {
    const scene = svgToScene(wrap('<x:coisa xmlns:x="urn:exemplo" id="c"/>'));
    const c = find(scene, 'c');
    expect(c.type === 'unknown' && c.sourceType).toBe('x:coisa');
  });

  it('defs, title, desc, metadata e style não geram nós; style com regras avisa', () => {
    const scene = svgToScene(
      wrap(
        '<title>t</title><desc>d</desc><metadata/><style>.a { fill: red }</style><defs><rect width="1" height="1"/></defs>',
      ),
    );
    expect(countNodes(scene.root)).toBe(1);
    expect(scene.warnings).toEqual(['regras de <style> ignoradas']);
  });

  it('aceita px e avisa uma vez por unidade desconhecida', () => {
    const scene = svgToScene(
      wrap(
        `<rect id="a" width="10px" height="5em"/><rect id="b" width="2em" height="1em"/>
         <rect id="c" width="3pt" height="1"/>`,
      ),
    );
    const a = findAs(scene, 'a', 'rect');
    expect([a.width, a.height]).toEqual([10, 5]);
    expect(scene.warnings.filter((w) => w.includes('em'))).toEqual([
      'unidade não suportada: em',
    ]);
    expect(scene.warnings).toContain('unidade não suportada: pt');
  });

  it('avisos repetidos aparecem uma vez só', () => {
    const scene = svgToScene(
      wrap(
        '<g mask="url(#m)"><rect width="1" height="1"/></g><g mask="url(#m)"><rect width="1" height="1"/></g>',
      ),
    );
    expect(scene.warnings).toEqual(['máscara não suportada: #m']);
  });

  it('o primeiro filho da raiz mantém a ordem do documento', () => {
    const scene = svgToScene(
      wrap('<rect id="primeiro" width="1" height="1"/><circle id="segundo" r="1"/>'),
    );
    expect(firstChild(scene).id).toBe('primeiro');
  });
});
