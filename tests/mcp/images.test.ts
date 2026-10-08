import { copyFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { connect, type Connection } from './workspace';
import {
  BLOCKS,
  CHILD_A,
  CHILD_B,
  IDS,
  IMAGE_FILES,
  IMAGE_SIZE,
  PARENT,
  SOLID,
  codeOf,
  createImageWorkspace,
  decodeBytes,
  distance,
  pixel,
  type ImageWorkspace,
} from './imageFixtures';
import type { Raster } from '../../mcp/image/raster';

// Integração das tools de imagem: sobe o `dist-mcp/mapping-mcp.js` por stdio (com os codecs
// WebAssembly embutidos) sobre um projeto com imagens PNG, JPEG e WebP geradas no teste.

interface MarkingImageData {
  ref: string;
  mode: 'crop' | 'context';
  image: { ref: string; file: string };
  format: string;
  width: number;
  height: number;
  scale: number;
  region: Rect;
  padding: number;
  markingInOutput: Rect;
  markingOutline?: { color: string; thickness: number };
  childrenLegend?: { color: string; name: string; ref: string; rect: Rect }[];
  childrenNotOutlined?: number;
  warning?: string;
}
interface ImageFileData {
  ref: string;
  format: string;
  width: number;
  height: number;
  originalWidth: number;
  originalHeight: number;
  scale: number;
  recoded: boolean;
  warning?: string;
}
interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}
interface Returned<T> {
  isError: boolean;
  data: T;
  /** A imagem devolvida (decodificada), se houver. */
  raster: Raster | null;
  mimeType: string | null;
  bytes: Uint8Array | null;
}

let ws: ImageWorkspace;
let mcp: Connection;

beforeAll(async () => {
  ws = await createImageWorkspace();
  mcp = await connect([ws.root]);
});

afterAll(async () => {
  await mcp.close();
});

async function call<T>(
  name: string,
  args: Record<string, unknown>,
): Promise<Returned<T>> {
  const result = await mcp.client.callTool({
    name,
    arguments: { project: 'imagens', ...args },
  });
  const content = result.content as (
    { type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string }
  )[];
  const text = content.find((c) => c.type === 'text');
  const image = content.find((c) => c.type === 'image');
  const bytes = image ? new Uint8Array(Buffer.from(image.data, 'base64')) : null;
  return {
    isError: result.isError === true,
    data: JSON.parse(text!.text) as T,
    raster: bytes ? await decodeBytes(bytes) : null,
    mimeType: image?.mimeType ?? null,
    bytes,
  };
}

const markingRef = (image: string, kind: 'parent' | 'childA' | 'childB' = 'parent') =>
  `m/${codeOf(IDS[kind](image))}`;
const imageRef = (image: string) => `i/${codeOf(image)}`;

const crop = (image: string, args: Record<string, unknown> = {}) =>
  call<MarkingImageData>('get_marking_image', { ref: markingRef(image), ...args });

function ok<T>(result: Returned<T>): Returned<T> & { raster: Raster } {
  expect(result.isError, JSON.stringify(result.data)).toBe(false);
  expect(result.raster).not.toBeNull();
  return result as Returned<T> & { raster: Raster };
}

function errorCode(result: Returned<unknown>): string {
  expect(result.isError).toBe(true);
  expect(result.raster).toBeNull();
  return (result.data as { error: { code: string } }).error.code;
}

