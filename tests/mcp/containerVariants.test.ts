import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  PROPOSAL_VARIANT_GROUP_FORMAT_VERSION,
  applySpecialization,
  createProject,
  serialize,
  specFiles,
  type Spec,
} from '../../src/model';
import { NOW } from '../model/fixtures';
import { acceptAllAndApply, errorOf, ok, propose, readProposal } from './proposalSupport';
import { connect, type Connection } from './workspace';

// Variants of a screen (schema v26, stage #2034 VR2): `add_container` and `update_container` accept
// `variantOf` (a container reference or `$name`; `null` in `update_container` leaves the group);
// `get_container` returns `variants` and `missingTypes`; `get_project` lists `variants` only on the
// containers that have them.

const SPEC: Spec = {
  format: 'mapping-spec',
  formatVersion: 21,
  id: 'ds',
  name: 'Design System',
  version: 1,
  layers: [
    {
      id: 'ui',
      name: 'UI',
      color: '#D32F2F',
      annotationTypes: [
        { id: 'button', name: 'Button', fields: [] },
        { id: 'fab', name: 'Fab', fields: [] },
      ],
    },
  ],
  containerClasses: [
    {
      id: 'window',
      name: 'Window',
      by: 'width',
      classes: [
        { id: 'compact', name: 'Compact', below: 600 },
        { id: 'expanded', name: 'Expanded' },
      ],
    },
  ],
};

let root: string;
let mcp: Connection;
let counter = 0;

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), 'mapping-variants-'));
  mcp = await connect([root]);
});

afterAll(async () => {
  await mcp?.close();
  rmSync(root, { recursive: true, force: true });
});

function newProject(): { name: string; dir: string } {
  const name = `variants-${++counter}`;
  const dir = join(root, 'projetos', name);
  const p = applySpecialization(
    createProject({
      name,
      now: NOW,
      firstLayer: { id: 'l1', name: 'Layer 1', color: '#D32F2F' },
      firstPage: { id: 'pg1', name: 'Page 1' },
    }),
    SPEC,
  );
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'mapping.json'), serialize(p));
  for (const [file, content] of specFiles(p)) {
    mkdirSync(dirname(join(dir, file)), { recursive: true });
    writeFileSync(join(dir, file), content);
  }
  return { name, dir };
}

async function apply(name: string, dir: string, operations: unknown[]) {
  const proposed = await propose(mcp, name, operations);
  if (!proposed.proposal) throw new Error(JSON.stringify(proposed.errors));
  return { proposed, saved: acceptAllAndApply(dir, proposed.proposal.id) };
}

const box = (as: string, width: number, extra: object = {}) => ({
  op: 'add_container',
  as,
  name: as.slice(1),
  width,
  height: 800,
  background: '#FFFFFF',
  ...extra,
});

const refOf = (
  proposed: { created: { kind: string; alias?: string; ref?: string }[] },
  alias: string,
): string => proposed.created.find((c) => c.alias === alias)!.ref!;

interface Failures {
  valid: boolean;
  errors: { code: string; message: string; variantError?: string }[];
}

async function plan(name: string, operations: unknown[]): Promise<Failures> {
  return ok(await mcp.call<Failures>('plan_changes', { project: name, operations }));
}

