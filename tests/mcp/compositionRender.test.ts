import {
  cpSync,
  mkdirSync,
  readFileSync,
  mkdtempSync,
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
import { renderMarking } from '../../mcp/renderImage';
import { NOW } from '../model/fixtures';

// CC5: `render_marking` of the `icon-button` of the example package `composition`: while loading, the
// spinner is painted in the content color the button passes by `provide` (not in the spinner's own
// `color`), and with `showBadge` the badge is painted.

const LIBRARY = join(__dirname, '../../examples/libraries/composition');
const LAYER = 'cccccccc-0000-4000-8000-000000000001';

let base: string;
let roots: Roots;

beforeAll(() => {
  base = mkdtempSync(join(tmpdir(), 'mapping-composition-'));
  const dir = join(base, 'telas');
  mkdirSync(join(dir, 'images'), { recursive: true });
  cpSync(LIBRARY, join(dir, 'specs', 'composition'), { recursive: true });
  const specText = JSON.stringify(
    JSON.parse(readFileSync(join(LIBRARY, 'composition.spec.json'), 'utf8')),
  );
  const parsed = parseSpecText(specText);
  if (!parsed.ok) throw new Error(`invalid spec: ${JSON.stringify(parsed)}`);
  let p = createProject({
    name: 'Telas',
    now: NOW,
    firstLayer: { id: LAYER, name: 'Layer 1', color: '#D32F2F' },
  });
  p = applySpecialization(p, parsed.spec, { packageSpecName: 'composition.spec.json' });
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

async function render(values: Record<string, string>): Promise<Raster> {
  const loaded = await loadProject(roots, await findProject(roots, 'telas'));
  const ops: Operation[] = [
    { op: 'add_container', as: '$tela', width: 100, height: 80, background: '#FFFFFF' },
    {
      op: 'create_marking',
      as: '$b',
      container: '$tela',
      rect: { x: 20, y: 20, width: 40, height: 40 },
      annotation: { type: 'composition/icon-button', values },
    },
  ];
  const result = await runBatch(loaded, ops, io);
  expect(result.errors).toEqual([]);
  const refs = new Refs({ ...loaded, project: result.project });
  const id = (result.aliases.get('$b') as { id: string }).id;
  const marking = result.project.markings.find((m) => m.id === id)!;
  const out = await renderMarking(roots, refs, marking, { background: 'none' });
  return (await decodeImage(out.image.bytes)).raster;
}

const pixel = (raster: Raster, x: number, y: number): number[] => {
  const i = (y * raster.width + x) * 4;
  return [raster.data[i]!, raster.data[i + 1]!, raster.data[i + 2]!];
};

describe('render_marking of the composition icon-button', () => {
  it('loading paints the spinner in the provided content color, not its own color', async () => {
    const raster = await render({ state: 'loading' });
    // the ring's left edge at mid-height: #111827 from `provide`, never the spinner's #2563EB
    expect(pixel(raster, 9, 20)).toEqual([17, 24, 39]);
  });

  it('showBadge paints the badge on the top-end corner', async () => {
    const without = await render({});
    expect(pixel(without, 32, 2)).not.toEqual([220, 38, 38]);
    const raster = await render({ showBadge: 'yes', count: '3' });
    expect(pixel(raster, 32, 2)).toEqual([220, 38, 38]);
  });
});
