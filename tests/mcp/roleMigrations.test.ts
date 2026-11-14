import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Json } from '../model/specV11Fixtures';
import {
  acceptAllAndApply,
  ok,
  propose,
  readProject,
  readProposal,
} from './proposalSupport';
import { createRoleWorkspace, roleSpec, type RoleWorkspace } from './roleWorkspace';
import { connect, type Connection } from './workspace';

// Stage #557, PM2 (MCP 0.20.0): the role steps (`rename-role`, `remove-role`, `set-role`) in
// `plan_library_update`, in `update_specialization` and in the `formatVersion` 12 validations, over
// stdio. The scenario is that of `roleWorkspace`: `button` (roles `click` and `hold`), `A1` with the children
// `C1` (`click`) and `C2` (no role, `onHold`); `image` (role `tap`), `A3`; `text` with no roles.

interface Loss {
  reason: string;
  role?: string;
  message: string;
}

interface Plan {
  decision: string;
  refused: boolean;
  validation: { valid: boolean; errors: { message: string }[] };
  missingMigrations: { message: string; path: string }[];
  steps: {
    step: { op: string };
    annotations: number;
    unlinked: number;
    lossCount: number;
    losses: Loss[];
  }[];
  losses: Loss[];
  lossesTotal: number;
  pending: { code: string; label: string }[];
  hint: string;
}

interface Validation {
  valid: boolean;
  errors: string[];
}

let ws: RoleWorkspace;
let mcp: Connection;

const BUTTON_HOLD = [{ id: 'hold', name: 'Press' }];

/** The scenario's specialization at version 2 (v12 with `steps`, otherwise v11) and its file. */
function variant(name: string, edit: (s: Json) => void, steps?: unknown[]): string {
  const spec = roleSpec((s) => {
    edit(s);
    s.version = 2;
    if (steps !== undefined) {
      s.formatVersion = 12;
      s.migrations = [{ from: 1, to: 2, steps }];
    }
  });
  const file = join(ws.root, name, 's.json');
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(spec, null, 2));
  return `${name}/s.json`;
}

const noClick = (s: Json) => {
  s.layers[0].annotationTypes[0].childRoles = BUTTON_HOLD;
};
const textRoles = (s: Json) => {
  s.layers[0].annotationTypes[2].allowedChildren = [{ layer: 'eventos' }];
  s.layers[0].annotationTypes[2].childRoles = [{ id: 'main', name: 'Main' }];
};

let files: Record<string, string>;

beforeAll(async () => {
  ws = createRoleWorkspace();
  files = {
    removeNoStep: variant('rm-sem-passo', noClick),
    rolesNoStep: variant('papeis-sem-passo', textRoles),
    clear: variant('rm-clear', noClick, [
      { op: 'remove-role', type: 'button', role: 'click', mode: 'clear' },
    ]),
    unlink: variant('rm-unlink', noClick, [
      { op: 'remove-role', type: 'button', role: 'click', mode: 'unlink' },
    ]),
    rename: variant('renomeia', noClick, [
      { op: 'rename-role', type: 'button', from: 'click', to: 'hold' },
    ]),
    setRole: variant('set-role', textRoles, [
      { op: 'set-role', type: 'text', role: 'main' },
      { op: 'set-role', type: 'button', childType: 'onHold', role: 'hold' },
    ]),
  };
  mcp = await connect([ws.root], { cwd: ws.root });
});

afterAll(async () => {
  await mcp?.close();
});

const plan = async (path: string) =>
  ok(await mcp.call<Plan>('plan_library_update', { project: ws.project, path }));

describe('plan_library_update: role breaks without a step', () => {
  it('removed role: refused with removed-role and the hint cites the nine steps', async () => {
    const result = await plan(files.removeNoStep!);
    expect(result.decision).toBe('update');
    expect(result.refused).toBe(true);
    expect(result.missingMigrations).toHaveLength(1);
    expect(result.missingMigrations[0]!.message).toContain('"click"');
    expect(result.missingMigrations[0]!.path).toContain('childRoles');
    expect(result.hint).toMatch(
      /rename-type, remove-type, rename-field, remove-field, map-values, fill-field, rename-role, remove-role or set-role/,
    );
  });

  it('an owner that gains roles: refused with roles-required', async () => {
    const result = await plan(files.rolesNoStep!);
    expect(result.refused).toBe(true);
    expect(result.missingMigrations).toHaveLength(1);
    expect(result.missingMigrations[0]!.message).toContain('set-role');
    expect(result.missingMigrations[0]!.path).toMatch(/childRoles$/);
  });
});

