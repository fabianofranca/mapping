import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  addContainer,
  applySpecialization,
  createProject,
  parseSpecText,
  serialize,
} from '../../src/model';
import { createServer } from '../../mcp/server';
import { decodeImage, encodeImage } from '../../mcp/image/codecs';
import { createRaster, type Raster } from '../../mcp/image/raster';
import { NOW } from '../model/fixtures';

// PC3 (#2975, decision 7): `region` in `render_container`, in container pixels, at the asked zoom.

const LAYER = 'cccccccc-0000-4000-8000-000000000001';
const TALL = 'bbbbbbbb-0000-4000-8000-000000000001';

const SPEC = {
  format: 'mapping-spec',
  formatVersion: 15,
  id: 'lib',
  name: 'Lib',
  version: 1,
  tokens: { modes: ['light'], values: { bg: { light: '#ff0000' } } },
  layers: [
    {
      id: 'ui',
      name: 'UI',
      color: '#6750A4',
      annotationTypes: [
        { id: 'btn', name: 'Button', component: 'components/btn.json', fields: [] },
      ],
    },
  ],
};

const BUTTON = {
  format: 'mapping-component',
  formatVersion: 4,
  id: 'btn',
  name: 'Button',
  size: { width: 120, height: 44 },
  template: {
    type: 'frame',
    layout: { type: 'none' },
    fill: { $token: 'bg' },
    children: [],
  },
};

const BATCH = [
  { op: 'add_container', as: '$screen', width: 360, height: 640, background: '#FFFFFF' },
  {
    op: 'create_marking',
    container: '$screen',
    rect: { x: 100, y: 200, width: 120, height: 44 },
    annotation: { type: 'lib/btn' },
  },
];

let base: string;
let dir: string;
let client: Client;

beforeAll(async () => {
  base = mkdtempSync(join(tmpdir(), 'mapping-render-region-'));
  dir = join(base, 'telas');
  const lib = join(dir, 'specs', 'lib');
  mkdirSync(join(lib, 'components'), { recursive: true });
  mkdirSync(join(dir, 'images'), { recursive: true });
  writeFileSync(join(lib, 'lib.spec.json'), JSON.stringify(SPEC));
  writeFileSync(join(lib, 'components', 'btn.json'), JSON.stringify(BUTTON));
  const photo = createRaster(360, 640);
  for (let i = 0; i < photo.data.length; i += 4) photo.data.set([16, 160, 48, 255], i);
  writeFileSync(join(dir, 'images', 'tall.png'), await encodeImage(photo, 'png'));
  const parsed = parseSpecText(JSON.stringify(SPEC));
  if (!parsed.ok) throw new Error('invalid spec');
  let p = createProject({
    name: 'Telas',
    now: NOW,
    firstLayer: { id: LAYER, name: 'Layer 1', color: '#D32F2F' },
  });
  p = addContainer(p, { id: TALL, file: 'images/tall.png', width: 360, height: 640 });
  p = applySpecialization(p, parsed.spec, { packageSpecName: 'lib.spec.json' });
  writeFileSync(join(dir, 'mapping.json'), serialize(p));
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await createServer({ roots: [base] }).connect(serverSide);
  client = new Client({ name: 'test', version: '0' });
  await client.connect(clientSide);
});

afterAll(async () => {
  await client.close();
  rmSync(base, { recursive: true, force: true });
});

async function call(args: Record<string, unknown>) {
  const result = await client.callTool({ name: 'render_container', arguments: args });
  const content = result.content as { type: string; text?: string; data?: string }[];
  return {
    isError: result.isError === true,
    json: JSON.parse(content.find((c) => c.type === 'text')?.text ?? '{}') as Record<
      string,
      any // eslint-disable-line @typescript-eslint/no-explicit-any
    >,
    image: content.find((c) => c.type === 'image')?.data,
  };
}

async function raster(image: string | undefined): Promise<Raster> {
  return (await decodeImage(Buffer.from(image!, 'base64'))).raster;
}

