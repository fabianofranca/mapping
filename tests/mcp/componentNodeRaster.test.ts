import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createProject,
  applySpecialization,
  parseSpecText,
  serialize,
} from '../../src/model';
import { runBatch } from '../../mcp/batch';
import { decodeImage } from '../../mcp/image/codecs';
import type { Raster } from '../../mcp/image/raster';
import { Refs } from '../../mcp/items';
import type { Operation } from '../../mcp/operations';
import { Roots } from '../../mcp/paths';
import { findProject, loadProject } from '../../mcp/projects';
import { renderMarking } from '../../mcp/renderImage';
import { NOW } from '../model/fixtures';

// CC2: `render_marking` of an instance of a composed component paints the inner colors (the one
// the node's `provide` passes included), and after the inner file changes on disk a new
// `render_marking` paints the new color: the catalog cache is keyed by the stamps of every file.

const LAYER = 'cccccccc-0000-4000-8000-000000000001';

const SPEC = {
  format: 'mapping-spec',
  formatVersion: 15,
  id: 'lib',
  name: 'Lib',
  version: 1,
  layers: [
    {
      id: 'ui',
      name: 'UI',
      color: '#6750A4',
      annotationTypes: [
        { id: 'outer', name: 'Outer', component: 'components/outer.json', fields: [] },
        { id: 'inner', name: 'Inner', component: 'components/inner.json', fields: [] },
      ],
    },
  ],
};

const component = (id: string, width: number, template: object) => ({
  format: 'mapping-component',
  formatVersion: 4,
  id,
  name: id,
  size: { width, height: 20 },
  template,
});

/** Two 20 px squares: the left one has a fixed color, the right one reads the inherited `ink`. */
const inner = (fixed: string) =>
  component('inner', 40, {
    type: 'frame',
    layout: { type: 'none' },
    children: [
      {
        type: 'rect',
        name: 'fixed',
        anchors: { left: 0, top: 0 },
        width: 20,
        height: 20,
        fill: fixed,
      },
      {
        type: 'rect',
        name: 'inherited',
        anchors: { left: 20, top: 0 },
        width: 20,
        height: 20,
        fill: { $provided: 'ink', default: '#999999' },
      },
    ],
  });

const OUTER = component('outer', 60, {
  type: 'frame',
  layout: { type: 'none' },
  children: [
    {
      type: 'component',
      id: 'inner',
      anchors: { left: 10, top: 0 },
      width: 40,
      height: 20,
      provide: { ink: '#ff0000' },
    },
  ],
});

let base: string;
let roots: Roots;
let innerFile: string;

beforeAll(async () => {
  base = mkdtempSync(join(tmpdir(), 'mapping-nested-'));
  const dir = join(base, 'telas');
  const lib = join(dir, 'specs', 'lib');
  mkdirSync(join(lib, 'components'), { recursive: true });
  mkdirSync(join(dir, 'images'), { recursive: true });
  writeFileSync(join(lib, 'lib.spec.json'), JSON.stringify(SPEC));
  writeFileSync(join(lib, 'components', 'outer.json'), JSON.stringify(OUTER));
  innerFile = join(lib, 'components', 'inner.json');
  writeFileSync(innerFile, JSON.stringify(inner('#0000ff')));
  const parsed = parseSpecText(JSON.stringify(SPEC));
  if (!parsed.ok) throw new Error(`invalid spec: ${JSON.stringify(parsed)}`);
  let p = createProject({
    name: 'Telas',
    now: NOW,
    firstLayer: { id: LAYER, name: 'Layer 1', color: '#D32F2F' },
  });
  p = applySpecialization(p, parsed.spec, { packageSpecName: 'lib.spec.json' });
  writeFileSync(join(dir, 'mapping.json'), serialize(p));
  roots = new Roots([base]);
});

afterAll(() => {
  rmSync(base, { recursive: true, force: true });
});

const io = {
  readSource: () => Promise.reject(new Error('no files')),
  readSpecInput: () => Promise.reject(new Error('no files')),
  takenImageFiles: new Set<string>(),
  now: () => new Date(NOW),
};

const ops: Operation[] = [
  { op: 'add_container', as: '$tela', width: 100, height: 60, background: '#FFFFFF' },
  {
    op: 'create_marking',
    as: '$o',
    container: '$tela',
    rect: { x: 20, y: 20, width: 60, height: 20 },
    annotation: { type: 'lib/outer', values: {} },
  },
];

/** Loads the project again (the catalog comes from the cache or is read) and renders the outer marking. */
async function render(): Promise<Raster> {
  const loaded = await loadProject(roots, await findProject(roots, 'telas'));
  const result = await runBatch(loaded, ops, io);
  expect(result.errors).toEqual([]);
  const refs = new Refs({ ...loaded, project: result.project });
  const id = (result.aliases.get('$o') as { id: string }).id;
  const marking = result.project.markings.find((m) => m.id === id)!;
  const out = await renderMarking(roots, refs, marking, { background: 'none' });
  return (await decodeImage(out.image.bytes)).raster;
}

const pixel = (raster: Raster, x: number, y: number): number[] => {
  const i = (y * raster.width + x) * 4;
  return [raster.data[i]!, raster.data[i + 1]!, raster.data[i + 2]!];
};

describe('render_marking of a composed component', () => {
  it('paints the inner colors, the one passed by the node provide included', async () => {
    const raster = await render();
    // The node sits at x = 10..50 of the 60 px marking: the fixed square, then the provided one.
    expect(pixel(raster, 15, 10)).toEqual([0, 0, 255]);
    expect(pixel(raster, 35, 10)).toEqual([255, 0, 0]);
    // outside the node nothing is drawn
    expect(pixel(raster, 5, 10)).not.toEqual([0, 0, 255]);
  });

  it('after the inner file changes on disk a new render paints the new color', async () => {
    expect(pixel(await render(), 15, 10)).toEqual([0, 0, 255]);
    writeFileSync(innerFile, JSON.stringify(inner('#00ff00')));
    // The stamp of the cache key is size + mtime: make sure the mtime moves even on a fast disk.
    const later = new Date(Date.now() + 5000);
    utimesSync(innerFile, later, later);
    const raster = await render();
    expect(pixel(raster, 15, 10)).toEqual([0, 255, 0]);
    expect(pixel(raster, 35, 10)).toEqual([255, 0, 0]);
  });
});
