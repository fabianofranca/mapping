// Remote images of the embeddable viewer (RI4, decision 9): off by default (nothing is
// requested from the network); on, the URL policy and the host `allowOrigin` function apply
// (default: refuse everything). The network is a fake `Image` that records each requested `src`.
import Konva from 'konva';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { installFakeCanvas } from '../canvas/harness';
import { approximateMeasurer } from '../../src/model/components/instantiate';
import { loadLibrary } from '../../src/model/components/library';
import type { Screen } from '../../src/model/components/screen';
import { type Viewer, type ViewerOptions, createViewer } from '../../viewer';

beforeAll(() => installFakeCanvas());

// pt-BR kept: shared fixture data (folder, type ids and field names) used by the viewer tests
const ROOT = join(__dirname, '../../tests/fixtures/pessoas');

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

const CDN = 'https://cdn.example.com';
const OTHER = 'https://other.example.com';

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
      values: { nome: `Person ${index}`, foto },
    })),
  };
}

/** Fake `Image`: keeps who was created and the `src` it received (it is the "network request"). */
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

describe('remote images of the viewer', () => {
  it('off by default: no image is created or requested', () => {
    vi.stubGlobal('Image', FakeImage);
    const allowOrigin = vi.fn(() => true);
    make({ allowOrigin }, [`${CDN}/a.png`]);
    expect(FakeImage.created).toEqual([]);
    expect(allowOrigin).not.toHaveBeenCalled();
    expect(konvaImages()).toEqual([]);
  });

  it('on without allowOrigin: refuses everything and draws the placeholder', () => {
    vi.stubGlobal('Image', FakeImage);
    make({ remoteImages: true }, [`${CDN}/a.png`, `${OTHER}/b.png`]);
    expect(FakeImage.requested()).toEqual([]);
    expect(konvaImages()).toEqual([]);
  });

  it('on with allowOrigin: only requests the accepted origins', () => {
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

  it('the policy comes first: http, local network, credentials and garbage never reach allowOrigin', () => {
    vi.stubGlobal('Image', FakeImage);
    const allowOrigin = vi.fn(() => true);
    make({ remoteImages: true, allowOrigin }, [
      'http://cdn.example.com/a.png',
      'https://localhost/a.png',
      'https://192.168.0.10/a.png',
      'https://user:secret@cdn.example.com/a.png',
      'javascript:alert(1)',
      'not a url',
    ]);
    expect(allowOrigin).not.toHaveBeenCalled();
    expect(FakeImage.requested()).toEqual([]);
  });

  it('an allowOrigin that throws is the same as refusing', () => {
    vi.stubGlobal('Image', FakeImage);
    make(
      {
        remoteImages: true,
        allowOrigin: () => {
          throw new Error('failed');
        },
      },
      [`${CDN}/a.png`],
    );
    expect(FakeImage.requested()).toEqual([]);
  });

  it('the image that finishes loading enters the instance drawing', () => {
    vi.stubGlobal('Image', FakeImage);
    make({ remoteImages: true, allowOrigin: () => true }, [`${CDN}/a.png`]);
    expect(konvaImages()).toEqual([]);
    const [image] = FakeImage.created;
    if (!image) throw new Error('the image was not requested');
    image.naturalWidth = 64;
    image.naturalHeight = 64;
    image.onload?.();
    return vi.waitFor(() => expect(konvaImages()).toHaveLength(1));
  });

  it('a load failure keeps the placeholder and does not request again', () => {
    vi.stubGlobal('Image', FakeImage);
    const viewer = make({ remoteImages: true, allowOrigin: () => true }, [
      `${CDN}/a.png`,
    ]);
    FakeImage.created[0]?.onerror?.();
    viewer.redraw();
    expect(konvaImages()).toEqual([]);
    expect(FakeImage.requested()).toEqual([`${CDN}/a.png`]);
  });

  it('with more distinct URLs than the cache (64), it does not enter continuous reloading', async () => {
    vi.stubGlobal('Image', FakeImage);
    const urls = Array.from({ length: 70 }, (_, i) => `${CDN}/p${i}.png`);
    make({ remoteImages: true, allowOrigin: () => true }, urls);
    const loaded = new Set<FakeImage>();
    // Finishes loading everything that was requested, round by round, until there are no more requests.
    for (let round = 0; round < 40; round += 1) {
      const waiting = FakeImage.created.filter(
        (image) => image.src !== '' && !loaded.has(image),
      );
      if (waiting.length === 0) break;
      for (const image of waiting) {
        loaded.add(image);
        image.naturalWidth = 64;
        image.naturalHeight = 64;
        image.onload?.();
      }
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    expect(FakeImage.requested()).toHaveLength(70);
  });

  it('dispose cancels what is in progress', () => {
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
