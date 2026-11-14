import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  addComponentMarking,
  addContainer,
  applySpecialization,
  approximateMeasurer,
  createProject,
  serialize,
  setFieldValue,
  setMarkingLocked,
  type Project,
} from '../../src/model';
import { changeType } from '../../src/model/proposalView';
import { runBatch, type BatchResult } from '../../mcp/batch';
import { planChanges } from '../../mcp/changes';
import type { Operation } from '../../mcp/operations';
import { Roots } from '../../mcp/paths';
import { findProject, loadProject, type LoadedProject } from '../../mcp/projects';
import { NOW } from '../model/fixtures';
import {
  FIT_COMPONENTS,
  FIT_SPEC_ID,
  FIT_SPEC_JSON,
  LONG_LABEL,
  fitCatalog,
  fitSpec,
} from '../model/fitFixtures';
import {
  acceptAllAndApply,
  applyAcceptedOnDisk,
  ok,
  propose,
  readProposal,
  reviewDecide,
} from './proposalSupport';
import { connect, type Connection } from './workspace';

// MC3 (decisões 14 a 18 da #898): `fit_marking` no MCP. O servidor nunca grava o projeto, então "direto"
// é a prévia (`plan_changes`) e o lote (`runBatch`); a proposta leva o ajuste para a revisão como a
// mudança de Posição de sempre.

const IMAGE = 'bbbbbbbb-0000-4000-8000-000000000001';
const LAYER = 'cccccccc-0000-4000-8000-000000000001';
const BUTTON = 'dddddddd-0000-4000-8000-000000000001';
const BUTTON_A = 'eeeeeeee-0000-4000-8000-000000000001';
const LOCKED = 'dddddddd-0000-4000-8000-000000000002';
const PLAIN = 'dddddddd-0000-4000-8000-000000000003';

let base: string;
let roots: Roots;
let loaded: LoadedProject;
let mcp: Connection;

/** Um botão curto (cabe no `minSize`), um com rótulo longo e trancado, e um sem eixo ajustável. */
function project(): Project {
  let p = createProject({
    name: 'Telas',
    now: NOW,
    firstLayer: { id: LAYER, name: 'Camada 1', color: '#D32F2F' },
  });
  p = addContainer(p, { id: IMAGE, file: 'images/foto.png', width: 600, height: 400 });
  p = applySpecialization(p, fitSpec(), { packageSpecName: 'fit.spec.json' });
  const add = (id: string, annotationId: string, typeId: string, x: number, y: number) =>
    addComponentMarking(
      p,
      fitCatalog(),
      {
        markingId: id,
        annotationId,
        containerId: IMAGE,
        parentId: null,
        specId: FIT_SPEC_ID,
        typeId,
        rect: { x, y, width: 120, height: 40 },
      },
      approximateMeasurer,
    );
  p = add(BUTTON, BUTTON_A, 'fit-button', 20, 20);
  p = add(LOCKED, 'eeeeeeee-0000-4000-8000-000000000002', 'fit-button', 200, 20);
  p = setFieldValue(p, 'eeeeeeee-0000-4000-8000-000000000002', 'label', LONG_LABEL);
  p = setMarkingLocked(p, LOCKED, true);
  p = add(PLAIN, 'eeeeeeee-0000-4000-8000-000000000003', 'fit-plain', 380, 20);
  return setFieldValue(p, 'eeeeeeee-0000-4000-8000-000000000003', 'label', LONG_LABEL);
}

beforeAll(async () => {
  base = mkdtempSync(join(tmpdir(), 'mapping-fit-'));
  const dir = join(base, 'telas');
  mkdirSync(join(dir, 'specs', 'fit', 'components'), { recursive: true });
  writeFileSync(
    join(dir, 'specs', 'fit', 'fit.spec.json'),
    JSON.stringify(FIT_SPEC_JSON),
  );
  for (const [id, component] of Object.entries(FIT_COMPONENTS)) {
    writeFileSync(
      join(dir, 'specs', 'fit', 'components', `${id}.json`),
      JSON.stringify(component),
    );
  }
  writeFileSync(join(dir, 'mapping.json'), serialize(project()));
  roots = new Roots([base]);
  loaded = await loadProject(roots, await findProject(roots, 'telas'));
  mcp = await connect([base]);
});

