// Cache das imagens da galeria do Catálogo: gera uma vez por chave; o rasterizador é injetado.
import Konva from 'konva';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { installFakeCanvas } from './harness';
import {
  type ExampleImageKey,
  type ExampleImageOptions,
  createExampleImageCache,
  renderSceneToDataUrl,
} from '../../src/canvas/components/exampleImages';
import {
  type RemoteImageView,
  clearEmbeddedImages,
} from '../../src/canvas/components/imageLoader';
import { type FrameNode, baseNode } from '../../src/model/components/scene';

const root: FrameNode = {
  ...baseNode({
    id: 'r',
    name: 'r',
    width: 40,
    height: 20,
    fills: [{ type: 'solid', color: '#ff0000' }],
  }),
  type: 'frame',
  clip: false,
  cornerRadius: 0,
  children: [],
};
const key: ExampleImageKey = {
  specId: 'm3',
  version: 1,
  typeId: 'button',
  example: 'preview',
  width: 40,
  height: 20,
  fontsEpoch: 0,
  imagesEpoch: 0,
};

describe('cache de imagens de exemplo', () => {
  it('devolve a mesma string e gera uma vez por chave', () => {
    const rasterize = vi.fn(() => `data:image/png;base64,${Math.random()}`);
    const cache = createExampleImageCache(rasterize);
    const a = cache.get(key, () => root);
    const b = cache.get(key, () => root);
    expect(a).toBe(b);
    expect(rasterize).toHaveBeenCalledTimes(1);
    expect(cache.size).toBe(1);
  });

  it('chaves diferentes (versão, tamanho, exemplo, época) geram novas imagens', () => {
    const rasterize = vi.fn(() => `data:image/png;base64,${Math.random()}`);
    const cache = createExampleImageCache(rasterize);
    cache.get(key, () => root);
    cache.get({ ...key, version: 2 }, () => root);
    cache.get({ ...key, width: 80 }, () => root);
    cache.get({ ...key, example: 'Outlined' }, () => root);
    cache.get({ ...key, fontsEpoch: 1 }, () => root);
    cache.get({ ...key, imagesEpoch: 1 }, () => root);
    expect(rasterize).toHaveBeenCalledTimes(6);
  });

  it('a época das imagens invalida a entrada: a imagem que termina de carregar é redesenhada', () => {
    const rasterize = vi.fn(() => `data:image/png;base64,${Math.random()}`);
    const cache = createExampleImageCache(rasterize);
    const before = cache.get(key, () => root);
    expect(cache.get(key, () => root)).toBe(before);
    const after = cache.get({ ...key, imagesEpoch: 1 }, () => root);
    expect(after).not.toBe(before);
    expect(rasterize).toHaveBeenCalledTimes(2);
  });

  it('guarda uma entrada por cena: as épocas antigas não se acumulam', () => {
    const rasterize = vi.fn(() => `data:image/png;base64,${Math.random()}`);
    const cache = createExampleImageCache(rasterize);
    for (let epoch = 0; epoch < 5; epoch += 1) {
      cache.get({ ...key, fontsEpoch: epoch, imagesEpoch: epoch }, () => root);
    }
    expect(rasterize).toHaveBeenCalledTimes(5);
    expect(cache.size).toBe(1);
    // Outra cena é outra entrada.
    cache.get({ ...key, example: 'Outlined' }, () => root);
    expect(cache.size).toBe(2);
  });

  it('guarda os avisos do desenho junto da imagem, por chave', () => {
    const warning = { code: 'inner-shadow' } as const;
    const rasterize = vi.fn((_: FrameNode, options: ExampleImageOptions) => {
      options.onWarnings?.([warning]);
      return 'data:image/png;base64,AAAA';
    });
    const cache = createExampleImageCache(rasterize);
    expect(cache.warnings(key)).toEqual([]);
    cache.get(key, () => root);
    expect(cache.warnings(key)).toEqual([warning]);
    expect(cache.warnings({ ...key, example: 'Outlined' })).toEqual([]);
  });

  it('sem desenho não guarda nada e clear esvazia', () => {
    const cache = createExampleImageCache(() => 'data:x');
    expect(cache.get(key, () => null)).toBeNull();
    expect(cache.size).toBe(0);
    cache.get(key, () => root);
    cache.clear();
    expect(cache.size).toBe(0);
  });
});

