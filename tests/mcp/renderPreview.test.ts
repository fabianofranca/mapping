import {
  cpSync,
  existsSync,
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
  createMarking,
  createProject,
  parseSpecText,
  proposalFilePath,
  serialize,
} from '../../src/model';
import type { Operation } from '../../mcp/operations';
import { Roots } from '../../mcp/paths';
import { openPreview } from '../../mcp/renderPreview';
import { createServer } from '../../mcp/server';
import { decodeImage, encodeImage } from '../../mcp/image/codecs';
import { createRaster, type Raster } from '../../mcp/image/raster';
import { NOW } from '../model/fixtures';
import { applyAcceptedOnDisk, readProposal, reviewDecide } from './proposalSupport';

// BP2 (#2099, decisions 5 to 10): `render_container` and `render_marking` draw a batch, an open
// proposal or a batch over a proposal, without writing anything.

const LAYER = 'cccccccc-0000-4000-8000-000000000001';
const PHOTO = 'bbbbbbbb-0000-4000-8000-000000000001';
const FAIXA = 'aaaaaaaa-0000-4000-8000-000000000002';

const SPEC = {
  format: 'mapping-spec',
  formatVersion: 15,
  id: 'lib',
  name: 'Lib',
  version: 1,
  tokens: {
    modes: ['light', 'dark'],
    values: { bg: { light: '#ffffff', dark: '#202020' } },
  },
  layers: [
    {
      id: 'ui',
      name: 'UI',
      color: '#6750A4',
      annotationTypes: [
        {
          id: 'btn',
          name: 'Button',
          component: 'components/btn.json',
          fields: [{ key: 'label', type: 'string', default: 'Save' }],
        },
      ],
    },
  ],
};

const BUTTON = {
  format: 'mapping-component',
  formatVersion: 4,
  id: 'btn',
  name: 'Button',
  size: { width: 120, height: 40 },
  template: {
    type: 'frame',
    layout: { type: 'row', align: 'center', justify: 'center' },
    fill: { $token: 'bg' },
    children: [
      {
        type: 'text',
        text: { $field: 'label', default: 'Save' },
        font: { family: 'sans-serif', size: 14, weight: 400, lineHeight: 20 },
        color: '#000000',
      },
    ],
  },
};

// A library package that only the batch or the proposal brings: a red chip, a mode "neon" and a font.
const PKG_SPEC = {
  format: 'mapping-spec',
  formatVersion: 15,
  id: 'pkg',
  name: 'Pkg',
  version: 1,
  fonts: [{ family: 'Acme', file: 'fonts/Acme.ttf' }],
  tokens: {
    modes: ['light', 'neon'],
    values: { fg: { light: '#ff0000', neon: '#00ff00' } },
  },
  layers: [
    {
      id: 'ui',
      name: 'UI',
      color: '#6750A4',
      annotationTypes: [
        { id: 'chip', name: 'Chip', component: 'components/chip.json', fields: [] },
      ],
    },
  ],
};

const CHIP = {
  format: 'mapping-component',
  formatVersion: 4,
  id: 'chip',
  name: 'Chip',
  size: { width: 60, height: 30 },
  template: {
    type: 'frame',
    layout: { type: 'none' },
    fill: { $token: 'fg' },
    children: [],
  },
};

let base: string;
let dir: string;
let client: Client;

const mappingPath = () => join(dir, 'mapping.json');

