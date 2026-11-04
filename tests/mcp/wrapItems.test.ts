import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { wrapItems, type Project } from '../../src/model';
import {
  acceptAllAndApply,
  hashOf,
  ok,
  propose,
  readProject,
  readProposal,
} from './proposalSupport';
import { connect, type Connection } from './workspace';

// Operação `wrap_items` do MCP (etapa Envolver, EV2): o lote aplica o `wrapItems` do modelo
// (nenhuma regra própria), com apelido, nome e origem opcionais, avisos para nota e seta
// ignoradas e erro claro quando nada entra. A revisão mostra o mesmo que um `create_marking`.

interface Plan {
  valid: boolean;
  errors?: { index: number; op: string; code: string; message: string }[];
  warnings?: { code: string; op: number; message: string }[];
  summary: string[];
  changes: Record<string, { created: number; updated: number; deleted: number }>;
  created?: { op: number; alias?: string; kind: string; id?: string }[];
}

let root: string;
let mcp: Connection;
let dir: string;
const project = 'envolver';

const plan = async (operations: unknown[]) =>
  ok(await mcp.call<Plan>('plan_changes', { project, operations }));

const byName = (p: Project, name: string) => p.markings.find((m) => m.name === name)!;
const containerByName = (p: Project, name: string) =>
  p.containers.find((c) => c.name === name)!;

/** A marcação que o projeto novo tem e o anterior não tinha (a resposta traz só a referência). */
const created = (before: Project, after: Project) =>
  after.markings.find((m) => !before.markings.some((b) => b.id === m.id))!;

/**
 * O projeto sem o que varia entre uma execução e outra (revisão e data), com cada lista
 * ordenada por id: a aplicação de uma proposta acrescenta a marcação criada, enquanto o
 * `wrapItems` da app a põe antes da primeira envolvida (só muda o empate de área igual).
 */
const shape = (p: Project, newId: string) => {
  const sorted = (list: readonly unknown[]) =>
    list
      .map((x) =>
        JSON.stringify(
          Object.entries(x as object).sort(([a], [b]) => a.localeCompare(b)),
        ).replaceAll(newId, 'NEW'),
      )
      .sort();
  return {
    containers: sorted(p.containers),
    markings: sorted(p.markings),
    arrows: sorted(p.arrows),
    annotations: sorted(p.annotations),
  };
};

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), 'mapping-wrap-'));
  mcp = await connect([root]);
  ok(await mcp.call('create_project', { path: `projetos/${project}`, name: project }));
  dir = join(root, 'projetos', project);
  const base = await propose(mcp, project, [
    {
      op: 'add_container',
      as: '$home',
      name: 'Home',
      width: 300,
      height: 200,
      background: '#FFFFFF',
    },
    { op: 'add_container', name: 'Tela', width: 300, height: 200, background: '#FFFFFF' },
    {
      op: 'create_marking',
      as: '$a',
      container: 'Home',
      rect: { x: 50, y: 50, width: 40, height: 30 },
      name: 'A',
    },
    {
      op: 'create_marking',
      as: '$b',
      container: 'Home',
      rect: { x: 120, y: 60, width: 40, height: 30 },
      name: 'B',
    },
    {
      op: 'create_marking',
      container: 'Home',
      rect: { x: 200, y: 100, width: 30, height: 30 },
      name: 'C',
    },
    {
      op: 'create_marking',
      near: '$home',
      annotation: { type: 'notas/nota' },
      name: 'N',
    },
    { op: 'create_arrow', from: '$a', to: '$b', name: 'S' },
  ]);
  expect(base.valid, JSON.stringify(base.errors)).toBe(true);
  acceptAllAndApply(dir, base.proposal.id);
});

afterAll(async () => {
  await mcp?.close();
  rmSync(root, { recursive: true, force: true });
});

