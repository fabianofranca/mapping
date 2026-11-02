// Imagens remotas do visualizador embutível (RI4, decisão 9): desligadas por padrão (nada é
// pedido à rede); ligadas, valem a política de URL e a função `allowOrigin` do hospedeiro
// (padrão: recusar tudo). A rede é um `Image` falso que registra cada `src` pedido.
import Konva from 'konva';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { installFakeCanvas } from '../../canvas/harness';
import { approximateMeasurer } from '../../../src/model/components/instantiate';
import { loadLibrary } from '../../../src/model/components/library';
import type { Screen } from '../../../src/model/components/screen';
import { type Viewer, type ViewerOptions, createViewer } from '../../../lab/viewer';

beforeAll(() => installFakeCanvas());

const ROOT = join(__dirname, '../../../tests/fixtures/pessoas');

function listDisk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? listDisk(join(dir, e.name))
      : [relative(ROOT, join(dir, e.name)).split('\\').join('/')],
  );
}

const library = loadLibrary(
  listDisk(ROOT).map((path) => ({ path, text: readFileSync(join(ROOT, path), 'utf8') })),
);

const CDN = 'https://cdn.exemplo.com';
const OTHER = 'https://outra.exemplo.com';

function screenOf(photos: readonly string[]): Screen {
  return {
    id: 't',
    name: 'T',
    width: 300,
    height: 100 * photos.length,
    background: '#FFFFFF',
    instances: photos.map((foto, index) => ({
      id: `i${index}`,
      typeId: 'avatar',
      box: { x: 0, y: index * 100, width: 220, height: 56 },
      values: { nome: `Pessoa ${index}`, foto },
    })),
  };
}

/** `Image` falso: guarda quem foi criado e o `src` que recebeu (é o "pedido à rede"). */
class FakeImage {
  static created: FakeImage[] = [];
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  crossOrigin: string | null = null;
  referrerPolicy = '';
  naturalWidth = 0;
  naturalHeight = 0;
  src = '';
  constructor() {
    FakeImage.created.push(this);
  }
  static requested(): string[] {
    return FakeImage.created.map((image) => image.src).filter((src) => src !== '');
  }
}

const mounted: Viewer[] = [];

function container(): HTMLDivElement {
  const el = document.createElement('div');
  Object.defineProperty(el, 'clientWidth', { value: 400, configurable: true });
  Object.defineProperty(el, 'clientHeight', { value: 600, configurable: true });
  document.body.appendChild(el);
  return el;
}

function make(options: ViewerOptions, photos: readonly string[]): Viewer {
  const viewer = createViewer(container(), {
    measure: approximateMeasurer,
    library,
    screen: screenOf(photos),
    ...options,
  });
  mounted.push(viewer);
  return viewer;
}

function konvaImages(): Konva.Image[] {
  return Konva.stages.flatMap((stage) => stage.find<Konva.Image>('Image'));
}

afterEach(() => {
  for (const viewer of mounted.splice(0)) viewer.dispose();
  document.body.replaceChildren();
  FakeImage.created = [];
  vi.unstubAllGlobals();
});

describe('imagens remotas do visualizador', () => {
  it('desligadas por padrão: nenhuma imagem é criada nem pedida', () => {
    vi.stubGlobal('Image', FakeImage);
    const allowOrigin = vi.fn(() => true);
    make({ allowOrigin }, [`${CDN}/a.png`]);
    expect(FakeImage.created).toEqual([]);
    expect(allowOrigin).not.toHaveBeenCalled();
    expect(konvaImages()).toEqual([]);
  });

  it('ligadas sem allowOrigin: recusa tudo e desenha o reservado', () => {
    vi.stubGlobal('Image', FakeImage);
    make({ remoteImages: true }, [`${CDN}/a.png`, `${OTHER}/b.png`]);
    expect(FakeImage.requested()).toEqual([]);
    expect(konvaImages()).toEqual([]);
  });

  it('ligadas com allowOrigin: só pede as origens aceitas', () => {
    vi.stubGlobal('Image', FakeImage);
    const allowOrigin = vi.fn((origin: string) => origin === CDN);
    make({ remoteImages: true, allowOrigin }, [`${CDN}/a.png`, `${OTHER}/b.png`]);
    expect(FakeImage.requested()).toEqual([`${CDN}/a.png`]);
    expect(allowOrigin).toHaveBeenCalledWith(CDN);
    expect(allowOrigin).toHaveBeenCalledWith(OTHER);
    const [image] = FakeImage.created;
    expect(image?.crossOrigin).toBe('anonymous');
    expect(image?.referrerPolicy).toBe('no-referrer');
  });

  it('a política vem antes: http, rede local, credenciais e lixo nem chegam ao allowOrigin', () => {
    vi.stubGlobal('Image', FakeImage);
    const allowOrigin = vi.fn(() => true);
    make({ remoteImages: true, allowOrigin }, [
      'http://cdn.exemplo.com/a.png',
      'https://localhost/a.png',
      'https://192.168.0.10/a.png',
      'https://user:senha@cdn.exemplo.com/a.png',
      'javascript:alert(1)',
      'não é url',
    ]);
    expect(allowOrigin).not.toHaveBeenCalled();
    expect(FakeImage.requested()).toEqual([]);
  });

  it('allowOrigin que lança equivale a recusar', () => {
    vi.stubGlobal('Image', FakeImage);
    make(
      {
        remoteImages: true,
        allowOrigin: () => {
          throw new Error('falhou');
        },
      },
      [`${CDN}/a.png`],
    );
    expect(FakeImage.requested()).toEqual([]);
  });

  it('a imagem que termina de carregar entra no desenho da instância', () => {
    vi.stubGlobal('Image', FakeImage);
    make({ remoteImages: true, allowOrigin: () => true }, [`${CDN}/a.png`]);
    expect(konvaImages()).toEqual([]);
    const [image] = FakeImage.created;
    if (!image) throw new Error('a imagem não foi pedida');
    image.naturalWidth = 64;
    image.naturalHeight = 64;
    image.onload?.();
    return vi.waitFor(() => expect(konvaImages()).toHaveLength(1));
  });

  it('falha de carga mantém o reservado e não pede de novo', () => {
    vi.stubGlobal('Image', FakeImage);
    const viewer = make({ remoteImages: true, allowOrigin: () => true }, [
      `${CDN}/a.png`,
    ]);
    FakeImage.created[0]?.onerror?.();
    viewer.redraw();
    expect(konvaImages()).toEqual([]);
    expect(FakeImage.requested()).toEqual([`${CDN}/a.png`]);
  });

  it('dispose cancela o que está em andamento', () => {
    vi.stubGlobal('Image', FakeImage);
    const viewer = make({ remoteImages: true, allowOrigin: () => true }, [
      `${CDN}/a.png`,
    ]);
    const [image] = FakeImage.created;
    viewer.dispose();
    expect(image?.src).toBe('');
    expect(image?.onload).toBeNull();
  });
});
