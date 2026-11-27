import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
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
import { ImageServer } from '../../mcp/imageServer';
import { decodeImage, encodeImage } from '../../mcp/image/codecs';
import { createRaster, type PixelRect, type Raster } from '../../mcp/image/raster';
import { NOW } from '../model/fixtures';
import { acceptAllAndApply } from './proposalSupport';

// PC5 (#2978, decisions 8 to 10): the `compare` mode of `render_container`: the before side (today, a
// batch or a proposal) against the call's own side, as a count of different pixels, boxes of the changed
// regions (container pixels) and a side-by-side crop. Nothing is written.

const LAYER = 'cccccccc-0000-4000-8000-000000000001';
const TALL = 'bbbbbbbb-0000-4000-8000-000000000001';
const OTHER_LAYER = 'cccccccc-0000-4000-8000-000000000002';

const SPEC = {
  format: 'mapping-spec',
  formatVersion: 15,
  id: 'lib',
  name: 'Lib',
  version: 1,
  tokens: { modes: ['light'], values: { bg: { light: '#ffffff' } } },
  layers: [
    {
      id: 'ui',
      name: 'UI',
      color: '#6750A4',
      annotationTypes: [
        {
          id: 'tag',
          name: 'Tag',
          component: 'components/tag.json',
          fields: [{ key: 'label', type: 'string', default: 'Tag' }],
        },
      ],
    },
  ],
};

const TAG = {
  format: 'mapping-component',
  formatVersion: 4,
  id: 'tag',
  name: 'Tag',
  size: { width: 128, height: 48 },
  template: {
    type: 'frame',
    layout: { type: 'row', align: 'center', justify: 'center' },
    fill: { $token: 'bg' },
    children: [
      {
        type: 'text',
        text: { $field: 'label', default: 'Tag' },
        font: { family: 'sans-serif', size: 16, weight: 400, lineHeight: 20 },
        color: '#000000',
      },
    ],
  },
};

/** The marking of the seed: aligned to the 16-pixel grid of the diff cells. */
const RECT = { x: 96, y: 192, width: 128, height: 48 };

let base: string;
let dir: string;
let client: Client;
let container: string;
let annotation: string;

const mappingPath = () => join(dir, 'mapping.json');
const proposalsListing = () => {
  try {
    return readdirSync(join(dir, 'proposals')).sort();
  } catch {
    return [];
  }
};

interface Reply {
  readonly isError: boolean;
  readonly json: Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  readonly image: string | undefined;
}

async function call(name: string, args: Record<string, unknown>): Promise<Reply> {
  const result = await client.callTool({ name, arguments: args });
  const content = result.content as { type: string; text?: string; data?: string }[];
  return {
    isError: result.isError === true,
    json: JSON.parse(content.find((c) => c.type === 'text')?.text ?? '{}'),
    image: content.find((c) => c.type === 'image')?.data,
  };
}

const ok = (reply: Reply) => {
  expect(reply.isError, JSON.stringify(reply.json)).toBe(false);
  return reply;
};

const errorOf = (reply: Reply) => {
  expect(reply.isError).toBe(true);
  return reply.json.error as { code: string; message: string; [key: string]: unknown };
};

async function raster(reply: Reply): Promise<Raster> {
  return (await decodeImage(Buffer.from(reply.image!, 'base64'))).raster;
}

const compareCall = (args: Record<string, unknown>) =>
  call('render_container', { project: 'telas', ref: container, ...args });

const setLabel = (label: string) => ({
  op: 'update_annotation',
  annotation,
  values: { label },
});

const inside = (box: PixelRect, rect: PixelRect) =>
  box.x >= rect.x &&
  box.y >= rect.y &&
  box.x + box.width <= rect.x + rect.width &&
  box.y + box.height <= rect.y + rect.height;

