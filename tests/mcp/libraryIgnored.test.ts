import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createProject, addBackgroundContainer, serialize } from '../../src/model';
import { NOW } from '../model/fixtures';
import { ok } from './proposalSupport';
import { connect, type Connection } from './workspace';

// Fase CRM4 (#965): o pacote lido do disco ignora subpastas com mais de 8 níveis, entradas
// ocultas e `node_modules`, e avisa quais pulou (`ignored-paths`); `plan_library_update` lê o
// pacote como `validate_library` (sem o limite de arquivos da app).

const MATERIAL3 = 'tests/fixtures/material3';

interface Issue {
  file: string;
  path: string;
  message: string;
  severity: 'error' | 'warning';
}
interface Validated {
  valid: boolean;
  errors: Issue[];
  warnings: Issue[];
}
interface Plan {
  decision: string;
  validation: { valid: boolean; errors: Issue[]; warnings: Issue[] };
}

let base: string;
let root: string;
let mcp: Connection;

const layer = 'cccccccc-0000-4000-8000-000000000001';
const image = 'bbbbbbbb-0000-4000-8000-000000000001';

beforeAll(async () => {
  base = mkdtempSync(join(tmpdir(), 'mapping-libign-'));
  root = join(base, 'raiz');
  mkdirSync(root, { recursive: true });

  cpSync(MATERIAL3, join(root, 'limpo', 'material3'), { recursive: true });

  const ignored = join(root, 'ignorado', 'material3');
  cpSync(MATERIAL3, ignored, { recursive: true });
  mkdirSync(join(ignored, '.rascunho'), { recursive: true });
  writeFileSync(join(ignored, '.rascunho', 'x.json'), '{}');
  mkdirSync(join(ignored, 'node_modules', 'pkg'), { recursive: true });
  writeFileSync(join(ignored, 'node_modules', 'pkg', 'y.md'), 'x');
  const deep = Array.from({ length: 10 }, (_, i) => `n${i}`);
  mkdirSync(join(ignored, ...deep), { recursive: true });
  writeFileSync(join(ignored, ...deep, 'fundo.md'), 'x');

  // Mais arquivos que o limite da app (500), menos que o do servidor (2000).
  const many = join(root, 'muitos', 'material3');
  cpSync(MATERIAL3, many, { recursive: true });
  mkdirSync(join(many, 'extras'), { recursive: true });
  for (let i = 0; i < 520; i++) writeFileSync(join(many, 'extras', `f${i}.bin`), 'x');

  let empty = createProject({
    name: 'Vazio',
    now: NOW,
    firstLayer: { id: layer, name: 'Livre', color: '#D32F2F' },
  });
  empty = addBackgroundContainer(empty, {
    id: image,
    width: 390,
    height: 844,
    background: '#FFFFFF',
  });
  mkdirSync(join(root, 'projetos', 'vazio'), { recursive: true });
  writeFileSync(join(root, 'projetos', 'vazio', 'mapping.json'), serialize(empty));
  mcp = await connect([root]);
});

afterAll(async () => {
  await mcp?.close();
  rmSync(base, { recursive: true, force: true });
});

const ignoredOf = (issues: Issue[]) => issues.filter((i) => i.path === 'ignored-paths');

describe('aviso ignored-paths', () => {
  it('validate_library lista as pastas puladas', async () => {
    const result = ok(
      await mcp.call<Validated>('validate_library', { path: 'ignorado/material3' }),
    );
    const found = ignoredOf(result.warnings);
    expect(found).toHaveLength(1);
    expect(found[0]!.severity).toBe('warning');
    expect(found[0]!.message).toContain('.rascunho');
    expect(found[0]!.message).toContain('node_modules');
    expect(found[0]!.message).toContain('n0/n1/n2/n3/n4/n5/n6/n7/n8');
    expect(result.valid).toBe(true);
  });

  it('pacote sem pastas ignoradas não leva o aviso', async () => {
    const result = ok(
      await mcp.call<Validated>('validate_library', { path: 'limpo/material3' }),
    );
    expect(ignoredOf(result.warnings)).toEqual([]);
  });

  it('plan_library_update repete o aviso na validação', async () => {
    const result = ok(
      await mcp.call<Plan>('plan_library_update', {
        project: 'vazio',
        path: 'ignorado/material3',
      }),
    );
    expect(ignoredOf(result.validation.warnings)).toHaveLength(1);
  });

  it('o lote que aplica a biblioteca devolve o aviso', async () => {
    const result = ok(
      await mcp.call<{ warnings?: Issue[]; steps?: { warnings?: Issue[] }[] }>(
        'plan_changes',
        {
          project: 'vazio',
          operations: [{ op: 'apply_specialization', file: 'ignorado/material3' }],
        },
      ),
    );
    expect(JSON.stringify(result)).toContain('ignored-paths');
  });
});

describe('plan_library_update lê o pacote como validate_library', () => {
  it('pacote com mais de 500 arquivos, aceito por validate_library, não é recusado', async () => {
    const validated = ok(
      await mcp.call<Validated>('validate_library', { path: 'muitos/material3' }),
    );
    expect(validated.valid).toBe(true);
    const result = ok(
      await mcp.call<Plan>('plan_library_update', {
        project: 'vazio',
        path: 'muitos/material3',
      }),
    );
    expect(result.decision).toBe('apply');
    expect(result.validation.valid).toBe(true);
  });
});
