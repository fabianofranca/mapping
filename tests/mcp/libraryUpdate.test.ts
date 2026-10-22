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
  addBlankImage,
  addImage,
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

// Atualização da biblioteca pelo servidor (B4): `plan_library_update` (prévia) e as operações
// `apply_specialization`/`update_specialization` de `propose_changes` com a PASTA do pacote v4.
// O pacote de prova é o Material 3 de `examples/libraries/material3/` como v1.

const MATERIAL3 = 'examples/libraries/material3';

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

/** Projeto com o Material 3 v1 aplicado (pasta `specs/material3/`) e duas anotações tipadas. */
function projectWithLibrary(): Project {
  let p = createProject({
    name: 'Telas',
    now: NOW,
    firstLayer: { id: ids.layer, name: 'Livre', color: '#D32F2F' },
  });
  p = addImage(p, { id: ids.image, file: 'images/foto.png', width: 400, height: 400 });
  p = applySpecialization(p, material3(), {
    newId,
    packageSpecName: 'material3.spec.json',
  });
  p = createMarking(p, {
    id: ids.marking,
    imageId: ids.image,
    rect: { x: 10, y: 10, width: 200, height: 60 },
    name: 'Campo',
  });
  const layer = p.layers.find((l) => l.spec?.specId === 'material3')!;
  p = addTypedAnnotation(p, {
    id: ids.field,
    markingId: ids.marking,
    layerId: layer.id,
    type: { specId: 'material3', typeId: 'm3-text-field' },
  });
  p = setFieldValue(p, ids.field, 'label', 'Nome');
  p = setFieldValue(p, ids.field, 'supporting', 'Como no documento');
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

/** Copia o pacote para `root/<name>/material3` e devolve a pasta. */
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
  if (!type) throw new Error(`tipo ${typeId}`);
  return type;
}

