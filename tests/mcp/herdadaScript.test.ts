// R25.83 to R25.86 (MF3, inherited color): the library that `scripts/testing/herdada.mjs` builds passes
// in `validate_library` (stdio) without errors and with only the known warnings, `render_container` paints the child (the Text inside
// the Card) in the color the Card offers, and the loose Text on the screen, in its `default`.
import { execFileSync } from 'node:child_process';
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  applySpecialization,
  createProject,
  parseSpecText,
  serialize,
} from '../../src/model';
import { validateComponent } from '../../src/model/components/parseComponent';
import { runBatch, type BatchResult } from '../../mcp/batch';
import { decodeImage } from '../../mcp/image/codecs';
import type { Raster } from '../../mcp/image/raster';
import { Refs } from '../../mcp/items';
import type { Operation } from '../../mcp/operations';
import { Roots } from '../../mcp/paths';
import { findProject, loadProject, type LoadedProject } from '../../mcp/projects';
import { renderContainer } from '../../mcp/renderImage';
import { NOW } from '../model/fixtures';
import { acceptAllAndApply, ok, propose, readProject } from './proposalSupport';
import { connect, type Connection } from './workspace';

interface Validated {
  valid: boolean;
  errors: unknown[];
  warnings: unknown[];
}

const LAYER = 'cccccccc-0000-4000-8000-000000000001';
const BLUE = [0x19, 0x76, 0xd2];
const RED = [0xd3, 0x2f, 0x2f];
const GREEN = [0x2e, 0x7d, 0x32];
const CARD_FILL = [0xff, 0xf8, 0xe1];

let base: string;
let root: string;
let roots: Roots;
let loaded: LoadedProject;
let mcp: Connection;

beforeAll(async () => {
  base = mkdtempSync(join(tmpdir(), 'mapping-herdada-'));
  root = join(base, 'raiz');
  const lib = join(root, 'm3-herdada');
  cpSync('libraries/material3-compose', lib, { recursive: true });
  execFileSync('node', [resolve('scripts/testing/herdada.mjs'), lib]);
  // The `telas` project keeps the library copy in `specs/`, as the app does when applying it.
  const dir = join(root, 'telas');
  const specs = join(dir, 'specs', 'material3-compose');
  mkdirSync(specs, { recursive: true });
  cpSync(lib, specs, { recursive: true });
  const parsed = parseSpecText(
    readFileSync(join(lib, 'material3-compose.spec.json'), 'utf8'),
  );
  if (!parsed.ok) throw new Error(`invalid spec: ${JSON.stringify(parsed)}`);
  let p = createProject({
    name: 'Screens',
    now: NOW,
    firstLayer: { id: LAYER, name: 'Camada 1', color: '#D32F2F' },
  });
  p = applySpecialization(p, parsed.spec, {
    packageSpecName: 'material3-compose.spec.json',
  });
  writeFileSync(join(dir, 'mapping.json'), serialize(p));
  roots = new Roots([root]);
  loaded = await loadProject(roots, await findProject(roots, 'telas'));
  mcp = await connect([root], { cwd: root });
});

afterAll(async () => {
  await mcp?.close();
  rmSync(base, { recursive: true, force: true });
});

const io = {
  readSource: () => Promise.reject(new Error('sem arquivos')),
  readSpecInput: () => Promise.reject(new Error('sem arquivos')),
  takenImageFiles: new Set<string>(),
  now: () => new Date(NOW),
};

const create = (
  alias: string,
  type: string,
  rect: { x: number; y: number; width: number; height: number },
): Operation => ({
  op: 'create_marking',
  as: alias,
  container: '$screen',
  rect,
  annotation: { type: `material3-compose/${type}`, values: {} },
});

const OPERATIONS: Operation[] = [
  { op: 'add_container', as: '$screen', width: 340, height: 260, background: '#FFFFFF' },
  create('$card', 'card', { x: 20, y: 20, width: 300, height: 120 }),
  // The Text inside the Card (the child) and the one outside (without an ancestor).
  create('$inside', 'text', { x: 30, y: 30, width: 200, height: 70 }),
  create('$outside', 'text', { x: 20, y: 160, width: 200, height: 70 }),
];

async function setup() {
  const result: BatchResult = await runBatch(loaded, OPERATIONS, io);
  expect(result.errors).toEqual([]);
  return result;
}

async function paint(project: BatchResult['project']): Promise<Raster> {
  const refs = new Refs({ ...loaded, project });
  const tela = project.containers.find((c) => c.name === 'Screens' || c.file === null)!;
  const out = await renderContainer(roots, refs, tela, { zoom: 1 });
  return (await decodeImage(out.image.bytes)).raster;
}

const pixel = (raster: Raster, x: number, y: number): number[] => {
  const i = (y * raster.width + x) * 4;
  return [...raster.data.subarray(i, i + 3)];
};

