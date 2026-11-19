import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  addContainer,
  applySpecialization,
  createProject,
  parseSpec,
  serialize,
  setContainerDensity,
} from '../../src/model';
import { runBatch } from '../../mcp/batch';
import type { Operation } from '../../mcp/operations';
import { Roots } from '../../mcp/paths';
import { findProject, loadProject, type LoadedProject } from '../../mcp/projects';
import { NOW } from '../model/fixtures';
import {
  FIT_COMPONENTS,
  FIT_SPEC_ID,
  FIT_SPEC_JSON,
  LONG_LABEL,
} from '../model/fitFixtures';
import { errorOf, ok } from './proposalSupport';
import { connect, type Connection } from './workspace';

// FM3 (decisions 7 to 10 of #2089): `measure_component` measures a component for given values, in units
// and pixels, with no marking and no batch; it gives what `fit_marking` gives with room.

const IMAGE = 'bbbbbbbb-0000-4000-8000-000000000001';
const DENSE = 'bbbbbbbb-0000-4000-8000-000000000003';
const LAYER = 'cccccccc-0000-4000-8000-000000000001';

let base: string;
let roots: Roots;
let loaded: LoadedProject;
let mcp: Connection;

/** A project folder with the fit library (and the extra spec keys) applied, and a container of each density. */
function writeProject(name: string, extra: Record<string, unknown>): void {
  const dir = join(base, name);
  mkdirSync(join(dir, 'specs', 'fit', 'components'), { recursive: true });
  // The fit library plus a type with no component, to measure nothing.
  const specJson = {
    ...FIT_SPEC_JSON,
    ...extra,
    layers: [
      ...FIT_SPEC_JSON.layers,
      {
        id: 'notes',
        name: 'Notes',
        color: '#00796B',
        annotationTypes: [{ id: 'note', name: 'Note', fields: [] }],
      },
    ],
  };
  const parsed = parseSpec(specJson);
  if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
  writeFileSync(join(dir, 'specs', 'fit', 'fit.spec.json'), JSON.stringify(specJson));
  for (const [id, component] of Object.entries(FIT_COMPONENTS)) {
    writeFileSync(
      join(dir, 'specs', 'fit', 'components', `${id}.json`),
      JSON.stringify(component),
    );
  }
  let p = createProject({
    name: 'Screens',
    now: NOW,
    firstLayer: { id: LAYER, name: 'Layer 1', color: '#D32F2F' },
  });
  p = addContainer(p, { id: IMAGE, file: 'images/foto.png', width: 600, height: 400 });
  p = addContainer(p, { id: DENSE, file: 'images/dense.png', width: 1800, height: 1200 });
  p = setContainerDensity(p, DENSE, 3);
  p = applySpecialization(p, parsed.spec, { packageSpecName: 'fit.spec.json' });
  writeFileSync(join(dir, 'mapping.json'), serialize(p));
}

beforeAll(async () => {
  base = mkdtempSync(join(tmpdir(), 'mapping-measure-'));
  writeProject('telas', {});
  writeProject('fonted', { fonts: [{ family: 'Acme', file: 'fonts/Acme.ttf' }] });
  mkdirSync(join(base, 'fonted', 'specs', 'fit', 'fonts'), { recursive: true });
  cpSync(
    'mcp/fonts/MappingMono-Bold.ttf',
    join(base, 'fonted', 'specs', 'fit', 'fonts', 'Acme.ttf'),
  );
  roots = new Roots([base]);
  loaded = await loadProject(roots, await findProject(roots, 'telas'));
  mcp = await connect([base]);
});

afterAll(async () => {
  await mcp.close();
  rmSync(base, { recursive: true, force: true });
});

interface Measure {
  type: { specId: string; id: string; name: string };
  units: { width: number; height: number };
  pixels: { width: number; height: number };
  density: number;
  follows: { width: boolean; height: boolean };
  approximate: boolean;
  hint?: string;
  messages?: string[];
}

const measure = (type: string, extra: Record<string, unknown> = {}) =>
  mcp.call<Measure>('measure_component', {
    project: 'telas',
    specId: FIT_SPEC_ID,
    type,
    ...extra,
  });

