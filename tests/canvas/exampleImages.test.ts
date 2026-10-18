// Cache das imagens da galeria do Catálogo: gera uma vez por chave; o rasterizador é injetado.
import Konva from 'konva';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { installFakeCanvas } from './harness';
import {
  type ExampleImageKey,
  createExampleImageCache,
  exampleImageKey,
  renderSceneToDataUrl,
} from '../../src/canvas/components/exampleImages';
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
    expect(rasterize).toHaveBeenCalledTimes(5);
    expect(new Set([key, { ...key, version: 2 }].map(exampleImageKey)).size).toBe(2);
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
});
