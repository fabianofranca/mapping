import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { acceptAllAndApply, errorOf, ok, propose, readProject } from './proposalSupport';
import { createRoleWorkspace, type RoleWorkspace } from './roleWorkspace';
import { connect, type Connection } from './workspace';
import { join } from 'node:path';

// Etapa #559, PD6 (MCP 0.18.0): `role` em create_annotation e update_annotation, as vistas com o
// `parentRole` e os filhos por papel, e set_doc_repo / remove_doc_repo, por stdio.

interface Plan {
  valid: boolean;
  summary: string[];
  errors?: { index: number; op: string; code: string; message: string }[];
  changes: Record<string, { created: number; updated: number; deleted: number }>;
  issues: { new: { codes?: string[]; issues?: { code: string }[] }[] };
  warnings?: {
    code: string;
    op?: number;
    annotation?: string;
    role?: string;
    roleName?: string;
    message?: string;
  }[];
}

let ws: RoleWorkspace;
let mcp: Connection;

beforeAll(async () => {
  ws = createRoleWorkspace();
  mcp = await connect([ws.root], { cwd: ws.root });
});

afterAll(async () => {
  await mcp?.close();
});

const plan = (operations: unknown[], project = ws.project) =>
  mcp.call<Plan>('plan_changes', { project, operations });
const dir = () => join(ws.root, ws.project);
const eventsType = { type: 's/onClick' };

describe('create_annotation com role', () => {
  it('com owner e um role que o dono oferece, o plano é válido e diz o papel', async () => {
    const result = ok(
      await plan([
        {
          op: 'create_annotation',
          marking: ws.ref('M1', 'm'),
          ...eventsType,
          owner: ws.ref('A2'),
          role: 'hold',
        },
      ]),
    );
    expect(result.valid).toBe(true);
    expect(result.summary[0]).toContain('role "Pressionar"');
  });

  it('um role que o dono não oferece falha com unknown-role', async () => {
    const result = ok(
      await plan([
        {
          op: 'create_annotation',
          marking: ws.ref('M1', 'm'),
          ...eventsType,
          owner: ws.ref('A3'),
          role: 'click',
        },
      ]),
    );
    expect(result.valid).toBe(false);
    expect(result.errors![0]!.code).toBe('unknown-role');
    expect(result.errors![0]!.message).toContain('the owner does not offer this role');
  });

  it('um role sem owner falha com role-without-owner', async () => {
    const result = ok(
      await plan([
        {
          op: 'create_annotation',
          marking: ws.ref('M1', 'm'),
          ...eventsType,
          role: 'click',
        },
      ]),
    );
    expect(result.errors![0]!.code).toBe('role-without-owner');
  });

  it('sem role num dono com papéis o lote vale, e o plano devolve missing-role em issues', async () => {
    const result = ok(
      await plan([
        {
          op: 'create_annotation',
          marking: ws.ref('M1', 'm'),
          ...eventsType,
          owner: ws.ref('A2'),
        },
      ]),
    );
    expect(result.valid).toBe(true);
    expect(JSON.stringify(result.issues.new)).toContain('missing-role');
  });

  it('o lote proposto e aplicado grava o parentRole', async () => {
    const proposed = await propose(mcp, ws.project, [
      {
        op: 'create_annotation',
        as: '$novo',
        marking: ws.ref('M1', 'm'),
        ...eventsType,
        owner: ws.ref('A2'),
        role: 'hold',
      },
    ]);
    const project = acceptAllAndApply(dir(), proposed.proposal.id);
    const created = project.annotations.filter((a) => a.parentAnnotationId === ws.ids.A2);
    expect(created.map((a) => a.parentRole)).toEqual(['hold']);
    expect(readProject(dir()).annotations.length).toBe(project.annotations.length);
  });
});

