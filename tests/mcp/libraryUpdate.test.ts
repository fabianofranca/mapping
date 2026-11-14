import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  addBackgroundContainer,
  addContainer,
  addTypedAnnotation,
  applyAccepted,
  applySpecialization,
  createMarking,
  createProject,
  parseSpecText,
  serialize,
  setFieldValue,
  type Project,
  type Spec,
} from '../../src/model';
import { NOW } from '../model/fixtures';
import {
  errorOf,
  ok,
  propose,
  readProject,
  readProposal,
  reviewDecide,
} from './proposalSupport';
import { connect, type Connection } from './workspace';

// Library update through the server (B4): `plan_library_update` (preview) and the
// `apply_specialization`/`update_specialization` operations of `propose_changes` with the v4 package FOLDER.
// The test package is the Material 3 from `tests/fixtures/material3/` as v1.

const MATERIAL3 = 'tests/fixtures/material3';

interface Plan {
  specId: string;
  from: number | null;
  to: number;
  decision: 'apply' | 'update' | 'not-newer';
  validation: {
    valid: boolean;
    errors: { file: string; path: string; message: string }[];
    warnings: unknown[];
  };
  additive?: boolean;
  refused?: boolean;
  missingMigrations?: { message: string; path: string }[];
  changes?: { code: string; kind: string; path: string; message: string }[];
  steps?: {
    from: number;
    to: number;
    step: { op: string };
    annotations: number;
    values: number;
    lossCount: number;
    losses: unknown[];
  }[];
  stepsTotal?: number;
  losses?: {
    reason: string;
    message: string;
    annotation: string;
    markingLabel: string;
    field?: string;
    value?: unknown;
  }[];
  lossesTotal?: number;
  pending?: unknown[];
  pendingTotal?: number;
  brokenRefs?: number;
  addedLayers?: unknown[];
  freedLayers?: unknown[];
  hint: string;
}

type Json = Record<string, unknown>;

const ids = {
  layer: 'cccccccc-0000-4000-8000-000000000001',
  image: 'bbbbbbbb-0000-4000-8000-000000000001',
  marking: 'eeeeeeee-0000-4000-8000-000000000001',
  field: 'ffffffff-0000-4000-8000-000000000001',
  chip: 'ffffffff-0000-4000-8000-000000000002',
};

let base: string;
let root: string;
let mcp: Connection;
let n = 0;
const newId = () => `dddddddd-0000-4000-8000-${String(++n).padStart(12, '0')}`;

function material3(): Spec {
  const parsed = parseSpecText(
    readFileSync(join(MATERIAL3, 'material3.spec.json'), 'utf8'),
  );
  if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
  return parsed.spec;
}

/** Project with Material 3 v1 applied (folder `specs/material3/`) and two typed annotations. */
function projectWithLibrary(): Project {
  let p = createProject({
    name: 'Screens',
    now: NOW,
    firstLayer: { id: ids.layer, name: 'Free', color: '#D32F2F' },
  });
  p = addContainer(p, {
    id: ids.image,
    file: 'images/photo.png',
    width: 400,
    height: 400,
  });
  p = applySpecialization(p, material3(), {
    newId,
    packageSpecName: 'material3.spec.json',
  });
  p = createMarking(p, {
    id: ids.marking,
    containerId: ids.image,
    rect: { x: 10, y: 10, width: 200, height: 60 },
    name: 'Field',
  });
  const layer = p.layers.find((l) => l.spec?.specId === 'material3')!;
  p = addTypedAnnotation(p, {
    id: ids.field,
    markingId: ids.marking,
    layerId: layer.id,
    type: { specId: 'material3', typeId: 'm3-text-field' },
  });
  p = setFieldValue(p, ids.field, 'label', 'Name');
  p = setFieldValue(p, ids.field, 'supporting', 'As in the document');
  p = addTypedAnnotation(p, {
    id: ids.chip,
    markingId: ids.marking,
    layerId: layer.id,
    type: { specId: 'material3', typeId: 'm3-chip' },
  });
  return p;
}