describe('renderSceneToDataUrl', () => {
  beforeAll(() => installFakeCanvas());
  it('desenha numa Stage fora da tela e a destrói', () => {
    const before = Konva.stages.length;
    const spy = vi
      .spyOn(HTMLCanvasElement.prototype, 'toDataURL')
      .mockReturnValue('data:image/png;base64,AAAA');
    const url = renderSceneToDataUrl(root, { background: '#ffffff' });
    expect(url).toBe('data:image/png;base64,AAAA');
    expect(Konva.stages.length).toBe(before);
    spy.mockRestore();
  });

  describe('imagens embutidas (data:)', () => {
    const embedded: FrameNode = {
      ...baseNode({ id: 'card', name: 'card', width: 40, height: 40 }),
      type: 'frame',
      clip: false,
      cornerRadius: 0,
      fills: [],
      children: [
        {
          ...baseNode({ id: 'img', name: 'img', width: 40, height: 40 }),
          type: 'rect',
          cornerRadius: 0,
          fills: [{ type: 'image', src: 'data:image/png;base64,QUJD' }],
        },
      ],
    };

    class FakeImage {
      static instances: FakeImage[] = [];
      naturalWidth = 10;
      naturalHeight = 10;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      src = '';
      constructor() {
        FakeImage.instances.push(this);
      }
    }

    /** As imagens do Konva com pixels no momento da leitura (`toDataURL`). */
    function loadedAtRead(): number {
      const layers: Konva.Layer[] = [];
      const add = vi.spyOn(Konva.Layer.prototype, 'add').mockImplementation(function (
        this: Konva.Layer,
        ...nodes: Array<Konva.Group | Konva.Shape>
      ) {
        layers.push(this);
        return Konva.Container.prototype.add.apply(this, nodes) as never;
      });
      let seen = -1;
      const read = vi
        .spyOn(HTMLCanvasElement.prototype, 'toDataURL')
        .mockImplementation(() => {
          seen = (layers[0]?.find('Image') as Konva.Image[]).filter((i) =>
            i.image(),
          ).length;
          return 'data:image/png;base64,AAAA';
        });
      try {
        renderSceneToDataUrl(embedded, {});
      } finally {
        add.mockRestore();
        read.mockRestore();
      }
      return seen;
    }

    it('o PNG da cena sai com a imagem embutida depois que ela carrega', () => {
      const original = globalThis.Image;
      globalThis.Image = FakeImage as unknown as typeof Image;
      clearEmbeddedImages();
      FakeImage.instances = [];
      try {
        // Primeira leitura: a imagem ainda decodifica, o PNG sai com o reservado.
        expect(loadedAtRead()).toBe(0);
        FakeImage.instances[0]?.onload?.();
        // A época das imagens embutidas mudou: o novo PNG leva a imagem decodificada.
        expect(loadedAtRead()).toBe(1);
        expect(FakeImage.instances).toHaveLength(1);
      } finally {
        globalThis.Image = original;
        clearEmbeddedImages();
      }
    });

    it('entrega os avisos do desenho a quem pede', () => {
      const unknown: FrameNode = {
        ...embedded,
        children: [
          {
            ...baseNode({ id: 'u', name: 'u', width: 5, height: 5 }),
            type: 'unknown',
            sourceType: 'STICKY',
          },
        ],
      };
      const read = vi
        .spyOn(HTMLCanvasElement.prototype, 'toDataURL')
        .mockReturnValue('data:image/png;base64,AAAA');
      const heard: unknown[] = [];
      renderSceneToDataUrl(unknown, { onWarnings: (w) => heard.push(...w) });
      read.mockRestore();
      expect(heard).toEqual([{ code: 'unknown-node', params: { type: 'STICKY' } }]);
    });
  });

  describe('imagens remotas', () => {
    const URL = 'https://cdn.exemplo.com/a.png';
    const withImage: FrameNode = {
      ...baseNode({ id: 'card', name: 'card', width: 40, height: 40 }),
      type: 'frame',
      clip: false,
      cornerRadius: 0,
      fills: [],
      children: [
        {
          ...baseNode({ id: 'img', name: 'img', width: 40, height: 40 }),
          type: 'rect',
          cornerRadius: 0,
          fills: [{ type: 'image', url: URL }],
        },
      ],
    };
    const image = { width: 10, height: 10 } as unknown as CanvasImageSource;

    /** Quantos `KonvaImage` a cena tinha no momento da leitura de pixels. */
    function imagesAtRead(remoteImage: (url: string) => RemoteImageView): number {
      const layers: Konva.Layer[] = [];
      const add = vi.spyOn(Konva.Layer.prototype, 'add').mockImplementation(function (
        this: Konva.Layer,
        ...nodes: Array<Konva.Group | Konva.Shape>
      ) {
        layers.push(this);
        return Konva.Container.prototype.add.apply(this, nodes) as never;
      });
      let seen = -1;
      const read = vi
        .spyOn(HTMLCanvasElement.prototype, 'toDataURL')
        .mockImplementation(() => {
          seen = layers[0]?.find('Image').length ?? -1;
          return 'data:image/png;base64,AAAA';
        });
      try {
        renderSceneToDataUrl(withImage, { remoteImage });
      } finally {
        add.mockRestore();
        read.mockRestore();
      }
      return seen;
    }

    it('imagem opaque (sem CORS) nunca entra no que é lido de volta: vale o reservado', () => {
      expect(
        imagesAtRead(() => ({ state: 'opaque', image, width: 10, height: 10 })),
      ).toBe(0);
    });

    it('imagem com CORS entra; sem a função, o reservado', () => {
      expect(
        imagesAtRead(() => ({ state: 'loaded', image, width: 10, height: 10 })),
      ).toBe(1);
      expect(imagesAtRead(() => ({ state: 'loading' }))).toBe(0);
      const read = vi
        .spyOn(HTMLCanvasElement.prototype, 'toDataURL')
        .mockReturnValue('data:image/png;base64,AAAA');
      expect(renderSceneToDataUrl(withImage, {})).toBe('data:image/png;base64,AAAA');
      read.mockRestore();
    });

    it('o rasterizador pede a URL à função das opções', () => {
      const remoteImage = vi.fn((): RemoteImageView => ({ state: 'loading' }));
      imagesAtRead(remoteImage);
      expect(remoteImage).toHaveBeenCalledWith(URL);
    });
  });
});