describe('update_annotation com role', () => {
  it('troca o role, limpa com null, e um role que o dono não oferece falha', async () => {
    const bad = ok(
      await plan([{ op: 'update_annotation', annotation: ws.ref('C1'), role: 'tap' }]),
    );
    expect(bad.errors![0]!.code).toBe('unknown-role');

    const proposed = await propose(mcp, ws.project, [
      { op: 'update_annotation', annotation: ws.ref('C2'), role: 'click' },
      { op: 'update_annotation', annotation: ws.ref('C1'), role: null },
    ]);
    const project = acceptAllAndApply(dir(), proposed.proposal.id);
    const role = (id: string) =>
      project.annotations.find((a) => a.id === ws.ids[id])!.parentRole;
    expect(role('C2')).toBe('click');
    expect(role('C1')).toBeNull();
  });

  it('trocar o owner para um dono sem o papel limpa o papel', async () => {
    const proposed = await propose(mcp, ws.project, [
      { op: 'update_annotation', annotation: ws.ref('C2'), owner: ws.ref('A3') },
    ]);
    const project = acceptAllAndApply(dir(), proposed.proposal.id);
    const c2 = project.annotations.find((a) => a.id === ws.ids.C2)!;
    expect(c2.parentAnnotationId).toBe(ws.ids.A3);
    expect(c2.parentRole).toBeNull();
  });

  it('trocar o owner e o role no mesmo passo confere o role contra o novo dono', async () => {
    const result = ok(
      await plan([
        {
          op: 'update_annotation',
          annotation: ws.ref('C1'),
          owner: ws.ref('A3'),
          role: 'tap',
        },
      ]),
    );
    expect(result.valid).toBe(true);
  });
});

describe('aviso role-cleared: a troca de dono que limpa o papel', () => {
  const cleared = (r: Plan) =>
    (r.warnings ?? []).filter((w) => w.code === 'role-cleared');
  // Testes anteriores gravam alterações em C1 e C2: o passo 0 põe o papel de C1 de volta.
  const clickOnC1 = () => ({
    op: 'update_annotation',
    annotation: ws.ref('C1'),
    role: 'click',
  });

  it('dona que não oferece o papel: nota no passo e um aviso estruturado', async () => {
    const result = ok(
      await plan([
        clickOnC1(),
        { op: 'update_annotation', annotation: ws.ref('C1'), owner: ws.ref('A3') },
      ]),
    );
    expect(result.valid).toBe(true);
    expect(result.summary[1]).toMatch(/owner .*; role "Clique" cleared$/);
    expect(cleared(result)).toEqual([
      {
        code: 'role-cleared',
        op: 1,
        annotation: ws.ref('C1'),
        role: 'click',
        roleName: 'Clique',
        message: expect.stringMatching(
          /^the role "Clique" of .* is cleared: the new owner does not offer it$/,
        ),
      },
    ]);
  });

  it('owner null num filho sem requiresOwner: sem dona e o aviso diz isso', async () => {
    const result = ok(
      await plan([
        clickOnC1(),
        { op: 'update_annotation', annotation: ws.ref('C1'), owner: null },
      ]),
    );
    expect(result.valid).toBe(true);
    expect(result.summary[1]).toMatch(/no owner; role "Clique" cleared$/);
    const [warning] = cleared(result);
    expect(cleared(result)).toHaveLength(1);
    expect(warning).toMatchObject({ op: 1, annotation: ws.ref('C1'), role: 'click' });
    expect(warning!.message).toMatch(/is cleared: the annotation is left without an owner$/);
  });

  it('sem aviso: sem papel antes, dona que oferece o mesmo papel, ou role no mesmo passo', async () => {
    const result = ok(
      await plan([
        { op: 'update_annotation', annotation: ws.ref('C2'), owner: ws.ref('A3') },
        clickOnC1(),
        { op: 'update_annotation', annotation: ws.ref('C1'), owner: ws.ref('A2') },
        {
          op: 'update_annotation',
          annotation: ws.ref('C1'),
          owner: ws.ref('A3'),
          role: 'tap',
        },
        {
          op: 'update_annotation',
          annotation: ws.ref('C1'),
          owner: ws.ref('A1'),
          role: 'click',
        },
        { op: 'update_annotation', annotation: ws.ref('C1'), owner: null, role: null },
      ]),
    );
    expect(result.valid).toBe(true);
    expect(cleared(result)).toEqual([]);
    for (const line of result.summary) expect(line).not.toContain('limpo');
  });

  it('o propose_changes avisa igual e continua gravando a proposta', async () => {
    const proposed = await propose(mcp, ws.project, [
      clickOnC1(),
      { op: 'update_annotation', annotation: ws.ref('C1'), owner: ws.ref('A3') },
    ]);
    expect(proposed.valid).toBe(true);
    expect(proposed.proposed).toBe(true);
    expect(proposed.summary[1]).toMatch(/; role "Clique" cleared$/);
    const warnings = (proposed as unknown as Plan).warnings ?? [];
    expect(warnings.filter((w) => w.code === 'role-cleared')).toHaveLength(1);
  });
});