beforeAll(async () => {
  base = mkdtempSync(join(tmpdir(), 'mapping-render-preview-'));
  dir = join(base, 'telas');
  const lib = join(dir, 'specs', 'lib');
  mkdirSync(join(lib, 'components'), { recursive: true });
  mkdirSync(join(dir, 'images'), { recursive: true });
  writeFileSync(join(lib, 'lib.spec.json'), JSON.stringify(SPEC));
  writeFileSync(join(lib, 'components', 'btn.json'), JSON.stringify(BUTTON));
  const photo = createRaster(200, 100);
  for (let i = 0; i < photo.data.length; i += 4) photo.data.set([16, 160, 48, 255], i);
  writeFileSync(join(dir, 'images', 'foto.png'), await encodeImage(photo, 'png'));
  // The new images: outside the project, inside the root (`assets/`).
  mkdirSync(join(base, 'assets'), { recursive: true });
  const red = createRaster(100, 50);
  for (let i = 0; i < red.data.length; i += 4) red.data.set([200, 32, 32, 255], i);
  writeFileSync(join(base, 'assets', 'red.png'), await encodeImage(red, 'png'));
  // The package that only the batch or the proposal applies.
  const pkg = join(base, 'pkg');
  mkdirSync(join(pkg, 'components'), { recursive: true });
  mkdirSync(join(pkg, 'fonts'), { recursive: true });
  writeFileSync(join(pkg, 'pkg.spec.json'), JSON.stringify(PKG_SPEC));
  writeFileSync(join(pkg, 'components', 'chip.json'), JSON.stringify(CHIP));
  cpSync('mcp/fonts/MappingMono-Bold.ttf', join(pkg, 'fonts', 'Acme.ttf'));
  const parsed = parseSpecText(readFileSync(join(lib, 'lib.spec.json'), 'utf8'));
  if (!parsed.ok) throw new Error(`invalid spec: ${JSON.stringify(parsed)}`);
  let p = createProject({
    name: 'Telas',
    now: NOW,
    firstLayer: { id: LAYER, name: 'Layer 1', color: '#D32F2F' },
  });
  p = addContainer(p, { id: PHOTO, file: 'images/foto.png', width: 200, height: 100 });
  p = createMarking(p, {
    id: FAIXA,
    containerId: PHOTO,
    rect: { x: 10, y: 10, width: 20, height: 20 },
    name: 'Faixa',
  });
  p = applySpecialization(p, parsed.spec, { packageSpecName: 'lib.spec.json' });
  writeFileSync(mappingPath(), serialize(p));
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await createServer({ roots: [base] }).connect(serverSide);
  client = new Client({ name: 'test', version: '0' });
  await client.connect(clientSide);
});

afterAll(async () => {
  await client.close();
  rmSync(base, { recursive: true, force: true });
});

interface Reply {
  readonly isError: boolean;
  readonly json: Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  /** The returned image (base64), when there is one. */
  readonly image: string | undefined;
}

async function call(name: string, args: Record<string, unknown>): Promise<Reply> {
  const result = await client.callTool({ name, arguments: args });
  const content = result.content as { type: string; text?: string; data?: string }[];
  const text = content.find((c) => c.type === 'text')?.text ?? '{}';
  return {
    isError: result.isError === true,
    json: JSON.parse(text),
    image: content.find((c) => c.type === 'image')?.data,
  };
}

const ok = (reply: Reply) => {
  expect(reply.isError, JSON.stringify(reply.json)).toBe(false);
  return reply;
};

const errorOf = (reply: Reply) => {
  expect(reply.isError).toBe(true);
  return reply.json.error as { code: string; [key: string]: unknown };
};

async function raster(reply: Reply): Promise<Raster> {
  return (await decodeImage(Buffer.from(reply.image!, 'base64'))).raster;
}

function pixel(r: Raster, x: number, y: number): [number, number, number] {
  const i = (y * r.width + x) * 4;
  return [r.data[i]!, r.data[i + 1]!, r.data[i + 2]!];
}

const SCREEN = {
  op: 'add_container',
  as: '$screen',
  width: 300,
  height: 200,
  background: '#FFEBEE',
};
const BUTTON_OP = (label = 'Hello') => ({
  op: 'create_marking',
  as: '$button',
  container: '$screen',
  rect: { x: 40, y: 50, width: 120, height: 40 },
  annotation: { type: 'lib/btn', values: { label } },
});
const BATCH = [SCREEN, BUTTON_OP()];

const sha = (path: string) => readFileSync(path, 'utf8');
/** What is in `proposals/` (nothing, when the folder does not exist). */
const proposalsListing = () =>
  existsSync(join(dir, 'proposals')) ? readdirSync(join(dir, 'proposals')).sort() : [];

async function propose(operations: unknown[]) {
  const reply = ok(
    await call('propose_changes', { project: 'telas', title: 'Test', operations }),
  );
  const created = reply.json.created as { kind: string; ref?: string }[];
  return {
    ref: reply.json.proposal.ref as string,
    id: reply.json.proposal.id as string,
    container: created.find((c) => c.kind === 'container')?.ref ?? '',
    marking: created.find((c) => c.kind === 'marking')?.ref ?? '',
    annotation: created.find((c) => c.kind === 'annotation')?.ref,
  };
}

