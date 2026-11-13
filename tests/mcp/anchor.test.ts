import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  addComponentMarking,
  addContainer,
  applySpecialization,
  approximateMeasurer,
  createDrawingCache,
  createMarking,
  createProject,
  serialize,
  setMarkingAnchor,
  setMarkingLocked,
  type Project,
} from '../../src/model';
import { walk } from '../../src/model/components/scene';
import { runBatch, type BatchResult } from '../../mcp/batch';
import { planChanges } from '../../mcp/changes';
import type { Operation } from '../../mcp/operations';
import { Roots } from '../../mcp/paths';
import { findProject, loadProject, type LoadedProject } from '../../mcp/projects';
import { NOW } from '../model/fixtures';
import {
  TIP_COMPONENTS,
  TIP_SPEC_ID,
  TIP_SPEC_JSON,
  tipCatalog,
  tipSpec,
} from '../model/tooltipFixtures';
import {
  acceptAllAndApply,
  applyAcceptedOnDisk,
  errorOf,
  ok,
  propose,
  readProposal,
  reviewDecide,
} from './proposalSupport';
import { connect, type Connection } from './workspace';

// R3 da etapa #1096: a âncora no MCP. `anchor` em `create_marking` (sem `rect` nasce encostada) e
// em `update_marking` (`null` tira), a op `snap_to_anchor` (no lote e na proposta), `get_marking`
// (`anchor`, `anchoredBy`) e `get_code_hints` (`anchor`). O servidor nunca grava o projeto:
// "direto" é o lote (`runBatch`) e a prévia (`plan_changes`).

const IMAGE = 'bbbbbbbb-0000-4000-8000-000000000001';
const LAYER = 'cccccccc-0000-4000-8000-000000000001';
const TARGET = 'dddddddd-0000-4000-8000-000000000001';
const TIP = 'dddddddd-0000-4000-8000-000000000002';
const TIP_A = 'eeeeeeee-0000-4000-8000-000000000002';
const LOCKED = 'dddddddd-0000-4000-8000-000000000003';
const LOOSE = 'dddddddd-0000-4000-8000-000000000004';
const LOOSE2 = 'dddddddd-0000-4000-8000-000000000006';
const LOOSE3 = 'dddddddd-0000-4000-8000-000000000007';
const CANVAS = 'dddddddd-0000-4000-8000-000000000005';
const TARGET_RECT = { x: 200, y: 200, width: 100, height: 40 };

let base: string;
let roots: Roots;
let loaded: LoadedProject;
let mcp: Connection;

/** Um alvo, um tooltip já ancorado nele (o encosto é feito), um trancado ancorado e um solto. */
function project(): Project {
  let p = createProject({
    name: 'Telas',
    now: NOW,
    firstLayer: { id: LAYER, name: 'Camada 1', color: '#D32F2F' },
  });
  p = addContainer(p, { id: IMAGE, file: 'images/foto.png', width: 600, height: 400 });
  p = applySpecialization(p, tipSpec(), { packageSpecName: 'tip.spec.json' });
  p = createMarking(p, {
    id: TARGET,
    containerId: IMAGE,
    name: 'Alvo',
    rect: TARGET_RECT,
  });
  const tip = (id: string, annotationId: string, x: number, y: number) =>
    addComponentMarking(
      p,
      tipCatalog(),
      {
        markingId: id,
        annotationId,
        containerId: IMAGE,
        parentId: null,
        specId: TIP_SPEC_ID,
        typeId: 'tooltip',
        rect: { x, y, width: 100, height: 48 },
      },
      approximateMeasurer,
    );
  p = tip(TIP, TIP_A, 200, 148);
  p = setMarkingAnchor(p, TIP, { to: TARGET, side: 'top' });
  p = tip(LOCKED, 'eeeeeeee-0000-4000-8000-000000000003', 20, 20);
  p = setMarkingAnchor(p, LOCKED, { to: TARGET });
  p = setMarkingLocked(p, LOCKED, true);
  p = createMarking(p, {
    id: LOOSE,
    containerId: IMAGE,
    rect: { x: 400, y: 300, width: 50, height: 50 },
  });
  // Dois soltos a mais: cada teste de proposta aplica no disco e usa o seu.
  p = createMarking(p, {
    id: LOOSE2,
    containerId: IMAGE,
    rect: { x: 400, y: 100, width: 50, height: 50 },
  });
  p = createMarking(p, {
    id: LOOSE3,
    containerId: IMAGE,
    rect: { x: 500, y: 100, width: 50, height: 50 },
  });
  return createMarking(p, {
    id: CANVAS,
    containerId: null,
    rect: { x: 1000, y: 1000, width: 80, height: 40 },
  });
}