afterAll(async () => {
  await mcp.close();
  rmSync(base, { recursive: true, force: true });
});

const io = {
  readSource: () => Promise.reject(new Error('sem arquivos')),
  readSpecInput: () => Promise.reject(new Error('sem arquivos')),
  takenImageFiles: new Set<string>(),
  now: () => new Date(NOW),
};

const run = (operations: Operation[]): Promise<BatchResult> =>
  runBatch(loaded, operations, io);
const rectOf = (result: BatchResult, id: string) =>
  result.project.markings.find((m) => m.id === id)!.rect;
const fit = (marking = BUTTON): Operation =>
  ({ op: 'fit_marking', marking }) as Operation;
const relabel = (label: string, annotation = BUTTON_A): Operation =>
  ({ op: 'update_annotation', annotation, values: { label } }) as Operation;

describe('fit_marking no lote', () => {
  it('depois de mudar o rótulo, ajusta a altura; o resumo diz o retângulo antes e depois', async () => {
    const result = await run([relabel(LONG_LABEL), fit()]);
    expect(result.errors).toEqual([]);
    const rect = rectOf(result, BUTTON);
    expect(rect).toMatchObject({ x: 20, y: 20, width: 120 });
    expect(rect.height).toBeGreaterThanOrEqual(76);
    const step = result.steps.find((s) => s.index === 1)!;
    expect(step.description).toContain('Fit the marking');
    expect(step.description).toContain('120×40 px at (20, 20)');
    expect(step.description).toContain(`120×${rect.height} px at (20, 20)`);
    expect(result.invariantIssues).toEqual([]);
  });

  it('só mudar o valor não muda o retângulo (nada se ajusta sozinho)', async () => {
    const result = await run([relabel(LONG_LABEL)]);
    expect(rectOf(result, BUTTON)).toMatchObject({ width: 120, height: 40 });
  });

  it('nada a mudar: o resumo diz isso e o projeto é o mesmo', async () => {
    const result = await run([fit()]);
    expect(result.errors).toEqual([]);
    expect(result.steps[0]!.description).toContain('nothing changes');
    expect(result.project.markings).toEqual(loaded.project.markings);
  });

  it('ajustar duas vezes: a segunda não muda nada', async () => {
    const result = await run([relabel(LONG_LABEL), fit(), fit()]);
    expect(result.steps[2]!.description).toContain('nothing changes');
  });

  it('os erros: not-fittable (com a dica), locked e referência desconhecida', async () => {
    const plain = await run([fit(PLAIN)]);
    expect(plain.errors[0]).toMatchObject({
      index: 0,
      op: 'fit_marking',
      code: 'not-fittable',
    });
    expect(plain.errors[0]!.hint).toContain('fit_marking');
    const locked = await run([fit(LOCKED)]);
    expect(locked.errors[0]).toMatchObject({ code: 'locked' });
    const missing = await run([fit('ffffffff-0000-4000-8000-000000000009')]);
    expect(missing.errors).toHaveLength(1);
    expect(missing.errors[0]!.op).toBe('fit_marking');
  });

  it('um apelido de uma marcação criada no mesmo lote vale', async () => {
    const result = await run([
      {
        op: 'create_marking',
        as: '$b',
        container: IMAGE,
        rect: { x: 300, y: 100, width: 120, height: 40 },
        annotation: { type: `${FIT_SPEC_ID}/fit-button`, values: { label: LONG_LABEL } },
      } as Operation,
      { op: 'fit_marking', marking: '$b' } as Operation,
    ]);
    expect(result.errors).toEqual([]);
    const id = (result.aliases.get('$b') as { id: string }).id;
    expect(rectOf(result, id).height).toBeGreaterThanOrEqual(76);
  });
});