describe('batch only', () => {
  it('draws the container and the marking that the batch creates, by alias, writing nothing', async () => {
    const before = sha(mappingPath());
    const folders = proposalsListing();
    const container = ok(
      await call('render_container', {
        project: 'telas',
        ref: '$screen',
        operations: BATCH,
      }),
    );
    expect(container.json).toMatchObject({
      width: 300,
      height: 200,
      alias: '$screen',
      provisional: true,
      preview: { operations: 2 },
    });
    expect(container.json.preview.revision).toBeTypeOf('number');
    const r = await raster(container);
    expect(pixel(r, 2, 2)).toEqual([255, 235, 238]);
    // The button's white fill inside the container.
    expect(pixel(r, 45, 55)).toEqual([255, 255, 255]);

    const marking = ok(
      await call('render_marking', {
        project: 'telas',
        ref: '$button',
        operations: BATCH,
      }),
    );
    expect(marking.json).toMatchObject({
      width: 120,
      height: 40,
      alias: '$button',
      provisional: true,
    });
    expect(sha(mappingPath())).toBe(before);
    expect(proposalsListing()).toEqual(folders);
    expect(existsSync(join(dir, 'proposals'))).toBe(false);
  });

  it('an existing item keeps its reference and is not provisional', async () => {
    const reply = ok(
      await call('render_container', {
        project: 'telas',
        ref: 'mapping://telas/i/bbbbbbbb',
        operations: [
          { op: 'update_marking', marking: 'mapping://telas/m/aaaaaaaa', name: 'Novo' },
        ],
      }),
    );
    expect(reply.json.provisional).toBeUndefined();
    expect(reply.json.preview.operations).toBe(1);
  });

  it('operationsFile inside the roots draws the same as the inline batch', async () => {
    mkdirSync(join(base, 'assets'), { recursive: true });
    const file = join(base, 'assets', 'batch.json');
    writeFileSync(file, JSON.stringify(BATCH));
    const inline = ok(
      await call('render_container', {
        project: 'telas',
        ref: '$screen',
        operations: BATCH,
      }),
    );
    const fromFile = ok(
      await call('render_container', {
        project: 'telas',
        ref: '$screen',
        operationsFile: file,
      }),
    );
    expect(fromFile.image).toBe(inline.image);
  });
});

describe('proposal only', () => {
  it('draws the same bytes as the batch, from the final reference of the proposal', async () => {
    const batch = ok(
      await call('render_container', {
        project: 'telas',
        ref: '$screen',
        operations: BATCH,
      }),
    );
    const before = sha(mappingPath());
    const p = await propose(BATCH);
    const proposalFile = join(dir, proposalFilePath(p.id));
    const proposalBefore = sha(proposalFile);
    const drawn = ok(
      await call('render_container', { ref: p.container, proposal: p.ref }),
    );
    expect(drawn.image).toBe(batch.image);
    expect(drawn.json.provisional).toBeUndefined();
    expect(drawn.json.preview).toMatchObject({ proposal: p.ref });
    const marking = ok(await call('render_marking', { ref: p.marking, proposal: p.ref }));
    expect(marking.json.width).toBe(120);
    expect(sha(mappingPath())).toBe(before);
    expect(sha(proposalFile)).toBe(proposalBefore);
  });
});

describe('proposal plus batch', () => {
  it('applies the batch over the proposal: the drawing changes and proposal.json does not', async () => {
    const p = await propose(BATCH);
    const proposalFile = join(dir, proposalFilePath(p.id));
    const proposalBefore = sha(proposalFile);
    const plain = ok(await call('render_marking', { ref: p.marking, proposal: p.ref }));
    const revised = ok(
      await call('render_marking', {
        ref: p.marking,
        proposal: p.ref,
        operations: [
          {
            op: 'update_annotation',
            annotation: p.annotation,
            values: { label: 'A much longer label' },
          },
        ],
      }),
    );
    expect(revised.image).not.toBe(plain.image);
    expect(revised.json.preview).toMatchObject({ proposal: p.ref, operations: 1 });
    expect(sha(proposalFile)).toBe(proposalBefore);
  });
});

describe('placement over a proposal (#2415)', () => {
  it('the preview puts a new container where revise_proposal puts it', async () => {
    const screen = (name: string) => ({
      op: 'add_container',
      as: '$s',
      name,
      width: 360,
      height: 64,
      background: '#FFFFFF',
    });
    const b = await propose([screen('Holder B')]);
    await propose([screen('Holder A')]);
    const batch = [screen('Previewed')] as unknown as Operation[];
    const preview = await openPreview(new Roots([base]), () => Date.now(), {
      ref: b.container,
      proposal: b.ref,
      operations: batch,
    });
    const previewed = preview.refs.project.containers.find((c) => c.name === 'Previewed');
    expect(previewed).toBeDefined();
    ok(await call('revise_proposal', { ref: b.ref, operations: batch }));
    const created = readProposal(dir, b.id).changes.filter(
      (c) => c.entity === 'image' && c.kind === 'create',
    );
    const revised = created
      .map((c) => c.to as unknown as { name: string; placement: unknown })
      .find((c) => c.name === 'Previewed');
    expect(revised).toBeDefined();
    expect(previewed!.placement).toEqual(revised!.placement);
  });
});

