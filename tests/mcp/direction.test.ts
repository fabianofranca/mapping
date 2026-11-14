import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  PROPOSAL_DIRECTION_FORMAT_VERSION,
  PROPOSAL_FORMAT_VERSION,
} from '../../src/model';
import { createCodeWorkspace, type CodeWorkspace } from './codeWorkspace';
import {
  acceptAllAndApply,
  ok,
  propose,
  readProject,
  readProposal,
} from './proposalSupport';
import { codeOf, connect, type Connection } from './workspace';

// R2 (#1096, decision 3): the reading direction in the MCP. `update_project` sets or removes the
// project one; `add_container` and `update_container` set the container one (`null` goes back to following the
// project); `get_project`, `get_container` and `get_marking` return the pinned and the effective one;
// `render_*` accept `direction`; `get_code_hints` returns the effective one. The `escrita` project of
// the code scenario is the writing one (SDUI with Screen `Cadastro`, container with the image).

let ws: CodeWorkspace;
let mcp: Connection;

beforeAll(async () => {
  ws = createCodeWorkspace();
  mcp = await connect([ws.root], { cwd: ws.repo });
});

afterAll(async () => {
  await mcp.close();
});

const PROJECT = 'escrita';
const dir = () => ws.projectDir(PROJECT);
const markingRef = () => `mapping://${PROJECT}/m/${codeOf(ws.ids.MF!)}`;

interface ContainerView {
  ref: string;
  direction: string | null;
  effectiveDirection: string;
}

/** Applies the batch through the proposal (accepts everything) and returns the written project. */
async function apply(operations: unknown[]) {
  const proposed = await propose(mcp, PROJECT, operations);
  return { proposed, saved: acceptAllAndApply(dir(), proposed.proposal.id) };
}

async function firstContainer(): Promise<ContainerView> {
  const project = ok(
    await mcp.call<{ containers: ContainerView[] }>('get_project', { project: PROJECT }),
  );
  return project.containers[0]!;
}

describe('update_project: project direction', () => {
  it('writes the direction, shows up in proposal.json and in get_project; null removes', async () => {
    const before = ok(await mcp.call('get_project', { project: PROJECT }));
    expect(before.direction).toBe('ltr');

    const { proposed, saved } = await apply([{ op: 'update_project', direction: 'rtl' }]);
    expect(saved.direction).toBe('rtl');
    expect(readProposal(dir(), proposed.proposal.id).formatVersion).toBe(
      PROPOSAL_DIRECTION_FORMAT_VERSION,
    );
    expect(proposed.summary.join('\n')).toContain('direction');
    expect(ok(await mcp.call('get_project', { project: PROJECT })).direction).toBe('rtl');

    const cleared = await apply([{ op: 'update_project', direction: null }]);
    expect(cleared.saved.direction).toBeUndefined();
    expect(ok(await mcp.call('get_project', { project: PROJECT })).direction).toBe('ltr');
  });

  it('refuses a value outside the set; an absent key does not change', async () => {
    const wrong = await mcp.client
      .callTool({
        name: 'plan_changes',
        arguments: {
          project: PROJECT,
          operations: [{ op: 'update_project', direction: 'up' }],
        },
      })
      .then(
        (r) => JSON.stringify(r),
        (e: unknown) => String(e),
      );
    expect(wrong).toMatch(/direction/);
    expect(readProject(dir()).direction).toBeUndefined();

    await apply([{ op: 'update_project', direction: 'rtl' }]);
    const plan = ok(
      await mcp.call<{ valid: boolean }>('plan_changes', {
        project: PROJECT,
        operations: [{ op: 'update_project' }],
      }),
    );
    expect(plan.valid).toBe(true);
    expect(readProject(dir()).direction).toBe('rtl');
    await apply([{ op: 'update_project', direction: null }]);
  });
});

describe('container direction', () => {
  it('add_container and update_container set it; null goes back to following the project', async () => {
    await apply([{ op: 'update_project', direction: 'ltr' }]);
    const added = await apply([
      {
        op: 'add_container',
        as: '$c',
        width: 100,
        height: 80,
        background: '#FFFFFF',
        direction: 'rtl',
      },
    ]);
    const created = added.saved.containers.find((c) => c.direction === 'rtl')!;
    expect(created).toBeDefined();
    expect(added.proposed.summary.join('\n')).toContain('direction');
    const ref = added.proposed.created.find((c) => c.kind === 'container')!.ref!;
    expect(ok(await mcp.call('get_container', { ref }))).toMatchObject({
      direction: 'rtl',
      effectiveDirection: 'rtl',
    });

    // Pinned to ltr with the project in rtl: the effective one is the container one.
    await apply([{ op: 'update_project', direction: 'rtl' }]);
    const second = await apply([
      { op: 'update_container', container: ref, direction: 'ltr' },
    ]);
    expect(second.saved.containers.find((c) => c.id === created.id)!.direction).toBe(
      'ltr',
    );
    expect(ok(await mcp.call('get_container', { ref }))).toMatchObject({
      direction: 'ltr',
      effectiveDirection: 'ltr',
    });

    // null: goes back to following the project (rtl).
    const third = await apply([
      { op: 'update_container', container: ref, direction: null },
    ]);
    expect(
      third.saved.containers.find((c) => c.id === created.id)!.direction ?? null,
    ).toBeNull();
    expect(ok(await mcp.call('get_container', { ref }))).toMatchObject({
      direction: null,
      effectiveDirection: 'rtl',
    });
    await apply([{ op: 'update_project', direction: null }]);
  });

  it('refuses a value outside the set in add_container and update_container', async () => {
    const container = await firstContainer();
    for (const operation of [
      { op: 'add_container', as: '$c', width: 10, height: 10, direction: 'x' },
      { op: 'update_container', container: container.ref, direction: 'x' },
    ]) {
      const wrong = await mcp.client
        .callTool({
          name: 'plan_changes',
          arguments: { project: PROJECT, operations: [operation] },
        })
        .then(
          (r) => JSON.stringify(r),
          (e: unknown) => String(e),
        );
      expect(wrong).toMatch(/direction/);
    }
  });
});

