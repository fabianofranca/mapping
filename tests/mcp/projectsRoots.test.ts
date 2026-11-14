import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createProject, serialize } from '../../src/model';
import { Roots } from '../../mcp/paths';
import { findProject } from '../../mcp/projects';
import { NOW } from '../model/fixtures';

describe('findProject with several roots', () => {
  it('finds the project that only exists in the second root, even if the folder exists (without a project) in the first', async () => {
    const first = mkdtempSync(join(tmpdir(), 'mapping-r1-'));
    const second = mkdtempSync(join(tmpdir(), 'mapping-r2-'));
    mkdirSync(join(first, 'apps', 'cadastro'), { recursive: true });
    mkdirSync(join(second, 'apps', 'cadastro'), { recursive: true });
    writeFileSync(
      join(second, 'apps', 'cadastro', 'mapping.json'),
      serialize(
        createProject({
          name: 'Cadastro',
          now: NOW,
          firstLayer: { id: 'L1', name: 'Camada 1', color: '#D32F2F' },
        }),
      ),
    );
    const found = await findProject(new Roots([first, second], first), 'apps/cadastro');
    expect(found.root).toBe(second);
    expect(found.path).toBe('apps/cadastro');
  });

  it('without a project in any root, the error is still project-not-found', async () => {
    const first = mkdtempSync(join(tmpdir(), 'mapping-r1-'));
    const second = mkdtempSync(join(tmpdir(), 'mapping-r2-'));
    mkdirSync(join(first, 'x'));
    mkdirSync(join(second, 'x'));
    await expect(
      findProject(new Roots([first, second], first), 'x'),
    ).rejects.toMatchObject({
      code: 'project-not-found',
    });
  });
});
