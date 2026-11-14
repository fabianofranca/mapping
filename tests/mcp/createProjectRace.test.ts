import { mkdtempSync, mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

// Simulates the `mapping.json` that appears after the check of `create_project` and before the
// write: the folder's `mkdir` (done between the two) creates someone else's file.
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

describe('create_project: exclusive write of the mapping.json', () => {
  it('a mapping.json that appears between the check and the write is not overwritten', async () => {
    const root = mkdtempSync(join(tmpdir(), 'mapping-race-'));
    const dir = join(root, 'fresh');
    mkdirSync(dir);
    state.dropRival = join(dir, 'mapping.json');

    const failure = await createProjectFolder(new Roots([root], root), {
      path: 'fresh',
      name: 'Novo',
    }).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ToolError);
    expect((failure as InstanceType<typeof ToolError>).code).toBe('already-exists');
    expect(readFileSync(join(dir, 'mapping.json'), 'utf8')).toBe(RIVAL);
  });

  it('without concurrency, creates the project', async () => {
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
