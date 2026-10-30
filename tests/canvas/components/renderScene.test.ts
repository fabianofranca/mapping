// A cena vira nós Konva com a estrutura, as transformações e os paints esperados.
import Konva from 'konva';
import { beforeAll, describe, expect, it } from 'vitest';
import { installFakeCanvas } from '../harness';
import {
  DEFAULT_PALETTE,
  decompose,
  fontStyle,
  renderScene,
  sceneIdOf,
} from '../../../src/canvas/components/renderScene';
import {
  type FrameNode,
  type Scene,
  type SceneNode,
  baseNode,
  translate,
} from '../../../src/model/components/scene';

beforeAll(() => installFakeCanvas());

function scene(root: SceneNode): Scene {
  return { root, warnings: [] };
}

const card: FrameNode = {
  ...baseNode({
    id: 'card',
    name: 'Card',
    width: 200,
    height: 100,
    transform: translate(10, 20),
  }),
  type: 'frame',
  clip: true,
  cornerRadius: 8,
  fills: [{ type: 'solid', color: '#ffffff' }],
  stroke: { paints: [{ type: 'solid', color: '#1a63cc' }], width: 2, align: 'inside' },
  effects: [{ color: 'rgba(0,0,0,0.2)', offset: { x: 0, y: 4 }, blur: 8 }],
  children: [
    {
      ...baseNode({
        id: 'title',
        name: 'Title',
        width: 0,
        height: 20,
        transform: translate(100, 10),
      }),
      type: 'text',
      text: 'Olá',
      fills: [{ type: 'solid', color: '#111111' }],
      style: {
        fontFamily: 'Inter',
        fontSize: 16,
        fontWeight: 600,
        italic: false,
        align: 'center',
        verticalAlign: 'top',
      },
    },
    {
      ...baseNode({ id: 'avatar', name: 'Avatar', width: 40, height: 40 }),
      type: 'ellipse',
      fills: [
        {
          type: 'linear',
          start: { x: 0, y: 0 },
          end: { x: 40, y: 40 },
          stops: [
            { offset: 0, color: '#5b9bff' },
            { offset: 1, color: '#7e57c2' },
          ],
        },
      ],
    },
    {
      ...baseNode({ id: 'icon', name: 'Icon', width: 8, height: 16 }),
      type: 'path',
      d: 'M0 0L8 8L0 16',
      fillRule: 'evenodd',
      fills: [],
      stroke: {
        paints: [{ type: 'solid', color: '#ffffff' }],
        width: 2,
        align: 'center',
        cap: 'round',
      },
    },
    {
      ...baseNode({ id: 'photo', name: 'Foto', width: 56, height: 40 }),
      type: 'rect',
      cornerRadius: [4, 4, 0, 0],
      fills: [{ type: 'image' }],
    },
    {
      ...baseNode({ id: 'mystery', name: '?', width: 10, height: 10 }),
      type: 'unknown',
      sourceType: 'STICKY',
    },
    {
      ...baseNode({
        id: 'ghost',
        name: 'Oculto',
        width: 10,
        height: 10,
        visible: false,
        opacity: 0.5,
      }),
      type: 'rect',
      cornerRadius: 0,
      fills: [],
    },
  ],
};