/** v2 aditiva: um componente novo (cópia do chip) e um campo opcional novo no chip. */
function makeAdditive(dir: string): void {
  editSpec(dir, (spec) => {
    spec.version = 2;
    const chip = typeOf(spec, 'm3-chip');
    chip.fields.push({ key: 'tooltip', label: 'Dica', type: 'string' });
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

/** v2 que renomeia o campo `supporting` do campo de texto para `helper` (com ou sem migração). */
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

/** v2 que remove o campo `supporting` (com `remove-field`): perde o valor da anotação. */
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
  // O desenho deixa de ter o texto de apoio, o único que citava o campo removido.
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
  root = join(base, 'raiz');
  mkdirSync(root, { recursive: true });
  cpSync(MATERIAL3, join(root, 'lib', 'material3'), { recursive: true });
  makeAdditive(copyPackage('v2-aditiva'));
  makeRename(copyPackage('v2-renomeia'), true);
  makeRename(copyPackage('v2-sem-migracao'), false);
  makeRemoval(copyPackage('v2-remove'));
  // Uma especialização de arquivo único (formatVersion 3), para o caminho sem pacote.
  mkdirSync(join(root, 'legado'), { recursive: true });
  cpSync('tests/fixtures/sdui-v2.json', join(root, 'legado', 'sdui.json'));
  // O mesmo, como v4 (e v5) que não cita arquivo do pacote: vale como arquivo isolado.
  for (const v of [4, 5]) {
    const raw = JSON.parse(readFileSync('tests/fixtures/sdui-v2.json', 'utf8')) as object;
    writeFileSync(
      join(root, 'legado', `sdui-v${v}.json`),
      JSON.stringify({ ...raw, formatVersion: v }),
    );
  }

  writeProject(join(root, 'projetos', 'telas'), projectWithLibrary(), true);
  // Projeto sem a biblioteca, com um container.
  let empty = createProject({
    name: 'Vazio',
    now: NOW,
    firstLayer: { id: ids.layer, name: 'Livre', color: '#D32F2F' },
  });
  empty = addBlankImage(empty, {
    id: ids.image,
    width: 390,
    height: 844,
    background: '#FFFFFF',
  });
  writeProject(join(root, 'projetos', 'vazio'), empty, false);
  mcp = await connect([root]);
});

afterAll(async () => {
  await mcp?.close();
  rmSync(base, { recursive: true, force: true });
});

const plan = async (path: string, project = 'telas') =>
  ok(await mcp.call<Plan>('plan_library_update', { project, path }));

describe('plan_library_update', () => {
  it('atualização aditiva (componente e campo opcional novos): aplica direto, sem passos', async () => {
    const result = await plan('v2-aditiva/material3');
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
    expect(result.hint).toMatch(/aditiva/);
    expect(result.hint).toMatch(/update_specialization/);
  });

  it('aceita o arquivo da especialização dentro da pasta', async () => {
    const result = await plan('v2-aditiva/material3/material3.spec.json');
    expect(result).toMatchObject({ decision: 'update', additive: true });
  });

  it('renomeia um campo com rename-field: o passo conta o valor e nada se perde', async () => {
    const result = await plan('v2-renomeia/material3');
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
    expect(result.hint).toMatch(/cobrem as quebras/);
    expect(result.hint).not.toMatch(/perde dados/);
  });

  it('quebra sem migração: refused com a lista do que falta', async () => {
    const result = await plan('v2-sem-migracao/material3');
    expect(result.decision).toBe('update');
    expect(result.refused).toBe(true);
    expect(result.additive).toBe(false);
    expect(result.missingMigrations?.length).toBeGreaterThan(0);
    for (const m of result.missingMigrations ?? []) {
      expect(typeof m.message).toBe('string');
      expect(typeof m.path).toBe('string');
    }
    // A validação com a cópia aplicada como `previous` também recusa o pacote.
    expect(result.validation.valid).toBe(false);
    expect(result.validation.errors.length).toBeGreaterThan(0);
    expect(result.hint).toMatch(/declare `migrations`/);
  });

  it('remove-field perde o valor: a perda vem com a anotação e a hint pede confirmação', async () => {
    const result = await plan('v2-remove/material3');
    expect(result.validation.errors).toEqual([]);
    expect(result.refused).toBe(false);
    expect(result.lossesTotal).toBe(1);
    expect(result.losses?.[0]).toMatchObject({
      reason: 'removed-field',
      field: 'supporting',
      value: 'Como no documento',
    });
    expect(result.losses?.[0]?.annotation).toMatch(/^mapping:\/\/telas\/a\//);
    expect(result.losses?.[0]?.markingLabel).toMatch(/Campo/);
    expect(result.steps?.[0]?.lossCount).toBe(1);
    expect(result.hint).toMatch(/confirme com a pessoa/);
  });

  it('versão que não cresceu e biblioteca ainda não aplicada', async () => {
    const same = await plan('lib/material3');
    expect(same).toMatchObject({ decision: 'not-newer', from: 1, to: 1 });
    expect(same.hint).toMatch(/não é maior/);
    const fresh = await plan('lib/material3', 'vazio');
    expect(fresh).toMatchObject({ decision: 'apply', from: null, to: 1 });
    expect(fresh.validation.valid).toBe(true);
    expect(fresh.hint).toMatch(/apply_specialization/);
  });

  it('pasta sem especialização devolve a validação, não um erro; caminhos inválidos falham', async () => {
    mkdirSync(join(root, 'vazia'), { recursive: true });
    writeFileSync(join(root, 'vazia', 'LEIA-ME.md'), 'nada');
    const result = await plan('vazia');
    expect(result.validation.valid).toBe(false);
    expect(result.validation.errors[0]?.message).toMatch(/nenhuma especialização/);
    expect(
      errorOf(await mcp.call('plan_library_update', { project: 'telas', path: 'x/nao' }))
        .code,
    ).toBe('path-not-found');
    expect(
      errorOf(
        await mcp.call('plan_library_update', { project: 'telas', path: '../fora' }),
      ).code,
    ).toBe('outside-roots');
  });

  it('não grava nada', async () => {
    const dir = join(root, 'projetos', 'telas');
    const before = readFileSync(join(dir, 'mapping.json'), 'utf8');
    await plan('v2-renomeia/material3');
    expect(readFileSync(join(dir, 'mapping.json'), 'utf8')).toBe(before);
    expect(existsSync(join(dir, 'proposals'))).toBe(false);
  });
});

describe('propose_changes com a pasta do pacote', () => {
  it('apply_specialization de pacote v4: a proposta leva a pasta em proposals/<id>/specs/…', async () => {
    const dir = join(root, 'projetos', 'vazio');
    const result = await propose(mcp, 'vazio', [
      { op: 'apply_specialization', file: 'lib/material3' },
    ]);
    expect(result.proposed).toBe(true);
    expect(result.summary[0]).toMatch(/Aplicar a especialização.*material3.*v1/);
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

    // A mudança da especialização aponta a pasta definitiva; a app copia para `specs/`.
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
    // Copiada para `specs/<pasta>/`, a pasta passa na validação do servidor.
    cpSync(join(dir, applied.packages[0]!.from), join(dir, applied.packages[0]!.dir), {
      recursive: true,
    });
    const valid = ok(
      await mcp.call<{ valid: boolean }>('validate_library', {
        path: join('projetos', 'vazio', 'specs', 'material3'),
      }),
    );
    expect(valid.valid).toBe(true);
  });

  it('update_specialization com a pasta v2: arquivos na proposta e mudanças das anotações migradas', async () => {
    const dir = join(root, 'projetos', 'telas');
    const result = await propose(mcp, 'telas', [
      { op: 'update_specialization', file: 'v2-renomeia/material3' },
    ]);
    expect(result.proposed).toBe(true);
    expect(result.summary[0]).toMatch(
      /Atualizar a especialização "material3" para a v2 \(migração em 1 passo, 1 valor alterado/,
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
    expect(byField.get('values.helper')?.to).toBe('Como no documento');
    expect(byField.has('values.supporting')).toBe(true);
    expect(byField.get('values.supporting')?.to).toBeNull();
    expect(result.reviewChanges.total).toBe(proposal.changes.length);
  });

  it('update aditivo vai por proposta sem mudar as anotações', async () => {
    const dir = join(root, 'projetos', 'telas');
    const result = await propose(mcp, 'telas', [
      { op: 'update_specialization', file: 'v2-aditiva/material3/material3.spec.json' },
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

  it('a perda aparece na descrição da operação', async () => {
    const result = await propose(mcp, 'telas', [
      { op: 'update_specialization', file: 'v2-remove/material3' },
    ]);
    expect(result.summary[0]).toMatch(/1 valor perdido/);
  });

  it('update sem migração é recusado com spec-missing-migrations e a lista do que falta', async () => {
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
        project: 'telas',
        title: 'Sem migração',
        operations: [{ op: 'update_specialization', file: 'v2-sem-migracao/material3' }],
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

  it('pacote com erro: invalid-library com os primeiros erros', async () => {
    const dir = join(root, 'quebrado', 'material3');
    cpSync(MATERIAL3, dir, { recursive: true });
    rmSync(join(dir, 'components', 'm3-button.json'));
    const result = ok(
      await mcp.call<{ errors: { code: string; errors: { file: string }[] }[] }>(
        'plan_changes',
        {
          project: 'vazio',
          operations: [{ op: 'apply_specialization', file: 'quebrado/material3' }],
        },
      ),
    );
    expect(result.errors[0]?.code).toBe('invalid-library');
    expect(result.errors[0]?.errors[0]?.file).toBe('material3.spec.json');
  });

  it('versão que não cresceu e update de especialização não aplicada', async () => {
    const same = ok(
      await mcp.call<{ errors: { code: string }[] }>('plan_changes', {
        project: 'telas',
        operations: [{ op: 'update_specialization', file: 'lib/material3' }],
      }),
    );
    expect(same.errors[0]?.code).toBe('spec-not-newer');
    const missing = ok(
      await mcp.call<{ errors: { code: string }[] }>('plan_changes', {
        project: 'vazio',
        operations: [{ op: 'update_specialization', file: 'v2-aditiva/material3' }],
      }),
    );
    expect(missing.errors[0]?.code).toBe('not-found');
  });

  it('nunca grava specs/ nem o mapping.json do projeto', async () => {
    const dir = join(root, 'projetos', 'telas');
    const text = readFileSync(join(dir, 'mapping.json'), 'utf8');
    expect(JSON.parse(text)).toMatchObject({ specializations: [{ version: 1 }] });
    expect(
      readFileSync(join(dir, 'specs', 'material3', 'material3.spec.json'), 'utf8'),
    ).toBe(readFileSync(join(MATERIAL3, 'material3.spec.json'), 'utf8'));
  });

  it('especialização v1 a v3 em arquivo continua indo só pelo arquivo', async () => {
    const result = ok(
      await mcp.call<{ valid: boolean; summary: string[] }>('plan_changes', {
        project: 'vazio',
        operations: [{ op: 'apply_specialization', file: 'legado/sdui.json' }],
      }),
    );
    expect(result.valid).toBe(true);
    expect(result.summary[0]).toMatch(/Aplicar a especialização/);
  });

  it('v4 e v5 sem arquivo do pacote valem como arquivo isolado', async () => {
    for (const v of [4, 5]) {
      const result = ok(
        await mcp.call<{ valid: boolean; summary: string[] }>('plan_changes', {
          project: 'vazio',
          operations: [{ op: 'apply_specialization', file: `legado/sdui-v${v}.json` }],
        }),
      );
      expect(result.valid).toBe(true);
      expect(result.summary[0]).toMatch(/Aplicar a especialização/);
    }
  });
});