describe('get_marking_image: recorte', () => {
  it('devolve só a marcação, nas dimensões e cores da imagem original', async () => {
    const r = ok(await crop(IDS.png));
    expect(r.mimeType).toBe('image/png');
    expect(r.data).toMatchObject({
      mode: 'crop',
      format: 'png',
      width: PARENT.width,
      height: PARENT.height,
      scale: 1,
      region: PARENT,
      padding: 0,
      markingInOutput: { x: 0, y: 0, width: PARENT.width, height: PARENT.height },
    });
    expect(r.data.ref).toMatch(
      /^mapping:\/\/imagens\/m\/[0-9a-f]{8} \(tela\.png › Formulário\)$/,
    );
    expect(r.data.image.file).toBe(IMAGE_FILES.png);
    expect([r.raster.width, r.raster.height]).toEqual([PARENT.width, PARENT.height]);
    // PNG sem perdas: o pixel é exatamente o da imagem original, filhas incluídas (sem contorno).
    expect(pixel(r.raster, 20, 120)).toEqual([...SOLID.form, 255]);
    expect(pixel(r.raster, CHILD_A.x - PARENT.x + 5, CHILD_A.y - PARENT.y + 5)).toEqual([
      ...SOLID.a,
      255,
    ]);
  });

  it('padding aumenta a região em volta, em pixels da imagem original', async () => {
    const r = ok(await crop(IDS.png, { padding: 20 }));
    expect(r.data.region).toEqual({ x: 80, y: 30, width: 240, height: 190 });
    expect(r.data.padding).toBe(20);
    expect(r.data.markingInOutput).toEqual({ x: 20, y: 20, width: 200, height: 150 });
    expect([r.raster.width, r.raster.height]).toEqual([240, 190]);
    // Dentro da margem aparece o que há em volta (o gradiente), e a marcação continua no lugar.
    const outside = pixel(r.raster, 0, 0);
    expect(
      distance(outside, [
        Math.round((80 / 399) * 255),
        Math.round((30 / 299) * 255),
        128,
      ]),
    ).toBeLessThanOrEqual(1);
    expect(pixel(r.raster, 40, 140)).toEqual([...SOLID.form, 255]);
  });

  it('padding maior que a imagem fica limitado às bordas', async () => {
    const r = ok(await crop(IDS.png, { padding: 4000 }));
    expect(r.data.region).toEqual({ x: 0, y: 0, ...IMAGE_SIZE });
    expect([r.raster.width, r.raster.height]).toEqual([400, 300]);
    expect(r.data.markingInOutput).toEqual(PARENT);
  });

  it('maxSize reduz o lado maior sem deformar e sem ampliar', async () => {
    const small = ok(await crop(IDS.png, { maxSize: 100 }));
    expect([small.raster.width, small.raster.height]).toEqual([100, 75]);
    expect(small.data.scale).toBeCloseTo(0.5);
    expect(small.data.markingInOutput).toEqual({ x: 0, y: 0, width: 100, height: 75 });
    expect(pixel(small.raster, 10, 60)).toEqual([...SOLID.form, 255]);

    const same = ok(await crop(IDS.png, { maxSize: 4096 }));
    expect([same.raster.width, same.raster.height]).toEqual([200, 150]);
    expect(same.data.scale).toBe(1);
  });

  it('a marcação filha usa o próprio retângulo', async () => {
    const r = ok(
      await call<MarkingImageData>('get_marking_image', {
        ref: markingRef(IDS.png, 'childB'),
      }),
    );
    expect([r.raster.width, r.raster.height]).toEqual([CHILD_B.width, CHILD_B.height]);
    expect(r.data.region).toEqual(CHILD_B);
    expect(pixel(r.raster, 30, 25)).toEqual([...SOLID.b, 255]);
  });
});