function writeProject(dir: string, p: Project, withSpecs: boolean): void {
  mkdirSync(dir, { recursive: true });
  if (withSpecs) cpSync(MATERIAL3, join(dir, 'specs', 'material3'), { recursive: true });
  writeFileSync(join(dir, 'mapping.json'), serialize(p));
}

function readJson(path: string): Json {
  return JSON.parse(readFileSync(path, 'utf8')) as Json;
}

/** Copies the package to `root/<name>/material3` and returns the folder. */
function copyPackage(name: string): string {
  const dir = join(root, name, 'material3');
  cpSync(MATERIAL3, dir, { recursive: true });
  return dir;
}

function editSpec(dir: string, edit: (spec: Spec) => void): void {
  const file = join(dir, 'material3.spec.json');
  const spec = JSON.parse(readFileSync(file, 'utf8')) as Spec;
  edit(spec);
  writeFileSync(file, JSON.stringify(spec, null, 2));
}

function typeOf(spec: Spec, typeId: string) {
  const type = spec.layers.flatMap((l) => l.annotationTypes).find((t) => t.id === typeId);
  if (!type) throw new Error(`type ${typeId}`);
  return type;
}

/** Additive v2: a new component (copy of the chip) and a new optional field on the chip. */
function makeAdditive(dir: string): void {
  editSpec(dir, (spec) => {
    spec.version = 2;
    const chip = typeOf(spec, 'm3-chip');
    chip.fields.push({ key: 'tooltip', label: 'Hint', type: 'string' });
    const badge = structuredClone(chip);
    badge.id = 'm3-badge';
    badge.name = 'Badge';
    badge.component = 'components/m3-badge.json';
    delete badge.doc;
    delete badge.examples;
    delete badge.sources;
    spec.layers[0]!.annotationTypes.push(badge);
  });
  const component = readJson(join(dir, 'components', 'm3-chip.json'));
  writeFileSync(
    join(dir, 'components', 'm3-badge.json'),
    JSON.stringify({ ...component, id: 'm3-badge', name: 'Badge' }, null, 2),
  );
}

/** v2 that renames the `supporting` field of the text field to `helper` (with or without a migration). */
function makeRename(dir: string, migration: boolean): void {
  editSpec(dir, (spec) => {
    spec.version = 2;
    const type = typeOf(spec, 'm3-text-field');
    const field = type.fields.find((f) => f.key === 'supporting')!;
    field.key = 'helper';
    for (const example of type.examples ?? []) {
      if (
        'values' in example &&
        example.values !== undefined &&
        'supporting' in example.values
      ) {
        example.values['helper'] = example.values['supporting']!;
        delete example.values['supporting'];
      }
    }
    if (migration) {
      spec.migrations = [
        {
          from: 1,
          to: 2,
          steps: [
            {
              op: 'rename-field',
              type: 'm3-text-field',
              from: 'supporting',
              to: 'helper',
            },
          ],
        },
      ];
    }
  });
  const file = join(dir, 'components', 'm3-text-field.json');
  writeFileSync(file, readFileSync(file, 'utf8').replaceAll('"supporting"', '"helper"'));
}

/** v2 that changes the layer id (same types, no break): its typed annotations become free-form. */
function makeLayerRename(dir: string): void {
  editSpec(dir, (spec) => {
    spec.version = 2;
    spec.layers[0]!.id = 'screens';
  });
}

/** v2 that removes the `supporting` field (with `remove-field`): loses the annotation value. */
function makeRemoval(dir: string): void {
  editSpec(dir, (spec) => {
    spec.version = 2;
    const type = typeOf(spec, 'm3-text-field');
    type.fields = type.fields.filter((f) => f.key !== 'supporting');
    for (const example of type.examples ?? []) {
      if ('values' in example && example.values !== undefined) {
        delete example.values['supporting'];
      }
    }
    spec.migrations = [
      {
        from: 1,
        to: 2,
        steps: [{ op: 'remove-field', type: 'm3-text-field', field: 'supporting' }],
      },
    ];
  });
  const file = join(dir, 'components', 'm3-text-field.json');
  const component = JSON.parse(readFileSync(file, 'utf8')) as {
    preview?: Json;
    template: unknown;
  };
  delete component.preview?.['supporting'];
  // The drawing no longer has the supporting text, the only one that cited the removed field.
  const drop = (node: unknown): void => {
    if (typeof node !== 'object' || node === null) return;
    const children = Reflect.get(node, 'children');
    if (Array.isArray(children)) {
      const kept = children.filter(
        (child: unknown) => Reflect.get(child as object, 'name') !== 'apoio',
      );
      Reflect.set(node, 'children', kept);
      kept.forEach(drop);
    }
  };
  drop(component.template);
  writeFileSync(file, JSON.stringify(component, null, 2));
}