describe('views', () => {
  it('get_project and get_marking (in the item container) bring the pinned and the effective one', async () => {
    const container = await firstContainer();
    await apply([{ op: 'update_container', container: container.ref, direction: 'rtl' }]);
    const view = await firstContainer();
    expect(view).toMatchObject({ direction: 'rtl', effectiveDirection: 'rtl' });

    const marking = ok(
      await mcp.call<{ container: ContainerView }>('get_marking', {
        ref: markingRef(),
      }),
    );
    expect(marking.container).toMatchObject({
      direction: 'rtl',
      effectiveDirection: 'rtl',
    });

    // Not pinned: follows the project.
    await apply([
      { op: 'update_container', container: container.ref, direction: null },
      { op: 'update_project', direction: 'rtl' },
    ]);
    expect(await firstContainer()).toMatchObject({
      direction: null,
      effectiveDirection: 'rtl',
    });
    await apply([{ op: 'update_project', direction: null }]);
  });
});

describe('render_marking and render_container', () => {
  it('accept direction, cite the one used in the result and refuse a value outside the set', async () => {
    const container = await firstContainer();
    const marking = await mcp.call('render_marking', {
      ref: markingRef(),
      direction: 'rtl',
    });
    expect(marking.data).toMatchObject({ direction: 'rtl' });
    const rendered = await mcp.call('render_container', {
      ref: container.ref,
      direction: 'rtl',
    });
    expect(rendered.data).toMatchObject({ direction: 'rtl' });
    const plain = await mcp.call('render_container', { ref: container.ref });
    expect(plain.data).toMatchObject({ direction: null });

    const wrong = await mcp.client
      .callTool({
        name: 'render_container',
        arguments: { ref: container.ref, direction: 'up' },
      })
      .then(
        (r) => JSON.stringify(r),
        (e: unknown) => String(e),
      );
    expect(wrong).toMatch(/direction/);
  });
});

describe('get_code_hints', () => {
  it('returns the effective direction of the marking container, at the top and on each node', async () => {
    interface Hints {
      direction: string;
      tree: { direction: string; children?: { direction: string }[] };
    }
    const hints = () =>
      mcp.call<Hints>('get_code_hints', { ref: markingRef(), platform: 'android' });
    const ltr = ok(await hints());
    expect(ltr.direction).toBe('ltr');
    expect(ltr.tree.direction).toBe('ltr');

    const container = await firstContainer();
    await apply([{ op: 'update_container', container: container.ref, direction: 'rtl' }]);
    const rtl = ok(await hints());
    expect(rtl.direction).toBe('rtl');
    expect(rtl.tree.direction).toBe('rtl');
    expect(rtl.tree.children!.every((c) => c.direction === 'rtl')).toBe(true);
    await apply([{ op: 'update_container', container: container.ref, direction: null }]);
  });
});

describe('proposal format (goes up to 8 only when it uses the direction)', () => {
  it('the batch with direction writes formatVersion 8; without direction the proposal does not go up', async () => {
    const withProject = await propose(mcp, PROJECT, [
      { op: 'update_project', direction: 'rtl' },
    ]);
    expect(readProposal(dir(), withProject.proposal.id).formatVersion).toBe(
      PROPOSAL_DIRECTION_FORMAT_VERSION,
    );
    const container = await propose(mcp, PROJECT, [
      {
        op: 'add_container',
        as: '$c',
        width: 10,
        height: 10,
        background: '#FFFFFF',
        direction: 'rtl',
      },
    ]);
    expect(readProposal(dir(), container.proposal.id).formatVersion).toBe(
      PROPOSAL_DIRECTION_FORMAT_VERSION,
    );
    const plain = await propose(mcp, PROJECT, [
      { op: 'add_container', as: '$d', width: 10, height: 10, background: '#FFFFFF' },
    ]);
    expect(readProposal(dir(), plain.proposal.id).formatVersion).toBeLessThan(
      PROPOSAL_DIRECTION_FORMAT_VERSION,
    );
    expect(PROPOSAL_FORMAT_VERSION).toBeLessThan(PROPOSAL_DIRECTION_FORMAT_VERSION);
  });
});