describe('vistas: parentRole e filhos por papel', () => {
  it('get_annotation do filho mostra o parentRole e o do dono agrupa os filhos por papel', async () => {
    const child = ok(await mcp.call('get_annotation', { ref: ws.ref('C2') }));
    expect(child.owner).toBe(ws.ref('A3'));
    const withRole = await propose(mcp, ws.project, [
      {
        op: 'update_annotation',
        annotation: ws.ref('C1'),
        owner: ws.ref('A1'),
        role: 'hold',
      },
      {
        op: 'update_annotation',
        annotation: ws.ref('C2'),
        owner: ws.ref('A1'),
        role: null,
      },
    ]);
    acceptAllAndApply(dir(), withRole.proposal.id);

    const c1 = ok(
      await mcp.call<Record<string, unknown>>('get_annotation', { ref: ws.ref('C1') }),
    );
    expect(c1.parentRole).toBe('hold');
    expect(c1.roleName).toBe('Pressionar');

    const owner = ok(
      await mcp.call<Record<string, unknown>>('get_annotation', { ref: ws.ref('A1') }),
    );
    const byRole = owner.linkedByRole as {
      label: string | null;
      roles: { id: string; name: string; linked: string[] }[];
      unassigned: string[];
    };
    expect(byRole.label).toBe('Trigger');
    expect(byRole.roles.map((r) => [r.id, r.linked.length])).toEqual([
      ['click', 0],
      ['hold', 1],
    ]);
    expect(byRole.unassigned.length).toBe(1);
    expect((owner.linked as string[]).length).toBe(2);
  });

  it('a árvore de get_marking leva o parentRole de cada vinculada', async () => {
    const marking = ok(await mcp.call('get_marking', { ref: ws.ref('M1', 'm') }));
    expect(JSON.stringify(marking)).toContain('"parentRole":"hold"');
  });
});

describe('set_doc_repo e remove_doc_repo', () => {
  it('valida as operações pelos erros do modelo', async () => {
    const result = ok(
      await plan([
        { op: 'set_doc_repo', repo: 'design-docs', localPath: '../clone' },
        { op: 'set_doc_repo', repo: 'nao-existe', localPath: '..' },
        { op: 'set_doc_repo', repo: 'wiki' },
        { op: 'set_doc_repo', repo: 'wiki', localPath: '/abs/olute' },
        { op: 'remove_doc_repo', repo: 'wiki' },
      ]),
    );
    expect(result.errors!.map((e) => [e.index, e.code])).toEqual([
      [1, 'unknown-doc-repo'],
      [2, 'nothing-to-change'],
      [3, 'invalid-local-path'],
      [4, 'not-found'],
    ]);
  });

  it('o plano conta a mudança docRepos, e a proposta aplicada grava o localPath', async () => {
    const operations = [{ op: 'set_doc_repo', repo: 'wiki', localPath: '../wiki' }];
    const result = ok(await plan(operations));
    expect(result.valid).toBe(true);
    expect(result.summary[0]).toContain(
      'local clone of the documents repository "wiki"',
    );
    expect(result.changes.docRepos).toEqual({ created: 1, updated: 0, deleted: 0 });

    const proposed = await propose(mcp, ws.project, operations);
    const project = acceptAllAndApply(dir(), proposed.proposal.id);
    expect(project.docRepos.wiki).toEqual({ localPath: '../wiki' });

    const removal = [{ op: 'remove_doc_repo', repo: 'wiki' }];
    expect(ok(await plan(removal)).changes.docRepos).toEqual({
      created: 0,
      updated: 0,
      deleted: 1,
    });
    const removed = await propose(mcp, ws.project, removal);
    expect(acceptAllAndApply(dir(), removed.proposal.id).docRepos).toEqual({
      'design-docs': { localPath: '../clone' },
    });
  });

  it('o resumo do projeto lista os docRepos com o localPath', async () => {
    const project = ok(
      await mcp.call<{ docRepos: Record<string, unknown>[] }>('get_project', {
        project: ws.project,
      }),
    );
    expect(project.docRepos).toEqual([
      {
        id: 'design-docs',
        specs: ['s'],
        repos: [
          {
            specId: 's',
            url: 'https://gitlab.example.com/g/design-docs',
            urlTemplate: 'https://gitlab.example.com/g/design-docs/-/blob/main/{path}',
            ref: 'main',
          },
        ],
        localPath: '../clone',
      },
      {
        id: 'wiki',
        specs: ['s'],
        repos: [{ specId: 's', url: 'https://gitlab.example.com/g/wiki' }],
        localPath: null,
      },
    ]);
  });

  it('errorOf continua disponível para erros de chamada', async () => {
    expect(
      errorOf(await mcp.call('get_annotation', { ref: 'mapping://proj/a/zzzzzzzz' }))
        .code,
    ).toBeTruthy();
  });
});