beforeAll(async () => {
  base = mkdtempSync(join(tmpdir(), 'mapping-render-compare-'));
  dir = join(base, 'telas');
  const lib = join(dir, 'specs', 'lib');
  mkdirSync(join(lib, 'components'), { recursive: true });
  mkdirSync(join(dir, 'images'), { recursive: true });
  writeFileSync(join(lib, 'lib.spec.json'), JSON.stringify(SPEC));
  writeFileSync(join(lib, 'components', 'tag.json'), JSON.stringify(TAG));
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
  writeFileSync(mappingPath(), serialize(p));
  // A second project, for the `project-mismatch` of a proposal from another one.
  const other = join(base, 'outros');
  mkdirSync(other, { recursive: true });
  const q = createProject({
    name: 'Outros',
    now: NOW,
    firstLayer: { id: OTHER_LAYER, name: 'Layer 1', color: '#D32F2F' },
  });
  writeFileSync(join(other, 'mapping.json'), serialize(q));
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await createServer({ roots: [base] }).connect(serverSide);
  client = new Client({ name: 'test', version: '0' });
  await client.connect(clientSide);
  // The seed: a marking with a tag that says "Hello", applied on disk.
  const seeded = ok(
    await call('propose_changes', {
      project: 'telas',
      title: 'Seed',
      operations: [
        {
          op: 'update_container',
          container: `mapping://telas/i/${TALL.slice(0, 8)}`,
          name: 'Home',
        },
        {
          op: 'create_marking',
          container: `mapping://telas/i/${TALL.slice(0, 8)}`,
          rect: RECT,
          annotation: { type: 'lib/tag', values: { label: 'Hello' } },
        },
      ],
    }),
  );
  const created = seeded.json.created as { kind: string; ref?: string }[];
  annotation = created.find((c) => c.kind === 'annotation')!.ref!;
  acceptAllAndApply(dir, seeded.json.proposal.id as string);
  container = `mapping://telas/i/${TALL.slice(0, 8)}`;
});

afterAll(async () => {
  await client.close();
  rmSync(base, { recursive: true, force: true });
});

describe('today × a batch', () => {
  it('counts the different pixels, boxes them inside the component and draws them side by side', async () => {
    const reply = ok(await compareCall({ operations: [setLabel('World')], compare: {} }));
    const { compare } = reply.json;
    expect(compare.pixels).toBeGreaterThan(0);
    expect(compare.ratio).toBeGreaterThan(0);
    expect(compare.ratio).toBeLessThan(1);
    expect(compare.sizeChanged).toBeUndefined();
    expect(compare.regions.length).toBeGreaterThan(0);
    for (const box of compare.regions as PixelRect[])
      expect(inside(box, RECT)).toBe(true);
    expect(compare.before).toMatchObject({ ref: container, width: 360, height: 640 });
    expect(compare.after).toMatchObject({ ref: container, width: 360, height: 640 });
    expect(compare.before.preview).toBeUndefined();
    expect(compare.after.preview).toMatchObject({ operations: 1 });
    // The image: the union of the boxes with a margin of 8, two crops and a gap of 8 (zoom 1).
    const region = reply.json.region as PixelRect;
    expect(region.width).toBeGreaterThan(0);
    const image = await raster(reply);
    expect(image.width).toBe(2 * region.width + 8);
    expect(image.height).toBe(region.height);
    expect(reply.json.width).toBe(image.width);
    expect(reply.json.height).toBe(image.height);
    for (const box of compare.regions as PixelRect[]) {
      expect(region.x).toBeLessThanOrEqual(box.x);
      expect(region.x + region.width).toBeGreaterThanOrEqual(box.x + box.width);
    }
  });

  it('the pixels of the count are the ones of the two drawings', async () => {
    const before = await raster(ok(await call('render_container', { ref: container })));
    const after = await raster(
      ok(
        await call('render_container', {
          ref: container,
          operations: [setLabel('World')],
          project: 'telas',
        }),
      ),
    );
    let differing = 0;
    for (let i = 0; i < before.data.length; i += 4) {
      if (
        before.data[i] !== after.data[i] ||
        before.data[i + 1] !== after.data[i + 1] ||
        before.data[i + 2] !== after.data[i + 2] ||
        before.data[i + 3] !== after.data[i + 3]
      ) {
        differing++;
      }
    }
    const reply = ok(await compareCall({ operations: [setLabel('World')], compare: {} }));
    expect(reply.json.compare.pixels).toBe(differing);
  });

  it('a batch that changes nothing drawn: no pixels, no regions, the image is the after drawing', async () => {
    const operations = [{ op: 'update_container', container, name: 'Renamed' }];
    const reply = ok(await compareCall({ operations, compare: {} }));
    expect(reply.json.compare.pixels).toBe(0);
    expect(reply.json.compare.ratio).toBe(0);
    expect(reply.json.compare.regions).toEqual([]);
    const drawn = ok(
      await call('render_container', { ref: container, project: 'telas', operations }),
    );
    expect(await raster(reply)).toEqual(await raster(drawn));
  });

  it('the jpeg side-by-side has an opaque gap', async () => {
    const reply = ok(
      await compareCall({ operations: [setLabel('World')], compare: {}, format: 'jpeg' }),
    );
    expect(reply.json.format).toBe('jpeg');
    const image = await raster(reply);
    const region = reply.json.region as PixelRect;
    const gapX = region.width + 4;
    expect(image.data[(0 * image.width + gapX) * 4 + 3]).toBe(255);
  });
});