describe('images of the new containers', () => {
  const RED = (extra: Record<string, unknown> = {}) => ({
    op: 'add_container',
    as: '$photo',
    file: join(base, 'assets', 'red.png'),
    ...extra,
  });

  it('from the batch memory (nothing is copied to images/)', async () => {
    const folders = proposalsListing();
    const reply = ok(
      await call('render_container', {
        project: 'telas',
        ref: '$photo',
        operations: [RED()],
      }),
    );
    const r = await raster(reply);
    expect(r.width).toBe(100);
    expect(pixel(r, 5, 5)).toEqual([200, 32, 32]);
    expect(existsSync(join(dir, 'images', 'red.png'))).toBe(false);
    expect(proposalsListing()).toEqual(folders);
  });

  it('from proposals/<id>/images/', async () => {
    const reply = ok(
      await call('propose_changes', {
        project: 'telas',
        title: 'Image',
        operations: [RED()],
      }),
    );
    const created = reply.json.created as { kind: string; ref: string }[];
    const ref = created.find((c) => c.kind === 'container')!.ref;
    const drawn = ok(
      await call('render_container', { ref, proposal: reply.json.proposal.ref }),
    );
    const r = await raster(drawn);
    expect(pixel(r, 5, 5)).toEqual([200, 32, 32]);
  });

  it('the project image of an existing container still comes from the folder', async () => {
    const reply = ok(
      await call('render_container', {
        project: 'telas',
        ref: 'mapping://telas/i/bbbbbbbb',
        operations: [RED()],
      }),
    );
    expect(pixel(await raster(reply), 5, 90)).toEqual([16, 160, 48]);
  });
});

describe('library package', () => {
  const pkgBatch = () => [
    { op: 'apply_specialization', file: join(base, 'pkg') },
    SCREEN,
    {
      op: 'create_marking',
      as: '$chip',
      container: '$screen',
      rect: { x: 20, y: 20, width: 60, height: 30 },
      annotation: { type: 'pkg/chip' },
    },
  ];

  it('a batch that applies the package draws its components, with the fonts warning', async () => {
    const reply = ok(
      await call('render_container', {
        project: 'telas',
        ref: '$screen',
        operations: pkgBatch(),
      }),
    );
    expect(pixel(await raster(reply), 30, 30)).toEqual([255, 0, 0]);
    expect(String(reply.json.warning)).toContain('fonts');
    expect(existsSync(join(dir, 'specs', 'pkg'))).toBe(false);
  });

  it('a proposal that applies the package draws it from proposals/<id>/specs/', async () => {
    const p = await propose(pkgBatch());
    expect(existsSync(join(dir, 'proposals', p.id, 'specs', 'pkg'))).toBe(true);
    expect(existsSync(join(dir, 'specs', 'pkg'))).toBe(false);
    const reply = ok(
      await call('render_container', { ref: p.container, proposal: p.ref }),
    );
    expect(pixel(await raster(reply), 30, 30)).toEqual([255, 0, 0]);
    expect(String(reply.json.warning)).toContain('fonts');
  });

  it('accepts a drawingMode that only the previewed package declares', async () => {
    const withMode = ok(
      await call('render_container', {
        project: 'telas',
        ref: '$screen',
        operations: pkgBatch(),
        drawingMode: 'neon',
      }),
    );
    expect(withMode.json.drawingMode).toBe('neon');
    expect(pixel(await raster(withMode), 30, 30)).toEqual([0, 255, 0]);
    const without = await call('render_container', {
      project: 'telas',
      ref: 'mapping://telas/i/bbbbbbbb',
      drawingMode: 'neon',
    });
    expect(errorOf(without).code).toBe('invalid-arguments');
  });
});

