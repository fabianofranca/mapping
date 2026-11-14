import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { acceptAllAndApply, errorOf, ok, propose, readProject } from './proposalSupport';
import { createRoleWorkspace, type RoleWorkspace } from './roleWorkspace';
import { connect, type Connection } from './workspace';
import { join } from 'node:path';

// Stage #559, PD6 (MCP 0.18.0): `role` in create_annotation and update_annotation, the views with the
// `parentRole` and the children by role, and set_doc_repo / remove_doc_repo, over stdio.

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

describe('create_annotation with role', () => {
  it('with owner and a role the owner offers, the plan is valid and states the role', async () => {
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

  it('a role the owner does not offer fails with unknown-role', async () => {
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

  it('a role without owner fails with role-without-owner', async () => {
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

  it('without a role on an owner with roles the batch is valid, and the plan returns missing-role in issues', async () => {
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

  it('the proposed and applied batch writes the parentRole', async () => {
    const proposed = await propose(mcp, ws.project, [
      {
        op: 'create_annotation',
        as: '$new',
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

describe('update_annotation with role', () => {
  it('changes the role, clears with null, and a role the owner does not offer fails', async () => {
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

  it('changing the owner to an owner without the role clears the role', async () => {
    const proposed = await propose(mcp, ws.project, [
      { op: 'update_annotation', annotation: ws.ref('C2'), owner: ws.ref('A3') },
    ]);
    const project = acceptAllAndApply(dir(), proposed.proposal.id);
    const c2 = project.annotations.find((a) => a.id === ws.ids.C2)!;
    expect(c2.parentAnnotationId).toBe(ws.ids.A3);
    expect(c2.parentRole).toBeNull();
  });

  it('changing the owner and the role in the same step checks the role against the new owner', async () => {
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

describe('role-cleared warning: the owner change that clears the role', () => {
  const cleared = (r: Plan) =>
    (r.warnings ?? []).filter((w) => w.code === 'role-cleared');
  // Previous tests write changes to C1 and C2: step 0 puts the role of C1 back.
  const clickOnC1 = () => ({
    op: 'update_annotation',
    annotation: ws.ref('C1'),
    role: 'click',
  });

  it('owner that does not offer the role: note in the step and a structured warning', async () => {
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

  it('owner null on a child without requiresOwner: no owner and the warning says so', async () => {
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
    expect(warning!.message).toMatch(
      /is cleared: the annotation is left without an owner$/,
    );
  });

  it('no warning: no role before, owner that offers the same role, or role in the same step', async () => {
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

  it('propose_changes warns the same and still writes the proposal', async () => {
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

describe('views: parentRole and children by role', () => {
  it('get_annotation of the child shows the parentRole and the owner one groups the children by role', async () => {
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

  it('the get_marking tree carries the parentRole of each linked one', async () => {
    const marking = ok(await mcp.call('get_marking', { ref: ws.ref('M1', 'm') }));
    expect(JSON.stringify(marking)).toContain('"parentRole":"hold"');
  });
});

describe('set_doc_repo and remove_doc_repo', () => {
  it('validates the operations through the model errors', async () => {
    const result = ok(
      await plan([
        { op: 'set_doc_repo', repo: 'design-docs', localPath: '../clone' },
        { op: 'set_doc_repo', repo: 'does-not-exist', localPath: '..' },
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

  it('the plan counts the docRepos change, and the applied proposal writes the localPath', async () => {
    const operations = [{ op: 'set_doc_repo', repo: 'wiki', localPath: '../wiki' }];
    const result = ok(await plan(operations));
    expect(result.valid).toBe(true);
    expect(result.summary[0]).toContain('local clone of the documents repository "wiki"');
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

  it('the project summary lists the docRepos with the localPath', async () => {
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

  it('errorOf remains available for call errors', async () => {
    expect(
      errorOf(await mcp.call('get_annotation', { ref: 'mapping://proj/a/zzzzzzzz' }))
        .code,
    ).toBeTruthy();
  });
});
