import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ToolError } from '../../mcp/errors';
import { Roots } from '../../mcp/paths';
import { loadProject, type ProjectLocation } from '../../mcp/projects';
import { readInvalidFixture } from '../model/invalidFixtures';

// Projeto inconsistente no MCP: continua recusado (ler nunca grava, nem o reparo), mas a
// resposta traz a mesma lista de problemas que a app mostra.

function setup(text: string) {
  const root = mkdtempSync(join(tmpdir(), 'mapping-inconsistent-'));
  const dir = join(root, 'p');
  mkdirSync(dir);
  writeFileSync(join(dir, 'mapping.json'), text);
  const location: ProjectLocation = { name: 'p', dir, root, path: 'p' };
  return { roots: new Roots([root]), dir, location };
}

describe('loadProject com dados inconsistentes', () => {
  it('recusa com a lista de problemas (código, entidade, id e nome) e não grava nada', async () => {
    const text = readInvalidFixture('missing-parent');
    const { roots, dir, location } = setup(text);
    const error = await loadProject(roots, location).then(
      () => null,
      (e: unknown) => e,
    );
    if (!(error instanceof ToolError)) throw new Error('deveria recusar');
    expect(error.code).toBe('invalid-project');
    expect(error.message).toContain('missing-parent');
    const json = error.toJSON().error;
    expect((json.reason as { issues: unknown }).issues).toEqual([
      {
        code: 'missing-parent',
        entity: 'marking',
        id: 'MN',
        name: 'Nome',
        otherId: 'M9',
      },
    ]);
    // O resultado do reparo (um projeto inteiro) não vai na resposta.
    expect(JSON.stringify(json)).not.toContain('"markings"');
    expect(readFileSync(join(dir, 'mapping.json'), 'utf8')).toBe(text);
    expect(existsSync(join(dir, 'backups'))).toBe(false);
  });
});
