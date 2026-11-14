import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  addBackgroundContainer,
  addContainer,
  createMarking,
  createProject,
  serialize,
  type Project,
} from '../../src/model';
import { decodeImage, encodeImage } from '../../mcp/image/codecs';
import {
  createRaster,
  type PixelRect,
  type Raster,
  type Rgb,
} from '../../mcp/image/raster';
import type { ImageFormat } from '../../mcp/image/formats';
import { NOW } from '../model/fixtures';

// Fixture images generated in the test (PNG, JPEG and WebP) with the same codec as the server and a
// project of temporary folders that uses them. The pixels follow formulas, so the tests
// check the crop by the color of each place in the original image.

export const SOLID = { form: [16, 160, 48], a: [200, 32, 32], b: [32, 64, 200] } as const;

/** Smooth gradient (R grows with x, G with y) with three solid color blocks. */
export function patternRaster(width: number, height: number, blocks: Block[]): Raster {
  const r = createRaster(width, height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      r.data[i] = Math.round((x / Math.max(1, width - 1)) * 255);
      r.data[i + 1] = Math.round((y / Math.max(1, height - 1)) * 255);
      r.data[i + 2] = 128;
      r.data[i + 3] = 255;
    }
  }
  for (const { rect, color } of blocks) {
    for (let y = rect.y; y < rect.y + rect.height; y++) {
      for (let x = rect.x; x < rect.x + rect.width; x++) {
        r.data.set([...color, 255], (y * width + x) * 4);
      }
    }
  }
  return r;
}

export interface Block {
  readonly rect: PixelRect;
  readonly color: Rgb;
}

export function pixel(raster: Raster, x: number, y: number): number[] {
  const i = (y * raster.width + x) * 4;
  return [...raster.data.subarray(i, i + 4)];
}

/** Largest difference between channels: lossy JPEG and WebP slightly change the colors. */
export function distance(a: readonly number[], b: readonly number[]): number {
  return Math.max(...a.slice(0, 3).map((v, i) => Math.abs(v - b[i]!)));
}

export const PARENT: PixelRect = { x: 100, y: 50, width: 200, height: 150 };
export const CHILD_A: PixelRect = { x: 110, y: 60, width: 50, height: 40 };
export const CHILD_B: PixelRect = { x: 200, y: 120, width: 60, height: 50 };
export const IMAGE_SIZE = { width: 400, height: 300 } as const;

export const BLOCKS: Block[] = [
  { rect: PARENT, color: SOLID.form },
  { rect: CHILD_A, color: SOLID.a },
  { rect: CHILD_B, color: SOLID.b },
];

export async function fixtureFile(
  format: ImageFormat,
  raster = patternRaster(IMAGE_SIZE.width, IMAGE_SIZE.height, BLOCKS),
): Promise<Uint8Array> {
  return encodeImage(raster, format, { quality: 95 });
}

export async function decodeBytes(bytes: Uint8Array): Promise<Raster> {
  return (await decodeImage(bytes)).raster;
}

const containerId = (digit: string) => `${digit.repeat(8)}-0000-4000-8000-000000000001`;

export const IDS = {
  layer: 'cccccccc-0000-4000-8000-000000000001',
  png: containerId('1'),
  jpeg: containerId('2'),
  webp: containerId('3'),
  big: containerId('4'),
  mismatch: containerId('5'),
  missing: containerId('6'),
  text: containerId('7'),
  bomb: containerId('8'),
  escape: containerId('9'),
  // Container (without a file): it is not in IMAGE_FILES.
  bgContainer: containerId('d'),
  // The markings of each image swap the first character of the image id (distinct codes).
  parent: (image: string) => `a${image.slice(1)}`,
  childA: (image: string) => `b${image.slice(1)}`,
  childB: (image: string) => `c${image.slice(1)}`,
} as const;

/** The reference code (first 8 hexadecimal characters of the id). */
/** Background color of the fixture container. */
export const BLANK_BACKGROUND = '#1060A0';

export const codeOf = (id: string) => id.replaceAll('-', '').slice(0, 8);