describe('measure_component: the response', () => {
  it('gives the units, pixels, density and follows, and creates nothing', async () => {
    const r = ok(await measure('fit-hug', { values: { label: LONG_LABEL } }));
    expect(r.type).toEqual({ specId: FIT_SPEC_ID, id: 'fit-hug', name: 'fit-hug' });
    expect(r.follows).toEqual({ width: true, height: true });
    expect(r.density).toBe(1);
    expect(r.pixels).toEqual(r.units);
    expect(r.hint).toBeUndefined();
    expect(r.approximate).toBe(true);
    const again = await loadProject(roots, await findProject(roots, 'telas'));
    expect(again.project.markings).toEqual([]);
  });

  it('accepts the type by name and the container by id, with the density', async () => {
    const r = ok(
      await measure('FIT-HUG', { values: { label: LONG_LABEL }, container: DENSE }),
    );
    expect(r.type.id).toBe('fit-hug');
    expect(r.density).toBe(3);
    expect(r.pixels.width).toBeGreaterThanOrEqual(r.units.width * 3);
  });

  it('approximate is false when the project has a library font', async () => {
    const r = ok(
      await mcp.call<Measure>('measure_component', {
        project: 'fonted',
        specId: FIT_SPEC_ID,
        type: 'fit-hug',
        values: { label: LONG_LABEL },
      }),
    );
    expect(r.approximate).toBe(false);
  });

  it('a fixed component answers with its size, follows false and a hint', async () => {
    const r = ok(await measure('fit-plain', { size: { width: 90 } }));
    expect(r.follows).toEqual({ width: false, height: false });
    expect(r.units).toEqual({ width: 90, height: 40 });
    expect(r.hint).toContain('not-fittable');
  });

  it('size is the base of a kept axis', async () => {
    const r = ok(
      await measure('fit-button', { values: { label: 'Ok' }, size: { width: 200 } }),
    );
    expect(r.follows).toEqual({ width: false, height: true });
    expect(r.units.width).toBe(200);
  });
});

describe('measure_component: the errors', () => {
  it('not-found for a specialization that is not applied and for a container', async () => {
    const spec = await mcp.call('measure_component', {
      project: 'telas',
      specId: 'other',
      type: 'fit-hug',
    });
    expect(errorOf(spec).code).toBe('not-found');
    const container = await measure('fit-hug', { container: 'zzzzzzzz' });
    expect(errorOf(container).code).toBe('not-found');
  });

  it('unknown-type, unknown-field and invalid-value', async () => {
    expect(errorOf(await measure('missing')).code).toBe('unknown-type');
    expect(errorOf(await measure('fit-hug', { values: { nope: 'x' } })).code).toBe(
      'unknown-field',
    );
    expect(errorOf(await measure('fit-hug', { values: { label: 5 } })).code).toBe(
      'invalid-value',
    );
  });

  it('invalid-arguments for a type without a component', async () => {
    expect(errorOf(await measure('note')).code).toBe('invalid-arguments');
  });
});

describe('measure_component equals fit_marking (decision 10)', () => {
  const edge = (density: number) => (density === 3 ? DENSE : IMAGE);

  for (const density of [1, 3]) {
    for (const typeId of ['fit-hug', 'fit-button', 'fit-scaled']) {
      it(`${typeId} at density ${density}`, async () => {
        const values = { label: LONG_LABEL, tall: null };
        const result = await runBatch(
          loaded,
          [
            {
              op: 'create_marking',
              as: '$b',
              container: edge(density),
              rect: {
                x: 20 * density,
                y: 20 * density,
                width: 200 * density,
                height: 100 * density,
              },
              annotation: { type: `${FIT_SPEC_ID}/${typeId}`, values },
            } as Operation,
            { op: 'fit_marking', marking: '$b' } as Operation,
          ],
          {
            readSource: () => Promise.reject(new Error('no files')),
            readSpecInput: () => Promise.reject(new Error('no files')),
            takenImageFiles: new Set<string>(),
            now: () => new Date(NOW),
          },
        );
        expect(result.errors).toEqual([]);
        const id = (result.aliases.get('$b') as { id: string }).id;
        const rect = result.project.markings.find((m) => m.id === id)!.rect;
        const r = ok(
          await measure(typeId, {
            values: { label: LONG_LABEL },
            container: edge(density),
            size: { width: 200, height: 100 },
          }),
        );
        expect({ width: rect.width, height: rect.height }).toEqual(r.pixels);
      });
    }
  }
});
