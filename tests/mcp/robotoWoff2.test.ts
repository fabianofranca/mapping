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
import { issueChanges, runBatch, type BatchResult } from '../../mcp/batch';
import { decodeImage } from '../../mcp/image/codecs';
import type { Raster } from '../../mcp/image/raster';
import { batchAudits, withDrawingIssues } from '../../mcp/drawingProof';
import { Refs } from '../../mcp/items';
import type { Operation } from '../../mcp/operations';
import { Roots } from '../../mcp/paths';
import { findProject, loadProject, type LoadedProject } from '../../mcp/projects';
import { renderMarking } from '../../mcp/renderImage';
import { NOW } from '../model/fixtures';
import { PNG_1X1 } from './workspace';

// Stage #2126 (W2, decision 9): the Material 3 package, whose Roboto is `.woff2`, against a copy whose `fonts` cite the
// `.woff` of the same Fontsource release (tests/fixtures/fonts). Through the real batch and render code, the two give the
// same sizes, the same `component-overflow` set (never `approximate`) and text ink boxes within 1 px.

const LIBRARY = resolve('libraries/material3-compose');
const IMAGE = 'bbbbbbbb-0000-4000-8000-000000000001';
const LAYER = 'cccccccc-0000-4000-8000-000000000001';
const FONTS = [
  ['Roboto-Regular.woff2', 'roboto-latin-400-normal.woff'],
  ['Roboto-Medium.woff2', 'roboto-latin-500-normal.woff'],
] as const;

let base: string;
let roots: Roots;
let withWoff2: LoadedProject;
let withWoff: LoadedProject;

async function workspace(name: string, useWoff: boolean): Promise<LoadedProject> {
  const dir = join(base, name);
  const specDir = join(dir, 'specs', 'material3-compose');
  mkdirSync(join(dir, 'specs'), { recursive: true });
  cpSync(LIBRARY, specDir, { recursive: true });
  const specFile = join(specDir, 'material3-compose.spec.json');
  let text = readFileSync(specFile, 'utf8');
  if (useWoff) {
    for (const [woff2, woff] of FONTS) {
      cpSync(join('tests/fixtures/fonts', woff), join(specDir, 'fonts', woff));
      text = text.replace(`fonts/${woff2}`, `fonts/${woff}`);
    }
    writeFileSync(specFile, text);
  }
  const parsed = parseSpecText(text);
  if (!parsed.ok) throw new Error('material3-compose is invalid');
  let p = createProject({
    name: 'Screens',
    now: NOW,
    firstLayer: { id: LAYER, name: 'Layer 1', color: '#D32F2F' },
  });
  p = addContainer(p, { id: IMAGE, file: 'images/photo.png', width: 420, height: 560 });
  p = applySpecialization(p, parsed.spec, {
    packageSpecName: 'material3-compose.spec.json',
  });
  mkdirSync(join(dir, 'images'), { recursive: true });
  writeFileSync(join(dir, 'images', 'photo.png'), PNG_1X1);
  writeFileSync(join(dir, 'mapping.json'), serialize(p));
  return loadProject(roots, await findProject(roots, name));
}

beforeAll(async () => {
  base = mkdtempSync(join(tmpdir(), 'mapping-roboto-woff2-'));
  roots = new Roots([base]);
  withWoff2 = await workspace('woff2', false);
  withWoff = await workspace('woff', true);
}, 60_000);

afterAll(() => rmSync(base, { recursive: true, force: true }));

const io = {
  readSource: () => Promise.reject(new Error('no files')),
  readSpecInput: () => Promise.reject(new Error('no files')),
  takenImageFiles: new Set<string>(),
  now: () => new Date(NOW),
};

const make = (
  alias: string,
  type: string,
  values: Record<string, unknown>,
  rect?: { x: number; y: number; width: number; height: number },
): Operation =>
  ({
    op: 'create_marking',
    as: alias,
    container: IMAGE,
    ...(rect === undefined ? {} : { rect }),
    annotation: { type: `material3-compose/${type}`, values },
  }) as Operation;

const OPS: Operation[] = [
  make('$button', 'button', { label: 'Save the changes now' }),
  make('$snack', 'snackbar', {
    message: 'The file was saved to the shared folder and the team was told about it',
    actionLabel: 'Undo',
  }),
  make('$seg', 'segmented-button', {
    options: [
      { label: 'Day', icon: '', selected: 'false' },
      { label: 'Week', icon: '', selected: 'true' },
      { label: 'Month', icon: '', selected: 'false' },
    ],
  }),
  // Too small for its content (R25.54): `component-overflow`.
  make(
    '$tight',
    'card',
    { title: 'Weekend plans', subtitle: 'Saturday and Sunday' },
    { x: 200, y: 150, width: 30, height: 16 },
  ),
  { op: 'fit_marking', marking: '$button' } as Operation,
  { op: 'fit_marking', marking: '$snack' } as Operation,
  { op: 'fit_marking', marking: '$seg' } as Operation,
];