describe('create_marking sem rect: nasce no tamanho medido (decisão 16)', () => {
  const create = (
    annotation: Record<string, unknown>,
    extra: Record<string, unknown> = {},
  ) =>
    ({
      op: 'create_marking',
      as: '$novo',
      container: IMAGE,
      annotation: { type: `${FIT_SPEC_ID}/fit-button`, ...annotation },
      ...extra,
    }) as Operation;
  const created = (result: BatchResult) =>
    rectOf(result, (result.aliases.get('$novo') as { id: string }).id);

  it('com o rótulo longo nos values, a altura já é a do conteúdo', async () => {
    const result = await run([create({ values: { label: LONG_LABEL } })]);
    expect(result.errors).toEqual([]);
    const rect = created(result);
    expect(rect.width).toBe(120);
    expect(rect.height).toBeGreaterThanOrEqual(76);
  });

  it('com o rótulo curto, o tamanho de sempre', async () => {
    const result = await run([create({ values: { label: 'Ok' } })]);
    expect(created(result)).toMatchObject({ width: 120, height: 40 });
  });

  it('com rect dado, ele manda', async () => {
    const rect = { x: 300, y: 300, width: 120, height: 40 };
    const result = await run([create({ values: { label: LONG_LABEL } }, { rect })]);
    expect(created(result)).toEqual(rect);
  });
});

describe('plan_changes: a prévia direta do fit_marking', () => {
  it('valida, resume o retângulo antes e depois e não grava nada', async () => {
    const plan = await planChanges(
      roots,
      loaded.location,
      [relabel(LONG_LABEL), fit()],
      () => Date.parse(NOW),
    );
    expect(plan.valid).toBe(true);
    expect((plan.summary as string[]).join('\n')).toContain('Fit the marking');
    const again = await planChanges(roots, loaded.location, [fit(PLAIN)], () =>
      Date.parse(NOW),
    );
    expect(again.valid).toBe(false);
  });

  it('pelo cliente stdio: a mesma prévia e o erro not-fittable', async () => {
    const plan = ok(
      await mcp.call<{ valid: boolean; summary: string[] }>('plan_changes', {
        project: 'telas',
        operations: [relabel(LONG_LABEL), fit()],
      }),
    );
    expect(plan.valid).toBe(true);
    expect(plan.summary.join('\n')).toContain('Fit the marking');
    const failed = await mcp.call<{ valid: boolean; errors: { code: string }[] }>(
      'plan_changes',
      { project: 'telas', operations: [fit(PLAIN)] },
    );
    expect(failed.data.valid).toBe(false);
    expect(failed.data.errors[0]!.code).toBe('not-fittable');
  });
});

describe('fit_marking numa proposta (decisão 18)', () => {
  const dir = () => join(base, 'telas');

  it('a revisão mostra o valor e a Posição com a altura nova; dá para aceitar só um', async () => {
    const proposed = await propose(mcp, 'telas', [relabel(LONG_LABEL), fit()], {
      title: 'Rótulo novo no botão',
    });
    expect(proposed.valid).toBe(true);
    const proposal = readProposal(dir(), proposed.proposal.id);
    const value = proposal.changes.find((c) => c.entity === 'annotation')!;
    const rect = proposal.changes.find(
      (c) => c.entity === 'marking' && c.field === 'rect',
    )!;
    expect(value).toBeDefined();
    expect(rect).toMatchObject({
      kind: 'update',
      from: { x: 20, y: 20, width: 120, height: 40 },
    });
    expect((rect.to as { height: number }).height).toBeGreaterThanOrEqual(76);
    // A revisão da app: a Posição é a mudança de geometria de sempre (sem tipo novo).
    expect(changeType(rect)).toBe('moved');
    expect(rect.field).toBe('rect');

    // Aceitar só o valor: o rótulo muda, o retângulo não.
    reviewDecide(
      dir(),
      proposed.proposal.id,
      { level: 'change', id: value.id },
      'accepted',
    );
    reviewDecide(
      dir(),
      proposed.proposal.id,
      { level: 'change', id: rect.id },
      'rejected',
    );
    const applied = applyAcceptedOnDisk(dir(), proposed.proposal.id);
    const marking = applied.markings.find((m) => m.id === BUTTON)!;
    expect(marking.rect).toMatchObject({ width: 120, height: 40 });
    expect(applied.annotations.find((a) => a.id === BUTTON_A)!.values).toMatchObject({
      label: LONG_LABEL,
    });
  });

  it('aceitar tudo aplica o valor e o ajuste', async () => {
    const proposed = await propose(mcp, 'telas', [fit()], { title: 'Ajustar ao rótulo' });
    const applied = acceptAllAndApply(dir(), proposed.proposal.id);
    expect(
      applied.markings.find((m) => m.id === BUTTON)!.rect.height,
    ).toBeGreaterThanOrEqual(76);
  });
});
