import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createProject, addBackgroundContainer, serialize } from '../../src/model';
import { NOW } from '../model/fixtures';
import { ok } from './proposalSupport';
import { connect, type Connection } from './workspace';

// Phase CRM4 (#965): the package read from disk ignores subfolders deeper than 8 levels, hidden
// entries and `node_modules`, and warns which ones it skipped (`ignored-paths`); `plan_library_update` reads the
// package like `validate_library` (without the app's file limit).

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

  // More files than the app's limit (500), fewer than the server's (2000).
  const many = join(root, 'muitos', 'material3');
  cpSync(MATERIAL3, many, { recursive: true });
  mkdirSync(join(many, 'extras'), { recursive: true });
  for (let i = 0; i < 520; i++) writeFileSync(join(many, 'extras', `f${i}.bin`), 'x');

  let empty = createProject({
    name: 'Empty',
    now: NOW,
    firstLayer: { id: layer, name: 'Free', color: '#D32F2F' },
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

describe('ignored-paths warning', () => {
  it('validate_library lists the skipped folders', async () => {
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

  it('a package without ignored folders carries no warning', async () => {
    const result = ok(
      await mcp.call<Validated>('validate_library', { path: 'limpo/material3' }),
    );
    expect(ignoredOf(result.warnings)).toEqual([]);
  });

  it('plan_library_update repeats the warning in the validation', async () => {
    const result = ok(
      await mcp.call<Plan>('plan_library_update', {
        project: 'vazio',
        path: 'ignorado/material3',
      }),
    );
    expect(ignoredOf(result.validation.warnings)).toHaveLength(1);
  });

  it('the batch that applies the library returns the warning', async () => {
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

describe('plan_library_update reads the package like validate_library', () => {
  it('a package with more than 500 files, accepted by validate_library, is not refused', async () => {
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