describe('get_marking_image: contexto e filhas', () => {
  it('context devolve a imagem inteira com a marcação contornada em magenta', async () => {
    const r = ok(await crop(IDS.png, { mode: 'context' }));
    expect([r.raster.width, r.raster.height]).toEqual([400, 300]);
    expect(r.data.region).toEqual({ x: 0, y: 0, ...IMAGE_SIZE });
    expect(r.data.markingInOutput).toEqual(PARENT);
    expect(r.data.markingOutline).toEqual({ color: '#FF00FF', thickness: 2 });
    // A borda de cima da marcação (y = 50 e 51) é magenta; o halo escuro fica por fora.
    expect(pixel(r.raster, 200, PARENT.y)).toEqual([255, 0, 255, 255]);
    expect(pixel(r.raster, PARENT.x, 120)).toEqual([255, 0, 255, 255]);
    expect(pixel(r.raster, 200, PARENT.y - 1)).toEqual([0, 0, 0, 255]);
    // Fora do contorno e dentro dele, a imagem original.
    expect(pixel(r.raster, 5, 5).slice(0, 3)).toEqual([
      Math.round((5 / 399) * 255),
      Math.round((5 / 299) * 255),
      128,
    ]);
    expect(pixel(r.raster, 200, 100)).toEqual([...SOLID.form, 255]);
  });

  it('context com maxSize mantém a espessura do contorno', async () => {
    const r = ok(await crop(IDS.png, { mode: 'context', maxSize: 200 }));
    expect([r.raster.width, r.raster.height]).toEqual([200, 150]);
    expect(r.data.markingInOutput).toEqual({ x: 50, y: 25, width: 100, height: 75 });
    expect(pixel(r.raster, 100, 25)).toEqual([255, 0, 255, 255]);
    expect(pixel(r.raster, 100, 26)).toEqual([255, 0, 255, 255]);
    expect(pixel(r.raster, 100, 30)).toEqual([...SOLID.form, 255]);
  });

  it('outlineChildren contorna as filhas com cores diferentes e devolve a legenda', async () => {
    const r = ok(await crop(IDS.png, { outlineChildren: true }));
    const legend = r.data.childrenLegend!;
    expect(legend.map((l) => l.name).sort()).toEqual(['Campo A', 'Campo B']);
    expect(new Set(legend.map((l) => l.color)).size).toBe(2);
    for (const entry of legend) {
      expect(entry.color).toMatch(/^#[0-9A-F]{6}$/);
      expect(entry.ref).toMatch(
        /^mapping:\/\/imagens\/m\/[0-9a-f]{8} \(tela\.png › Formulário › Campo [AB]\)$/,
      );
    }
    const a = legend.find((l) => l.name === 'Campo A')!;
    const b = legend.find((l) => l.name === 'Campo B')!;
    expect(a.rect).toEqual(CHILD_A);
    expect(b.rect).toEqual(CHILD_B);
    // O contorno de cada filha, na cor da legenda, sobre a borda do retângulo dela (no recorte).
    const rgb = (hex: string) =>
      [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16));
    expect(
      pixel(r.raster, CHILD_A.x - PARENT.x + 20, CHILD_A.y - PARENT.y).slice(0, 3),
    ).toEqual(rgb(a.color));
    expect(
      pixel(r.raster, CHILD_B.x - PARENT.x + 20, CHILD_B.y - PARENT.y).slice(0, 3),
    ).toEqual(rgb(b.color));
    // Longe das bordas, o conteúdo continua intacto.
    expect(pixel(r.raster, CHILD_A.x - PARENT.x + 20, CHILD_A.y - PARENT.y + 20)).toEqual(
      [...SOLID.a, 255],
    );
    // A marcação sem contorno de filhas não traz legenda.
    expect((await crop(IDS.png)).data.childrenLegend).toBeUndefined();
  });

  it('outlineChildren no modo context contorna a marcação e as filhas', async () => {
    const r = ok(await crop(IDS.png, { mode: 'context', outlineChildren: true }));
    const a = r.data.childrenLegend!.find((l) => l.name === 'Campo A')!;
    expect(pixel(r.raster, 200, PARENT.y)).toEqual([255, 0, 255, 255]);
    const rgb = [1, 3, 5].map((i) => Number.parseInt(a.color.slice(i, i + 2), 16));
    expect(pixel(r.raster, CHILD_A.x + 20, CHILD_A.y).slice(0, 3)).toEqual(rgb);
  });

  it('marcação sem filhas devolve legenda vazia', async () => {
    const r = ok(
      await call<MarkingImageData>('get_marking_image', {
        ref: markingRef(IDS.png, 'childA'),
        outlineChildren: true,
      }),
    );
    expect(r.data.childrenLegend).toEqual([]);
  });
});