interface Run {
  readonly rects: unknown[];
  readonly issues: unknown[];
  readonly inks: (readonly number[] | null)[];
}

/** The bounding box (x0, y0, x1, y1) of what differs from the top-left pixel: the text, a button's fill included. */
function inkBox(raster: Raster): number[] | null {
  const at = (x: number, y: number) => (y * raster.width + x) * 4;
  const bg = [0, 1, 2].map((c) => raster.data[c]!);
  const box = [raster.width, raster.height, -1, -1];
  for (let y = 0; y < raster.height; y++)
    for (let x = 0; x < raster.width; x++) {
      const i = at(x, y);
      const far = [0, 1, 2].some((c) => Math.abs(raster.data[i + c]! - bg[c]!) > 80);
      if (!far) continue;
      box[0] = Math.min(box[0]!, x);
      box[1] = Math.min(box[1]!, y);
      box[2] = Math.max(box[2]!, x);
      box[3] = Math.max(box[3]!, y);
    }
  return box[2]! < 0 ? null : box;
}

async function run(loaded: LoadedProject): Promise<Run & { result: BatchResult }> {
  const result = await runBatch(loaded, OPS, io);
  expect(result.errors).toEqual([]);
  const refs = new Refs({ ...loaded, project: result.project });
  const markingOf = (alias: string) =>
    result.project.markings.find(
      (m) => m.id === (result.aliases.get(alias) as { id: string }).id,
    )!;
  const aliases = ['$button', '$snack', '$seg', '$tight'];
  const inks: (readonly number[] | null)[] = [];
  for (const alias of aliases) {
    const image = await renderMarking(roots, refs, markingOf(alias), { zoom: 1 });
    inks.push(inkBox((await decodeImage(image.image.bytes)).raster));
  }
  const changes = withDrawingIssues(
    issueChanges(refs, result.before),
    refs,
    result.before,
    batchAudits(refs, result.before),
  ) as { new: { issues: unknown[] }[] };
  return {
    result,
    rects: aliases.map((a) => markingOf(a).rect),
    issues: changes.new.flatMap((entry) => entry.issues),
    inks,
  };
}

describe('Material 3 in Roboto .woff2 against the .woff of the same release', () => {
  it('fit_marking and create_marking without rect give the same sizes', async () => {
    const a = await run(withWoff2);
    const b = await run(withWoff);
    expect(a.rects).toEqual(b.rects);
    // The text is measured with Roboto, not the embedded font: a button of this label is not the embedded size.
    const embedded = await run(await workspaceWithoutFonts());
    expect(a.rects).not.toEqual(embedded.rects);
  }, 60_000);

  it('give the same component-overflow set, without approximate', async () => {
    const a = await run(withWoff2);
    const b = await run(withWoff);
    expect(a.issues).toEqual(b.issues);
    const codes = a.issues.map((i) => (i as { code: string }).code);
    expect(codes).toContain('component-overflow');
    expect(JSON.stringify(a.issues)).not.toContain('approximate');
  }, 60_000);

  it('render_marking gives text ink boxes within 1 px', async () => {
    const a = await run(withWoff2);
    const b = await run(withWoff);
    expect(a.inks).toHaveLength(b.inks.length);
    a.inks.forEach((box, i) => {
      expect(box).not.toBeNull();
      box!.forEach((v, k) => expect(Math.abs(v - b.inks[i]![k]!)).toBeLessThanOrEqual(1));
    });
  }, 60_000);
});

/** The same package with no `fonts` declared: the embedded font applies. */
async function workspaceWithoutFonts(): Promise<LoadedProject> {
  const dir = join(base, 'embedded');
  const specDir = join(dir, 'specs', 'material3-compose');
  mkdirSync(join(dir, 'specs'), { recursive: true });
  cpSync(LIBRARY, specDir, { recursive: true });
  const specFile = join(specDir, 'material3-compose.spec.json');
  const json = JSON.parse(readFileSync(specFile, 'utf8')) as { fonts?: unknown };
  delete json.fonts;
  writeFileSync(specFile, JSON.stringify(json));
  const parsed = parseSpecText(JSON.stringify(json));
  if (!parsed.ok) throw new Error('material3-compose is invalid');
  let p = createProject({
    name: 'Screens',
    now: NOW,
    firstLayer: { id: LAYER, name: 'Layer 1', color: '#D32F2F' },
  });
  p = addContainer(p, { id: IMAGE, file: 'images/photo.png', width: 420, height: 560 });
  p = applySpecialization(p, parsed.spec, {
    packageSpecName: 'material3-compose.spec.json',
  });
  mkdirSync(join(dir, 'images'), { recursive: true });
  writeFileSync(join(dir, 'images', 'photo.png'), PNG_1X1);
  writeFileSync(join(dir, 'mapping.json'), serialize(p));
  return loadProject(roots, await findProject(roots, 'embedded'));
}