describe('variantOf in add_container and update_container', () => {
  it('add_container links to an existing container and to a $name of the same batch', async () => {
    const { name, dir } = newProject();
    const first = await apply(name, dir, [box('$a', 390)]);
    const a = refOf(first.proposed, '$a');
    const second = await apply(name, dir, [
      box('$b', 900, { variantOf: a }),
      box('$c', 1200, { variantOf: '$b' }),
    ]);
    const groups = second.saved.containers.map((c) => c.variantGroup);
    expect(groups[0]).toBeDefined();
    expect(new Set(groups).size).toBe(1);
  });

  it('update_container merges two groups and null leaves the group', async () => {
    const { name, dir } = newProject();
    const made = await apply(name, dir, [
      box('$a', 390),
      box('$b', 900, { variantOf: '$a' }),
      box('$c', 400),
      box('$d', 1000, { variantOf: '$c' }),
    ]);
    const a = refOf(made.proposed, '$a');
    const c = refOf(made.proposed, '$c');
    expect(new Set(made.saved.containers.map((x) => x.variantGroup)).size).toBe(2);

    const merged = await apply(name, dir, [
      { op: 'update_container', container: a, variantOf: c },
    ]);
    expect(new Set(merged.saved.containers.map((x) => x.variantGroup)).size).toBe(1);

    const left = await apply(name, dir, [
      { op: 'update_container', container: a, variantOf: null },
    ]);
    expect('variantGroup' in left.saved.containers[0]!).toBe(false);
    expect(left.saved.containers[1]!.variantGroup).toBeDefined();
  });

  it('refuses the same container and one already in the group, with the code in details', async () => {
    const { name, dir } = newProject();
    const made = await apply(name, dir, [
      box('$a', 390),
      box('$b', 900, { variantOf: '$a' }),
    ]);
    const a = refOf(made.proposed, '$a');
    const b = refOf(made.proposed, '$b');

    const self = await plan(name, [{ op: 'update_container', container: a, variantOf: a }]);
    expect(self.valid).toBe(false);
    expect(self.errors[0]).toMatchObject({
      code: 'invalid-arguments',
      variantError: 'variant-self',
    });
    const again = await plan(name, [{ op: 'update_container', container: a, variantOf: b }]);
    expect(again.errors[0]).toMatchObject({
      code: 'invalid-arguments',
      variantError: 'variant-already-linked',
    });
  });

  it('an unknown reference is not-found', async () => {
    const { name } = newProject();
    const result = await mcp.call('plan_changes', {
      project: name,
      operations: [box('$a', 390, { variantOf: `mapping://${name}/i/zzzzzz` })],
    });
    const body = result.data as unknown as Failures | { error: { code: string } };
    const code = 'errors' in body ? body.errors[0]!.code : body.error.code;
    expect(code).toBe('not-found');
  });

  it('plan_changes shows the variantGroup changes and propose_changes writes the new formatVersion', async () => {
    const { name, dir } = newProject();
    const planned = await mcp.call<{ summary: string[] }>('plan_changes', {
      project: name,
      operations: [box('$a', 390), box('$b', 900, { variantOf: '$a' })],
    });
    expect(JSON.stringify(planned.data)).toContain('variant');
    const { proposed } = await apply(name, dir, [
      box('$a', 390),
      box('$b', 900, { variantOf: '$a' }),
    ]);
    const proposal = readProposal(dir, proposed.proposal.id);
    expect(proposal.formatVersion).toBe(PROPOSAL_VARIANT_GROUP_FORMAT_VERSION);
  });

  it('a variantOf that is not a string or null is invalid', async () => {
    const { name } = newProject();
    await expect(
      mcp.call('plan_changes', {
        project: name,
        operations: [box('$a', 390, { variantOf: 5 })],
      }),
    ).rejects.toThrow();
    void errorOf;
  });
});

describe('variants and missingTypes in the reads', () => {
  it('get_container gives variants (ref, name, page, effectiveClasses) and missingTypes', async () => {
    const { name, dir } = newProject();
    const made = await apply(name, dir, [
      { op: 'add_page', as: '$p2', name: 'Tablet' },
      box('$a', 390, { page: 'Page 1' }),
      box('$b', 900, { variantOf: '$a', page: '$p2' }),
      {
        op: 'create_marking',
        container: '$b',
        rect: { x: 10, y: 10, width: 100, height: 40 },
        annotation: { type: 'ds/button' },
      },
    ]);
    const a = refOf(made.proposed, '$a');
    const b = refOf(made.proposed, '$b');
    const view = ok(
      await mcp.call<{
        variants: {
          ref: string;
          name: string;
          page: { id: string; name: string };
          effectiveClasses: Record<string, string>;
        }[];
        missingTypes: { type: unknown; name: string; variants: string[] }[];
      }>('get_container', { ref: a }),
    );
    expect(view.variants).toHaveLength(1);
    expect(view.variants[0]).toMatchObject({
      ref: b,
      name: 'b',
      page: { name: 'Tablet' },
      effectiveClasses: { window: 'expanded' },
    });
    expect(view.missingTypes).toHaveLength(1);
    expect(view.missingTypes[0]).toMatchObject({ name: 'Button', variants: [b] });
  });

  it('a container without variants has empty lists; get_project lists variants only where there are', async () => {
    const { name, dir } = newProject();
    const made = await apply(name, dir, [
      box('$a', 390),
      box('$b', 900, { variantOf: '$a' }),
      box('$c', 500),
    ]);
    const c = refOf(made.proposed, '$c');
    const view = ok(
      await mcp.call<{ variants: unknown[]; missingTypes: unknown[] }>('get_container', {
        ref: c,
      }),
    );
    expect(view.variants).toEqual([]);
    expect(view.missingTypes).toEqual([]);
    const project = ok(
      await mcp.call<{ containers: { name: string; variants?: string[] }[] }>(
        'get_project',
        { project: name },
      ),
    );
    const byName = new Map(project.containers.map((x) => [x.name, x]));
    expect(byName.get('a')!.variants).toEqual([refOf(made.proposed, '$b')]);
    expect(byName.get('b')!.variants).toEqual([refOf(made.proposed, '$a')]);
    expect('variants' in byName.get('c')!).toBe(false);
  });
});
