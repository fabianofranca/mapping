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
  addAnnotation,
  addContainer,
  createMarking,
  applySpecialization,
  createProject,
  loadSpecComponents,
  measureComponentSize,
  parseSpec,
  serialize,
  setContainerDensity,
} from '../../src/model';
import { runBatch } from '../../mcp/batch';
import { createFontBook, measurerFor } from '../../mcp/image/textMeasurer';
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
const MARKING = 'dddddddd-0000-4000-8000-000000000001';
const ANNOTATION = 'eeeeeeee-0000-4000-8000-000000000001';
const TARGET = 'mapping://telas/a/eeeeeeee';

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
        annotationTypes: [
          { id: 'note', name: 'Note', fields: [] },
          {
            id: 'acme-label',
            name: 'Acme label',
            component: 'components/acme-label.json',
            fields: [{ key: 'label', type: 'string', default: 'Ok' }],
          },
          {
            id: 'inter-label',
            name: 'Inter label',
            component: 'components/inter-label.json',
            fields: [{ key: 'label', type: 'string', default: 'Ok' }],
          },
        ],
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
  // A `hug` button whose text is set in `Acme` (a library font in `fonted`, a plain name in `telas`).
  writeFileSync(
    join(dir, 'specs', 'fit', 'components', 'acme-label.json'),
    JSON.stringify({
      format: 'mapping-component',
      formatVersion: 4,
      id: 'acme-label',
      name: 'acme-label',
      size: { width: 120, height: 40 },
      sizing: { width: 'hug', height: 'hug' },
      template: {
        type: 'frame',
        layout: { type: 'column', padding: 8 },
        children: [
          {
            type: 'text',
            name: 'label',
            text: { $field: 'label', default: '' },
            width: 'hug',
            height: 'hug',
            font: { family: 'Acme', size: 14, lineHeight: 20 },
          },
        ],
      },
    }),
  );
  // The same button in a stack that is not a library font: still approximate (stage #2825, decision 5).
  writeFileSync(
    join(dir, 'specs', 'fit', 'components', 'inter-label.json'),
    JSON.stringify({
      format: 'mapping-component',
      formatVersion: 4,
      id: 'inter-label',
      name: 'inter-label',
      size: { width: 120, height: 40 },
      sizing: { width: 'hug', height: 'hug' },
      template: {
        type: 'frame',
        layout: { type: 'column', padding: 8 },
        children: [
          {
            type: 'text',
            name: 'label',
            text: { $field: 'label', default: '' },
            width: 'hug',
            height: 'hug',
            font: { family: 'Inter, sans-serif', size: 14, lineHeight: 20 },
          },
        ],
      },
    }),
  );
  let p = createProject({
    name: 'Screens',
    now: NOW,
    firstLayer: { id: LAYER, name: 'Layer 1', color: '#D32F2F' },
  });
  p = addContainer(p, { id: IMAGE, file: 'images/foto.png', width: 600, height: 400 });
  p = addContainer(p, { id: DENSE, file: 'images/dense.png', width: 1800, height: 1200 });
  p = setContainerDensity(p, DENSE, 3);
  // A free annotation that a `ref` of the list type can point to.
  p = createMarking(p, {
    id: MARKING,
    containerId: IMAGE,
    rect: { x: 10, y: 10, width: 50, height: 50 },
  });
  p = addAnnotation(p, {
    id: ANNOTATION,
    markingId: MARKING,
    layerId: LAYER,
    entries: [{ id: 'ffffffff-0000-4000-8000-000000000001', key: 'note', value: 'x' }],
  });
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
    // Stage #2825, decision 5: a text in the default font (Mapping Sans) is exact.
    expect(r.approximate).toBe(false);
    const again = await loadProject(roots, await findProject(roots, 'telas'));
    expect(again.project.markings).toHaveLength(1);
    expect(again.project.annotations).toHaveLength(1);
  });

  it('accepts the type by name and the container by id, with the density', async () => {
    const r = ok(
      await measure('FIT-HUG', { values: { label: LONG_LABEL }, container: DENSE }),
    );
    expect(r.type.id).toBe('fit-hug');
    expect(r.density).toBe(3);
    expect(r.pixels.width).toBeGreaterThanOrEqual(r.units.width * 3);
  });

  const inFonted = async (type: string) =>
    ok(
      await mcp.call<Measure>('measure_component', {
        project: 'fonted',
        specId: FIT_SPEC_ID,
        type,
        values: { label: LONG_LABEL },
      }),
    );

  // Stage #2267, decision 4: `approximate` follows the families the text is measured with, not the project's fonts.
  it('approximate is false when the text is set in a library font', async () => {
    expect((await inFonted('acme-label')).approximate).toBe(false);
  });

  it('approximate is false in a project with a library font when the text is in the default font', async () => {
    expect((await inFonted('fit-hug')).approximate).toBe(false);
  });

  it('approximate stays true for a stack that does not start with a library font or the default one (Inter, sans-serif)', async () => {
    expect((await inFonted('inter-label')).approximate).toBe(true);
    expect(
      ok(await measure('inter-label', { values: { label: LONG_LABEL } })).approximate,
    ).toBe(true);
  });

  it('approximate is true for a family that is not a library font, and false for a component with no text', async () => {
    const r = ok(await measure('acme-label', { values: { label: LONG_LABEL } }));
    expect(r.approximate).toBe(true);
    // A slot-only component measures no text.
    const noText = ok(await measure('fit-row-none'));
    expect(noText.approximate).toBe(false);
  });

  it('a slot component that follows the content keeps its size and says it is the empty slots', async () => {
    const r = ok(await measure('fit-row-none'));
    expect(r.follows).toEqual({ width: false, height: true });
    expect(r.hint).toMatch(/empty/i);
    expect(r.hint).toMatch(/born at the component's `size`/);
    expect(r.hint).toMatch(/Arrange|fit_marking/);
    const nominal = ok(await measure('fit-slot-px'));
    expect(nominal.hint).toBeUndefined();
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

describe('measure_component: table and ref values', () => {
  const rows = (n: number) => Array.from({ length: n }, (_, i) => ({ text: `Row ${i}` }));

  it('measures a list from the rows of its table', async () => {
    const none = ok(await measure('fit-list'));
    const six = ok(await measure('fit-list', { values: { items: rows(6) } }));
    expect(six.units.height).toBeGreaterThan(none.units.height);
    expect(six.follows).toEqual({ width: false, height: true });
  });

  it('takes `ref` values like create_marking: a field and a cell, by `mapping://` reference', async () => {
    const r = ok(
      await measure('fit-list', {
        values: {
          target: { annotation: TARGET, entry: 'note' },
          items: [
            { text: 'One', link: { annotation: TARGET, entry: 'note' } },
            { text: 'Two' },
          ],
        },
      }),
    );
    expect(r.units.height).toBeGreaterThan(40);
  });

  it('a reference that does not exist or an alias that is not in a batch fails by its code', async () => {
    expect(
      errorOf(
        await measure('fit-list', {
          values: { target: { annotation: 'mapping://telas/a/ffffffff', entry: 'note' } },
        }),
      ).code,
    ).toBe('not-found');
    expect(
      errorOf(await measure('fit-list', { values: { target: { annotation: '$a' } } }))
        .code,
    ).toBe('unknown-alias');
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

// PC2 (#2973, stage #2928, decisions 1, 2 and 5): `measure_component` of a package folder (`path` + `project`)
// measures a working copy with its own components and fonts over the project, applying nothing.

const PF = 'tests/fixtures/preview-fonts';
const ROBOTO = 'tests/fixtures/fonts/roboto-latin-500-normal.woff';
const PF_LABEL = 'Mapping preview';

function pfPackage(name: string, withFont: boolean, edit?: (s: Json) => void): string {
  const pkg = join(base, name);
  mkdirSync(join(pkg, 'fonts'), { recursive: true });
  cpSync(join(PF, 'components'), join(pkg, 'components'), { recursive: true });
  const spec = JSON.parse(
    readFileSync(join(PF, 'preview-fonts.spec.json'), 'utf8'),
  ) as Json;
  edit?.(spec);
  writeFileSync(join(pkg, 'preview-fonts.spec.json'), JSON.stringify(spec));
  if (withFont) cpSync(ROBOTO, join(pkg, 'fonts', 'Roboto-Medium.woff'));
  return pkg;
}

type Json = Record<string, unknown>;

/** A project that applies `pkg` (an older copy when `edit` strips the fonts), copied into its `specs/`. */
function pfProject(name: string, pkg: string | null, edit?: (s: Json) => void): void {
  const dir = join(base, name);
  mkdirSync(dir, { recursive: true });
  let p = createProject({
    name,
    now: NOW,
    firstLayer: { id: LAYER, name: 'Layer 1', color: '#D32F2F' },
  });
  if (pkg !== null) {
    const copy = join(dir, 'specs', 'preview-fonts');
    mkdirSync(copy, { recursive: true });
    cpSync(join(pkg, 'components'), join(copy, 'components'), { recursive: true });
    const spec = JSON.parse(
      readFileSync(join(pkg, 'preview-fonts.spec.json'), 'utf8'),
    ) as Json;
    edit?.(spec);
    writeFileSync(join(copy, 'preview-fonts.spec.json'), JSON.stringify(spec));
    const parsed = parseSpec(spec);
    if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
    p = applySpecialization(p, parsed.spec, {
      packageSpecName: 'preview-fonts.spec.json',
    });
  }
  p = addContainer(p, { id: IMAGE, file: 'images/foto.png', width: 600, height: 400 });
  p = addContainer(p, { id: DENSE, file: 'images/dense.png', width: 1800, height: 1200 });
  p = setContainerDensity(p, DENSE, 3);
  writeFileSync(join(dir, 'mapping.json'), serialize(p));
}

describe('measure_component: a package folder (path + project)', () => {
  const run = (args: Record<string, unknown>) =>
    mcp.call<Measure>('measure_component', {
      type: 'tag',
      values: { label: PF_LABEL },
      ...args,
    });

  beforeAll(() => {
    pfPackage('pf-pkg', true);
    pfPackage('pf-pkg-nofont', false);
    pfProject('pf-plain', null);
    // The applied copy is an older one, with no `fonts`.
    pfProject('pf-old', join(base, 'pf-pkg'), (s) => {
      delete s.fonts;
    });
  });

  it('(a) measures with the folder fonts, exactly, as the same project with the library applied in memory', async () => {
    const r = ok(await run({ project: 'pf-plain', path: join(base, 'pf-pkg') }));
    expect(r.approximate).toBe(false);
    const parsed = parseSpec(
      JSON.parse(readFileSync(join(PF, 'preview-fonts.spec.json'), 'utf8')),
    );
    if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
    const spec = parsed.spec;
    const file = 'specs/preview-fonts/preview-fonts.spec.json';
    const project = applySpecialization(
      (await loadProject(roots, await findProject(roots, 'pf-plain'))).project,
      spec,
      { packageSpecName: 'preview-fonts.spec.json' },
    );
    const texts = new Map([
      [
        'specs/preview-fonts/components/tag.json',
        readFileSync(join(PF, 'components', 'tag.json'), 'utf8'),
      ],
    ]);
    const catalog = new Map([
      [spec.id, loadSpecComponents(spec, file, spec.version, (path) => texts.get(path))],
    ]);
    const book = createFontBook([
      {
        family: 'Roboto',
        weight: '500',
        style: 'normal',
        path: 'x',
        bytes: new Uint8Array(readFileSync(ROBOTO)).buffer as ArrayBuffer,
      },
    ]);
    const expected = measureComponentSize(
      project,
      catalog,
      {
        specId: spec.id,
        typeId: 'tag',
        containerId: null,
        values: { label: PF_LABEL },
        size: {},
      },
      measurerFor(book),
    );
    expect(r.units).toEqual(expected.units);
  });

  it('(b) without the font file in the folder it is approximate, with another width', async () => {
    const withFont = ok(await run({ project: 'pf-plain', path: join(base, 'pf-pkg') }));
    const without = ok(
      await run({ project: 'pf-plain', path: join(base, 'pf-pkg-nofont') }),
    );
    expect(without.approximate).toBe(true);
    expect(without.units.width).not.toBe(withFont.units.width);
  });

  it('(c) path measures the folder copy, project + specId still the applied one', async () => {
    const byPath = ok(await run({ project: 'pf-old', path: join(base, 'pf-pkg') }));
    expect(byPath.approximate).toBe(false);
    const applied = ok(
      await run({
        project: 'pf-old',
        specId: 'preview-fonts',
        values: { label: PF_LABEL },
      }),
    );
    expect(applied.approximate).toBe(true);
    expect(applied.units.width).not.toBe(byPath.units.width);
  });

  it('(d) path with specId, and path without project, are invalid-arguments', async () => {
    const both = await run({
      project: 'pf-plain',
      path: join(base, 'pf-pkg'),
      specId: 'preview-fonts',
    });
    expect(errorOf(both).code).toBe('invalid-arguments');
    const noProject = await run({ path: join(base, 'pf-pkg') });
    expect(errorOf(noProject).code).toBe('invalid-arguments');
  });

  it('(e) container gives that container density, and nothing is written', async () => {
    const r = ok(
      await run({ project: 'pf-plain', path: join(base, 'pf-pkg'), container: DENSE }),
    );
    expect(r.density).toBe(3);
    const again = await loadProject(roots, await findProject(roots, 'pf-plain'));
    expect(again.project.specializations).toHaveLength(0);
  });
});
