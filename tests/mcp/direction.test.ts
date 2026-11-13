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

// R2 (#1096, decisão 3): a direção de leitura no MCP. `update_project` fixa ou remove a do
// projeto; `add_container` e `update_container` fixam a do container (`null` volta a seguir o
// projeto); `get_project`, `get_container` e `get_marking` devolvem a fixada e a efetiva;
// `render_*` aceitam `direction`; `get_code_hints` devolve a efetiva. O projeto `escrita` do
// cenário do código é o de escrita (SDUI com Screen `Cadastro`, container com a imagem).

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

/** Aplica o lote pela proposta (aceita tudo) e devolve o projeto gravado. */
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

describe('update_project: direção do projeto', () => {
  it('grava a direção, aparece no proposal.json e em get_project; null remove', async () => {
    const before = ok(await mcp.call('get_project', { project: PROJECT }));
    expect(before.direction).toBe('ltr');

    const { proposed, saved } = await apply([{ op: 'update_project', direction: 'rtl' }]);
    expect(saved.direction).toBe('rtl');
    expect(readProposal(dir(), proposed.proposal.id).formatVersion).toBe(
      PROPOSAL_DIRECTION_FORMAT_VERSION,
    );
    expect(proposed.summary.join('\n')).toContain('direção');
    expect(ok(await mcp.call('get_project', { project: PROJECT })).direction).toBe('rtl');

    const cleared = await apply([{ op: 'update_project', direction: null }]);
    expect(cleared.saved.direction).toBeUndefined();
    expect(ok(await mcp.call('get_project', { project: PROJECT })).direction).toBe('ltr');
  });

  it('recusa valor fora do conjunto; chave ausente não muda', async () => {
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

describe('direção do container', () => {
  it('add_container e update_container fixam; null volta a seguir o projeto', async () => {
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
    expect(added.proposed.summary.join('\n')).toContain('direção');
    const ref = added.proposed.created.find((c) => c.kind === 'container')!.ref!;
    expect(ok(await mcp.call('get_container', { ref }))).toMatchObject({
      direction: 'rtl',
      effectiveDirection: 'rtl',
    });

    // Fixada em ltr com o projeto em rtl: a efetiva é a do container.
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

    // null: volta a seguir o projeto (rtl).
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

  it('recusa valor fora do conjunto em add_container e update_container', async () => {
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

describe('vistas', () => {
  it('get_project e get_marking (no container do item) trazem a fixada e a efetiva', async () => {
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

    // Sem fixar: segue o projeto.
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

describe('render_marking e render_container', () => {
  it('aceitam direction, citam a usada no resultado e recusam valor fora do conjunto', async () => {
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
  it('devolve a direção efetiva do container da marcação, no topo e em cada nó', async () => {
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

describe('formato da proposta (sobe para 8 só quando usa a direção)', () => {
  it('o lote com direction grava a formatVersion 8; sem direção a proposta não sobe', async () => {
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