function window(r: Raster, x: number, y: number, w: number, h: number): Raster {
  const out = createRaster(w, h);
  for (let row = 0; row < h; row++) {
    const from = ((y + row) * r.width + x) * 4;
    out.data.set(r.data.subarray(from, from + w * 4), row * w * 4);
  }
  return out;
}

function expectClose(a: Raster, b: Raster) {
  expect([a.width, a.height]).toEqual([b.width, b.height]);
  let worst = 0;
  for (let i = 0; i < a.data.length; i++) {
    worst = Math.max(worst, Math.abs(a.data[i]! - b.data[i]!));
  }
  expect(worst).toBeLessThanOrEqual(1);
}

const PREVIEW = { project: 'telas', ref: '$screen', operations: BATCH };
const REGION = { x: 100, y: 200, width: 120, height: 44 };

describe('region', () => {
  it('draws only the window, at the asked zoom, equal to that window of the whole drawing', async () => {
    const whole = await call({ ...PREVIEW, zoom: 2 });
    const part = await call({ ...PREVIEW, zoom: 2, region: REGION });
    expect(part.isError, JSON.stringify(part.json)).toBe(false);
    expect([part.json.width, part.json.height]).toEqual([240, 88]);
    expect(part.json.region).toMatchObject(REGION);
    expectClose(
      await raster(part.image),
      window(await raster(whole.image), 200, 400, 240, 88),
    );
  });

  it('works without the preview arguments too', async () => {
    const part = await call({
      project: 'telas',
      ref: 'mapping://telas/i/bbbbbbbb',
      zoom: 2,
      region: REGION,
    });
    expect(part.isError, JSON.stringify(part.json)).toBe(false);
    expect([part.json.width, part.json.height]).toEqual([240, 88]);
  });

  it('clips a region partly outside, with a warning and the clipped region', async () => {
    const part = await call({
      ...PREVIEW,
      region: { x: 300, y: 600, width: 200, height: 200 },
    });
    expect(part.isError, JSON.stringify(part.json)).toBe(false);
    expect(part.json.region).toMatchObject({ x: 300, y: 600, width: 60, height: 40 });
    expect([part.json.width, part.json.height]).toEqual([60, 40]);
    expect(String(part.json.warning)).toContain(
      'the region was clipped to the container (360 × 640)',
    );
  });

  it('refuses a region that does not touch the container', async () => {
    const part = await call({
      ...PREVIEW,
      region: { x: 400, y: 0, width: 50, height: 50 },
    });
    expect(part.isError).toBe(true);
    expect(part.json.error).toMatchObject({
      code: 'region-outside-container',
      container: { width: 360, height: 640 },
    });
  });

  it('refuses an output above MAX_PIXELS', async () => {
    const part = await call({
      project: 'telas',
      ref: 'mapping://telas/i/bbbbbbbb',
      zoom: 8,
      region: { x: 0, y: 0, width: 360, height: 640 },
      // 2880 × 5120 = 14.7 M is allowed; the cap is hit only above 40 M, so use a bigger container below.
    });
    expect(part.isError).toBe(false);
    const huge = await call({
      project: 'telas',
      operations: [
        {
          op: 'add_container',
          as: '$big',
          width: 8000,
          height: 8000,
          background: '#FFFFFF',
        },
      ],
      ref: '$big',
      zoom: 1,
      region: { x: 0, y: 0, width: 8000, height: 8000 },
    });
    expect(huge.isError).toBe(true);
    expect(huge.json.error).toMatchObject({ code: 'image-too-large' });
  });

  it('with operations draws the batch window, same as the whole drawing', async () => {
    const whole = await call({ ...PREVIEW, zoom: 1 });
    const part = await call({ ...PREVIEW, zoom: 1, region: REGION });
    expectClose(
      await raster(part.image),
      window(await raster(whole.image), 100, 200, 120, 44),
    );
    expect(part.json.provisional).toBe(true);
  });
});