describe('wrap_items: criação', () => {
  it('em volta de dois containers: marcação do canvas com 8 px de margem e os dois filhos', async () => {
    const before = readProject(dir);
    const items = [
      containerByName(before, 'Home').id,
      containerByName(before, 'Tela').id,
    ];
    const proposed = await propose(mcp, project, [{ op: 'wrap_items', items }]);
    expect(proposed.valid, JSON.stringify(proposed.errors)).toBe(true);
    const after = acceptAllAndApply(dir, proposed.proposal.id);
    const id = created(before, after).id;
    const wrapper = after.markings.find((m) => m.id === id)!;
    expect(wrapper.containerId).toBeNull();
    expect(wrapper.name).toBeNull();
    for (const container of items) {
      expect(after.containers.find((c) => c.id === container)!.parentId).toBe(id);
    }
    // Margem: o retângulo é o mesmo do modelo, que dá 8 px em volta do conjunto.
    const expected = wrapItems(
      before,
      { id, items: items.map((i) => ({ kind: 'image' as const, id: i })) },
      { settle: true },
    );
    expect(wrapper.rect).toEqual(expected.markings.find((m) => m.id === id)!.rect);
    const first = containerByName(before, 'Home');
    expect(wrapper.rect.x).toBe(first.placement.x - 8);
    expect(wrapper.rect.y).toBe(first.placement.y - 8);
  });

  it('com marcações do mesmo container: a nova é desse container, com 8 px de margem', async () => {
    const before = readProject(dir);
    const a = byName(before, 'A');
    const b = byName(before, 'B');
    const result = await plan([{ op: 'wrap_items', items: [a.id, b.id] }]);
    expect(result.errors).toBeUndefined();
    expect(result.valid).toBe(true);
    expect(result.changes.markings?.created).toBe(1);
    const proposed = await propose(mcp, project, [
      { op: 'wrap_items', items: [a.id, b.id] },
    ]);
    const after = acceptAllAndApply(dir, proposed.proposal.id);
    const id = created(before, after).id;
    const wrapper = after.markings.find((m) => m.id === id)!;
    expect(wrapper.containerId).toBe(a.containerId);
    expect(wrapper.rect).toEqual({ x: 42, y: 42, width: 126, height: 56 });
    expect(after.markings.find((m) => m.id === a.id)!.parentId).toBe(id);
    expect(after.markings.find((m) => m.id === b.id)!.parentId).toBe(id);
  });

  it('as dá apelido à nova (citada na operação seguinte); name e source saem nela', async () => {
    const before = readProject(dir);
    const items = [byName(before, 'A').id, byName(before, 'C').id];
    const proposed = await propose(mcp, project, [
      {
        op: 'wrap_items',
        as: '$grupo',
        items,
        name: 'Grupo',
        source: { system: 'figma', id: '1:2' },
      },
      { op: 'create_annotation', marking: '$grupo', type: 'notas/nota' },
    ]);
    expect(proposed.valid, JSON.stringify(proposed.errors)).toBe(true);
    expect(proposed.created.find((c) => c.alias === '$grupo')?.kind).toBe('marking');
    const after = acceptAllAndApply(dir, proposed.proposal.id);
    const wrapper = created(before, after);
    expect(wrapper.name).toBe('Grupo');
    expect(wrapper.source).toMatchObject({ system: 'figma', id: '1:2' });
    expect(after.annotations.some((n) => n.markingId === wrapper.id)).toBe(true);
  });

  it('o resultado é o do wrapItems do modelo, sem regra própria do MCP', async () => {
    const before = readProject(dir);
    const items = [byName(before, 'B').id, byName(before, 'C').id];
    const proposed = await propose(mcp, project, [{ op: 'wrap_items', items }]);
    const after = acceptAllAndApply(dir, proposed.proposal.id);
    const id = created(before, after).id;
    const expected = wrapItems(
      before,
      { id, items: items.map((i) => ({ kind: 'marking' as const, id: i })) },
      { settle: true },
    );
    expect(shape(after, id)).toEqual(shape(expected, id));
  });
});