export const IMAGE_FILES = {
  png: 'images/tela.png',
  jpeg: 'images/foto.jpg',
  webp: 'images/tela.webp',
  big: 'images/grande.png',
  mismatch: 'images/menor.png',
  missing: 'images/ausente.png',
  text: 'images/texto.png',
  bomb: 'images/bomba.png',
  escape: 'images/fuga.png',
} as const;

function imageProject(): Project {
  let p = createProject({
    name: 'Imagens',
    now: NOW,
    firstLayer: { id: IDS.layer, name: 'Camada 1', color: '#D32F2F' },
  });
  const sizes: Record<keyof typeof IMAGE_FILES, { width: number; height: number }> = {
    png: IMAGE_SIZE,
    jpeg: IMAGE_SIZE,
    webp: IMAGE_SIZE,
    big: { width: 3000, height: 2000 },
    // The file has half the dimensions recorded in mapping.json.
    mismatch: IMAGE_SIZE,
    missing: IMAGE_SIZE,
    text: IMAGE_SIZE,
    bomb: IMAGE_SIZE,
    escape: IMAGE_SIZE,
  };
  for (const key of Object.keys(IMAGE_FILES) as (keyof typeof IMAGE_FILES)[]) {
    p = addContainer(p, { id: IDS[key], file: IMAGE_FILES[key], ...sizes[key] });
  }
  p = addBackgroundContainer(p, {
    id: IDS.bgContainer,
    width: IMAGE_SIZE.width,
    height: IMAGE_SIZE.height,
    background: BLANK_BACKGROUND,
  });
  const named = (id: string, containerId: string, rect: PixelRect, name: string) => ({
    id,
    containerId,
    rect,
    name,
  });
  for (const key of [
    'png',
    'jpeg',
    'webp',
    'mismatch',
    'missing',
    'text',
    'bomb',
    'bgContainer',
  ] as const) {
    const image = IDS[key];
    p = createMarking(p, named(IDS.parent(image), image, PARENT, 'Formulário'));
    p = createMarking(p, named(IDS.childA(image), image, CHILD_A, 'Campo A'));
    p = createMarking(p, named(IDS.childB(image), image, CHILD_B, 'Campo B'));
  }
  return p;
}

export interface ImageWorkspace {
  readonly root: string;
  readonly dir: string;
}

/** Temporary folder with the `imagens` project and the fixture images in PNG, JPEG and WebP. */
export async function createImageWorkspace(): Promise<ImageWorkspace> {
  const root = mkdtempSync(join(tmpdir(), 'mapping-mcp-img-'));
  const dir = join(root, 'imagens');
  mkdirSync(join(dir, 'images'), { recursive: true });
  writeFileSync(join(dir, 'mapping.json'), serialize(imageProject()));
  const put = (file: string, bytes: Uint8Array) => writeFileSync(join(dir, file), bytes);
  put(IMAGE_FILES.png, await fixtureFile('png'));
  put(IMAGE_FILES.jpeg, await fixtureFile('jpeg'));
  put(IMAGE_FILES.webp, await fixtureFile('webp'));
  put(IMAGE_FILES.big, await fixtureFile('png', patternRaster(3000, 2000, [])));
  put(
    IMAGE_FILES.mismatch,
    await fixtureFile(
      'png',
      patternRaster(200, 150, [
        { rect: { x: 50, y: 25, width: 100, height: 75 }, color: SOLID.form },
      ]),
    ),
  );
  put(IMAGE_FILES.text, new TextEncoder().encode('this is not an image'));
  // PNG header that declares 50,000 × 50,000 pixels: refused before decoding.
  const bomb = new Uint8Array(33);
  bomb.set([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52,
  ]);
  new DataView(bomb.buffer).setUint32(16, 50_000);
  new DataView(bomb.buffer).setUint32(20, 50_000);
  put(IMAGE_FILES.bomb, bomb);
  // Symbolic link to a file outside the roots: the image is treated as nonexistent.
  const outside = join(root, '..', `outside-${Date.now()}`);
  mkdirSync(outside, { recursive: true });
  writeFileSync(join(outside, 'secret.png'), await fixtureFile('png'));
  symlinkSync(join(outside, 'secret.png'), join(dir, IMAGE_FILES.escape));
  return { root, dir };
}
