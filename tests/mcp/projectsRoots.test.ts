import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createProject, serialize } from '../../src/model';
import { Roots } from '../../mcp/paths';
import { findProject } from '../../mcp/projects';
import { NOW } from '../model/fixtures';

describe('findProject com várias raízes', () => {
  it('acha o projeto que só existe na segunda raiz, mesmo que a pasta exista (sem projeto) na primeira', async () => {
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

  it('sem projeto em nenhuma raiz, o erro continua sendo project-not-found', async () => {
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