describe('formatos', () => {
  it('lê e devolve JPEG (padrão para origem JPEG) com cores próximas das originais', async () => {
    const r = ok(await crop(IDS.jpeg));
    expect(r.mimeType).toBe('image/jpeg');
    expect(r.data.format).toBe('jpeg');
    expect([r.raster.width, r.raster.height]).toEqual([PARENT.width, PARENT.height]);
    expect(distance(pixel(r.raster, 20, 120), [...SOLID.form])).toBeLessThanOrEqual(12);
  });

  it('lê WebP e devolve PNG por padrão', async () => {
    const r = ok(await crop(IDS.webp, { padding: 10 }));
    expect(r.mimeType).toBe('image/png');
    expect([r.raster.width, r.raster.height]).toEqual([220, 170]);
    expect(distance(pixel(r.raster, 30, 130), [...SOLID.form])).toBeLessThanOrEqual(12);
  });

  it.each([
    ['webp', 'image/webp'],
    ['jpeg', 'image/jpeg'],
    ['png', 'image/png'],
  ] as const)('format %s muda a codificação da saída', async (format, mime) => {
    const r = ok(await crop(IDS.png, { format }));
    expect(r.mimeType).toBe(mime);
    expect(r.data.format).toBe(format);
    expect([r.raster.width, r.raster.height]).toEqual([PARENT.width, PARENT.height]);
    expect(distance(pixel(r.raster, 20, 120), [...SOLID.form])).toBeLessThanOrEqual(12);
  });
});

describe('get_image_file', () => {
  it('devolve o arquivo como está quando cabe em maxSize', async () => {
    const r = ok(await call<ImageFileData>('get_image_file', { ref: imageRef(IDS.png) }));
    expect(r.data).toMatchObject({
      format: 'png',
      width: 400,
      height: 300,
      scale: 1,
      recoded: false,
    });
    expect(r.mimeType).toBe('image/png');
    expect(
      Buffer.from(r.bytes!).equals(readFileSync(join(ws.dir, IMAGE_FILES.png))),
    ).toBe(true);
  });

  it('reduz a 1568 px por padrão, mantendo a proporção', async () => {
    const r = ok(await call<ImageFileData>('get_image_file', { ref: imageRef(IDS.big) }));
    expect([r.raster.width, r.raster.height]).toEqual([1568, 1045]);
    expect(r.data).toMatchObject({
      width: 1568,
      height: 1045,
      originalWidth: 3000,
      originalHeight: 2000,
      recoded: true,
    });
    expect(r.data.scale).toBeCloseTo(1568 / 3000);
    // O gradiente cresce da esquerda para a direita e de cima para baixo.
    expect(pixel(r.raster, 0, 0)[0]).toBeLessThan(2);
    expect(pixel(r.raster, 1567, 0)[0]).toBeGreaterThan(253);
    expect(pixel(r.raster, 0, 1044)[1]).toBeGreaterThan(253);
  });

  it('respeita maxSize e format', async () => {
    const r = ok(
      await call<ImageFileData>('get_image_file', {
        ref: imageRef(IDS.big),
        maxSize: 500,
        format: 'jpeg',
      }),
    );
    expect(r.mimeType).toBe('image/jpeg');
    expect([r.raster.width, r.raster.height]).toEqual([500, 333]);
  });

  it('muda o formato mesmo sem reduzir', async () => {
    const r = ok(
      await call<ImageFileData>('get_image_file', {
        ref: imageRef(IDS.webp),
        format: 'png',
      }),
    );
    expect(r.mimeType).toBe('image/png');
    expect(r.data.recoded).toBe(true);
    expect([r.raster.width, r.raster.height]).toEqual([400, 300]);
  });

  it('devolve o JPEG e o WebP originais intactos', async () => {
    for (const key of ['jpeg', 'webp'] as const) {
      const r = ok(
        await call<ImageFileData>('get_image_file', { ref: imageRef(IDS[key]) }),
      );
      expect(r.data.recoded).toBe(false);
      expect(
        Buffer.from(r.bytes!).equals(readFileSync(join(ws.dir, IMAGE_FILES[key]))),
      ).toBe(true);
    }
  });
});

