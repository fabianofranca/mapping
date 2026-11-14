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
  addContainer,
  applySpecialization,
  createProject,
  parseSpecText,
  serialize,
} from '../../src/model';
import { runBatch, type BatchResult } from '../../mcp/batch';
import type { Operation } from '../../mcp/operations';
import { Roots } from '../../mcp/paths';
import { findProject, loadProject, type LoadedProject } from '../../mcp/projects';
import { NOW } from '../model/fixtures';

// CL1, finding 1.2 (#1890): an anchored `dropdown-menu` created without `rect` is born at the size of the drawing
// with the rows the batch itself provides (the `items` table), not that of the empty menu (112 × 16).

const LIBRARY = resolve('libraries/material3-compose');
const IMAGE = 'bbbbbbbb-0000-4000-8000-000000000001';
const LAYER = 'cccccccc-0000-4000-8000-000000000001';

let base: string;
let loaded: LoadedProject;

beforeAll(async () => {
  base = mkdtempSync(join(tmpdir(), 'mapping-anchor-table-'));
  const dir = join(base, 'screens');
  mkdirSync(join(dir, 'specs'), { recursive: true });
  cpSync(LIBRARY, join(dir, 'specs', 'material3-compose'), { recursive: true });
  const parsed = parseSpecText(
    readFileSync(join(LIBRARY, 'material3-compose.spec.json'), 'utf8'),
  );
  if (!parsed.ok) throw new Error('material3-compose is invalid');
  let p = createProject({
    name: 'Screens',
    now: NOW,
    firstLayer: { id: LAYER, name: 'Camada 1', color: '#D32F2F' },
  });
  p = addContainer(p, { id: IMAGE, file: 'images/photo.png', width: 420, height: 560 });
  p = applySpecialization(p, parsed.spec, {
    packageSpecName: 'material3-compose.spec.json',
  });
  writeFileSync(join(dir, 'mapping.json'), serialize(p));
  const roots = new Roots([base]);
  loaded = await loadProject(roots, await findProject(roots, 'screens'));
}, 30_000);

afterAll(() => rmSync(base, { recursive: true, force: true }));

const io = {
  readSource: () => Promise.reject(new Error('no files')),
  readSpecInput: () => Promise.reject(new Error('no files')),
  takenImageFiles: new Set<string>(),
  now: () => new Date(NOW),
};

const batchOf = (menuExtra: Record<string, unknown>): Operation[] => [
  {
    op: 'create_marking',
    as: '$field',
    container: IMAGE,
    rect: { x: 20, y: 340, width: 280, height: 56 },
    annotation: { type: 'material3-compose/text-field' },
  } as Operation,
  {
    op: 'create_marking',
    as: '$menu',
    container: IMAGE,
    annotation: {
      type: 'material3-compose/dropdown-menu',
      values: {
        style: 'menu',
        expanded: 'true',
        items: [
          { text: 'Edit', leadingIcon: 'Edit' },
          { text: 'Share', leadingIcon: 'Share' },
          { text: 'Delete', leadingIcon: 'Delete' },
        ],
      },
    },
    ...menuExtra,
  } as Operation,
];

const menuRect = (r: BatchResult) =>
  r.project.markings.find((m) => m.id === (r.aliases.get('$menu') as { id: string }).id)!
    .rect;

describe('create_marking without rect: the size includes the rows of the batch itself', () => {
  it('anchored: the menu is born with the height of the three items, not 112 × 16', async () => {
    const result = await runBatch(
      loaded,
      batchOf({ anchor: { to: '$field', side: 'bottom' } }),
      io,
    );
    expect(result.errors).toEqual([]);
    const rect = menuRect(result);
    expect(rect.height).toBe(160);
    // Already at the content size: fitting again changes nothing, and it stays flush below the field.
    expect(rect).toMatchObject({ x: 20, y: 396 });
    const again = await runBatch(
      loaded,
      [
        ...batchOf({ anchor: { to: '$field', side: 'bottom' } }),
        { op: 'fit_marking', marking: '$menu' } as Operation,
      ],
      io,
    );
    expect(again.steps[2]!.description).toContain('nothing changes');
  }, 30_000);
});

// CL1, finding 3.2 (#1890): the server fills in what the batch does not provide with the component's
// `preview` (like the app's Palette; documented in `create_marking`). The guide (R17.22 and R17.31)
// provides an empty value for what the step does not want, and then nothing beyond the request stays on the annotation.
describe('create_marking: the preview only fills in what the batch does not provide', () => {
  const valuesOf = (r: BatchResult, alias: string): Record<string, unknown> => {
    const id = (r.aliases.get(alias) as { id: string }).id;
    const a = r.project.annotations.find((x) => x.markingId === id)!;
    return (a.values ?? {}) as Record<string, unknown>;
  };
  const make = (
    alias: string,
    type: string,
    values: Record<string, unknown>,
  ): Operation =>
    ({
      op: 'create_marking',
      as: alias,
      container: IMAGE,
      rect: { x: 10, y: 10, width: 344, height: 48 },
      annotation: { type: `material3-compose/${type}`, values },
    }) as Operation;

  it('the preview fills in the field the batch does not provide (open decision: owner bug)', async () => {
    const r = await runBatch(loaded, [make('$sn', 'snackbar', { message: 'Hi' })], io);
    expect(r.errors).toEqual([]);
    expect(valuesOf(r, '$sn').actionLabel).toBe('Desfazer');
  }, 30_000);

  it('with the field provided empty (as in R17.31), nothing beyond the request goes in', async () => {
    const r = await runBatch(
      loaded,
      [
        make('$sn', 'snackbar', { message: 'Hi', actionLabel: '' }),
        make('$cd', 'card', {
          title: 'Title',
          style: 'elevated',
          subtitle: '',
          supportingText: '',
          media: '',
        }),
        make('$ad', 'alert-dialog', { title: 'T', text: 'x', icon: '' }),
      ],
      io,
    );
    expect(r.errors).toEqual([]);
    expect(valuesOf(r, '$sn').actionLabel ?? '').toBe('');
    expect(valuesOf(r, '$cd').media ?? '').toBe('');
    expect(valuesOf(r, '$cd').subtitle ?? '').toBe('');
    expect(valuesOf(r, '$ad').icon ?? '').toBe('');
  }, 30_000);
});