describe('renderScene', () => {
  it('cria um contêiner Konva por nó, com o sceneId, a transformação e a visibilidade', () => {
    const { root, byId } = renderScene(scene(card));
    expect(byId.size).toBe(7);
    expect(root.getAttr('sceneId')).toBe('card');
    expect(root.position()).toEqual({ x: 10, y: 20 });
    expect(byId.get('title')?.position()).toEqual({ x: 100, y: 10 });
    const ghost = byId.get('ghost');
    expect(ghost?.visible()).toBe(false);
    expect(ghost?.opacity()).toBe(0.5);
    expect(sceneIdOf(byId.get('avatar')?.getChildren()[0])).toBe('avatar');
  });

  it('desenha o quadro com fundo, traço por dentro, sombra e recorte arredondado', () => {
    const { root } = renderScene(scene(card));
    const rects = root.getChildren((n) => n instanceof Konva.Rect) as Konva.Rect[];
    expect(rects).toHaveLength(2);
    const [fill, stroke] = rects;
    expect(fill?.fill()).toBe('#ffffff');
    expect(fill?.cornerRadius()).toBe(8);
    expect(fill?.shadowBlur()).toBe(8);
    expect(fill?.shadowOffset()).toEqual({ x: 0, y: 4 });
    // Traço de 2px por dentro: o retângulo do traço encolhe 1px de cada lado.
    expect(stroke?.x()).toBe(1);
    expect(stroke?.width()).toBe(198);
    expect(stroke?.stroke()).toBe('#1a63cc');
    expect(stroke?.cornerRadius()).toBe(7);
    expect(root.clipFunc()).toBeTypeOf('function');
  });

  it('texto centrado sem largura fica ancorado no x; gradiente, caminho e imagem sem pixels', () => {
    const { byId, warnings } = renderScene(scene(card));
    const text = byId.get('title')?.getChildren()[0] as Konva.Text;
    expect(text.fontStyle()).toBe('600');
    expect(text.align()).toBe('center');
    expect(text.offsetX()).toBeCloseTo(text.width() / 2);

    const avatar = byId.get('avatar')?.getChildren()[0] as Konva.Ellipse;
    expect(avatar.fillLinearGradientColorStops()).toEqual([0, '#5b9bff', 1, '#7e57c2']);
    expect(avatar.radiusX()).toBe(20);

    const icon = byId.get('icon')?.getChildren()[0] as Konva.Path;
    expect(icon.data()).toBe('M0 0L8 8L0 16');
    expect(icon.stroke()).toBe('#ffffff');
    expect(icon.lineCap()).toBe('round');
    expect(icon.fillEnabled()).toBe(false);

    const photo = byId.get('photo')?.getChildren() ?? [];
    expect(photo).toHaveLength(2);
    expect((photo[0] as Konva.Rect).cornerRadius()).toEqual([4, 4, 0, 0]);
    expect(warnings).toContain('imagem sem pixels desenhada como reservado');
    expect(warnings).toContain('nó não desenhado (STICKY): só a caixa');
  });

  it('um grupo com sombra repassa a sombra à primeira forma descendente', () => {
    const group: SceneNode = {
      ...baseNode({
        id: 'g',
        name: 'g',
        effects: [{ color: '#000', offset: { x: 1, y: 2 }, blur: 3 }],
      }),
      type: 'group',
      children: [
        {
          ...baseNode({ id: 'r', name: 'r', width: 5, height: 5 }),
          type: 'rect',
          cornerRadius: 0,
          fills: [{ type: 'solid', color: '#f00' }],
        },
      ],
    };
    const { byId } = renderScene(scene(group));
    const rect = byId.get('r')?.getChildren()[0] as Konva.Rect;
    expect(rect.shadowBlur()).toBe(3);
    expect(rect.shadowOffset()).toEqual({ x: 1, y: 2 });
  });

  it('sombra interna é ignorada com aviso', () => {
    const node: SceneNode = {
      ...baseNode({
        id: 'r',
        name: 'r',
        width: 5,
        height: 5,
        effects: [{ color: '#000', offset: { x: 0, y: 0 }, blur: 2, inner: true }],
      }),
      type: 'rect',
      cornerRadius: 0,
      fills: [{ type: 'solid', color: '#f00' }],
    };
    const { warnings, byId } = renderScene(scene(node));
    expect(warnings).toContain('sombra interna não existe no canvas 2D: ignorada');
    expect((byId.get('r')?.getChildren()[0] as Konva.Rect).shadowEnabled()).toBe(true);
    expect((byId.get('r')?.getChildren()[0] as Konva.Rect).shadowBlur()).toBe(0);
  });

  it('decompõe matrizes com rotação e escala; fontStyle combina peso e itálico', () => {
    const rotated = decompose([0, 1, -1, 0, 10, 20]);
    expect(rotated.rotation).toBeCloseTo(90);
    expect(rotated.x).toBe(10);
    expect(rotated.y).toBe(20);
    const scaled = decompose([2, 0, 0, 3, 0, 0]);
    expect(scaled.scaleX).toBe(2);
    expect(scaled.scaleY).toBe(3);
    expect(scaled.rotation).toBeCloseTo(0);
    expect(fontStyle(400, false)).toBe('normal');
    expect(fontStyle(700, false)).toBe('bold');
    expect(fontStyle(500, true)).toBe('italic 500');
  });

  it('as cores do reservado e do nó desconhecido vêm da paleta (padrão do laboratório)', () => {
    const unknown: SceneNode = {
      ...baseNode({ id: 'u', name: 'u', width: 20, height: 10 }),
      type: 'unknown',
      sourceType: 'BLOB',
    };
    const strokeOf = (options?: Parameters<typeof renderScene>[1]) =>
      (
        renderScene(scene(unknown), options).byId.get('u')?.getChildren()[0] as Konva.Rect
      ).stroke();
    expect(strokeOf()).toBe(DEFAULT_PALETTE.unknownLine);
    expect(strokeOf({ palette: { unknownLine: '#123456' } })).toBe('#123456');

    const noPixels: SceneNode = {
      ...baseNode({ id: 'img', name: 'img', width: 20, height: 10 }),
      type: 'rect',
      cornerRadius: 0,
      fills: [{ type: 'image' }],
    };
    const { byId } = renderScene(scene(noPixels), {
      palette: { placeholderFill: '#aaaaaa', placeholderLine: '#bbbbbb' },
    });
    const [fill, cross] = byId.get('img')?.getChildren() ?? [];
    expect((fill as Konva.Rect).fill()).toBe('#aaaaaa');
    expect((cross as Konva.Line).stroke()).toBe('#bbbbbb');
  });
});

