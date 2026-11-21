import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  PROPOSAL_CONTAINER_CLASSES_FORMAT_VERSION,
  PROPOSAL_FORMAT_VERSION,
  applySpecialization,
  createProject,
  serialize,
  specFiles,
  type Spec,
} from '../../src/model';
import { NOW } from '../model/fixtures';
import { acceptAllAndApply, ok, propose, readProposal } from './proposalSupport';
import { connect, type Connection } from './workspace';

// Container classes (schema v23) in the MCP: `add_container` and `update_container` accept
// `classes` (set → class id, `null` per set; `classes: null` removes them all); `get_container`
// and `get_project` return `classes` (the stored map or `null`) and `effectiveClasses`.

const SPEC: Spec = {
  format: 'mapping-spec',
  formatVersion: 21,
  id: 'ds',
  name: 'Design System',
  version: 1,
  layers: [{ id: 'events', name: 'Events', color: '#D32F2F', annotationTypes: [] }],
  containerClasses: [
    {
      id: 'platform',
      name: 'Platform',
      classes: [
        { id: 'android', name: 'Android' },
        { id: 'ios', name: 'iOS' },
      ],
    },
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
  root = mkdtempSync(join(tmpdir(), 'mapping-classes-'));
  mcp = await connect([root]);
});

afterAll(async () => {
  await mcp?.close();
  rmSync(root, { recursive: true, force: true });
});

/** A project folder with `SPEC` applied (the container classes need a declaring specialization). */
function newProject(): { name: string; dir: string } {
  const name = `classes-${++counter}`;
  const dir = join(root, 'projetos', name);
  let p = createProject({
    name,
    now: NOW,
    firstLayer: { id: 'l1', name: 'Layer 1', color: '#D32F2F' },
    firstPage: { id: 'pg1', name: 'Page 1' },
  });
  p = applySpecialization(p, SPEC);
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
  return { proposed, saved: acceptAllAndApply(dir, proposed.proposal.id) };
}

const box = {
  op: 'add_container',
  as: '$c',
  width: 1080,
  height: 2400,
  background: '#FFFFFF',
};

interface PlanFailure {
  valid: boolean;
  errors: {
    code: string;
    message: string;
    chosenSets?: { id: string; name: string; classes: { id: string; name: string }[] }[];
  }[];
}

async function plan(name: string, operations: unknown[]): Promise<PlanFailure> {
  return ok(await mcp.call<PlanFailure>('plan_changes', { project: name, operations }));
}

describe('classes in add_container and update_container', () => {
  it('add_container pins the choice; get_container and get_project return classes and effectiveClasses', async () => {
    const { name, dir } = newProject();
    const { proposed, saved } = await apply(name, dir, [
      { ...box, density: 3, classes: { platform: 'android' } },
    ]);
    expect(saved.containers[0]!.classes).toEqual({ platform: 'android' });
    const ref = proposed.created.find((c) => c.kind === 'container')!.ref!;
    const container = ok(await mcp.call('get_container', { ref }));
    expect(container.classes).toEqual({ platform: 'android' });
    // 1080 px at density 3 = 360 units: compact; the chosen set joins the computed one.
    expect(container.effectiveClasses).toEqual({
      platform: 'android',
      window: 'compact',
    });
    const project = ok(
      await mcp.call<{
        containers: { classes: unknown; effectiveClasses: unknown }[];
      }>('get_project', { project: name }),
    );
    expect(project.containers[0]!.classes).toEqual({ platform: 'android' });
    expect(project.containers[0]!.effectiveClasses).toEqual({
      platform: 'android',
      window: 'compact',
    });
  });

  it('without a choice classes is null, the computed set is still effective and the file keeps no key', async () => {
    const { name, dir } = newProject();
    const { proposed, saved } = await apply(name, dir, [{ ...box }]);
    expect('classes' in saved.containers[0]!).toBe(false);
    const ref = proposed.created.find((c) => c.kind === 'container')!.ref!;
    const container = ok(await mcp.call('get_container', { ref }));
    expect(container.classes).toBeNull();
    expect(container.effectiveClasses).toEqual({ window: 'expanded' });
  });

  it('update_container changes one set, null per set removes it and classes: null removes them all', async () => {
    const { name, dir } = newProject();
    const first = await apply(name, dir, [{ ...box, classes: { platform: 'android' } }]);
    const ref = first.proposed.created.find((c) => c.kind === 'container')!.ref!;

    const ios = await apply(name, dir, [
      { op: 'update_container', container: ref, classes: { platform: 'ios' } },
    ]);
    expect(ios.saved.containers[0]!.classes).toEqual({ platform: 'ios' });

    const none = await apply(name, dir, [
      { op: 'update_container', container: ref, classes: { platform: null } },
    ]);
    expect('classes' in none.saved.containers[0]!).toBe(false);

    await apply(name, dir, [
      { op: 'update_container', container: ref, classes: { platform: 'android' } },
    ]);
    const cleared = await apply(name, dir, [
      { op: 'update_container', container: ref, classes: null },
    ]);
    expect('classes' in cleared.saved.containers[0]!).toBe(false);
    expect(ok(await mcp.call('get_container', { ref })).classes).toBeNull();
  });

  it.each([
    ['a computed set', { window: 'compact' }],
    ['a set no specialization declares', { form: 'phone' }],
    ['a class the set does not declare', { platform: 'tv' }],
  ])(
    '%s is invalid-arguments, with the chosen sets and their classes',
    async (_label, classes) => {
      const { name } = newProject();
      for (const operation of [
        { ...box, classes },
        { op: 'update_container', container: '$c', classes },
      ]) {
        const operations =
          operation.op === 'add_container' ? [operation] : [{ ...box }, operation];
        const bad = await plan(name, operations);
        expect(bad.valid).toBe(false);
        const error = bad.errors.at(-1)!;
        expect(error.code).toBe('invalid-arguments');
        expect(error.chosenSets).toEqual([
          {
            id: 'platform',
            name: 'Platform',
            classes: [
              { id: 'android', name: 'Android' },
              { id: 'ios', name: 'iOS' },
            ],
          },
        ]);
      }
    },
  );

  it('a value that is not a map of text is refused by the tool schema', async () => {
    const { name } = newProject();
    const result = await mcp.client.callTool({
      name: 'plan_changes',
      arguments: { project: name, operations: [{ ...box, classes: { platform: 3 } }] },
    });
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toMatch(/classes/);
  });
});

describe('proposal format (rises to 11 only when classes are used)', () => {
  it('add_container and update_container with classes write formatVersion 11; without it, it stays at 4', async () => {
    const { name, dir } = newProject();
    const plain = await propose(mcp, name, [{ ...box }]);
    expect(readProposal(dir, plain.proposal.id).formatVersion).toBe(
      PROPOSAL_FORMAT_VERSION,
    );
    const classed = await propose(mcp, name, [{ ...box, classes: { platform: 'ios' } }]);
    expect(readProposal(dir, classed.proposal.id).formatVersion).toBe(
      PROPOSAL_CONTAINER_CLASSES_FORMAT_VERSION,
    );
  });

  it('update_container with classes on an existing container writes 11', async () => {
    const { name, dir } = newProject();
    const first = await apply(name, dir, [{ ...box }]);
    const ref = first.proposed.created.find((c) => c.kind === 'container')!.ref!;
    const update = await propose(mcp, name, [
      { op: 'update_container', container: ref, classes: { platform: 'ios' } },
    ]);
    expect(readProposal(dir, update.proposal.id).formatVersion).toBe(
      PROPOSAL_CONTAINER_CLASSES_FORMAT_VERSION,
    );
  });
});