describe('arquivos problemáticos', () => {
  it('imagem ausente', async () => {
    const r = await call('get_image_file', { ref: imageRef(IDS.missing) });
    expect(errorCode(r)).toBe('image-file-missing');
    expect(errorCode(await crop(IDS.missing))).toBe('image-file-missing');
  });

  it('link simbólico para fora das raízes é tratado como inexistente', async () => {
    expect(errorCode(await call('get_image_file', { ref: imageRef(IDS.escape) }))).toBe(
      'image-file-missing',
    );
  });

  it('arquivo que não é imagem', async () => {
    expect(errorCode(await crop(IDS.text))).toBe('unsupported-image');
  });

  it('cabeçalho com pixels demais é recusado antes de decodificar', async () => {
    expect(errorCode(await crop(IDS.bomb))).toBe('image-too-large');
  });

  it('arquivo com dimensões diferentes das do projeto: ajusta as coordenadas e avisa', async () => {
    const r = ok(await crop(IDS.mismatch));
    expect(r.data.warning).toMatch(/200×150.*400×300/);
    expect([r.raster.width, r.raster.height]).toEqual([100, 75]);
    expect(pixel(r.raster, 50, 40)).toEqual([...SOLID.form, 255]);
    const file = ok(
      await call<ImageFileData>('get_image_file', { ref: imageRef(IDS.mismatch) }),
    );
    expect(file.data.warning).toBeDefined();
  });
});

describe('referências e argumentos', () => {
  it('aceita a referência completa com o caminho legível', async () => {
    const first = ok(await crop(IDS.png));
    const r = ok(
      await call<MarkingImageData>('get_marking_image', {
        ref: first.data.ref,
        project: undefined,
      }),
    );
    expect(r.data.ref).toBe(first.data.ref);
  });

  it('recusa referência do tipo errado', async () => {
    expect(errorCode(await call('get_image_file', { ref: markingRef(IDS.png) }))).toBe(
      'wrong-kind',
    );
    expect(errorCode(await call('get_marking_image', { ref: imageRef(IDS.png) }))).toBe(
      'wrong-kind',
    );
  });

  it('valida os argumentos', async () => {
    for (const args of [
      { maxSize: 10 },
      { maxSize: 100_000 },
      { padding: -1 },
      { mode: 'x' },
      { format: 'gif' },
    ]) {
      const r = await mcp.client.callTool({
        name: 'get_marking_image',
        arguments: { project: 'imagens', ref: markingRef(IDS.png), ...args },
      });
      expect(r.isError, JSON.stringify(args)).toBe(true);
    }
  });

  it('lista as duas tools', async () => {
    const { tools } = await mcp.client.listTools();
    const names = tools.map((t) => t.name);
    expect(names).toContain('get_marking_image');
    expect(names).toContain('get_image_file');
    expect(BLOCKS.length).toBe(3);
  });
});

describe('arquivo único', () => {
  it('funciona copiado para uma pasta sem node_modules, só com o Node', async () => {
    const tools = mkdtempSync(join(tmpdir(), 'mapping-mcp-tools-'));
    copyFileSync(resolve('dist-mcp/mapping-mcp.js'), join(tools, 'mapping-mcp.js'));
    // Como em tools/ de um repositório "type": "module".
    writeFileSync(join(tools, 'package.json'), '{ "type": "commonjs" }\n');
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [join(tools, 'mapping-mcp.js'), '--root', ws.root],
      cwd: tools,
      stderr: 'pipe',
    });
    const client = new Client({ name: 'teste', version: '0' });
    await client.connect(transport);
    try {
      for (const image of [IDS.png, IDS.jpeg, IDS.webp]) {
        const result = await client.callTool({
          name: 'get_marking_image',
          arguments: { project: 'imagens', ref: markingRef(image), format: 'webp' },
        });
        expect(result.isError).not.toBe(true);
        const content = result.content as { type: string; mimeType?: string }[];
        expect(content.map((c) => c.type)).toEqual(['text', 'image']);
        expect(content[1]!.mimeType).toBe('image/webp');
      }
    } finally {
      await client.close();
    }
  });
});