/** How many pixels of the region (inclusive) have exactly the color (only the inside of the letters). */
function count(
  raster: Raster,
  color: number[],
  area: { x0: number; y0: number; x1: number; y1: number },
): number {
  let n = 0;
  for (let y = area.y0; y <= area.y1; y++)
    for (let x = area.x0; x <= area.x1; x++) {
      const px = pixel(raster, x, y);
      if (px[0] === color[0] && px[1] === color[1] && px[2] === color[2]) n++;
    }
  return n;
}

const INSIDE = { x0: 20, y0: 20, x1: 319, y1: 139 };
const OUTSIDE = { x0: 0, y0: 150, x1: 339, y1: 259 };

describe('herdada.mjs (R25.83 a R25.86)', () => {
  it('the built library passes validate_library, with no error or warning', async () => {
    const result = ok(
      await mcp.call<Validated>('validate_library', { path: 'm3-herdada' }),
    );
    expect(result.errors).toEqual([]);
    // Provisional (owner decision pending in bug #1774; curation in #1134): only the
    // `parameter outside the signature` warnings of the known Material 3 set; any other warning fails.
    expect(
      result.warnings.filter(
        (w) => !JSON.stringify(w).includes('parameter outside the signature'),
      ),
    ).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it('in a formatVersion 3 the provide and the $provided are version errors', () => {
    const card = JSON.parse(
      readFileSync(join(root, 'm3-herdada/components/card.json'), 'utf8'),
    ) as object;
    const text = JSON.parse(
      readFileSync(join(root, 'm3-herdada/components/text.json'), 'utf8'),
    ) as object;
    expect(card).toMatchObject({ formatVersion: 4 });
    expect(validateComponent(card)).toEqual([]);
    expect(validateComponent(text)).toEqual([]);
    const old = validateComponent({ ...card, formatVersion: 3 });
    expect(old.some((e) => e.includes('provide'))).toBe(true);
    const oldText = validateComponent({ ...text, formatVersion: 3 });
    expect(oldText.some((e) => e.includes('only allowed with formatVersion 4'))).toBe(
      true,
    );
  });

  it('in render_container the Card Text comes out blue and the loose one comes out green', async () => {
    const { project } = await setup();
    const raster = await paint(project);
    expect(raster.width).toBe(340);
    expect(raster.height).toBe(260);
    expect(pixel(raster, 10, 10)).toEqual([255, 255, 255]);
    expect(pixel(raster, 25, 25)).toEqual(CARD_FILL);
    expect(count(raster, BLUE, INSIDE)).toBeGreaterThan(300);
    expect(count(raster, RED, INSIDE)).toBe(0);
    expect(count(raster, GREEN, INSIDE)).toBe(0);
    expect(count(raster, GREEN, OUTSIDE)).toBeGreaterThan(300);
    expect(count(raster, BLUE, OUTSIDE)).toBe(0);
  });

  it('propose_changes changes the Card ink; once applied, the child changes color and the disk does not keep the drawing', async () => {
    const { project } = await setup();
    const dir = join(root, 'telas2');
    mkdirSync(join(dir, 'specs'), { recursive: true });
    cpSync(join(root, 'telas', 'specs'), join(dir, 'specs'), { recursive: true });
    writeFileSync(join(dir, 'mapping.json'), serialize(project));
    const list = ok(
      await mcp.call<{
        markings: { ref: string; component: string; parent: string | null }[];
      }>('list_markings', { project: 'telas2' }),
    );
    const card = list.markings.find((m) => m.component.endsWith('/card'))!;
    const texts = list.markings.filter((m) => m.component.endsWith('/text'));
    expect(texts.map((m) => m.parent).sort()).toEqual([card.ref, null].sort());
    const got = ok(
      await mcp.call<{ layers: { annotations: { ref: string }[] }[] }>('get_marking', {
        ref: card.ref,
      }),
    );
    const annotation = got.layers[0]!.annotations[0]!.ref;
    const before = readFileSync(join(dir, 'mapping.json'), 'utf8');
    const proposed = await propose(
      mcp,
      'telas2',
      [{ op: 'update_annotation', annotation, values: { ink: '#D32F2F' } }],
      { title: 'Card ink' },
    );
    expect(proposed.valid).toBe(true);
    expect(readFileSync(join(dir, 'mapping.json'), 'utf8')).toBe(before);
    const applied = acceptAllAndApply(dir, proposed.proposal.id);
    const raster = await paint(applied);
    expect(count(raster, RED, INSIDE)).toBeGreaterThan(300);
    expect(count(raster, BLUE, INSIDE)).toBe(0);
    expect(count(raster, GREEN, OUTSIDE)).toBeGreaterThan(300);
    expect(count(raster, RED, OUTSIDE)).toBe(0);
    const disk = readFileSync(join(dir, 'mapping.json'), 'utf8');
    expect(disk).toContain('"ink": "#D32F2F"');
    for (const drawn of ['content-color', '#1976D2', '#2E7D32', '$provided'])
      expect(disk, drawn).not.toContain(drawn);
    expect(readProject(dir).revision).toBe(project.revision + 1);
  });
});
