// Component variables (formatVersion 4, stage #1504, VL1): the MCP accepts `let` and `$var` in
// `validate_library` (real server, over stdio) and the `render_marking` of a component with variables
// comes out the same as that of the same component written by hand without them. The errors give the name and the path of the use.
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
import { findProject, loadProject, type LoadedProject } from '../../mcp/projects';
import { renderMarking } from '../../mcp/renderImage';
import { NOW } from '../model/fixtures';
import { ok } from './proposalSupport';
import { connect, type Connection } from './workspace';

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
        { id: 'card', name: 'Card', component: 'components/card.json', fields: [] },
      ],
    },
  ],
};

const RED = '#D32F2F';
const BLUE = '#1976D2';

type Doc = Record<string, unknown>;

/** The same component written by hand, without `let` or `$var`. */
function byHand(): Doc {
  return {
    format: 'mapping-component',
    formatVersion: 4,
    id: 'card',
    name: 'Card',
    size: { width: 300, height: 120 },
    template: {
      type: 'frame',
      fill: '#FFFFFF',
      layout: { type: 'none' },
      children: [
        {
          type: 'frame',
          anchors: { left: 20, top: 20 },
          width: 110,
          height: 20,
          layout: { type: 'column' },
          children: [
            {
              type: 'repeat',
              count: 4,
              direction: 'row',
              gap: 10,
              template: {
                type: 'frame',
                width: 20,
                height: 20,
                fill: { $if: { $lt: [{ $field: '$index' }, 2] }, then: RED, else: BLUE },
              },
            },
          ],
        },
        {
          type: 'frame',
          anchors: { left: 170, top: 20 },
          width: 60,
          height: 40,
          layout: { type: 'none' },
          children: [
            {
              type: 'rect',
              anchors: { left: 0, top: 0 },
              width: 60,
              height: 40,
              fill: '#2E7D32',
            },
          ],
        },
        {
          type: 'rect',
          anchors: { left: 240, top: 20 },
          width: 40,
          height: 40,
          fill: '#FF9800',
        },
        {
          type: 'rect',
          anchors: { left: 0, top: 100 },
          width: { $mul: [{ $size: 'width' }, 0.5] },
          height: 10,
          fill: '#6A1B9A',
        },
      ],
    },
  };
}

let base: string;
let mcp: Connection;

const LET_SCRIPT = 'scripts/testing/let.mjs';

/** Writes `components/card.json` in `lib`: the given one, or (`null`) the one from `let.mjs` with the error case, if any. */
function writeCard(lib: string, card: Doc | null, kind?: string): void {
  mkdirSync(join(lib, 'components'), { recursive: true });
  if (card !== null) {
    writeFileSync(join(lib, 'components', 'card.json'), JSON.stringify(card));
    return;
  }
  const args: string[] = [LET_SCRIPT, lib];
  if (kind !== undefined) args.push(kind);
  execFileSync(process.execPath, args);
}

/** A project at `<base>/<name>` with the `lib` library of a `card` type. */
function writeProject(name: string, card: Doc | null): void {
  const dir = join(base, name);
  const lib = join(dir, 'specs', 'lib');
  mkdirSync(lib, { recursive: true });
  writeFileSync(join(lib, 'lib.spec.json'), JSON.stringify(SPEC));
  writeCard(lib, card);
  const parsed = parseSpecText(readFileSync(join(lib, 'lib.spec.json'), 'utf8'));
  if (!parsed.ok) throw new Error(`invalid spec: ${JSON.stringify(parsed)}`);
  let p = createProject({
    name,
    now: NOW,
    firstLayer: { id: LAYER, name: 'Camada 1', color: '#D32F2F' },
  });
  p = applySpecialization(p, parsed.spec, { packageSpecName: 'lib.spec.json' });
  writeFileSync(join(dir, 'mapping.json'), serialize(p));
}

/** A copy of the `lib` library with the card from `let.mjs` (and the error case), for `validate_library`. */
function writeLibrary(name: string, kind?: string): void {
  const lib = join(base, 'libraries', name);
  mkdirSync(lib, { recursive: true });
  writeFileSync(join(lib, 'lib.spec.json'), JSON.stringify(SPEC));
  writeCard(lib, null, kind);
}

const io = {
  readSource: () => Promise.reject(new Error('no files')),
  readSpecInput: () => Promise.reject(new Error('no files')),
  takenImageFiles: new Set<string>(),
  now: () => new Date(NOW),
};

const OPERATIONS: Operation[] = [
  { op: 'add_container', as: '$screen', width: 340, height: 160, background: '#FFFFFF' },
  {
    op: 'create_marking',
    as: '$card',
    container: '$screen',
    rect: { x: 20, y: 20, width: 300, height: 120 },
    annotation: { type: 'lib/card', values: {} },
  },
];