describe('two batches and two proposals', () => {
  it('compares two operationsFile batches', async () => {
    writeFileSync(join(base, 'alpha.json'), JSON.stringify([setLabel('Alpha')]));
    writeFileSync(join(base, 'beta.json'), JSON.stringify([setLabel('Beta')]));
    const reply = ok(
      await compareCall({
        operationsFile: 'beta.json',
        compare: { operationsFile: 'alpha.json' },
      }),
    );
    expect(reply.json.compare.pixels).toBeGreaterThan(0);
    expect(reply.json.compare.before.preview).toMatchObject({ operations: 1 });
    expect(reply.json.compare.after.preview).toMatchObject({ operations: 1 });
    for (const box of reply.json.compare.regions as PixelRect[]) {
      expect(inside(box, RECT)).toBe(true);
    }
  });

  it('compares two proposals', async () => {
    const propose = async (label: string) =>
      ok(
        await call('propose_changes', {
          project: 'telas',
          title: label,
          operations: [setLabel(label)],
        }),
      ).json.proposal.ref as string;
    const [first, second] = [await propose('One'), await propose('Two')];
    const reply = ok(
      await compareCall({ proposal: second, compare: { proposal: first } }),
    );
    expect(reply.json.compare.pixels).toBeGreaterThan(0);
    expect(reply.json.compare.before.preview).toMatchObject({ proposal: first });
    expect(reply.json.compare.after.preview).toMatchObject({ proposal: second });
    const same = ok(await compareCall({ proposal: first, compare: { proposal: first } }));
    expect(same.json.compare.pixels).toBe(0);
  });
});

describe('a container the batch recreates', () => {
  const recreate = () => [
    { op: 'delete_container', container },
    { op: 'add_container', as: '$v2', width: 360, height: 900, background: '#FFFFFF' },
  ];

  it('with `compare.ref` the before side is the old container and the size changed', async () => {
    const reply = ok(
      await call('render_container', {
        project: 'telas',
        ref: '$v2',
        operations: recreate(),
        compare: { ref: container },
      }),
    );
    const { compare } = reply.json;
    expect(compare.sizeChanged).toBe(true);
    expect(compare.before).toMatchObject({ ref: container, width: 360, height: 640 });
    expect(compare.after).toMatchObject({
      alias: '$v2',
      provisional: true,
      width: 360,
      height: 900,
    });
    const boxes = compare.regions as PixelRect[];
    expect(boxes.some((b) => b.y <= 640 && b.y + b.height >= 900)).toBe(true);
  });

  it('without `compare.ref` the before side names the alias that it cannot resolve', async () => {
    const error = errorOf(
      await call('render_container', {
        project: 'telas',
        ref: '$v2',
        operations: recreate(),
        compare: {},
      }),
    );
    expect(error.code).toBe('not-found');
    expect(error.message).toContain('$v2');
    expect(error.message).toContain('before');
    expect(error.side).toBe('before');
  });

  it('a side-by-side above the pixel limit is `image-too-large` with the union box', async () => {
    const error = errorOf(
      await call('render_container', {
        project: 'telas',
        ref: '$v2',
        operations: recreate(),
        compare: { ref: container },
        zoom: 8,
      }),
    );
    expect(error.code).toBe('image-too-large');
    const region = error.region as PixelRect;
    expect(region.width).toBeGreaterThan(0);
    expect(region.y + region.height).toBeGreaterThanOrEqual(900);
  });
});

describe('a deleted container (the same-name rule of the not-found)', () => {
  it('names the container created with the same name, not the other ones on the page', async () => {
    const screen = (as: string, name: string) => ({
      op: 'add_container',
      as,
      width: 100,
      height: 100,
      background: '#FFFFFF',
      name,
    });
    const error = errorOf(
      await call('render_container', {
        project: 'telas',
        ref: container,
        operations: [
          { op: 'delete_container', container },
          screen('$other', 'Other'),
          screen('$home', 'Home'),
        ],
      }),
    );
    expect(error.code).toBe('not-found');
    expect(error.deletedBy).toBe('batch');
    expect(error.replacedBy).toEqual(['$home']);
  });
});

describe('region', () => {
  it('both sides are that window and the boxes stay in container pixels', async () => {
    const region = { x: 96, y: 192, width: 128, height: 48 };
    const reply = ok(
      await compareCall({
        operations: [setLabel('World')],
        compare: {},
        region,
        zoom: 2,
      }),
    );
    expect(reply.json.compare.before).toMatchObject({ width: 256, height: 96 });
    expect(reply.json.compare.after).toMatchObject({ width: 256, height: 96 });
    expect(reply.json.compare.pixels).toBeGreaterThan(0);
    for (const box of reply.json.compare.regions as PixelRect[]) {
      expect(inside(box, RECT)).toBe(true);
    }
    const image = await raster(reply);
    expect(image.width).toBe(
      2 * Math.round((reply.json.region as PixelRect).width * 2) + 8,
    );
  });

  it('a region that does not touch the container is `region-outside-container`', async () => {
    const error = errorOf(
      await compareCall({
        operations: [setLabel('World')],
        compare: {},
        region: { x: 2000, y: 2000, width: 10, height: 10 },
      }),
    );
    expect(error.code).toBe('region-outside-container');
  });
});