beforeAll(async () => {
  base = mkdtempSync(join(tmpdir(), 'mapping-libupd-'));
  root = join(base, 'root');
  mkdirSync(root, { recursive: true });
  cpSync(MATERIAL3, join(root, 'lib', 'material3'), { recursive: true });
  makeAdditive(copyPackage('v2-additive'));
  makeRename(copyPackage('v2-rename'), true);
  makeRename(copyPackage('v2-no-migration'), false);
  makeRemoval(copyPackage('v2-remove'));
  makeLayerRename(copyPackage('v2-layer'));
  // A single-file specialization (formatVersion 3), for the path without a package.
  mkdirSync(join(root, 'legacy'), { recursive: true });
  cpSync('tests/fixtures/sdui-v2.json', join(root, 'legacy', 'sdui.json'));
  // The same, as v4 (and v5) that does not cite a package file: counts as an isolated file.
  for (const v of [4, 5]) {
    const raw = JSON.parse(readFileSync('tests/fixtures/sdui-v2.json', 'utf8')) as object;
    writeFileSync(
      join(root, 'legacy', `sdui-v${v}.json`),
      JSON.stringify({ ...raw, formatVersion: v }),
    );
  }

  writeProject(join(root, 'projetos', 'screens'), projectWithLibrary(), true);
  // Project without the library, with a container.
  let empty = createProject({
    name: 'Empty',
    now: NOW,
    firstLayer: { id: ids.layer, name: 'Free', color: '#D32F2F' },
  });
  empty = addBackgroundContainer(empty, {
    id: ids.image,
    width: 390,
    height: 844,
    background: '#FFFFFF',
  });
  writeProject(join(root, 'projetos', 'empty'), empty, false);
  mcp = await connect([root]);
});

afterAll(async () => {
  await mcp?.close();
  rmSync(base, { recursive: true, force: true });
});

const plan = async (path: string, project = 'screens') =>
  ok(await mcp.call<Plan>('plan_library_update', { project, path }));

