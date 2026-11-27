import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  applySpecialization,
  createProject,
  parseSpecText,
  serialize,
  type Project,
} from '../../src/model';
import { decodeImage } from '../../mcp/image/codecs';
import type { Raster } from '../../mcp/image/raster';
import { createFontBook, measurerFor } from '../../mcp/image/textMeasurer';
import type { Operation } from '../../mcp/operations';
import { Roots } from '../../mcp/paths';
import { buildPreviewFonts } from '../../mcp/previewFonts';
import { loadProject, findProject } from '../../mcp/projects';
import { openPreview } from '../../mcp/renderPreview';
import { createServer } from '../../mcp/server';
import { NOW } from '../model/fixtures';

// PC1 (#2971, stage #2928, decisions 1 to 3 and 11): `render_container` draws a library's new `fonts`
// before the batch or the proposal that brings them is applied.

const FIXTURE = 'tests/fixtures/preview-fonts';
const ROBOTO = 'tests/fixtures/fonts/roboto-latin-500-normal.woff';
const TEXT = 'Mapping preview of the fonts in a package';
const FONT = {
  family: 'Roboto',
  size: 16,
  weight: 500,
  italic: false,
  lineHeight: 20,
  letterSpacing: 0,
};

let base: string;
let client: Client;
let roots: Roots;

const dirOf = (name: string) => join(base, name);

/** A copy of the fixture package; the font file is copied in unless `withFont` is false. */
function copyPackage(
  name: string,
  withFont: boolean,
  edit?: (spec: Record<string, unknown>) => void,
) {
  const pkg = join(base, name);
  mkdirSync(join(pkg, 'fonts'), { recursive: true });
  cpSync(join(FIXTURE, 'components'), join(pkg, 'components'), { recursive: true });
  const spec = JSON.parse(readFileSync(join(FIXTURE, 'preview-fonts.spec.json'), 'utf8'));
  edit?.(spec);
  writeFileSync(join(pkg, 'preview-fonts.spec.json'), JSON.stringify(spec));
  if (withFont) cpSync(ROBOTO, join(pkg, 'fonts', 'Roboto-Medium.woff'));
  return pkg;
}

function writeProject(name: string, p: Project) {
  mkdirSync(dirOf(name), { recursive: true });
  writeFileSync(join(dirOf(name), 'mapping.json'), serialize(p));
}

function applied(
  pkg: string,
  name: string,
  edit?: (spec: Record<string, unknown>) => void,
) {
  const dir = join(dirOf(name), 'specs', 'preview-fonts');
  mkdirSync(join(dir, 'fonts'), { recursive: true });
  cpSync(join(pkg, 'components'), join(dir, 'components'), { recursive: true });
  const spec = JSON.parse(readFileSync(join(pkg, 'preview-fonts.spec.json'), 'utf8'));
  edit?.(spec);
  writeFileSync(join(dir, 'preview-fonts.spec.json'), JSON.stringify(spec));
  const parsed = parseSpecText(JSON.stringify(spec));
  if (!parsed.ok) throw new Error(`invalid spec: ${JSON.stringify(parsed)}`);
  return parsed.spec;
}

const empty = () =>
  createProject({
    name: 'P',
    now: NOW,
    firstLayer: {
      id: 'cccccccc-0000-4000-8000-000000000001',
      name: 'L',
      color: '#D32F2F',
    },
  });

