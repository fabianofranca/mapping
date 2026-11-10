// Desenho de componentes e imagens (etapa #940, fase 3): imagem embutida segue `paint.fit`, sombra
// de quadro transparente vai para o primeiro filho e os avisos levam código e parâmetros.
import Konva from 'konva';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { installFakeCanvas } from '../harness';
import { clearEmbeddedImages } from '../../../src/canvas/components/imageLoader';
import { renderScene } from '../../../src/canvas/components/renderScene';
import {
  type FrameNode,
  type Scene,
  type SceneNode,
  baseNode,
} from '../../../src/model/components/scene';

beforeAll(() => installFakeCanvas());

const scene = (root: SceneNode): Scene => ({ root, warnings: [] });

class FakeImage {
  static instances: FakeImage[] = [];
  naturalWidth = 80;
  naturalHeight = 40;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  src = '';
  constructor() {
    FakeImage.instances.push(this);
  }
}

let original: typeof Image;
beforeEach(() => {
  original = globalThis.Image;
  FakeImage.instances = [];
  globalThis.Image = FakeImage as unknown as typeof Image;
  clearEmbeddedImages();
});
afterEach(() => {
  globalThis.Image = original;
});

describe('imagem embutida (data:) segue paint.fit', () => {
  const SRC = 'data:image/png;base64,AAAA';
  const rect = (fit?: 'cover' | 'contain' | 'fill'): SceneNode => ({
    ...baseNode({ id: 'img', name: 'img', width: 40, height: 40 }),
    type: 'rect',
    cornerRadius: 0,
    fills: [{ type: 'image', src: SRC, ...(fit ? { fit } : {}) }],
  });
  const draw = (fit?: 'cover' | 'contain' | 'fill') => {
    let loaded = 0;
    const result = renderScene(scene(rect(fit)), { onImageLoaded: () => (loaded += 1) });
    FakeImage.instances[0]?.onload?.();
    const image = result.byId.get('img')?.getChildren()[0] as Konva.Image;
    return { image, loaded: () => loaded };
  };

  it('contain encaixa a fonte inteira no centro (80×40 numa caixa 40×40)', () => {
    const { image, loaded } = draw('contain');
    expect(image.image()).toBe(FakeImage.instances[0]);
    expect(image.width()).toBe(40);
    expect(image.height()).toBe(20);
    expect(image.y()).toBe(10);
    expect(image.crop()).toEqual({ x: 0, y: 0, width: 0, height: 0 });
    expect(loaded()).toBe(1);
  });

  it('o padrão é cover: recorta o centro da fonte para cobrir a caixa', () => {
    const { image } = draw();
    expect(image.width()).toBe(40);
    expect(image.height()).toBe(40);
    expect(image.crop()).toEqual({ x: 20, y: 0, width: 40, height: 40 });
  });

  it('fill estica; um segundo desenho da mesma URL não cria outra Image', () => {
    const { image } = draw('fill');
    expect(image.width()).toBe(40);
    expect(image.height()).toBe(40);
    renderScene(scene(rect('contain')));
    expect(FakeImage.instances).toHaveLength(1);
  });

  it('com a imagem já carregada, o desenho a usa de imediato e não pede outro quadro', () => {
    draw('contain');
    let loaded = 0;
    const again = renderScene(scene(rect('contain')), {
      onImageLoaded: () => (loaded += 1),
    });
    const image = again.byId.get('img')?.getChildren()[0] as Konva.Image;
    expect(image.image()).toBe(FakeImage.instances[0]);
    expect(image.height()).toBe(20);
    expect(loaded).toBe(0);
  });
});

describe('sombra num quadro sem preenchimento nem traço', () => {
  const shadow = { color: '#000000', offset: { x: 1, y: 2 }, blur: 3 };
  const frame = (children: SceneNode[]): FrameNode => ({
    ...baseNode({ id: 'f', name: 'f', width: 50, height: 50, effects: [shadow] }),
    type: 'frame',
    clip: false,
    cornerRadius: 0,
    children,
  });
  const child: SceneNode = {
    ...baseNode({ id: 'c', name: 'c', width: 10, height: 10 }),
    type: 'rect',
    cornerRadius: 0,
    fills: [{ type: 'solid', color: '#ff0000' }],
  };

  it('a sombra vai para o primeiro filho; a área clicável invisível não é dona dela', () => {
    const { byId } = renderScene(scene(frame([child])));
    const hit = byId.get('f')?.getChildren()[0] as Konva.Rect;
    expect(hit.fill()).toBe('transparent');
    expect(hit.shadowBlur()).toBe(0);
    const painted = byId.get('c')?.getChildren()[0] as Konva.Rect;
    expect(painted.shadowBlur()).toBe(3);
    expect(painted.shadowOffset()).toEqual({ x: 1, y: 2 });
  });

  it('sem filho nenhum, avisa que a sombra foi ignorada', () => {
    const { warnings } = renderScene(scene(frame([])));
    expect(warnings).toContainEqual({ code: 'empty-group-shadow' });
  });
});

describe('avisos do desenho levam código e parâmetros', () => {
  it('nó desconhecido leva o tipo de origem', () => {
    const node: SceneNode = {
      ...baseNode({ id: 'u', name: 'u', width: 20, height: 10 }),
      type: 'unknown',
      sourceType: 'STICKY',
    };
    expect(renderScene(scene(node)).warnings).toEqual([
      { code: 'unknown-node', params: { type: 'STICKY' } },
    ]);
  });

  it('sombra interna avisa; várias sombras externas não avisam mais', () => {
    const node: SceneNode = {
      ...baseNode({
        id: 'r',
        name: 'r',
        width: 5,
        height: 5,
        effects: [
          { color: '#000', offset: { x: 0, y: 0 }, blur: 2, inner: true },
          { color: '#000', offset: { x: 1, y: 1 }, blur: 2 },
          { color: '#000', offset: { x: 2, y: 2 }, blur: 2 },
        ],
      }),
      type: 'rect',
      cornerRadius: 0,
      fills: [{ type: 'solid', color: '#f00' }],
    };
    const { warnings } = renderScene(scene(node));
    expect(warnings).toContainEqual({ code: 'inner-shadow' });
    expect(warnings).toEqual([{ code: 'inner-shadow' }]);
  });

  it('o mesmo aviso não se repete', () => {
    const rect = (id: string): SceneNode => ({
      ...baseNode({ id, name: id, width: 5, height: 5 }),
      type: 'rect',
      cornerRadius: 0,
      fills: [{ type: 'image' }],
    });
    const root: FrameNode = {
      ...baseNode({ id: 'f', name: 'f', width: 20, height: 20 }),
      type: 'frame',
      clip: false,
      cornerRadius: 0,
      children: [rect('a'), rect('b')],
    };
    const { warnings } = renderScene(scene(root));
    expect(warnings).toEqual([{ code: 'image-without-pixels' }]);
  });
});

describe('slot e nó desconhecido: opacidade e cor vêm da paleta', () => {
  it('slotOpacity e unknownFill da paleta', () => {
    const slot: SceneNode = {
      ...baseNode({ id: 's', name: 's', width: 20, height: 10 }),
      type: 'unknown',
      sourceType: 'slot',
    };
    const rect = renderScene(scene(slot), { palette: { slotOpacity: 0.3 } })
      .byId.get('s')
      ?.getChildren()[0] as Konva.Rect;
    expect(rect.opacity()).toBe(0.3);
  });
});
