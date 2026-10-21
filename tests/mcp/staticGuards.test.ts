import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { mcpSources } from './sources';

// Guardas estáticas da escrita do servidor (fase 8.5, M8): varrem `mcp/**/*.ts` inteiro, então
// um módulo novo em qualquer subpasta que grave no disco ou cite o `mapping.json` falha aqui.
// Mudar a lista é uma decisão: o servidor só grava o projeto vazio e `proposals/`.

/** Funções do `node:fs` que alteram o disco (com ou sem `Sync`). */
const WRITERS = [
  'writeFile',
  'appendFile',
  'rename',
  'link',
  'symlink',
  'mkdir',
  'mkdtemp',
  'rm',
  'rmdir',
  'unlink',
  'copyFile',
  'cp',
  'truncate',
  'open',
  'createWriteStream',
];
const WRITER_CALL = new RegExp(`(?<![\\w$])(${WRITERS.join('|')})(?:Sync)?\\s*\\(`, 'g');

describe('quem grava no disco (mcp/**)', () => {
  const sources = mcpSources();

  it('a varredura desce às subpastas', () => {
    expect(sources.map((s) => s.file)).toContain('image/codecs.ts');
  });

  it('só paths.ts, createProject.ts e proposalStore.ts chamam funções que gravam, e só estas', () => {
    const calls: Record<string, string[]> = {};
    for (const { file, code } of sources) {
      const names = [...new Set([...code.matchAll(WRITER_CALL)].map((m) => m[1]!))];
      if (names.length > 0) calls[file] = names.sort();
    }
    expect(calls).toEqual({
      'createProject.ts': ['mkdir'],
      'paths.ts': ['rename', 'rm', 'writeFile'],
      'proposalStore.ts': ['link', 'mkdir', 'rm', 'writeFile'],
    });
  });

  it('writeFileAtomic só em createProject.ts e proposalStore.ts; sobre o mapping.json, só no create_project', () => {
    const callers = sources
      .filter(({ file, code }) => file !== 'paths.ts' && /writeFileAtomic\(/.test(code))
      .map((s) => s.file);
    expect(callers).toEqual(['createProject.ts', 'proposalStore.ts']);
    const onMapping = sources.flatMap(({ file, code }) =>
      [...code.matchAll(/writeFileAtomic\(([^;]*?)\)\s*;/g)]
        .filter((m) => /MAPPING_FILE|mapping\.json/.test(m[1]!))
        .map(() => file),
    );
    expect(onMapping).toEqual(['createProject.ts']);
  });

  it('o mapping.json só é citado por projects.ts e changes.ts (leitura) e createProject.ts', () => {
    const citing = sources
      // Literal de caminho ('mapping.json' ou "mapping.json"); o nome em texto corrido não conta.
      .filter(({ code }) => /MAPPING_FILE|(['"])mapping\.json\1/.test(code))
      .map((s) => s.file);
    expect(citing).toEqual(['changes.ts', 'createProject.ts', 'projects.ts']);
  });

  it('o gancho de disco dos testes não entra no bundle', () => {
    const bundle = readFileSync('dist-mcp/mapping-mcp.js', 'utf8');
    expect(bundle).not.toContain('MAPPING_MCP_FS_HOOKS');
    expect(bundle).not.toContain('fsHooks');
  });
});