describe('plan_library_update: with the steps', () => {
  it('remove-role with clear: report, cleared-role loss with the role and the missing-role pending item', async () => {
    const result = await plan(files.clear!);
    expect(result.refused).toBe(false);
    expect(result.validation.errors).toEqual([]);
    expect(result.steps[0]).toMatchObject({
      step: { op: 'remove-role' },
      annotations: 1,
      unlinked: 0,
      lossCount: 1,
    });
    expect(result.steps[0]!.losses[0]).toMatchObject({
      reason: 'cleared-role',
      role: 'click',
    });
    expect(result.losses[0]).toMatchObject({ reason: 'cleared-role', role: 'click' });
    expect(result.lossesTotal).toBe(1);
    expect(result.pending.map((p) => p.code)).toContain('missing-role');
    expect(result.hint).toMatch(/loses data/);
  });

  it('remove-role with unlink: unlinked in the step and in the report, unlinked loss with the role', async () => {
    const result = await plan(files.unlink!);
    expect(result.refused).toBe(false);
    expect(result.steps[0]).toMatchObject({ annotations: 1, unlinked: 1, lossCount: 1 });
    expect(result.steps[0]!.losses[0]).toMatchObject({
      reason: 'unlinked',
      role: 'click',
    });
    expect(result.losses).toHaveLength(1);
    expect(result.pending.map((p) => p.code)).not.toContain('missing-role');
  });

  it('rename-role: counts the child and nothing is lost', async () => {
    const result = await plan(files.rename!);
    expect(result.refused).toBe(false);
    expect(result.steps[0]).toMatchObject({
      step: { op: 'rename-role' },
      annotations: 1,
      unlinked: 0,
      lossCount: 0,
    });
    expect(result.lossesTotal).toBe(0);
    expect(result.hint).toMatch(/cover the breaks/);
  });

  it('set-role: the step with childType reaches only the child of the type, with no loss or new pending item', async () => {
    const result = await plan(files.setRole!);
    expect(result.refused).toBe(false);
    expect(result.steps.map((s) => [s.step.op, s.annotations])).toEqual([
      ['set-role', 0],
      ['set-role', 1],
    ]);
    expect(result.lossesTotal).toBe(0);
  });
});

/** A new scenario (applying migrates `proj`, so each test uses its own) with the v2 of the given steps. */
async function withMigration(
  steps: unknown[],
  run: (other: RoleWorkspace, conn: Connection) => Promise<void>,
): Promise<void> {
  const other = createRoleWorkspace();
  const conn = await connect([other.root], { cwd: other.root });
  try {
    const path = join(other.root, 'nova', 's.json');
    mkdirSync(dirname(path), { recursive: true });
    const spec = roleSpec((s) => {
      noClick(s);
      s.version = 2;
      s.formatVersion = 12;
      s.migrations = [{ from: 1, to: 2, steps }];
    });
    writeFileSync(path, JSON.stringify(spec));
    await run(other, conn);
  } finally {
    await conn.close();
  }
}

const updateOp = { op: 'update_specialization', file: 'nova/s.json' };