beforeAll(async () => {
  base = mkdtempSync(join(tmpdir(), 'mapping-anchor-'));
  const dir = join(base, 'telas');
  mkdirSync(join(dir, 'specs', 'tip', 'components'), { recursive: true });
  writeFileSync(
    join(dir, 'specs', 'tip', 'tip.spec.json'),
    JSON.stringify(TIP_SPEC_JSON),
  );
  for (const [id, component] of Object.entries(TIP_COMPONENTS)) {
    writeFileSync(
      join(dir, 'specs', 'tip', 'components', `${id}.json`),
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
const markingIn = (result: BatchResult, id: string) =>
  result.project.markings.find((m) => m.id === id)!;
const aliasId = (result: BatchResult, alias: string) =>
  (result.aliases.get(alias) as { id: string }).id;
const snap = (marking: string): Operation => ({ op: 'snap_to_anchor', marking });
const createTip = (extra: Record<string, unknown> = {}): Operation =>
  ({
    op: 'create_marking',
    as: '$tip',
    container: IMAGE,
    annotation: { type: `${TIP_SPEC_ID}/tooltip` },
    anchor: { to: TARGET },
    ...extra,
  }) as Operation;

/** A seta visível do tooltip: o canto de cima à esquerda, relativo à caixa dele. */
function arrowOf(project: Project, id: string): [number, number] | undefined {
  const drawing = createDrawingCache()(project, tipCatalog(), approximateMeasurer, 0).get(
    id,
  );
  const node = [...walk(drawing!.root)].find((n) => n.name === 'seta' && n.visible);
  return node === undefined ? undefined : [node.transform[4], node.transform[5]];
}

describe('create_marking com anchor', () => {
  it('sem rect nasce no tamanho do componente, encostado acima da âncora, com a seta sob o centro dela (num lote)', async () => {
    const result = await run([
      {
        op: 'create_marking',
        as: '$alvo',
        container: IMAGE,
        rect: { x: 300, y: 250, width: 120, height: 40 },
      } as Operation,
      createTip({ anchor: { to: '$alvo' } }),
    ]);
    expect(result.errors).toEqual([]);
    const target = aliasId(result, '$alvo');
    const tip = markingIn(result, aliasId(result, '$tip'));
    // 100 × 48 acima do alvo (y 250), com o offset.main 4 do componente; centrado em 300 + 60.
    expect(tip.rect).toEqual({ x: 310, y: 198, width: 100, height: 48 });
    expect(tip.anchor).toEqual({ to: target });
    expect(arrowOf(result.project, tip.id)).toEqual([42, 40]);
    expect(result.steps[1]!.description).toContain('tamanho inicial do componente');
    expect(result.invariantIssues).toEqual([]);
  });

  it('com side, align e offset dados, valem os dados (offset em pixels)', async () => {
    const result = await run([
      createTip({
        anchor: {
          to: TARGET,
          side: 'bottom',
          align: 'start',
          offset: { main: 10, cross: 3 },
        },
      }),
    ]);
    expect(result.errors).toEqual([]);
    expect(markingIn(result, aliasId(result, '$tip')).rect).toEqual({
      x: 203,
      y: 250,
      width: 100,
      height: 48,
    });
  });

  it('com rect dado, ele manda e a âncora é gravada', async () => {
    const rect = { x: 10, y: 10, width: 100, height: 48 };
    const result = await run([createTip({ rect })]);
    const tip = markingIn(result, aliasId(result, '$tip'));
    expect(tip.rect).toEqual(rect);
    expect(tip.anchor).toEqual({ to: TARGET });
  });

  it('marcação sem componente e sem rect continua sendo erro claro', async () => {
    const result = await run([
      { op: 'create_marking', container: IMAGE, anchor: { to: TARGET } } as Operation,
    ]);
    expect(result.errors[0]).toMatchObject({ code: 'invalid-arguments' });
    expect(result.errors[0]!.message).toContain('`rect` é obrigatório');
  });

  it('sem componente e com rect, a âncora é gravada sem mover', async () => {
    const rect = { x: 10, y: 10, width: 40, height: 40 };
    const result = await run([
      {
        op: 'create_marking',
        as: '$m',
        container: IMAGE,
        rect,
        anchor: { to: TARGET, side: 'start' },
      } as Operation,
    ]);
    expect(result.errors).toEqual([]);
    expect(markingIn(result, aliasId(result, '$m'))).toMatchObject({
      rect,
      anchor: { to: TARGET, side: 'start' },
    });
  });

  it('erros: âncora inexistente, em outro espaço', async () => {
    const missing = await run([
      createTip({ anchor: { to: 'ffffffff-0000-4000-8000-000000000009' } }),
    ]);
    expect(missing.errors).toHaveLength(1);
    expect(missing.errors[0]!.op).toBe('create_marking');
    const other = await run([createTip({ anchor: { to: CANVAS } })]);
    expect(other.errors[0]).toMatchObject({ code: 'anchor-other-space' });
  });
});

describe('update_marking com anchor', () => {
  it('grava a âncora sem mover e null a tira', async () => {
    const result = await run([
      {
        op: 'update_marking',
        marking: LOOSE,
        anchor: {
          to: TARGET,
          side: 'end',
          align: 'start',
          offset: { main: 2, cross: 0 },
        },
      } as Operation,
    ]);
    expect(result.errors).toEqual([]);
    expect(markingIn(result, LOOSE).anchor).toEqual({
      to: TARGET,
      side: 'end',
      align: 'start',
      offset: { main: 2, cross: 0 },
    });
    expect(markingIn(result, LOOSE).rect).toEqual({
      x: 400,
      y: 300,
      width: 50,
      height: 50,
    });
    expect(result.steps[0]!.description).toContain('ancorar em');
    const removed = await run([
      { op: 'update_marking', marking: TIP, anchor: null } as Operation,
    ]);
    expect(removed.errors).toEqual([]);
    expect(markingIn(removed, TIP).anchor ?? null).toBeNull();
    expect(removed.steps[0]!.description).toContain('tirar a âncora');
  });

  it('os erros anchor-self, anchor-cycle e anchor-other-space', async () => {
    const self = await run([
      { op: 'update_marking', marking: LOOSE, anchor: { to: LOOSE } } as Operation,
    ]);
    expect(self.errors[0]).toMatchObject({ op: 'update_marking', code: 'anchor-self' });
    const cycle = await run([
      { op: 'update_marking', marking: TARGET, anchor: { to: TIP } } as Operation,
    ]);
    expect(cycle.errors[0]).toMatchObject({ code: 'anchor-cycle' });
    const other = await run([
      { op: 'update_marking', marking: LOOSE, anchor: { to: CANVAS } } as Operation,
    ]);
    expect(other.errors[0]).toMatchObject({ code: 'anchor-other-space' });
  });

  it('a âncora tirada e depois a marcação movida: nada a levar junto', async () => {
    const result = await run([
      { op: 'update_marking', marking: TIP, anchor: null } as Operation,
      { op: 'update_marking', marking: TARGET, move: { dx: 50, dy: 0 } } as Operation,
    ]);
    expect(markingIn(result, TIP).rect.x).toBe(200);
  });
});

describe('mover a âncora e encostar de novo', () => {
  it('mover a âncora leva o tooltip junto; mudar o tamanho e snap_to_anchor o encosta de novo', async () => {
    const moved = await run([
      { op: 'update_marking', marking: TARGET, move: { dx: 60, dy: 20 } } as Operation,
    ]);
    expect(moved.errors).toEqual([]);
    expect(markingIn(moved, TIP).rect).toEqual({
      x: 260,
      y: 168,
      width: 100,
      height: 48,
    });

    const result = await run([
      {
        op: 'update_marking',
        marking: TIP,
        rect: { x: 200, y: 148, width: 100, height: 70 },
      } as Operation,
      snap(TIP),
    ]);
    expect(result.errors).toEqual([]);
    const tip = markingIn(result, TIP);
    // Mais alto (70): o encosto sobe até a borda de baixo ficar 4 acima da âncora (y 200).
    expect(tip.rect).toEqual({ x: 200, y: 126, width: 100, height: 70 });
    const step = result.steps[1]!;
    expect(step.description).toContain('Encostar a marcação');
    expect(step.description).toContain('100×70 px em (200, 148)');
    expect(step.description).toContain('100×70 px em (200, 126)');
    expect(result.invariantIssues).toEqual([]);
  });

  it('o padrão do componente (offset.main 4) vale quando a âncora não diz o offset', async () => {
    const result = await run([
      {
        op: 'update_marking',
        marking: TIP,
        rect: { x: 0, y: 0, width: 100, height: 48 },
      } as Operation,
      snap(TIP),
    ]);
    expect(markingIn(result, TIP).rect).toEqual({
      x: 200,
      y: 148,
      width: 100,
      height: 48,
    });
  });

  it('nada a mudar: o resumo diz isso e o projeto é o mesmo', async () => {
    const result = await run([snap(TIP)]);
    expect(result.errors).toEqual([]);
    expect(result.steps[0]!.description).toContain('nada muda');
    expect(result.project.markings).toEqual(loaded.project.markings);
  });

  it('os erros: not-anchored, locked e referência desconhecida', async () => {
    const loose = await run([snap(LOOSE)]);
    expect(loose.errors[0]).toMatchObject({
      index: 0,
      op: 'snap_to_anchor',
      code: 'not-anchored',
    });
    expect(loose.errors[0]!.hint).toContain('anchor');
    const locked = await run([snap(LOCKED)]);
    expect(locked.errors[0]).toMatchObject({ code: 'locked' });
    const missing = await run([snap('ffffffff-0000-4000-8000-000000000009')]);
    expect(missing.errors).toHaveLength(1);
    expect(missing.errors[0]!.op).toBe('snap_to_anchor');
  });

  it('um apelido de uma marcação criada no mesmo lote vale', async () => {
    const result = await run([
      createTip({ rect: { x: 10, y: 10, width: 100, height: 48 } }),
      snap('$tip'),
    ]);
    expect(result.errors).toEqual([]);
    expect(markingIn(result, aliasId(result, '$tip')).rect.y).toBe(148);
  });
});

describe('leitura: get_marking e get_code_hints', () => {
  const ref = async (id: string): Promise<string> =>
    ok(await mcp.call<{ ref: string }>('get_marking', { ref: id, project: 'telas' })).ref;

  it('get_marking da ancorada devolve anchor com to como referência; a âncora devolve anchoredBy', async () => {
    const tip = ok(
      await mcp.call<Record<string, unknown>>('get_marking', {
        ref: TIP,
        project: 'telas',
      }),
    );
    expect(tip.anchor).toEqual({ to: await ref(TARGET), side: 'top' });
    expect(tip.anchoredBy).toEqual([]);
    const target = ok(
      await mcp.call<Record<string, unknown>>('get_marking', {
        ref: TARGET,
        project: 'telas',
      }),
    );
    expect(target.anchor).toBeNull();
    expect(target.anchoredBy).toEqual(
      expect.arrayContaining([await ref(TIP), await ref(LOCKED)]),
    );
    expect((target.anchoredBy as string[]).length).toBe(2);
  });

  it('get_marking de uma marcação sem relação traz anchor null e anchoredBy vazio', async () => {
    const loose = ok(
      await mcp.call<Record<string, unknown>>('get_marking', {
        ref: LOOSE,
        project: 'telas',
      }),
    );
    expect(loose.anchor).toBeNull();
    expect(loose.anchoredBy).toEqual([]);
  });

  it('get_code_hints devolve anchor com o lado e o alinhamento efetivos (declarados ou os do componente)', async () => {
    const hints = ok(
      await mcp.call<{ anchor?: unknown; tree: { anchor?: unknown } }>('get_code_hints', {
        ref: TIP,
        platform: 'web',
        project: 'telas',
      }),
    );
    expect(hints.anchor).toEqual({
      marking: await ref(TARGET),
      side: 'top',
      align: 'center',
    });
    expect(hints.tree.anchor).toEqual(hints.anchor);
    const defaults = ok(
      await mcp.call<{ anchor?: unknown }>('get_code_hints', {
        ref: LOCKED,
        platform: 'web',
        project: 'telas',
      }),
    );
    expect(defaults.anchor).toEqual({
      marking: await ref(TARGET),
      side: 'top',
      align: 'center',
    });
    const none = ok(
      await mcp.call<{ anchor?: unknown }>('get_code_hints', {
        ref: TARGET,
        platform: 'web',
        project: 'telas',
      }),
    );
    expect(none.anchor).toBeUndefined();
  });
});

describe('plan_changes: a prévia direta', () => {
  it('valida a âncora e o encosto, resume o retângulo e não grava nada', async () => {
    const plan = await planChanges(
      roots,
      loaded.location,
      [
        {
          op: 'update_marking',
          marking: TIP,
          rect: { x: 0, y: 0, width: 100, height: 48 },
        } as Operation,
        snap(TIP),
      ],
      () => Date.parse(NOW),
    );
    expect(plan.valid).toBe(true);
    expect((plan.summary as string[]).join('\n')).toContain('Encostar a marcação');
    const again = await planChanges(roots, loaded.location, [snap(LOOSE)], () =>
      Date.parse(NOW),
    );
    expect(again.valid).toBe(false);
  });

  it('pelo cliente stdio: a mesma prévia e o erro not-anchored', async () => {
    const plan = ok(
      await mcp.call<{ valid: boolean; summary: string[] }>('plan_changes', {
        project: 'telas',
        operations: [
          { op: 'update_marking', marking: TARGET, move: { dx: 10, dy: 0 } },
          snap(TIP),
        ],
      }),
    );
    expect(plan.valid).toBe(true);
    const failed = await mcp.call<{ valid: boolean; errors: { code: string }[] }>(
      'plan_changes',
      { project: 'telas', operations: [snap(LOOSE)] },
    );
    expect(failed.data.valid).toBe(false);
    expect(failed.data.errors[0]!.code).toBe('not-anchored');
    expect(errorOf).toBeDefined();
  });
});

describe('anchor e snap_to_anchor numa proposta', () => {
  const dir = () => join(base, 'telas');
  const operations = (marking = LOOSE): Operation[] => [
    {
      op: 'update_marking',
      marking,
      anchor: { to: TARGET, side: 'bottom' },
    } as Operation,
    snap(marking),
  ];

  it('a revisão traz a âncora (campo anchor) e a Posição; a proposta grava a formatVersion 9', async () => {
    const proposed = await propose(mcp, 'telas', operations(), {
      title: 'Ancorar o solto',
    });
    expect(proposed.valid).toBe(true);
    const proposal = readProposal(dir(), proposed.proposal.id);
    expect(proposal.formatVersion).toBe(9);
    const anchor = proposal.changes.find(
      (c) => c.entity === 'marking' && c.field === 'anchor',
    )!;
    const rect = proposal.changes.find(
      (c) => c.entity === 'marking' && c.field === 'rect',
    )!;
    expect(anchor).toMatchObject({ from: null, to: { to: TARGET, side: 'bottom' } });
    expect(rect).toMatchObject({ from: { x: 400, y: 300, width: 50, height: 50 } });
    expect(proposed.summary.join('\n')).toContain('Encostar a marcação');
  });

  it('aceitar só a âncora grava a âncora e deixa o retângulo', async () => {
    const proposed = await propose(mcp, 'telas', operations(LOOSE2), {
      title: 'Só a âncora',
    });
    const proposal = readProposal(dir(), proposed.proposal.id);
    const anchor = proposal.changes.find((c) => c.field === 'anchor')!;
    const rect = proposal.changes.find((c) => c.field === 'rect')!;
    reviewDecide(
      dir(),
      proposed.proposal.id,
      { level: 'change', id: anchor.id },
      'accepted',
    );
    reviewDecide(
      dir(),
      proposed.proposal.id,
      { level: 'change', id: rect.id },
      'rejected',
    );
    const applied = applyAcceptedOnDisk(dir(), proposed.proposal.id);
    const marking = applied.markings.find((m) => m.id === LOOSE2)!;
    expect(marking.anchor).toEqual({ to: TARGET, side: 'bottom' });
    expect(marking.rect).toEqual({ x: 400, y: 100, width: 50, height: 50 });
  });

  it('aceitar só a Posição move e não grava a âncora', async () => {
    const proposed = await propose(mcp, 'telas', operations(LOOSE3), {
      title: 'Só a posição',
    });
    const proposal = readProposal(dir(), proposed.proposal.id);
    const anchor = proposal.changes.find((c) => c.field === 'anchor')!;
    const rect = proposal.changes.find((c) => c.field === 'rect')!;
    reviewDecide(
      dir(),
      proposed.proposal.id,
      { level: 'change', id: rect.id },
      'accepted',
    );
    reviewDecide(
      dir(),
      proposed.proposal.id,
      { level: 'change', id: anchor.id },
      'rejected',
    );
    const applied = applyAcceptedOnDisk(dir(), proposed.proposal.id);
    const marking = applied.markings.find((m) => m.id === LOOSE3)!;
    expect(marking.anchor ?? null).toBeNull();
    expect(marking.rect).toMatchObject({ x: 225, y: 240 });
  });

  it('só snap_to_anchor (numa já ancorada): é a Posição de sempre, sem subir a versão', async () => {
    const proposed = await propose(
      mcp,
      'telas',
      [
        {
          op: 'update_marking',
          marking: TIP,
          rect: { x: 200, y: 148, width: 100, height: 70 },
        } as Operation,
        snap(TIP),
      ],
      { title: 'Reencostar' },
    );
    const proposal = readProposal(dir(), proposed.proposal.id);
    expect(proposal.formatVersion).toBeLessThan(9);
    const applied = acceptAllAndApply(dir(), proposed.proposal.id);
    expect(applied.markings.find((m) => m.id === TIP)!.rect).toEqual({
      x: 200,
      y: 126,
      width: 100,
      height: 70,
    });
  });
});