beforeAll(async () => {
  base = mkdtempSync(join(tmpdir(), 'mapping-preview-fonts-'));
  roots = new Roots([base]);
  copyPackage('pf', true);
  copyPackage('pf-nofont', false);
  copyPackage('pf-v2', true, (s) => {
    s.version = 2;
  });
  // A project without the library, one with the library's v1 (no fonts) and one with it and its font.
  writeProject('plain', empty());
  const v1 = applied(join(base, 'pf'), 'v1', (s) => {
    delete s.fonts;
  });
  writeProject(
    'v1',
    applySpecialization(empty(), v1, { packageSpecName: 'preview-fonts.spec.json' }),
  );
  const full = applied(join(base, 'pf'), 'withfont');
  cpSync(
    ROBOTO,
    join(dirOf('withfont'), 'specs', 'preview-fonts', 'fonts', 'Roboto-Medium.woff'),
  );
  writeProject(
    'withfont',
    applySpecialization(empty(), full, { packageSpecName: 'preview-fonts.spec.json' }),
  );
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

async function raster(reply: Reply): Promise<Raster> {
  return (await decodeImage(Buffer.from(reply.image!, 'base64'))).raster;
}

/** The width of the box around the non-white pixels. */
function inkWidth(r: Raster): number {
  let min = r.width;
  let max = -1;
  for (let y = 0; y < r.height; y++) {
    for (let x = 0; x < r.width; x++) {
      const i = (y * r.width + x) * 4;
      if (r.data[i]! < 250 || r.data[i + 1]! < 250 || r.data[i + 2]! < 250) {
        min = Math.min(min, x);
        max = Math.max(max, x);
      }
    }
  }
  return max < min ? 0 : max - min + 1;
}

const SCREEN: Operation = {
  op: 'add_container',
  as: '$screen',
  width: 400,
  height: 80,
  background: '#FFFFFF',
};
const TAG: Operation = {
  op: 'create_marking',
  as: '$tag',
  container: '$screen',
  rect: { x: 20, y: 20, width: 340, height: 32 },
  annotation: { type: 'preview-fonts/tag', values: { label: TEXT } },
};
const applyOps = (pkg: string): Operation[] => [
  { op: 'apply_specialization', file: join(base, pkg) },
  SCREEN,
  TAG,
];

const bytes = () => readFileSync(ROBOTO);
const widthWith = (withFont: boolean): number => {
  const book = createFontBook(
    withFont
      ? [
          {
            family: 'Roboto',
            weight: '500',
            style: 'normal',
            path: 'x',
            bytes: new Uint8Array(bytes()).buffer as ArrayBuffer,
          },
        ]
      : [],
  );
  return measurerFor(book)(TEXT, FONT).width;
};

describe('the package fonts in the preview', () => {
  it('the two fonts measure differently (the test means something)', () => {
    expect(Math.abs(widthWith(true) - widthWith(false))).toBeGreaterThan(2.5);
  });

  it('(a) a batch that applies the library draws its text with its fonts, with no fonts warning', async () => {
    const reply = ok(
      await call('render_container', {
        project: 'plain',
        ref: '$screen',
        operations: applyOps('pf'),
      }),
    );
    expect(String(reply.json.warning ?? '')).not.toContain('font');
    const ink = inkWidth(await raster(reply));
    expect(Math.abs(ink - widthWith(true))).toBeLessThanOrEqual(1);
    expect(Math.abs(ink - widthWith(false))).toBeGreaterThan(1);
  });

  it('(b) the same through an open proposal', async () => {
    const proposed = ok(
      await call('propose_changes', {
        project: 'plain',
        title: 'Fonts',
        operations: applyOps('pf'),
      }),
    );
    const created = proposed.json.created as { kind: string; ref?: string }[];
    const container = created.find((c) => c.kind === 'container')!.ref!;
    const reply = ok(
      await call('render_container', {
        ref: container,
        proposal: proposed.json.proposal.ref,
      }),
    );
    expect(String(reply.json.warning ?? '')).not.toContain('font');
    expect(Math.abs(inkWidth(await raster(reply)) - widthWith(true))).toBeLessThanOrEqual(
      1,
    );
  });

  it('(c) an update_specialization that adds the font to the applied version', async () => {
    const reply = ok(
      await call('render_container', {
        project: 'v1',
        ref: '$screen',
        operations: [
          { op: 'update_specialization', file: join(base, 'pf-v2') },
          SCREEN,
          TAG,
        ],
      }),
    );
    expect(String(reply.json.warning ?? '')).not.toContain('font');
    expect(Math.abs(inkWidth(await raster(reply)) - widthWith(true))).toBeLessThanOrEqual(
      1,
    );
  });

  it('(d) a declared font that the package does not carry warns and draws with the embedded font', async () => {
    const reply = ok(
      await call('render_container', {
        project: 'plain',
        ref: '$screen',
        operations: applyOps('pf-nofont'),
      }),
    );
    const warning = String(reply.json.warning);
    expect(warning).toContain('preview-fonts');
    expect(warning).toContain('fonts/Roboto-Medium.woff');
    const ink = inkWidth(await raster(reply));
    expect(Math.abs(ink - widthWith(false))).toBeLessThan(
      Math.abs(ink - widthWith(true)),
    );
  });

  it('(e) a batch that brings no fonts keeps the book read with the project', async () => {
    const location = await findProject(roots, 'withfont');
    const disk = await loadProject(roots, location);
    const preview = await openPreview(roots, () => 0, {
      ref: '$screen',
      project: 'withfont',
      operations: [SCREEN],
    });
    expect(disk.fonts?.hasLibraryFonts).toBe(true);
    expect(preview.refs.loaded.fonts).toBe(disk.fonts);
    expect(preview.warning).toBeUndefined();
  });

  it('(f) two calls over the same batch parse the fonts once', async () => {
    const args = { ref: '$screen', project: 'plain', operations: applyOps('pf') };
    const first = await openPreview(roots, () => 0, args);
    const second = await openPreview(roots, () => 0, args);
    expect(first.refs.loaded.fonts).toBeDefined();
    expect(second.refs.loaded.fonts).toBe(first.refs.loaded.fonts);
    expect(first.refs.loaded.fonts?.hasLibraryFonts).toBe(true);
  });
});

describe('the preview-fonts fixture', () => {
  it('validates as a library once the font is copied in', async () => {
    const reply = ok(await call('validate_library', { path: join(base, 'pf') }));
    expect(reply.json.errors ?? []).toEqual([]);
  });
});

describe('buildPreviewFonts', () => {
  const project = async () =>
    (await loadProject(roots, await findProject(roots, 'withfont'))).project;

  it('keys the cache by content: another font file gives another book, the same bytes the same one', async () => {
    const p = await project();
    const same = await buildPreviewFonts(p, async () => bytes());
    const again = await buildPreviewFonts(p, async () => bytes());
    expect(again.book).toBe(same.book);
    const other = await buildPreviewFonts(p, async () =>
      readFileSync('tests/fixtures/fonts/roboto-latin-400-normal.woff'),
    );
    expect(other.book).not.toBe(same.book);
  });

  it('keeps at most 8 books (the least recently used goes out)', async () => {
    const p = await project();
    const books = [];
    // A single trailing byte changes the hash and keeps the font readable.
    const variant = (n: number) => async () => Buffer.concat([bytes(), Buffer.alloc(n)]);
    for (let n = 1; n <= 9; n++)
      books.push((await buildPreviewFonts(p, variant(n))).book);
    expect((await buildPreviewFonts(p, variant(9))).book).toBe(books[8]);
    expect((await buildPreviewFonts(p, variant(1))).book).not.toBe(books[0]);
  });

  it('warns once per unread font of a brought specialization, not of the others', async () => {
    const p = await project();
    const none = await buildPreviewFonts(p, async () => null);
    expect(none.warnings).toEqual([]);
    expect(none.book.hasLibraryFonts).toBe(false);
    const brought = await buildPreviewFonts(p, async () => null, p.specializations);
    expect(brought.warnings).toHaveLength(1);
    expect(brought.warnings[0]).toContain('preview-fonts');
  });
});