describe('slot (reservado do container)', () => {
  const slot: SceneNode = {
    ...baseNode({
      id: 's',
      name: 'slot',
      width: 50,
      height: 20,
      transform: translate(0, 0),
    }),
    type: 'unknown',
    sourceType: 'slot',
  };

  it('desenha o contorno tracejado por padrão', () => {
    const rect = renderScene(scene(slot)).byId.get('s')?.getChildren()[0] as Konva.Rect;
    expect(rect.dash()).toEqual([3, 5]);
  });

  it('com showSlots: false não gera forma, mas o contêiner existe', () => {
    const result = renderScene(scene(slot), { showSlots: false });
    expect(result.byId.get('s')?.getChildren()).toHaveLength(0);
    expect(result.warnings).toEqual([]);
  });
});

describe('imagem remota e embutida', () => {
  const rectWith = (fill: object): SceneNode => ({
    ...baseNode({ id: 'img', name: 'img', width: 40, height: 20 }),
    type: 'rect',
    cornerRadius: 0,
    fills: [fill as never],
  });

  /** Espiona o construtor de `Image`: devolve as URLs atribuídas a `src`. */
  function spyImage(): { sources: string[]; restore: () => void } {
    const original = globalThis.Image;
    const sources: string[] = [];
    class SpyImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      naturalWidth = 1;
      naturalHeight = 1;
      set src(value: string) {
        sources.push(value);
      }
    }
    globalThis.Image = SpyImage as unknown as typeof Image;
    return {
      sources,
      restore: () => {
        globalThis.Image = original;
      },
    };
  }

  it('o paint com url desenha o reservado (forma cinza e X), sem Image e sem aviso', () => {
    const spy = spyImage();
    try {
      const { byId, warnings } = renderScene(
        scene(
          rectWith({ type: 'image', fit: 'cover', url: 'https://cdn.exemplo.com/a.png' }),
        ),
      );
      const [fill, cross] = byId.get('img')?.getChildren() ?? [];
      expect((fill as Konva.Rect).fill()).toBe(DEFAULT_PALETTE.placeholderFill);
      expect(cross).toBeInstanceOf(Konva.Line);
      expect(spy.sources).toEqual([]);
      expect(warnings).toEqual([]);
    } finally {
      spy.restore();
    }
  });

  it('src de outro esquema vira reservado e nunca cria Image', () => {
    const spy = spyImage();
    try {
      for (const src of [
        'https://cdn.exemplo.com/a.png',
        'http://x.com/a.png',
        'blob:x',
      ]) {
        const { byId } = renderScene(scene(rectWith({ type: 'image', src })));
        const children = byId.get('img')?.getChildren() ?? [];
        expect(children).toHaveLength(2);
        expect(children[1]).toBeInstanceOf(Konva.Line);
      }
      expect(spy.sources).toEqual([]);
    } finally {
      spy.restore();
    }
  });

  it('src data: continua carregando a imagem embutida', () => {
    const spy = spyImage();
    try {
      const src = 'data:image/png;base64,AAAA';
      const { byId } = renderScene(scene(rectWith({ type: 'image', src })));
      const children = byId.get('img')?.getChildren() ?? [];
      expect(children).toHaveLength(1);
      expect(children[0]).toBeInstanceOf(Konva.Image);
      expect(spy.sources).toEqual([src]);
    } finally {
      spy.restore();
    }
  });
});