async function render(name: string) {
  const roots = new Roots([base]);
  const loaded: LoadedProject = await loadProject(roots, await findProject(roots, name));
  const result = await runBatch(loaded, OPERATIONS, io);
  expect(result.errors).toEqual([]);
  const refs = new Refs({ ...loaded, project: result.project });
  const marking = result.project.markings.find(
    (m) => m.id === (result.aliases.get('$card') as { id: string }).id,
  )!;
  const out = await renderMarking(roots, refs, marking, { padding: 0, zoom: 1 });
  return { out, raster: (await decodeImage(out.image.bytes)).raster };
}

const hex = (r: Raster, x: number, y: number): string => {
  const i = (y * r.width + x) * 4;
  return [0, 1, 2]
    .map((k) => r.data[i + k]!.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
};

beforeAll(async () => {
  base = mkdtempSync(join(tmpdir(), 'mapping-let-'));
  writeProject('with-let', null);
  writeProject('without-let', byHand());
  writeLibrary('valid');
  for (const kind of ['indefinida', 'ciclo', 'tipo', 'nome', 'v3'])
    writeLibrary(kind, kind);
  mcp = await connect([base]);
});

afterAll(async () => {
  await mcp?.close();
  rmSync(base, { recursive: true, force: true });
});

interface Validated {
  valid: boolean;
  errors: { file: string; path: string; message: string; severity: string }[];
  warnings: { message: string }[];
}

describe('validate_library with let and $var (real server)', () => {
  it('accepts the library with variables, without error or warning (level 3)', async () => {
    const result = ok(
      await mcp.call<Validated>('validate_library', { path: 'libraries/valid' }),
    );
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it.each([
    ['indefinida', 'template.children[0].children[0].gap', 'undefined variable: space'],
    ['ciclo', 'template.let.a', 'variable cycle: a → b → a'],
    ['nome', 'template.let.Gap', 'expected a variable name ([a-z][a-zA-Z0-9]*)'],
    [
      'tipo',
      'template.children[0].children[0].gap.$var(gap).$mul[0]',
      'must be a number',
    ],
  ])('%s: the error and the path of the use', async (name, path, message) => {
    const result = ok(
      await mcp.call<Validated>('validate_library', { path: `libraries/${name}` }),
    );
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual([
      { file: 'components/card.json', path, message, severity: 'error' },
    ]);
  });

  it('v3: let and $var are only allowed with formatVersion 4', async () => {
    const result = ok(
      await mcp.call<Validated>('validate_library', { path: 'libraries/v3' }),
    );
    expect(result.valid).toBe(false);
    const paths = result.errors.map((e) => e.path);
    expect(paths).toContain('template.let');
    expect(paths).toContain('template.children[0].children[0].template.let');
    expect(paths).toContain('template.children[0].children[0].gap');
    expect(result.errors.every((e) => e.message.includes('formatVersion 4'))).toBe(true);
  });
});

describe('get_component of a component with let and $var', () => {
  it('shows the file as it is, with let and $var (the substitution is only when reading the drawing)', async () => {
    const got = ok(
      await mcp.call<{ component: { template: Doc } | null }>('get_component', {
        path: 'libraries/valid',
        type: 'card',
      }),
    );
    const template = got.component?.template as Doc;
    expect(Object.keys(template.let as Doc)).toEqual(['gap', 'tone', 'dot', 'half']);
    expect(JSON.stringify(got.component)).toContain('{"$var":"gap"}');
  });
});

describe('render_marking of a component with let and $var', () => {
  it('the PNG equals that of the component written without variables', async () => {
    const withVars = await render('with-let');
    const without = await render('without-let');
    expect(withVars.out.json).toMatchObject({ width: 300, height: 120 });
    expect(
      Buffer.from(withVars.out.image.bytes).equals(Buffer.from(without.out.image.bytes)),
    ).toBe(true);
  });

  it('the $index is that of the use row, the inner one hides the outer one and $size is the instance one', async () => {
    const { raster } = await render('with-let');
    // the 20 px squares from (20, 20), gap 10: red, red, blue, blue
    expect([30, 60, 90, 120].map((x) => hex(raster, x, 30))).toEqual([
      'D32F2F',
      'D32F2F',
      '1976D2',
      '1976D2',
    ]);
    expect(hex(raster, 45, 30)).toBe('FFFFFF'); // the gap of 10 (the gap variable)
    expect(hex(raster, 200, 40)).toBe('2E7D32'); // the tone of the inner frame
    expect(hex(raster, 260, 40)).toBe('FF9800'); // the tone of the root
    expect(hex(raster, 100, 105)).toBe('6A1B9A'); // the bar: half of 300
    expect(hex(raster, 160, 105)).toBe('FFFFFF');
  });
});
