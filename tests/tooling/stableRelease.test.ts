// @vitest-environment node
// Etapa #920, fase RA1: a decisão de publicar a estável do MCP no merge do épico (job `decide`
// do `mcp-release.yml`) e a trava da versão no PR do épico (job `epic` do `ci.yml`) vivem em
// `scripts/release/stableRelease.mjs`; o YAML só junta os dados e chama o script.
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  checkEpicVersion,
  compareVersions,
  decideRelease,
  latestStable,
  parseTags,
  readServerVersion,
} from '../../scripts/release/stableRelease.mjs';

const TAGS = ['mcp-v0.27.0', 'mcp-v0.28.1', 'mcp-v0.28.2', 'mcp-v0.28.2-rc.1'];

describe('parseTags', () => {
  it('lê a saída de `git ls-remote --tags` e de `git tag -l`, sem o ^{}', () => {
    const text = [
      'abc123\trefs/tags/mcp-v0.28.1',
      'def456\trefs/tags/mcp-v0.28.1^{}',
      'mcp-v0.28.2',
      '',
    ].join('\n');
    expect(parseTags(text)).toEqual(['mcp-v0.28.1', 'mcp-v0.28.2']);
  });
});

describe('versões', () => {
  it('compara por número, não por texto', () => {
    expect(compareVersions('0.28.10', '0.28.2')).toBeGreaterThan(0);
    expect(compareVersions('0.28.2', '0.28.2')).toBe(0);
    expect(compareVersions('0.9.0', '0.28.0')).toBeLessThan(0);
  });

  it('a última estável ignora rc e snapshot', () => {
    expect(latestStable(TAGS)).toBe('0.28.2');
    expect(latestStable(['mcp-v0.29.0-rc.1', 'mcp-snapshot-pr12'])).toBeNull();
  });

  it('lê SERVER_VERSION do mcp/version.ts', () => {
    expect(readServerVersion("export const SERVER_VERSION = '0.28.2';")).toBe('0.28.2');
    expect(() => readServerVersion('nada')).toThrow(/SERVER_VERSION/);
  });
});

describe('decideRelease (job decide, push na main)', () => {
  it('versão nova publica e devolve a tag', () => {
    const r = decideRelease({ version: '0.29.0', tags: TAGS });
    expect(r.publish).toBe(true);
    expect(r.tag).toBe('mcp-v0.29.0');
  });

  it('tag existente pula, com o aviso de já publicada', () => {
    const r = decideRelease({ version: '0.28.2', tags: TAGS });
    expect(r.publish).toBe(false);
    expect(r.level).toBe('notice');
    expect(r.message).toBe('mcp-v0.28.2 já publicada; nada a fazer');
  });

  it('rc da mesma versão não conta como estável', () => {
    const r = decideRelease({ version: '0.29.0', tags: ['mcp-v0.29.0-rc.1'] });
    expect(r.publish).toBe(true);
  });
});

describe('checkEpicVersion (job epic do ci.yml)', () => {
  it('versão nova maior que a última estável passa', () => {
    const r = checkEpicVersion({
      version: '0.29.0',
      tags: TAGS,
      changed: ['mcp/tools.ts'],
    });
    expect(r.ok).toBe(true);
  });

  it('versão nova menor que a última estável falha', () => {
    const r = checkEpicVersion({ version: '0.28.0', tags: TAGS, changed: [] });
    expect(r.ok).toBe(false);
    expect(r.level).toBe('error');
    expect(r.message).toContain('0.28.0');
    expect(r.message).toContain('0.28.2');
  });

  it('versão nova igual à última estável (tag existente) cai no caso da tag existente', () => {
    const r = checkEpicVersion({ version: '0.28.2', tags: TAGS, changed: [] });
    expect(r.ok).toBe(true);
  });

  it('tag existente e entrada da release mudada falha, com a mensagem e até 5 arquivos', () => {
    const changed = [
      'README.md',
      'mcp/a.ts',
      'mcp/b.ts',
      'src/model/c.ts',
      'src/model/d.ts',
      'docs/AGENT-GUIDE.md',
      'libraries/notas/index.ts',
    ];
    const r = checkEpicVersion({ version: '0.28.2', tags: TAGS, changed });
    expect(r.ok).toBe(false);
    expect(r.level).toBe('error');
    expect(r.message).toBe(
      'O épico muda o que vai na release do MCP (mcp/a.ts, mcp/b.ts, src/model/c.ts, src/model/d.ts, docs/AGENT-GUIDE.md e mais 1) e mantém a versão 0.28.2, que já tem a estável mcp-v0.28.2. Suba SERVER_VERSION em mcp/version.ts (e os docs que a citam).',
    );
  });

  it('tag existente sem entrada mudada passa com aviso de que o merge não publica', () => {
    const r = checkEpicVersion({
      version: '0.28.2',
      tags: TAGS,
      changed: ['README.md', 'src/store/history.ts', 'docs/MCP.md'],
    });
    expect(r.ok).toBe(true);
    expect(r.level).toBe('notice');
    expect(r.message).toContain('não publica');
  });
});

