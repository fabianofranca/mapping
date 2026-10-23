import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { acceptAllAndApply, ok, propose, readProject } from './proposalSupport';
import { connect, type Connection } from './workspace';

// Correções da rodada da ME5: `near` em container de `placement` fracionário (como os que a app
// cria), `container` por nome em `create_marking`/`update_marking` e o aviso `ignored-argument`
// do `parent`.

interface Plan {
  valid: boolean;
  errors?: { index: number; op: string; code: string; message: string }[];
  warnings?: { code: string; op: number; message: string }[];
}

let root: string;
let mcp: Connection;
let dir: string;
const project = 'proximo';

const plan = async (operations: unknown[]) =>
  ok(await mcp.call<Plan>('plan_changes', { project, operations }));

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), 'mapping-near-'));
  mcp = await connect([root]);
  ok(await mcp.call('create_project', { path: `projetos/${project}`, name: project }));
  dir = join(root, 'projetos', project);
  const proposed = await propose(mcp, project, [
    { op: 'add_container', name: 'Home', width: 300, height: 200, background: '#FFFFFF' },
    {
      op: 'add_container',
      name: 'Detalhe',
      width: 300,
      height: 200,
      background: '#FFFFFF',
    },
  ]);
  expect(proposed.valid).toBe(true);
  acceptAllAndApply(dir, proposed.proposal.id);
  const second = await propose(mcp, project, [
    {
      op: 'create_marking',
      container: 'Home',
      rect: { x: 10, y: 10, width: 60, height: 40 },
      name: 'Botão',
    },
  ]);
  expect(second.valid, JSON.stringify(second.errors)).toBe(true);
  acceptAllAndApply(dir, second.proposal.id);
  // O container da app encaixa 300×200 com escala fracionária.
  const file = join(dir, 'mapping.json');
  const raw = JSON.parse(readFileSync(file, 'utf8')) as {
    containers: { name: string; placement: Record<string, number> }[];
  };
  const home = raw.containers.find((c) => c.name === 'Home')!;
  home.placement = { x: 0, y: 500 / 3, scale: 10 / 3 };
  writeFileSync(file, JSON.stringify(raw, null, 2));
});

afterAll(async () => {
  await mcp?.close();
  rmSync(root, { recursive: true, force: true });
});

describe('create_marking com near em container fracionário', () => {
  it('perto da marcação e perto do container: o retângulo sai inteiro', async () => {
    const botao = readProject(dir).markings.find((m) => m.name === 'Botão')!;
    const home = readProject(dir).containers.find((c) => c.name === 'Home')!;
    for (const near of [botao.id, home.id]) {
      const result = await plan([
        { op: 'create_marking', near, annotation: { type: 'notas/nota' }, name: 'Nota' },
      ]);
      expect(result.errors, JSON.stringify(result.errors)).toBeUndefined();
      expect(result.valid).toBe(true);
    }
  });
});

describe('container por nome', () => {
  it('create_marking e update_marking aceitam o nome do container', async () => {
    const result = await plan([
      {
        op: 'create_marking',
        container: 'Home',
        rect: { x: 100, y: 100, width: 20, height: 20 },
        name: 'A',
      },
      {
        op: 'update_marking',
        marking: readProject(dir).markings.find((m) => m.name === 'Botão')!.id,
        container: 'Detalhe',
        rect: { x: 5, y: 5, width: 30, height: 30 },
      },
    ]);
    expect(result.errors, JSON.stringify(result.errors)).toBeUndefined();
    expect(result.valid).toBe(true);
  });

  it('nome que não existe continua not-found', async () => {
    const result = await plan([
      {
        op: 'create_marking',
        container: 'Nada',
        rect: { x: 1, y: 1, width: 5, height: 5 },
      },
    ]);
    expect(result.errors?.[0]?.code).toBe('not-found');
  });
});

describe('parent ignorado', () => {
  it('o aviso sai com o código ignored-argument', async () => {
    const result = await plan([
      {
        op: 'update_marking',
        marking: readProject(dir).markings.find((m) => m.name === 'Botão')!.id,
        parent: 'qualquer',
        name: 'Botão',
      },
    ]);
    expect(result.warnings?.[0]).toMatchObject({ code: 'ignored-argument', op: 0 });
  });
});