describe('wrap_items: avisos e erros', () => {
  it('nota e seta na lista são ignoradas com aviso', async () => {
    const p = readProject(dir);
    const items = [
      byName(p, 'A').id,
      byName(p, 'B').id,
      byName(p, 'N').id,
      p.arrows[0]!.id,
    ];
    const result = await plan([{ op: 'wrap_items', items }]);
    expect(result.errors).toBeUndefined();
    expect(result.valid).toBe(true);
    expect(result.warnings?.[0]).toMatchObject({ code: 'ignored-argument', op: 0 });
  });

  it('só nota e seta: erro claro e nada proposto', async () => {
    const p = readProject(dir);
    const items = [byName(p, 'N').id, p.arrows[0]!.id];
    const hash = hashOf(join(dir, 'mapping.json'));
    const result = await plan([{ op: 'wrap_items', items }]);
    expect(result.valid).toBe(false);
    expect(result.errors?.[0]).toMatchObject({
      op: 'wrap_items',
      code: 'invalid-parent',
    });
    expect(JSON.stringify(result.errors?.[0])).toMatch(/nota|seta|flutuante/i);
    const proposed = await propose(mcp, project, [{ op: 'wrap_items', items }]);
    expect(proposed.valid).toBe(false);
    expect(proposed.proposed).not.toBe(true);
    expect(hashOf(join(dir, 'mapping.json'))).toBe(hash);
  });

  it('item inexistente: o erro de sempre das outras operações', async () => {
    const missing = await plan([{ op: 'wrap_items', items: ['m/deadbeef'] }]);
    const other = await plan([
      { op: 'update_marking', marking: 'm/deadbeef', name: 'x' },
    ]);
    expect(missing.errors?.[0]?.code).toBe(other.errors?.[0]?.code);
    expect(missing.errors?.[0]?.code).toBe('not-found');
  });

  it('lista vazia é recusada pelo schema', async () => {
    const result = await mcp.client.callTool({
      name: 'plan_changes',
      arguments: { project, operations: [{ op: 'wrap_items', items: [] }] },
    });
    expect(result.isError).toBe(true);
  });
});

describe('wrap_items: plano e revisão', () => {
  it('plan_changes descreve a operação e não grava', async () => {
    const p = readProject(dir);
    const hash = hashOf(join(dir, 'mapping.json'));
    const result = await plan([
      { op: 'wrap_items', items: [byName(p, 'A').id, byName(p, 'B').id] },
    ]);
    expect(result.summary.join('\n')).toMatch(/Envolver 2 itens/);
    expect(hashOf(join(dir, 'mapping.json'))).toBe(hash);
  });

  it('a revisão mostra o mesmo que um create_marking com o mesmo retângulo', async () => {
    const p = readProject(dir);
    const items = [byName(p, 'A').id, byName(p, 'C').id];
    const wrapped = await propose(mcp, project, [{ op: 'wrap_items', items }]);
    const wrapProposal = readProposal(dir, wrapped.proposal.id);
    const made = wrapProposal.changes.find(
      (c) => c.entity === 'marking' && c.kind === 'create',
    )!;
    const rect = (made.to as { rect: unknown }).rect;
    const marked = await propose(mcp, project, [
      { op: 'create_marking', container: 'Home', rect },
    ]);
    const markProposal = readProposal(dir, marked.proposal.id);
    const markId = markProposal.changes.find(
      (c) => c.entity === 'marking' && c.kind === 'create',
    )!.entityId;
    expect(wrapped.reviewChanges).toEqual(marked.reviewChanges);
    expect(wrapped.levels).toEqual(marked.levels);
    expect(wrapped.changes).toEqual(marked.changes);
    // As mudanças são as mesmas, a menos do id da nova e do id de cada mudança.
    const norm = (proposal: typeof wrapProposal, id: string) =>
      proposal.changes
        .map((c) => ({ ...c, id: undefined }))
        .map((c) => JSON.stringify(c).replaceAll(id, 'NEW'))
        .sort();
    expect(norm(wrapProposal, made.entityId)).toEqual(norm(markProposal, markId));
  });
});
