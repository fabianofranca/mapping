import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Project } from '../../src/model';
import { acceptAllAndApply, ok, propose, readProject } from './proposalSupport';
import { codeOf, connect, type Connection } from './workspace';

// Respostas do lote (etapa #467, PF2): o `move_marking` que não muda nada diz isso, e o
// resultado de `plan_changes` e `propose_changes` lista em `membership` quem mudou de pai ou
// de espaço pela geometria (o caso do R9.15 do `docs/TESTING.md`).

interface Place {
  parent: string | null;
  container: string | null;
}
interface MembershipEntry {
  kind: 'marking' | 'container';
  ref: string;
  name: string | null;
  from: Place;
  to: Place;
  message: string;
}
interface Plan {
  valid: boolean;
  errors?: { index: number; op: string; code: string; message: string }[];
  summary: string[];
  membership?: MembershipEntry[];
  created?: { op: number; alias?: string; kind: string; ref?: string }[];
}

let root: string;
let mcp: Connection;
let dir: string;
const project = 'membership';

const plan = async (operations: unknown[]) =>
  ok(await mcp.call<Plan>('plan_changes', { project, operations }));

const byName = (p: Project, name: string) => p.markings.find((m) => m.name === name)!;

/** Container Detalhes com Topo (0, 0, 360×432) e Botão (20, 380, 100×40) dentro dele. */
beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), 'mapping-membership-'));
  mcp = await connect([root]);
  ok(await mcp.call('create_project', { path: `projetos/${project}`, name: project }));
  dir = join(root, 'projetos', project);
  const base = await propose(mcp, project, [
    {
      op: 'add_container',
      name: 'Detalhes',
      width: 400,
      height: 500,
      background: '#FFFFFF',
    },
    {
      op: 'create_marking',
      container: 'Detalhes',
      rect: { x: 0, y: 0, width: 360, height: 432 },
      name: 'Topo',
    },
    {
      op: 'create_marking',
      container: 'Detalhes',
      rect: { x: 20, y: 380, width: 100, height: 40 },
      name: 'Botão',
    },
  ]);
  expect(base.valid, JSON.stringify(base.errors)).toBe(true);
  acceptAllAndApply(dir, base.proposal.id);
});

afterAll(async () => {
  await mcp?.close();
  rmSync(root, { recursive: true, force: true });
});

/** O pedido do R9.15: o Botão desce 40 (sai do Topo) e o Topo vai para o índice 0. */
const botaoSai = (p: Project) => [
  {
    op: 'update_marking',
    marking: byName(p, 'Botão').id,
    rect: { x: 20, y: 420, width: 100, height: 40 },
  },
  { op: 'move_marking', marking: byName(p, 'Topo').id, index: 0 },
];

describe('move_marking sem efeito', () => {
  it('diz que a marcação já está na posição e que nada muda', async () => {
    const result = await plan(botaoSai(readProject(dir)));
    expect(result.valid).toBe(true);
    expect(result.summary[1]).toContain('já está na posição 0 entre as 2 irmãs');
    expect(result.summary[1]).toContain('nada muda');
    expect(result.summary[1]).not.toContain('Mover');
  });

  it('o que muda a ordem segue com a descrição de sempre', async () => {
    const p = readProject(dir);
    const result = await plan([
      botaoSai(p)[0],
      { op: 'move_marking', marking: byName(p, 'Botão').id, index: 0 },
    ]);
    expect(result.summary[1]).toContain('Mover a marcação');
    expect(result.summary[1]).toContain('para a posição 0 entre as 2 irmãs');
  });
});

