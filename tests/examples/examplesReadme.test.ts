import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * `examples/README.md` diz o que cada exemplo mostra. Este teste o mantém em dia: todo exemplo do
 * disco tem uma seção (um título com o caminho entre crases) e todo caminho de título que começa
 * com `libraries/` ou `examples/` ainda existe.
 */

const ROOT = join(__dirname, '..', '..');
const README = join(ROOT, 'examples', 'README.md');

function dirs(parent: string): string[] {
  return readdirSync(join(ROOT, parent))
    .filter((name) => statSync(join(ROOT, parent, name)).isDirectory())
    .sort()
    .map((name) => `${parent}/${name}/`);
}

function files(parent: string, extension: string): string[] {
  return readdirSync(join(ROOT, parent))
    .filter(
      (name) => name.endsWith(extension) && statSync(join(ROOT, parent, name)).isFile(),
    )
    .sort()
    .map((name) => `${parent}/${name}`);
}

/** Os exemplos do disco: pastas de bibliotecas, arquivos de especialização, zips e projetos. */
function diskExamples(): string[] {
  return [
    ...dirs('libraries'),
    ...dirs('examples/libraries'),
    ...files('examples/specs', '.json'),
    ...files('examples', '.zip'),
    'examples/exemplo-completo/',
    'examples/workspace/',
  ];
}

/** Caminhos entre crases dos títulos (linhas que começam com `#`) do README. */
function headingPaths(): string[] {
  const out: string[] = [];
  for (const line of readFileSync(README, 'utf8').split('\n')) {
    if (!line.startsWith('#')) continue;
    for (const match of line.matchAll(/`([^`]+)`/g)) {
      if (match[1] !== undefined) out.push(match[1]);
    }
  }
  return out;
}

describe('examples/README.md', () => {
  it('existe', () => {
    expect(existsSync(README)).toBe(true);
  });

  it('tem uma seção para cada exemplo do disco', () => {
    const titled = new Set(headingPaths());
    const missing = diskExamples().filter((path) => !titled.has(path));
    expect(
      missing,
      `exemplo sem seção no examples/README.md (título com o caminho entre crases): ${missing.join(', ')}`,
    ).toEqual([]);
  });

  it('não tem seção de um exemplo que não existe mais', () => {
    const stale = headingPaths()
      .filter((path) => path.startsWith('libraries/') || path.startsWith('examples/'))
      .filter((path) => !existsSync(join(ROOT, path)));
    expect(
      stale,
      `seção do examples/README.md aponta para um caminho que não existe: ${stale.join(', ')}`,
    ).toEqual([]);
  });
});
