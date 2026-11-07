import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PROPOSAL_FORMAT_VERSION } from '../../src/model';
import {
  acceptAllAndApply,
  errorOf,
  ok,
  propose,
  readProject,
  readProposal,
} from './proposalSupport';
import { connect, type Connection } from './workspace';

// Fase CF6 (schema v18): o modo do desenho no MCP. `update_project` fixa ou remove o modo do
// projeto; `add_container` e `update_container` fixam o do container (`null` volta a seguir o do
// projeto); `get_project`, `get_container` e `list_markings` devolvem o modo (efetivo nas duas
// últimas).

let root: string;
let mcp: Connection;
let counter = 0;

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), 'mapping-drawing-mode-'));
  mcp = await connect([root]);
});

afterAll(async () => {
  await mcp?.close();
  rmSync(root, { recursive: true, force: true });
});

async function newProject(): Promise<{ name: string; dir: string }> {
  const name = `modo-${++counter}`;
  ok(await mcp.call('create_project', { path: `projetos/${name}`, name }));
  return { name, dir: join(root, 'projetos', name) };
}

/** Aplica o lote pela proposta (aceita tudo) e devolve o projeto gravado. */
async function apply(name: string, dir: string, operations: unknown[]) {
  const proposed = await propose(mcp, name, operations);
  return { proposed, saved: acceptAllAndApply(dir, proposed.proposal.id) };
}

const box = { op: 'add_container', as: '$c', width: 100, height: 80, background: '#FFFFFF' };

describe('update_project: modo do desenho do projeto', () => {
  it('grava o modo, aparece no proposal.json e em get_project; null remove', async () => {
    const { name, dir } = await newProject();
    const { proposed, saved } = await apply(name, dir, [
      { op: 'update_project', drawingMode: 'dark' },
    ]);
    expect(saved.drawingMode).toBe('dark');
    const proposal = readProposal(dir, proposed.proposal.id);
    expect(JSON.stringify(proposal.changes)).toContain('drawingMode');
    expect(ok(await mcp.call('get_project', { project: name })).drawingMode).toBe('dark');

    const cleared = await apply(name, dir, [{ op: 'update_project', drawingMode: null }]);
    expect(cleared.saved.drawingMode).toBeUndefined();
    expect(ok(await mcp.call('get_project', { project: name })).drawingMode).toBeNull();
  });

  it('chave ausente não muda; tipo errado é invalid-arguments; nome inválido é invalid-name', async () => {
    const { name, dir } = await newProject();
    await apply(name, dir, [{ op: 'update_project', drawingMode: 'dark' }]);
    const plan = ok(
      await mcp.call<{ valid: boolean }>('plan_changes', {
        project: name,
        operations: [{ op: 'update_project' }],
      }),
    );
    expect(plan.valid).toBe(true);
    expect(readProject(dir).drawingMode).toBe('dark');

    const wrong = await mcp.call('plan_changes', {
      project: name,
      operations: [{ op: 'update_project', drawingMode: 3 }],
    });
    expect(JSON.stringify(wrong.data)).toContain('invalid-arguments');

    const bad = await mcp.call('plan_changes', {
      project: name,
      operations: [{ op: 'update_project', drawingMode: 'Dark Mode' }],
    });
    expect(JSON.stringify(bad.data)).toContain('invalid-name');
    expect(errorOf).toBeDefined();
  });
});

describe('modo do container', () => {
  it('add_container e update_container fixam; null volta a seguir o projeto', async () => {
    const { name, dir } = await newProject();
    const first = await apply(name, dir, [
      { op: 'update_project', drawingMode: 'light' },
      { ...box, drawingMode: 'dark' },
    ]);
    const container = first.saved.containers[0]!;
    expect(container.drawingMode).toBe('dark');
    const ref = first.proposed.created.find((c) => c.kind === 'container')!.ref!;
    expect(ok(await mcp.call('get_container', { ref }))).toMatchObject({
      drawingMode: 'dark',
      effectiveDrawingMode: 'dark',
    });

    const second = await apply(name, dir, [
      { op: 'update_container', container: ref, drawingMode: 'compact' },
    ]);
    expect(second.saved.containers[0]!.drawingMode).toBe('compact');

    const third = await apply(name, dir, [
      { op: 'update_container', container: ref, drawingMode: null },
    ]);
    expect(third.saved.containers[0]!.drawingMode ?? null).toBeNull();
    expect(ok(await mcp.call('get_container', { ref }))).toMatchObject({
      drawingMode: null,
      effectiveDrawingMode: 'light',
    });
  });

  it('list_markings devolve o modo efetivo da marcação', async () => {
    const { name, dir } = await newProject();
    const { proposed } = await apply(name, dir, [
      { op: 'update_project', drawingMode: 'light' },
      { ...box, drawingMode: 'dark' },
      { op: 'create_marking', container: '$c', name: 'A', rect: { x: 0, y: 0, width: 10, height: 10 } },
    ]);
    expect(proposed.valid).toBe(true);
    const list = ok(
      await mcp.call<{ markings: { name: string; effectiveDrawingMode: string | null }[] }>(
        'list_markings',
        { project: name },
      ),
    );
    expect(list.markings.map((m) => [m.name, m.effectiveDrawingMode])).toEqual([
      ['A', 'dark'],
    ]);
  });
});

describe('formato da proposta', () => {
  it('a versão gravada com update_project é a PROPOSAL_FORMAT_VERSION', async () => {
    const { name, dir } = await newProject();
    const proposed = await propose(mcp, name, [{ op: 'update_project', drawingMode: 'dark' }]);
    expect(readProposal(dir, proposed.proposal.id).formatVersion).toBe(
      PROPOSAL_FORMAT_VERSION,
    );
  });
});
