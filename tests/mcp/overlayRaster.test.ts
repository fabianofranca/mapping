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
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  applySpecialization,
  createProject,
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
import { renderContainer, renderMarking } from '../../mcp/renderImage';
import { NOW } from '../model/fixtures';

// DG4 (#2915): `overlay: true` draws the node above the child markings of the same container in the MCP's
// PNG (`render_marking` and `render_container`). The Scroll of the `drawing-fidelity` package has a 4 × 80
// scrollbar on its right edge with the flag; a Block as wide as the Scroll covers that area.

const LAYER = 'dddddddd-0000-4000-8000-000000000001';
const PACKAGE = join(__dirname, '../../examples/libraries/drawing-fidelity');
const SCROLLBAR = [0x6b, 0x72, 0x80];
const BLOCK = [0x86, 0xef, 0xac];

let base: string;
let roots: Roots;

/** The project folder `<name>` with the package copied to `specs/drawing-fidelity/`. */
function setup(name: string, overlay: boolean): void {
  const dir = join(base, name);
  const lib = join(dir, 'specs', 'drawing-fidelity');
  mkdirSync(join(dir, 'images'), { recursive: true });
  cpSync(PACKAGE, lib, { recursive: true });
  const scroll = join(lib, 'components', 'scroll.json');
  const body = readFileSync(scroll, 'utf8');
  if (!body.includes('"overlay": true')) throw new Error('the Scroll lost its overlay');
  if (!overlay)
    writeFileSync(scroll, body.replace('"overlay": true', '"overlay": false'));
  const parsed = parseSpecText(
    readFileSync(join(lib, 'drawing-fidelity.spec.json'), 'utf8'),
  );
  if (!parsed.ok) throw new Error(`invalid spec: ${JSON.stringify(parsed)}`);
  let p = createProject({
    name,
    now: NOW,
    firstLayer: { id: LAYER, name: 'Layer 1', color: '#D32F2F' },
  });
  p = applySpecialization(p, parsed.spec, {
    packageSpecName: 'drawing-fidelity.spec.json',
  });
  writeFileSync(join(dir, 'mapping.json'), serialize(p));
}

beforeAll(() => {
  base = mkdtempSync(join(tmpdir(), 'mapping-overlay-'));
  setup('with', true);
  setup('without', false);
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

/** A Scroll with a green Block in its slot: the Block is as wide as the Scroll, over the scrollbar. */
const ops: Operation[] = [
  { op: 'add_container', as: '$tela', width: 220, height: 260, background: '#FFFFFF' },
  {
    op: 'create_marking',
    as: '$s',
    container: '$tela',
    rect: { x: 10, y: 10, width: 200, height: 240 },
    annotation: { type: 'drawing-fidelity/scroll', values: {} },
  },
  {
    op: 'create_marking',
    as: '$b',
    container: '$tela',
    inside: '$s',
    rect: { x: 0, y: 0, width: 200, height: 48 },
    annotation: { type: 'drawing-fidelity/block', values: { color: 'green' } },
  },
];

const pixel = (raster: Raster, x: number, y: number): number[] => {
  const i = (y * raster.width + x) * 4;
  return [raster.data[i]!, raster.data[i + 1]!, raster.data[i + 2]!];
};

async function open(name: string) {
  const loaded = await loadProject(roots, await findProject(roots, name));
  const result = await runBatch(loaded, ops, io);
  expect(result.errors).toEqual([]);
  const refs = new Refs({ ...loaded, project: result.project });
  const scroll = result.project.markings.find(
    (m) => m.id === (result.aliases.get('$s') as { id: string }).id,
  )!;
  const container = result.project.containers[0]!;
  return { refs, scroll, container };
}

/** The scrollbar sits at x = 196..200 of the Scroll (right: 4), y = 16..96, and the Block covers y = 0..48. */
const AT_SCROLLBAR = { x: 10 + 200 - 4 - 2, y: 10 + 30 };
const AT_BLOCK = { x: 10 + 100, y: 10 + 20 };

describe('render_marking and render_container with overlay', () => {
  it('render_marking draws the scrollbar above the Block that covers it', async () => {
    const { refs, scroll } = await open('with');
    const out = await renderMarking(roots, refs, scroll, { background: 'none' });
    const raster = (await decodeImage(out.image.bytes)).raster;
    // The marking's own crop starts at the Scroll's corner.
    expect(pixel(raster, AT_SCROLLBAR.x - 10, AT_SCROLLBAR.y - 10)).toEqual(SCROLLBAR);
    expect(pixel(raster, AT_BLOCK.x - 10, AT_BLOCK.y - 10)).toEqual(BLOCK);
  });

  it('render_container draws the scrollbar above the Block that covers it', async () => {
    const { refs, container } = await open('with');
    const out = await renderContainer(roots, refs, container, { background: 'none' });
    const raster = (await decodeImage(out.image.bytes)).raster;
    expect(pixel(raster, AT_SCROLLBAR.x, AT_SCROLLBAR.y)).toEqual(SCROLLBAR);
    expect(pixel(raster, AT_BLOCK.x, AT_BLOCK.y)).toEqual(BLOCK);
  });

  it('without overlay the Block covers the scrollbar in both', async () => {
    const { refs, scroll, container } = await open('without');
    const marking = await renderMarking(roots, refs, scroll, { background: 'none' });
    const whole = await renderContainer(roots, refs, container, { background: 'none' });
    const cropped = (await decodeImage(marking.image.bytes)).raster;
    const full = (await decodeImage(whole.image.bytes)).raster;
    expect(pixel(cropped, AT_SCROLLBAR.x - 10, AT_SCROLLBAR.y - 10)).toEqual(BLOCK);
    expect(pixel(full, AT_SCROLLBAR.x, AT_SCROLLBAR.y)).toEqual(BLOCK);
  });

  it('draws the part of the scrollbar that is past the Block too', async () => {
    const { refs, container } = await open('with');
    const out = await renderContainer(roots, refs, container, { background: 'none' });
    const raster = (await decodeImage(out.image.bytes)).raster;
    // Block covers y 0..48 of the Scroll; the scrollbar runs to y 96: the part below is plain.
    expect(pixel(raster, AT_SCROLLBAR.x, 10 + 80)).toEqual(SCROLLBAR);
  });
});