describe('CLI', () => {
  const SCRIPT = resolve('scripts/release/stableRelease.mjs');
  const dirs: string[] = [];
  afterEach(() => {
    while (dirs.length > 0)
      rmSync(dirs.pop() as string, { recursive: true, force: true });
  });

  const git = (cwd: string, ...args: string[]): void => {
    const r = spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], {
      cwd,
      encoding: 'utf8',
    });
    expect(r.status, r.stderr).toBe(0);
  };

  /** Repositório de teste com `mcp-v0.28.2` no primeiro commit e um arquivo mudado depois. */
  function repo(changedAfterTag: string): string {
    const dir = mkdtempSync(join(tmpdir(), 'stable-'));
    dirs.push(dir);
    mkdirSync(join(dir, 'mcp'), { recursive: true });
    writeFileSync(
      join(dir, 'mcp/version.ts'),
      "export const SERVER_VERSION = '0.28.2';\n",
    );
    git(dir, 'init', '-q', '-b', 'main');
    git(dir, 'add', '.');
    git(dir, 'commit', '-q', '-m', 'um');
    git(dir, 'tag', 'mcp-v0.28.2');
    mkdirSync(join(dir, changedAfterTag, '..'), { recursive: true });
    writeFileSync(join(dir, changedAfterTag), 'x\n');
    git(dir, 'add', '.');
    git(dir, 'commit', '-q', '-m', 'dois');
    return dir;
  }

  const run = (cwd: string, ...args: string[]) =>
    spawnSync('node', [SCRIPT, ...args], { cwd, encoding: 'utf8' });

  it('epic: falha com ::error:: quando muda entrada da release e mantém a versão', () => {
    const dir = repo('mcp/novo.ts');
    const r = run(dir, 'epic', '--version-file', 'mcp/version.ts');
    expect(r.status).toBe(1);
    expect(r.stdout).toContain(
      '::error::O épico muda o que vai na release do MCP (mcp/novo.ts)',
    );
  });

  it('epic: passa com ::notice:: quando nada da release mudou', () => {
    const dir = repo('docs/outro.md');
    const r = run(dir, 'epic', '--version-file', 'mcp/version.ts');
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('::notice::');
  });

  it('decide: escreve publish, tag e sha no arquivo de saída', () => {
    const dir = repo('docs/outro.md');
    writeFileSync(
      join(dir, 'mcp/version.ts'),
      "export const SERVER_VERSION = '0.29.0';\n",
    );
    writeFileSync(join(dir, 'tags.txt'), 'abc\trefs/tags/mcp-v0.28.2\n');
    const out = join(dir, 'out.txt');
    const r = run(
      dir,
      'decide',
      '--version-file',
      'mcp/version.ts',
      '--tags-file',
      join(dir, 'tags.txt'),
      '--sha',
      'abc123',
      '--output',
      out,
    );
    expect(r.status, r.stderr).toBe(0);
    expect(readFileSync(out, 'utf8')).toBe('tag=mcp-v0.29.0\nsha=abc123\npublish=true\n');
  });

  it('decide: tag existente termina verde com o aviso e publish=false', () => {
    const dir = repo('docs/outro.md');
    writeFileSync(join(dir, 'tags.txt'), 'abc\trefs/tags/mcp-v0.28.2\n');
    const out = join(dir, 'out.txt');
    const r = run(
      dir,
      'decide',
      '--version-file',
      'mcp/version.ts',
      '--tags-file',
      join(dir, 'tags.txt'),
      '--sha',
      'abc123',
      '--output',
      out,
    );
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toContain('::notice::mcp-v0.28.2 já publicada; nada a fazer');
    expect(readFileSync(out, 'utf8')).toContain('publish=false');
  });
});
