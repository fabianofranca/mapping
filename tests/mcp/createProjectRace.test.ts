import { mkdtempSync, mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

// Simula o `mapping.json` que aparece depois da conferência de `create_project` e antes da
// gravação: o `mkdir` da pasta (feito entre as duas) cria o arquivo de outra pessoa.
const RIVAL = '{"rival":true}\n';
const state = vi.hoisted(() => ({ dropRival: null as string | null }));

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return {
    ...actual,
    mkdir: (async (...args: Parameters<typeof actual.mkdir>) => {
      const made = await actual.mkdir(...args);
      if (state.dropRival !== null) {
        const target = state.dropRival;
        state.dropRival = null;
        await actual.writeFile(target, RIVAL);
      }
      return made;
    }) as typeof actual.mkdir,
  };
});

const { createProjectFolder } = await import('../../mcp/createProject');
const { Roots } = await import('../../mcp/paths');
const { ToolError } = await import('../../mcp/errors');

describe('create_project: gravação exclusiva do mapping.json', () => {
  it('um mapping.json que aparece entre a conferência e a gravação não é sobrescrito', async () => {
    const root = mkdtempSync(join(tmpdir(), 'mapping-race-'));
    const dir = join(root, 'novo');
    mkdirSync(dir);
    state.dropRival = join(dir, 'mapping.json');

    const failure = await createProjectFolder(new Roots([root], root), {
      path: 'novo',
      name: 'Novo',
    }).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ToolError);
    expect((failure as InstanceType<typeof ToolError>).code).toBe('already-exists');
    expect(readFileSync(join(dir, 'mapping.json'), 'utf8')).toBe(RIVAL);
  });

  it('sem concorrência, cria o projeto', async () => {
    const root = mkdtempSync(join(tmpdir(), 'mapping-race-'));
    const created = await createProjectFolder(new Roots([root], root), {
      path: 'ok',
      name: 'Ok',
    });
    expect(created.name).toBe('ok');
    expect(
      JSON.parse(readFileSync(join(root, 'ok', 'mapping.json'), 'utf8')),
    ).toMatchObject({ app: 'mapping' });
  });
});
