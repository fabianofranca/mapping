import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { mcpSources } from './sources';

// Static guards on the server's writing (phase 8.5, M8): they scan all of `mcp/**/*.ts`, so
// a new module in any subfolder that writes to disk or cites `mapping.json` fails here.
// Changing the list is a decision: the server only writes the empty project and `proposals/`.

/** `node:fs` functions that change the disk (with or without `Sync`). */
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

describe('who writes to disk (mcp/**)', () => {
  const sources = mcpSources();

  it('the scan descends into subfolders', () => {
    expect(sources.map((s) => s.file)).toContain('image/codecs.ts');
  });

  it('only paths.ts, createProject.ts, proposalStore.ts and threadStore.ts call functions that write, and only these', () => {
    const calls: Record<string, string[]> = {};
    for (const { file, code } of sources) {
      const names = [...new Set([...code.matchAll(WRITER_CALL)].map((m) => m[1]!))];
      if (names.length > 0) calls[file] = names.sort();
    }
    expect(calls).toEqual({
      'createProject.ts': ['mkdir'],
      'paths.ts': ['rename', 'rm', 'writeFile'],
      'proposalStore.ts': ['link', 'mkdir', 'rm', 'writeFile'],
      'threadStore.ts': ['mkdir'],
    });
  });

  it('writeFileAtomic only in createProject.ts, proposalStore.ts and threadStore.ts; on mapping.json (writeFileAtomic or writeNewFile), only in create_project', () => {
    const callers = sources
      .filter(({ file, code }) => file !== 'paths.ts' && /writeFileAtomic\(/.test(code))
      .map((s) => s.file);
    expect(callers).toEqual(['createProject.ts', 'proposalStore.ts', 'threadStore.ts']);
    const onMapping = sources.flatMap(({ file, code }) =>
      [...code.matchAll(/(?:writeFileAtomic|writeNewFile)\(([^;]*?)\)\s*;/g)]
        .filter((m) => /MAPPING_FILE|mapping\.json/.test(m[1]!))
        .map(() => file),
    );
    expect(onMapping).toEqual(['createProject.ts']);
  });

  it('mapping.json is only cited by projects.ts and changes.ts (reading) and createProject.ts', () => {
    const citing = sources
      // Path literal ('mapping.json' or "mapping.json"); the name in running text does not count.
      .filter(({ code }) => /MAPPING_FILE|(['"])mapping\.json\1/.test(code))
      .map((s) => s.file);
    expect(citing).toEqual(['changes.ts', 'createProject.ts', 'projects.ts']);
  });

  it("the tests' disk hook does not enter the bundle", () => {
    const bundle = readFileSync('dist-mcp/mapping-mcp.js', 'utf8');
    expect(bundle).not.toContain('MAPPING_MCP_FS_HOOKS');
    expect(bundle).not.toContain('fsHooks');
  });
});