describe('update_specialization writes the migrated links', () => {
  it('clear: the plan shows parentRole click → null and applying writes it', async () => {
    await withMigration(
      [{ op: 'remove-role', type: 'button', role: 'click', mode: 'clear' }],
      async (other, conn) => {
        const dir = join(other.root, other.project);
        const proposed = await propose(conn, other.project, [updateOp]);
        expect(proposed.proposed).toBe(true);
        expect(proposed.summary.join(' ')).toMatch(/1 value lost/);
        const proposal = readProposal(dir, proposed.proposal.id);
        expect(proposal.changes.find((c) => c.field === 'parentRole')).toMatchObject({
          entity: 'annotation',
          from: 'click',
          to: null,
        });
        const next = acceptAllAndApply(dir, proposed.proposal.id);
        expect(next.annotations.find((a) => a.id === other.ids.C1)).toMatchObject({
          parentRole: null,
          parentAnnotationId: other.ids.A1,
        });
        expect(readProject(dir).revision).toBe(next.revision);
      },
    );
  });

  it('unlink: the plan shows parentAnnotationId and parentRole → null; the proposal stays in format 4', async () => {
    await withMigration(
      [{ op: 'remove-role', type: 'button', role: 'click', mode: 'unlink' }],
      async (other, conn) => {
        const dir = join(other.root, other.project);
        const proposed = await propose(conn, other.project, [updateOp]);
        expect(proposed.proposed).toBe(true);
        expect(proposed.summary.join(' ')).toMatch(/1 link undone/);
        const proposal = readProposal(dir, proposed.proposal.id);
        expect(proposal.formatVersion).toBe(4);
        const changes = proposal.changes.filter((c) => c.entity === 'annotation');
        expect(changes.find((c) => c.field === 'parentRole')?.to).toBeNull();
        expect(changes.find((c) => c.field === 'parentAnnotationId')).toMatchObject({
          from: other.ids.A1,
          to: null,
        });
        const next = acceptAllAndApply(dir, proposed.proposal.id);
        expect(next.annotations.find((a) => a.id === other.ids.C1)).toMatchObject({
          parentRole: null,
          parentAnnotationId: null,
        });
      },
    );
  });

  it('rename-role: the child becomes hold and the other stays as it was', async () => {
    await withMigration(
      [{ op: 'rename-role', type: 'button', from: 'click', to: 'hold' }],
      async (other, conn) => {
        const dir = join(other.root, other.project);
        const proposed = await propose(conn, other.project, [updateOp]);
        const next = acceptAllAndApply(dir, proposed.proposal.id);
        expect(next.annotations.find((a) => a.id === other.ids.C1)?.parentRole).toBe(
          'hold',
        );
        expect(
          next.annotations.find((a) => a.id === other.ids.C2)?.parentRole,
        ).toBeNull();
      },
    );
  });

  it('plan_changes shows the parentRole change without changing the proposal format', async () => {
    await withMigration(
      [{ op: 'rename-role', type: 'button', from: 'click', to: 'hold' }],
      async (other, conn) => {
        const planned = ok(
          await conn.call<{
            valid: boolean;
            changes: Record<string, { updated: number }>;
            summary: string[];
          }>('plan_changes', { project: other.project, operations: [updateOp] }),
        );
        expect(planned.valid).toBe(true);
        expect(planned.changes.annotations?.updated).toBe(1);
        expect(planned.summary.join(' ')).toMatch(/migration in 1 step/);
      },
    );
  });

  it('a role break with no step is refused with spec-missing-migrations', async () => {
    const failed = ok(
      await mcp.call<{
        valid: boolean;
        errors: { code: string; missingMigrations: { message: string }[] }[];
      }>('propose_changes', {
        project: ws.project,
        title: 'No step',
        operations: [{ op: 'update_specialization', file: files.removeNoStep! }],
      }),
    );
    expect(failed.valid).toBe(false);
    expect(failed.errors[0]!.code).toBe('spec-missing-migrations');
    expect(failed.errors[0]!.missingMigrations[0]!.message).toContain('"click"');
  });
});

describe('validate_specialization and validate_library: formatVersion 12', () => {
  const validate = async (spec: unknown) =>
    ok(
      await mcp.call<Validation>('validate_specialization', {
        text: JSON.stringify(spec),
      }),
    );
  const step = { op: 'remove-role', type: 'button', role: 'click', mode: 'clear' };
  const withStep = (formatVersion: number) =>
    roleSpec((s) => {
      noClick(s);
      s.version = 2;
      s.formatVersion = formatVersion;
      s.migrations = [{ from: 1, to: 2, steps: [step] }];
    });

  it('accepts v12 with the role steps', async () => {
    const result = await validate(withStep(12));
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it('a role step in a v11 gives only allowed with formatVersion 12 at the exact path', async () => {
    const result = await validate(withStep(11));
    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      'migrations[0].steps[0].op: only allowed with formatVersion 12',
    );
  });

  it('validate_library with previous accepts the step and refuses without it', async () => {
    const previous = join(ws.root, 'lib', 's.json');
    const good = ok(
      await mcp.call<Validation>('validate_library', { path: files.clear!, previous }),
    );
    expect(good.valid).toBe(true);
    const bad = ok(
      await mcp.call<Validation>('validate_library', {
        path: files.removeNoStep!,
        previous,
      }),
    );
    expect(bad.valid).toBe(false);
  });
});