describe('refusals', () => {
  it('an invalid batch: invalid-batch with the errors and nothing drawn', async () => {
    const reply = await call('render_container', {
      project: 'telas',
      ref: '$screen',
      operations: [
        SCREEN,
        {
          op: 'create_marking',
          container: 'mapping://telas/i/ffffffff',
          rect: { x: 0, y: 0, width: 10, height: 10 },
        },
      ],
    });
    const error = errorOf(reply);
    expect(error.code).toBe('invalid-batch');
    expect(Array.isArray(error.errors)).toBe(true);
    expect((error.errors as unknown[]).length).toBeGreaterThan(0);
    expect(String(error.hint)).toContain('plan_changes');
    expect(reply.image).toBeUndefined();
  });

  it('an unknown alias is unknown-alias', async () => {
    const reply = await call('render_container', {
      project: 'telas',
      ref: '$nope',
      operations: BATCH,
    });
    expect(errorOf(reply).code).toBe('unknown-alias');
  });

  it('an alias of the wrong kind is wrong-kind', async () => {
    const reply = await call('render_container', {
      project: 'telas',
      ref: '$button',
      operations: BATCH,
    });
    expect(errorOf(reply).code).toBe('wrong-kind');
    const other = await call('render_marking', {
      project: 'telas',
      ref: '$screen',
      operations: BATCH,
    });
    expect(errorOf(other).code).toBe('wrong-kind');
  });

  it('$alias without project is invalid-arguments', async () => {
    const reply = await call('render_container', { ref: '$screen', operations: BATCH });
    const error = errorOf(reply);
    expect(error.code).toBe('invalid-arguments');
    expect(error.message).toContain('project');
  });

  it('a project that disagrees with the reference is project-mismatch, with and without proposal', async () => {
    const other = join(base, 'outros');
    mkdirSync(other, { recursive: true });
    writeFileSync(join(other, 'mapping.json'), readFileSync(mappingPath(), 'utf8'));
    try {
      const batch = await call('render_container', {
        project: 'outros',
        ref: 'mapping://telas/i/bbbbbbbb',
        operations: BATCH,
      });
      expect(errorOf(batch).code).toBe('project-mismatch');
      const marking = await call('render_marking', {
        project: 'outros',
        ref: 'mapping://telas/m/aaaaaaaa',
        operations: BATCH,
      });
      expect(errorOf(marking).code).toBe('project-mismatch');
      const { ref: proposal } = await propose(BATCH);
      const withProposal = await call('render_container', {
        project: 'outros',
        ref: 'mapping://telas/i/bbbbbbbb',
        proposal,
      });
      expect(errorOf(withProposal).code).toBe('project-mismatch');
    } finally {
      rmSync(other, { recursive: true, force: true });
    }
  });

  it('both operations and operationsFile is invalid-arguments', async () => {
    const reply = await call('render_container', {
      project: 'telas',
      ref: '$screen',
      operations: BATCH,
      operationsFile: join(base, 'assets', 'batch.json'),
    });
    expect(errorOf(reply).code).toBe('invalid-arguments');
  });

  it('a withdrawn proposal is not-open', async () => {
    const p = await propose(BATCH);
    ok(await call('withdraw_proposal', { ref: p.ref }));
    const reply = await call('render_container', { ref: p.container, proposal: p.ref });
    expect(errorOf(reply).code).toBe('not-open');
  });

  it('a proposal with an applied change is proposal-applied', async () => {
    const p = await propose([
      { op: 'update_marking', marking: 'mapping://telas/m/aaaaaaaa', name: 'Applied' },
      { op: 'update_container', container: 'mapping://telas/i/bbbbbbbb', name: 'Second' },
    ]);
    const proposal = readProposal(dir, p.id);
    const first = proposal.changes.find((c) => c.kind === 'update' && c.field === 'name');
    reviewDecide(dir, p.id, { level: 'change', id: first!.id }, 'accepted');
    applyAcceptedOnDisk(dir, p.id);
    expect(readProposal(dir, p.id).status).toBe('open');
    const reply = await call('render_container', {
      ref: 'mapping://telas/i/bbbbbbbb',
      proposal: p.ref,
    });
    const error = errorOf(reply);
    expect(error.code).toBe('proposal-applied');
    expect(String(error.hint)).toContain('without `proposal`');
  });

  it('an unknown proposal is proposal-not-found', async () => {
    const reply = await call('render_container', {
      ref: 'mapping://telas/i/bbbbbbbb',
      proposal: 'mapping://telas/p/00000000',
    });
    expect(errorOf(reply).code).toBe('proposal-not-found');
  });
});

describe('without preview arguments', () => {
  it('stays as today: the applied project, no preview field', async () => {
    const reply = ok(
      await call('render_container', { ref: 'mapping://telas/i/bbbbbbbb' }),
    );
    expect(reply.json.preview).toBeUndefined();
    expect(reply.json.provisional).toBeUndefined();
  });
});