describe('refusals', () => {
  it('a proposal of another project is `project-mismatch`', async () => {
    const other = ok(
      await call('propose_changes', {
        project: 'outros',
        title: 'Other',
        operations: [
          { op: 'add_container', width: 100, height: 100, background: '#FFFFFF' },
        ],
      }),
    );
    const error = errorOf(
      await compareCall({ compare: { proposal: other.json.proposal.ref as string } }),
    );
    expect(error.code).toBe('project-mismatch');
  });

  it('an invalid batch names the side', async () => {
    const broken = [
      {
        op: 'update_annotation',
        annotation: 'mapping://telas/a/ffffffff',
        values: { label: 'x' },
      },
    ];
    const after = errorOf(await compareCall({ operations: broken, compare: {} }));
    expect(after.code).toBe('invalid-batch');
    expect(after.side).toBe('after');
    expect(after.message).toContain('after');
    const before = errorOf(
      await compareCall({
        operations: [setLabel('World')],
        compare: { operations: broken },
      }),
    );
    expect(before.code).toBe('invalid-batch');
    expect(before.side).toBe('before');
    expect(before.message).toContain('before');
  });

  it('both `operations` and `operationsFile` on the before side are `invalid-arguments`', async () => {
    const error = errorOf(
      await compareCall({
        compare: { operations: [setLabel('x')], operationsFile: 'alpha.json' },
      }),
    );
    expect(error.code).toBe('invalid-arguments');
  });

  it('a drawing mode axis that a side does not declare is `invalid-arguments`', async () => {
    const error = errorOf(
      await compareCall({ compare: {}, drawingMode: { theme: 'dark' } }),
    );
    expect(error.code).toBe('invalid-arguments');
  });
});

describe('nothing is written', () => {
  it('mapping.json and proposals/ stay as they were', async () => {
    const mapping = readFileSync(mappingPath(), 'utf8');
    const folders = proposalsListing();
    ok(await compareCall({ operations: [setLabel('World')], compare: {} }));
    ok(
      await compareCall({
        operationsFile: 'beta.json',
        compare: { operationsFile: 'alpha.json' },
      }),
    );
    expect(readFileSync(mappingPath(), 'utf8')).toBe(mapping);
    expect(proposalsListing()).toEqual(folders);
  });
});

describe('the image server', () => {
  it('publishes the whole drawing of each side and the side-by-side', async () => {
    const published: string[] = [];
    const images = {
      publish: async (_bytes: Uint8Array, _mime: string, extension: string) => {
        published.push(extension);
        return `http://127.0.0.1:1/${published.length}.${extension}`;
      },
    } as unknown as ImageServer;
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    await createServer({ roots: [base], images }).connect(serverSide);
    const own = new Client({ name: 'test', version: '0' });
    await own.connect(clientSide);
    const result = await own.callTool({
      name: 'render_container',
      arguments: {
        project: 'telas',
        ref: container,
        operations: [setLabel('World')],
        compare: {},
      },
    });
    const text = (result.content as { type: string; text?: string }[]).find(
      (c) => c.type === 'text',
    )!.text!;
    const json = JSON.parse(text);
    expect(json.compare.before.url).toMatch(/^http:/);
    expect(json.compare.before.markdown).toContain(json.compare.before.url);
    expect(json.compare.after.url).toMatch(/^http:/);
    expect(json.compare.after.url).not.toBe(json.compare.before.url);
    expect(json.url).toMatch(/^http:/);
    expect(published).toHaveLength(3);
    await own.close();
  });
});

describe('scale', () => {
  it('compares a 2,000 × 2,000 container', async () => {
    const screen = (label: string) => [
      {
        op: 'add_container',
        as: '$big',
        width: 2000,
        height: 2000,
        background: '#FFFFFF',
      },
      {
        op: 'create_marking',
        container: '$big',
        rect: { x: 400, y: 400, width: 128, height: 48 },
        annotation: { type: 'lib/tag', values: { label } },
      },
    ];
    const reply = ok(
      await call('render_container', {
        project: 'telas',
        ref: '$big',
        operations: screen('B'),
        compare: { operations: screen('A') },
      }),
    );
    expect(reply.json.compare.pixels).toBeGreaterThan(0);
    expect(reply.json.compare.after).toMatchObject({ width: 2000, height: 2000 });
  }, 60_000);
});