describe('membership', () => {
  it('plan_changes lista o Botão, que sai do Topo e fica direto no Detalhes', async () => {
    const p = readProject(dir);
    const result = await plan(botaoSai(p));
    expect(result.membership).toHaveLength(1);
    const [entry] = result.membership!;
    expect(entry!.kind).toBe('marking');
    expect(entry!.name).toBe('Botão');
    expect(entry!.ref).toContain(codeOf(byName(p, 'Botão').id));
    expect(entry!.from.parent).toContain(codeOf(byName(p, 'Topo').id));
    expect(entry!.to.parent).toBeNull();
    expect(entry!.to.container).toBe(entry!.from.container);
    expect(entry!.to.container).toContain(
      p.containers[0]!.id.replaceAll('-', '').slice(0, 8),
    );
    expect(entry!.message).toBe('Botão sai de Topo; agora direto em Detalhes');
  });

  it('propose_changes traz o mesmo, e o aplicado bate com o `to`', async () => {
    const before = readProject(dir);
    const planned = await plan(botaoSai(before));
    const proposed = await propose(mcp, project, botaoSai(before));
    expect(proposed.valid, JSON.stringify(proposed.errors)).toBe(true);
    const { membership } = proposed as unknown as Plan;
    expect(membership).toHaveLength(1);
    expect(membership![0]!.message).toBe('Botão sai de Topo; agora direto em Detalhes');
    expect(membership).toEqual(planned.membership);
    const after = acceptAllAndApply(dir, proposed.proposal.id);
    const botao = byName(after, 'Botão');
    expect(botao.parentId).toBeNull();
    expect(botao.containerId).toBe(before.containers[0]!.id);
  });

  it('lote sem mudança de pertencimento não traz o campo', async () => {
    const p = readProject(dir);
    const result = await plan([
      { op: 'update_marking', marking: byName(p, 'Topo').id, name: 'Topo 2' },
    ]);
    expect(result.valid).toBe(true);
    expect(result).not.toHaveProperty('membership');
  });

  it('wrap_items lista os dois itens, com a criada (pelo apelido) como pai novo', async () => {
    const p = readProject(dir);
    const items = [byName(p, 'Topo').id, byName(p, 'Botão').id];
    const result = await plan([{ op: 'wrap_items', as: '$grupo', items, name: 'Grupo' }]);
    expect(result.valid, JSON.stringify(result.errors)).toBe(true);
    const grupo = result.created!.find((c) => c.alias === '$grupo')!;
    const entries = result.membership!;
    expect(entries.map((e) => e.name).sort()).toEqual(['Botão', 'Topo']);
    for (const entry of entries) {
      expect(entry.to.parent).toBe(grupo.ref);
      expect(entry.message).toContain('Grupo');
    }
  });
});

describe('membership no empate de retângulo', () => {
  it('a marcação que preenche o container fica dentro da criada, e a lista bate com o aplicado', async () => {
    const seed = await propose(mcp, project, [
      {
        op: 'add_container',
        name: 'Cheio',
        width: 200,
        height: 200,
        background: '#FFFFFF',
      },
      {
        op: 'create_marking',
        container: 'Cheio',
        rect: { x: 0, y: 0, width: 200, height: 200 },
        name: 'Tudo',
      },
    ]);
    expect(seed.valid, JSON.stringify(seed.errors)).toBe(true);
    const before = acceptAllAndApply(dir, seed.proposal.id);
    const tudo = byName(before, 'Tudo');
    const operations = [
      { op: 'wrap_items', as: '$g', items: [tudo.id], name: 'Envoltório' },
    ];
    const planned = await plan(operations);
    const proposed = await propose(mcp, project, operations);
    expect(proposed.valid, JSON.stringify(proposed.errors)).toBe(true);
    const { membership } = proposed as unknown as Plan;
    expect(membership).toHaveLength(1);
    expect(planned.membership).toHaveLength(1);
    // O id da criada muda a cada cálculo; o resto da entrada é o mesmo.
    expect({ ...membership![0]!, to: null, ref: null }).toEqual({
      ...planned.membership![0]!,
      to: null,
      ref: null,
    });
    const after = acceptAllAndApply(dir, proposed.proposal.id);
    const wrapper = byName(after, 'Envoltório');
    expect(byName(after, 'Tudo').parentId).toBe(wrapper.id);
    expect(membership![0]!.to.parent).toContain(codeOf(wrapper.id));
    expect(membership![0]!.message).toBe('Tudo entra em Envoltório');
  });
});