describe('plan_library_update', () => {
  it('additive update (new component and optional field): applies directly, without steps', async () => {
    const result = await plan('v2-additive/material3');
    expect(result).toMatchObject({
      specId: 'material3',
      from: 1,
      to: 2,
      decision: 'update',
      additive: true,
      refused: false,
      stepsTotal: 0,
      lossesTotal: 0,
      pendingTotal: 0,
    });
    expect(result.validation.valid).toBe(true);
    expect(result.validation.errors).toEqual([]);
    expect(result.steps).toEqual([]);
    expect(result.missingMigrations).toEqual([]);
    expect(result.changes?.map((c) => c.code)).toEqual(
      expect.arrayContaining(['added-type', 'added-field']),
    );
    expect(result.hint).toMatch(/additive/);
    expect(result.hint).toMatch(/update_specialization/);
  });

  it("a layer that disappears: is not additive and the hint asks for the person's confirmation", async () => {
    const result = await plan('v2-layer/material3');
    expect(result).toMatchObject({ decision: 'update', additive: false, refused: false });
    expect(result.validation.valid).toBe(true);
    expect(result.freedLayers?.length).toBe(1);
    expect(result.hint).not.toMatch(/without an impact dialog/);
    expect(result.hint).toMatch(/layers become free-form/);
    expect(result.hint).toMatch(/confirm with the person/);
    expect(result.hint).toMatch(/update_specialization/);
  });

  it('accepts the specialization file inside the folder', async () => {
    const result = await plan('v2-additive/material3/material3.spec.json');
    expect(result).toMatchObject({ decision: 'update', additive: true });
  });

  it('renames a field with rename-field: the step counts the value and nothing is lost', async () => {
    const result = await plan('v2-rename/material3');
    expect(result).toMatchObject({
      decision: 'update',
      additive: false,
      refused: false,
      stepsTotal: 1,
      lossesTotal: 0,
      pendingTotal: 0,
    });
    expect(result.validation.valid).toBe(true);
    expect(result.missingMigrations).toEqual([]);
    expect(result.steps?.[0]).toMatchObject({
      from: 1,
      to: 2,
      step: {
        op: 'rename-field',
        type: 'm3-text-field',
        from: 'supporting',
        to: 'helper',
      },
      annotations: 1,
      values: 1,
      lossCount: 0,
      losses: [],
    });
    expect(result.hint).toMatch(/cover the breaks/);
    expect(result.hint).not.toMatch(/loses data/);
  });

  it('a break without a migration: refused with the list of what is missing', async () => {
    const result = await plan('v2-no-migration/material3');
    expect(result.decision).toBe('update');
    expect(result.refused).toBe(true);
    expect(result.additive).toBe(false);
    expect(result.missingMigrations?.length).toBeGreaterThan(0);
    for (const m of result.missingMigrations ?? []) {
      expect(typeof m.message).toBe('string');
      expect(typeof m.path).toBe('string');
    }
    // Validation with the applied copy as `previous` also refuses the package.
    expect(result.validation.valid).toBe(false);
    expect(result.validation.errors.length).toBeGreaterThan(0);
    expect(result.hint).toMatch(/declare `migrations`/);
  });

  it('remove-field loses the value: the loss comes with the annotation and the hint asks for confirmation', async () => {
    const result = await plan('v2-remove/material3');
    expect(result.validation.errors).toEqual([]);
    expect(result.refused).toBe(false);
    expect(result.lossesTotal).toBe(1);
    expect(result.losses?.[0]).toMatchObject({
      reason: 'removed-field',
      field: 'supporting',
      value: 'As in the document',
    });
    expect(result.losses?.[0]?.annotation).toMatch(/^mapping:\/\/screens\/a\//);
    expect(result.losses?.[0]?.markingLabel).toMatch(/Field/);
    expect(result.steps?.[0]?.lossCount).toBe(1);
    expect(result.hint).toMatch(/confirm with the person/);
  });

  it('version that did not grow and library not yet applied', async () => {
    const same = await plan('lib/material3');
    expect(same).toMatchObject({ decision: 'not-newer', from: 1, to: 1 });
    expect(same.hint).toMatch(/is not greater than/);
    const fresh = await plan('lib/material3', 'empty');
    expect(fresh).toMatchObject({ decision: 'apply', from: null, to: 1 });
    expect(fresh.validation.valid).toBe(true);
    expect(fresh.hint).toMatch(/apply_specialization/);
  });

  it('folder without a specialization returns the validation, not an error; invalid paths fail', async () => {
    mkdirSync(join(root, 'no-spec'), { recursive: true });
    writeFileSync(join(root, 'no-spec', 'LEIA-ME.md'), 'nothing');
    const result = await plan('no-spec');
    expect(result.validation.valid).toBe(false);
    expect(result.validation.errors[0]?.message).toMatch(/no specialization found/);
    expect(
      errorOf(
        await mcp.call('plan_library_update', { project: 'screens', path: 'x/missing' }),
      ).code,
    ).toBe('path-not-found');
    expect(
      errorOf(
        await mcp.call('plan_library_update', { project: 'screens', path: '../outside' }),
      ).code,
    ).toBe('outside-roots');
  });

  it('writes nothing', async () => {
    const dir = join(root, 'projetos', 'screens');
    const before = readFileSync(join(dir, 'mapping.json'), 'utf8');
    await plan('v2-rename/material3');
    expect(readFileSync(join(dir, 'mapping.json'), 'utf8')).toBe(before);
    expect(existsSync(join(dir, 'proposals'))).toBe(false);
  });
});

describe('propose_changes with the package folder', () => {
  it('apply_specialization of a v4 package: the proposal carries the folder in proposals/<id>/specs/…', async () => {
    const dir = join(root, 'projetos', 'empty');
    const result = await propose(mcp, 'empty', [
      { op: 'apply_specialization', file: 'lib/material3' },
    ]);
    expect(result.proposed).toBe(true);
    expect(result.summary[0]).toMatch(/Apply the specialization.*material3.*v1/);
    const id = result.proposal.id;
    const packaged = join(dir, 'proposals', id, 'specs', 'material3');
    expect(readdirSync(packaged).sort()).toEqual(readdirSync(MATERIAL3).sort());
    expect(existsSync(join(packaged, 'material3.spec.json'))).toBe(true);
    expect(existsSync(join(packaged, 'components', 'm3-button.json'))).toBe(true);
    expect(existsSync(join(packaged, 'fonts', 'LEIA-ME.txt'))).toBe(true);
    expect(readFileSync(join(packaged, 'docs', 'm3-button.md'), 'utf8')).toBe(
      readFileSync(join(MATERIAL3, 'docs', 'm3-button.md'), 'utf8'),
    );
    expect(result.files.packages).toEqual([
      {
        dir: `proposals/${id}/specs/material3`,
        files: expect.any(Number) as number,
      },
    ]);

    // The specialization change points to the final folder; the app copies it to `specs/`.
    const proposal = readProposal(dir, id);
    const change = proposal.changes.find((c) => c.entity === 'specialization')!;
    expect(change.kind).toBe('create');
    expect((change.to as { file: string }).file).toBe(
      'specs/material3/material3.spec.json',
    );
    reviewDecide(dir, id, { level: 'proposal', id: null }, 'accepted');
    const applied = applyAccepted(readProject(dir), readProposal(dir, id), NOW);
    if (!applied.ok) throw new Error(JSON.stringify(applied.issues));
    expect(applied.packages).toHaveLength(1);
    expect(existsSync(join(dir, applied.packages[0]!.from, 'material3.spec.json'))).toBe(
      true,
    );
    // Copied to `specs/<folder>/`, the folder passes the server validation.
    cpSync(join(dir, applied.packages[0]!.from), join(dir, applied.packages[0]!.dir), {
      recursive: true,
    });
    const valid = ok(
      await mcp.call<{ valid: boolean }>('validate_library', {
        path: join('projetos', 'empty', 'specs', 'material3'),
      }),
    );
    expect(valid.valid).toBe(true);
  });

  it('update_specialization with the v2 folder: files in the proposal and changes of the migrated annotations', async () => {
    const dir = join(root, 'projetos', 'screens');
    const result = await propose(mcp, 'screens', [
      { op: 'update_specialization', file: 'v2-rename/material3' },
    ]);
    expect(result.proposed).toBe(true);
    expect(result.summary[0]).toMatch(
      /Update the specialization "material3" to v2 \(migration in 1 step, 1 value changed/,
    );
    const id = result.proposal.id;
    const packaged = join(dir, 'proposals', id, 'specs', 'material3');
    expect(existsSync(join(packaged, 'material3.spec.json'))).toBe(true);
    expect(
      readFileSync(join(packaged, 'components', 'm3-text-field.json'), 'utf8'),
    ).toContain('"helper"');

    const proposal = readProposal(dir, id);
    const spec = proposal.changes.find((c) => c.entity === 'specialization')!;
    expect(spec.kind).toBe('update');
    expect((spec.to as { version: number; file: string }).version).toBe(2);
    expect((spec.to as { file: string }).file).toBe(
      'specs/material3/material3.spec.json',
    );
    const values = proposal.changes.filter(
      (c) => c.entity === 'annotation' && c.field?.startsWith('values.'),
    );
    const byField = new Map(values.map((c) => [c.field, c]));
    expect(byField.get('values.helper')?.to).toBe('As in the document');
    expect(byField.has('values.supporting')).toBe(true);
    expect(byField.get('values.supporting')?.to).toBeNull();
    expect(result.reviewChanges.total).toBe(proposal.changes.length);
  });

  it('an additive update goes through a proposal without changing the annotations', async () => {
    const dir = join(root, 'projetos', 'screens');
    const result = await propose(mcp, 'screens', [
      { op: 'update_specialization', file: 'v2-additive/material3/material3.spec.json' },
    ]);
    expect(result.proposed).toBe(true);
    const proposal = readProposal(dir, result.proposal.id);
    expect(proposal.changes.filter((c) => c.entity === 'annotation')).toEqual([]);
    expect(
      existsSync(
        join(
          dir,
          'proposals',
          result.proposal.id,
          'specs',
          'material3',
          'components',
          'm3-badge.json',
        ),
      ),
    ).toBe(true);
  });

  it('the loss appears in the operation description', async () => {
    const result = await propose(mcp, 'screens', [
      { op: 'update_specialization', file: 'v2-remove/material3' },
    ]);
    expect(result.summary[0]).toMatch(/1 value lost/);
  });

  it('an update without a migration is refused with spec-missing-migrations and the list of what is missing', async () => {
    const result = ok(
      await mcp.call<{
        valid: boolean;
        proposed?: boolean;
        errors: {
          op: string;
          code: string;
          missingMigrations: { message: string; path: string }[];
        }[];
      }>('propose_changes', {
        project: 'screens',
        title: 'No migration',
        operations: [{ op: 'update_specialization', file: 'v2-no-migration/material3' }],
      }),
    );
    expect(result.valid).toBe(false);
    expect(result.proposed).toBe(false);
    const error = result.errors[0]!;
    expect(error.code).toBe('spec-missing-migrations');
    expect(error.missingMigrations.length).toBeGreaterThan(0);
    expect(error.missingMigrations[0]).toEqual({
      message: expect.any(String) as string,
      path: expect.any(String) as string,
    });
  });

  it('package with an error: invalid-library with the first errors', async () => {
    const dir = join(root, 'broken', 'material3');
    cpSync(MATERIAL3, dir, { recursive: true });
    rmSync(join(dir, 'components', 'm3-button.json'));
    const result = ok(
      await mcp.call<{ errors: { code: string; errors: { file: string }[] }[] }>(
        'plan_changes',
        {
          project: 'empty',
          operations: [{ op: 'apply_specialization', file: 'broken/material3' }],
        },
      ),
    );
    expect(result.errors[0]?.code).toBe('invalid-library');
    expect(result.errors[0]?.errors[0]?.file).toBe('material3.spec.json');
  });

  it('version that did not grow and update of a specialization not applied', async () => {
    const same = ok(
      await mcp.call<{ errors: { code: string }[] }>('plan_changes', {
        project: 'screens',
        operations: [{ op: 'update_specialization', file: 'lib/material3' }],
      }),
    );
    expect(same.errors[0]?.code).toBe('spec-not-newer');
    const missing = ok(
      await mcp.call<{ errors: { code: string }[] }>('plan_changes', {
        project: 'empty',
        operations: [{ op: 'update_specialization', file: 'v2-additive/material3' }],
      }),
    );
    expect(missing.errors[0]?.code).toBe('not-found');
  });

  it('never writes specs/ or the project mapping.json', async () => {
    const dir = join(root, 'projetos', 'screens');
    const text = readFileSync(join(dir, 'mapping.json'), 'utf8');
    expect(JSON.parse(text)).toMatchObject({ specializations: [{ version: 1 }] });
    expect(
      readFileSync(join(dir, 'specs', 'material3', 'material3.spec.json'), 'utf8'),
    ).toBe(readFileSync(join(MATERIAL3, 'material3.spec.json'), 'utf8'));
  });

  it('a v1 to v3 specialization in a file still goes only through the file', async () => {
    const result = ok(
      await mcp.call<{ valid: boolean; summary: string[] }>('plan_changes', {
        project: 'empty',
        operations: [{ op: 'apply_specialization', file: 'legacy/sdui.json' }],
      }),
    );
    expect(result.valid).toBe(true);
    expect(result.summary[0]).toMatch(/Apply the specialization/);
  });

  it('v4 and v5 without a package file count as an isolated file', async () => {
    for (const v of [4, 5]) {
      const result = ok(
        await mcp.call<{ valid: boolean; summary: string[] }>('plan_changes', {
          project: 'empty',
          operations: [{ op: 'apply_specialization', file: `legacy/sdui-v${v}.json` }],
        }),
      );
      expect(result.valid).toBe(true);
      expect(result.summary[0]).toMatch(/Apply the specialization/);
    }
  });
});
