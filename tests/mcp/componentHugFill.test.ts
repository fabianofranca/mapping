// R25 (HC2 of #2164): the library that `scripts/testing/hug-fill.mjs` builds passes in `validate_library`
// (stdio) and its menu item, with a `hug` width and a `fill` label, takes the creation without `rect`,
// `fit_marking` and `render_container` to the numbers the script promises (96, the label's width, 136).
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
import { runBatch, type BatchResult } from '../../mcp/batch';
import { decodeImage } from '../../mcp/image/codecs';
import type { Raster } from '../../mcp/image/raster';
import { Refs } from '../../mcp/items';
import type { Operation } from '../../mcp/operations';
import { Roots } from '../../mcp/paths';
import { findProject, loadProject, type LoadedProject } from '../../mcp/projects';
import { renderContainer } from '../../mcp/renderImage';
import { NOW } from '../model/fixtures';
import { ok } from './proposalSupport';
import { connect, type Connection } from './workspace';

interface Validated {
  valid: boolean;
  errors: unknown[];
  warnings: unknown[];
}

const LAYER = 'cccccccc-0000-4000-8000-000000000001';
const TYPE = 'material3-compose/chip';
const FILL = [0xee, 0xee, 0xee];
const WHITE = [255, 255, 255];
const LONG = 'a'.repeat(40);

let base: string;
let root: string;
let roots: Roots;
const loadedOf: Record<string, LoadedProject> = {};
let mcp: Connection;

/** Builds `<root>/<name>` (the library) and the `<name>-p` project that keeps its copy in `specs/`. */
async function build(name: string, args: string[]): Promise<void> {
  const lib = join(root, name);
  cpSync('libraries/material3-compose', lib, { recursive: true });
  execFileSync('node', [resolve('scripts/testing/hug-fill.mjs'), lib, ...args]);
  const dir = join(root, `${name}-p`);
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
    firstLayer: { id: LAYER, name: 'Layer 1', color: '#D32F2F' },
  });
  p = applySpecialization(p, parsed.spec, {
    packageSpecName: 'material3-compose.spec.json',
  });
  writeFileSync(join(dir, 'mapping.json'), serialize(p));
}

beforeAll(async () => {
  base = mkdtempSync(join(tmpdir(), 'mapping-hugfill-'));
  root = join(base, 'raiz');
  await build('m3-hug', []);
  await build('m3-hug2', ['two']);
  roots = new Roots([root]);
  for (const name of ['m3-hug-p', 'm3-hug2-p'])
    loadedOf[name] = await loadProject(roots, await findProject(roots, name));
  mcp = await connect([root], { cwd: root });
});

afterAll(async () => {
  await mcp?.close();
  rmSync(base, { recursive: true, force: true });
});

const io = {
  readSource: () => Promise.reject(new Error('no files')),
  readSpecInput: () => Promise.reject(new Error('no files')),
  takenImageFiles: new Set<string>(),
  now: () => new Date(NOW),
};

const SCREEN: Operation = {
  op: 'add_container',
  as: '$screen',
  width: 340,
  height: 100,
  background: '#FFFFFF',
};

async function widthOf(
  project: string,
  values: Record<string, string>,
  mode: 'create' | 'fit',
): Promise<{ width: number; result: BatchResult }> {
  const create: Operation = {
    op: 'create_marking',
    as: '$item',
    container: '$screen',
    ...(mode === 'fit' ? { rect: { x: 20, y: 20, width: 104, height: 40 } } : {}),
    annotation: { type: TYPE, values },
  } as Operation;
  const operations: Operation[] = [SCREEN, create];
  if (mode === 'fit')
    operations.push({ op: 'fit_marking', marking: '$item' } as Operation);
  const result = await runBatch(loadedOf[project]!, operations, io);
  expect(result.errors).toEqual([]);
  const id = (result.aliases.get('$item') as { id: string }).id;
  const rect = result.project.markings.find((m) => m.id === id)!.rect;
  expect(rect.height).toBe(40);
  return { width: rect.width, result };
}

describe('hug-fill.mjs (R25: fill inside hug)', () => {
  it.each(['m3-hug', 'm3-hug2'])(
    '%s passes validate_library with no error',
    async (name) => {
      const result = ok(await mcp.call<Validated>('validate_library', { path: name }));
      expect(result.errors).toEqual([]);
      expect(result.valid).toBe(true);
    },
  );

  it('one label: creation without rect and fit_marking give 96, the content and 136', async () => {
    for (const mode of ['create', 'fit'] as const) {
      expect((await widthOf('m3-hug-p', { label: 'Ok' }, mode)).width).toBe(96);
      expect((await widthOf('m3-hug-p', { label: 'Settings' }, mode)).width).toBe(107);
      expect((await widthOf('m3-hug-p', { label: LONG }, mode)).width).toBe(136);
    }
  });

  it('two labels: the width is the smallest at which the equal split gives each its content', async () => {
    const width = (label: string, leadingIconDescription: string) =>
      widthOf('m3-hug2-p', { label, leadingIconDescription }, 'create').then(
        (r) => r.width,
      );
    expect(await width('Ok', 'Ok')).toBe(100);
    expect(await width('Open', 'Edit')).toBe(133);
    expect(await width('Open', 'Ok')).toBe(133);
    expect(await width('Settings', 'Ok')).toBe(136);
    expect(await width('Ok', 'Settings')).toBe(136);
    expect(await width(LONG, 'Ok')).toBe(136);
  });

  it('render_container paints the frame as wide as the measured width', async () => {
    const { width, result } = await widthOf('m3-hug-p', { label: 'Settings' }, 'create');
    const loaded = loadedOf['m3-hug-p']!;
    const refs = new Refs({ ...loaded, project: result.project });
    const container = result.project.containers.find((c) => c.file === null)!;
    const out = await renderContainer(roots, refs, container, { zoom: 1 });
    const raster: Raster = (await decodeImage(out.image.bytes)).raster;
    const pixel = (x: number, y: number) => {
      const i = (y * raster.width + x) * 4;
      return [...raster.data.subarray(i, i + 3)];
    };
    const rect = result.project.markings[0]!.rect;
    expect(pixel(rect.x + 2, rect.y + 2)).toEqual(FILL);
    expect(pixel(rect.x + width - 3, rect.y + 2)).toEqual(FILL);
    expect(pixel(rect.x + width + 2, rect.y + 2)).toEqual(WHITE);
  });
});
