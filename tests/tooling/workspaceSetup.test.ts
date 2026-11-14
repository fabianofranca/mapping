// @vitest-environment node
// Stage #681, phase WA2: `examples/workspace/setup.sh` brings the whole workspace to the version of
// the tag (server, skill, AGENTS.md block and the script itself). Each test runs the real script
// against a fake "release" on `file://` assembled by `workspaceAssets.mjs`.
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildWorkspaceAssets } from '../../scripts/release/workspaceAssets.mjs';

const REPO = process.cwd();
const SKELETON = join(REPO, 'examples/workspace');
const BEGIN =
  '<!-- mapping:begin (gerenciado pelo setup.sh; não edite entre estas linhas) -->';
const END = '<!-- mapping:end -->';
const OLD_AGENTS = readFileSync(
  join(REPO, 'tests/fixtures/workspace/AGENTS.old.md'),
  'utf8',
);
const REAL_SETUP = readFileSync(join(SKELETON, 'setup.sh'), 'utf8');
const REAL_AGENTS = readFileSync(join(SKELETON, 'AGENTS.md'), 'utf8');
const BLOCK = `${REAL_AGENTS.slice(REAL_AGENTS.indexOf(BEGIN), REAL_AGENTS.indexOf(END) + END.length)}\n`;
const RELEASE_SKILL = '# skill from the release\n';
const RAW_SKILL = '# skill from raw (main)\n';
const RELEASE_WATCHER = '// watcher from the release\n';
const OLD_WATCHER = '// watcher copied by hand, old\n';
const RELEASE_EXTRACTOR = '// extractor from the release\n';
const OLD_EXTRACTOR = '// old extractor\n';

const dirs: string[] = [];
afterEach(() => {
  while (dirs.length > 0) rmSync(dirs.pop() as string, { recursive: true, force: true });
});
const tmp = (name: string): string => {
  const dir = mkdtempSync(join(tmpdir(), `wa-setup-${name}-`));
  dirs.push(dir);
  return dir;
};
const sha = (data: string | Buffer): string =>
  createHash('sha256').update(data).digest('hex');

/** The real `setup.sh` with a line that counts the runs, right after `set -euo pipefail`. */
const COUNTED = REAL_SETUP.replace(
  'set -euo pipefail\n',
  'set -euo pipefail\n[ -z "${MAPPING_TEST_COUNT:-}" ] || echo run >> "$MAPPING_TEST_COUNT"\n',
);
const LOCAL_SETUP = `${COUNTED}# old version, only to differ\n`;

interface Env {
  release: string;
  raw: string;
  ws: string;
  count: string;
}

interface Options {
  /** Release files not to publish (nor their `.sha256`). */
  omit?: string[];
  /** Does not copy the local `setup.sh` to the workspace. */
  noLocalSetup?: boolean;
}

/** Builds a fake release, a fake raw and a copy of the skeleton as the workspace. */
function setup(options: Options = {}): Env {
  const root = tmp('root');
  mkdirSync(join(root, 'examples/workspace'), { recursive: true });
  mkdirSync(join(root, '.claude/skills/spec-author'), { recursive: true });
  writeFileSync(join(root, 'examples/workspace/setup.sh'), COUNTED);
  writeFileSync(join(root, 'examples/workspace/AGENTS.md'), REAL_AGENTS);
  writeFileSync(join(root, '.claude/skills/spec-author/SKILL.md'), RELEASE_SKILL);
  writeFileSync(join(root, 'examples/workspace/watch-comments.mjs'), RELEASE_WATCHER);
  const release = join(tmp('release'), 'rel');
  buildWorkspaceAssets(release, root);
  const server = "if (process.argv.includes('--version')) console.log('0.0.0-test');\n";
  writeFileSync(join(release, 'mapping-mcp.js'), server);
  writeFileSync(
    join(release, 'mapping-mcp.js.sha256'),
    `${sha(server)}  mapping-mcp.js\n`,
  );
  writeFileSync(join(release, 'mapping-signature.mjs'), RELEASE_EXTRACTOR);
  writeFileSync(
    join(release, 'mapping-signature.mjs.sha256'),
    `${sha(RELEASE_EXTRACTOR)}  mapping-signature.mjs\n`,
  );
  for (const name of options.omit ?? []) {
    rmSync(join(release, name));
    rmSync(join(release, `${name}.sha256`));
  }
  const raw = tmp('raw');
  mkdirSync(join(raw, '.claude/skills/spec-author'), { recursive: true });
  writeFileSync(join(raw, '.claude/skills/spec-author/SKILL.md'), RAW_SKILL);
  const ws = tmp('ws');
  cpSync(SKELETON, ws, { recursive: true, filter: (src) => !src.endsWith('setup.sh') });
  if (!options.noLocalSetup) {
    writeFileSync(join(ws, 'setup.sh'), LOCAL_SETUP);
    chmodSync(join(ws, 'setup.sh'), 0o755);
  }
  return { release, raw, ws, count: join(tmp('count'), 'count') };
}

/** Runs the workspace `setup.sh` (synchronous: `file://` needs no server). */
function run(env: Env, args: string[] = [], extraEnv: Record<string, string> = {}) {
  const result = spawnSync('bash', ['setup.sh', ...args], {
    cwd: env.ws,
    encoding: 'utf8',
    env: {
      ...process.env,
      MAPPING_RELEASE_BASE: `file://${env.release}`,
      MAPPING_RAW_BASE: `file://${env.raw}`,
      MAPPING_TEST_COUNT: env.count,
      ...extraEnv,
    },
  });
  return {
    status: result.status,
    out: result.stdout,
    err: result.stderr,
    all: result.stdout + result.stderr,
  };
}

const executions = (env: Env): number =>
  existsSync(env.count)
    ? readFileSync(env.count, 'utf8').split('\n').filter(Boolean).length
    : 0;

/** Relative path -> hash of the content (or link target) of everything in the folder. */
function snapshot(dir: string): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (current: string): void => {
    for (const name of readdirSync(current)) {
      const path = join(current, name);
      const key = relative(dir, path);
      const stat = lstatSync(path);
      if (stat.isSymbolicLink()) out[key] = `link:${readlinkSync(path)}`;
      else if (stat.isDirectory()) {
        out[key] = 'dir';
        walk(path);
      } else out[key] = sha(readFileSync(path));
    }
  };
  walk(dir);
  return out;
}

const read = (env: Env, path: string): string => readFileSync(join(env.ws, path), 'utf8');
const write = (env: Env, path: string, text: string): void => {
  mkdirSync(join(env.ws, path, '..'), { recursive: true });
  writeFileSync(join(env.ws, path), text);
};
const backups = (env: Env): string[] =>
  readdirSync(env.ws).filter((name) => name.startsWith('AGENTS.md.bak-'));
const leftovers = (env: Env): string[] =>
  readdirSync(env.ws).filter(
    (name) => name.startsWith('.mapping-setup.') || name === 'setup.sh.new',
  );

describe('new workspace (only setup.sh)', () => {
  it('downloads and checks server and skill, creates AGENTS.md and the skill link, and prints the summary', () => {
    const env = setup({ noLocalSetup: true });
    writeFileSync(join(env.ws, 'setup.sh'), COUNTED);
    // In a new workspace the skeleton brings neither AGENTS.md nor the link.
    rmSync(join(env.ws, 'AGENTS.md'));
    rmSync(join(env.ws, 'watch-comments.mjs'));
    const result = run(env);
    expect(result.status, result.all).toBe(0);
    expect(read(env, 'watch-comments.mjs')).toBe(RELEASE_WATCHER);
    expect(result.out).toContain('Watcher: installed');
    expect(read(env, 'tools/mapping-mcp.js')).toContain('0.0.0-test');
    expect(read(env, 'tools/mapping-mcp.js.sha256')).toContain('mapping-mcp.js');
    expect(read(env, '.agents/skills/spec-author/SKILL.md')).toBe(RELEASE_SKILL);
    expect(lstatSync(join(env.ws, '.claude/skills/spec-author')).isSymbolicLink()).toBe(
      true,
    );
    expect(read(env, '.claude/skills/spec-author/SKILL.md')).toBe(RELEASE_SKILL);
    const agents = read(env, 'AGENTS.md');
    expect(
      agents.startsWith('# Mappings\n\n## What these mappings are for\n\n<!--'),
    ).toBe(true);
    expect(agents.endsWith(`\n\n${BLOCK}`)).toBe(true);
    expect(result.out).toContain('Server: 0.0.0-test');
    expect(result.out).toContain('Skill: release');
    expect(result.out).toContain('AGENTS.md: created');
    expect(result.out).toContain('Done.');
    expect(leftovers(env)).toEqual([]);
  });
});

describe('watcher (watch-comments.mjs)', () => {
  it('old hand-made copy: replaced by the release one, with no backup, and the summary says updated', () => {
    const env = setup();
    write(env, 'watch-comments.mjs', OLD_WATCHER);
    const result = run(env);
    expect(result.status, result.all).toBe(0);
    expect(read(env, 'watch-comments.mjs')).toBe(RELEASE_WATCHER);
    expect(result.out).toContain('Watcher: updated');
    expect(readdirSync(env.ws).filter((n) => n.includes('watch-comments.mjs.'))).toEqual(
      [],
    );
  });

  it('release without the watcher: warning, the local file intact and the rest of the setup carries on', () => {
    const env = setup({ omit: ['watch-comments.mjs'] });
    write(env, 'watch-comments.mjs', OLD_WATCHER);
    const result = run(env);
    expect(result.status, result.all).toBe(0);
    expect(result.err).toContain('watch-comments.mjs');
    expect(read(env, 'watch-comments.mjs')).toBe(OLD_WATCHER);
    expect(result.out).toContain('Watcher: not updated (release without the watcher)');
    expect(result.out).toContain('Server: 0.0.0-test');
  });

  it('release without the watcher and without a local file: stays absent', () => {
    const env = setup({ omit: ['watch-comments.mjs'] });
    rmSync(join(env.ws, 'watch-comments.mjs'));
    const result = run(env);
    expect(result.status, result.all).toBe(0);
    expect(existsSync(join(env.ws, 'watch-comments.mjs'))).toBe(false);
    expect(result.out).toContain('Watcher: not updated (release without the watcher)');
  });

  it('copy equal to the release one: no change', () => {
    const env = setup();
    write(env, 'watch-comments.mjs', RELEASE_WATCHER);
    const result = run(env);
    expect(result.status, result.all).toBe(0);
    expect(result.out).toContain('Watcher: no change');
  });
});

describe('self-update', () => {
  it('replaces setup.sh, warns and runs again once only', () => {
    const env = setup();
    const result = run(env);
    expect(result.status, result.all).toBe(0);
    expect(result.all).toContain('setup.sh updated');
    expect(executions(env)).toBe(2);
    expect(read(env, 'setup.sh')).toBe(COUNTED);
    expect(statSync(join(env.ws, 'setup.sh')).mode & 0o111).not.toBe(0);
    expect(result.out).toContain('Done.');
    expect(leftovers(env)).toEqual([]);
  });

  it('--no-self-update (before or after the tag) does not replace', () => {
    for (const args of [
      ['--no-self-update'],
      ['mcp-v0.0.0', '--no-self-update'],
      ['--no-self-update', 'mcp-v0.0.0'],
    ]) {
      const env = setup();
      const result = run(env, args);
      expect(result.status, result.all).toBe(0);
      expect(executions(env)).toBe(1);
      expect(read(env, 'setup.sh')).toBe(LOCAL_SETUP);
      expect(result.out).toContain('Done.');
    }
  });

  it('MAPPING_SETUP_UPDATED=1 does not replace', () => {
    const env = setup();
    const result = run(env, [], { MAPPING_SETUP_UPDATED: '1' });
    expect(result.status, result.all).toBe(0);
    expect(executions(env)).toBe(1);
    expect(read(env, 'setup.sh')).toBe(LOCAL_SETUP);
  });

  it('release without setup.sh: carries on with the current one and warns', () => {
    const env = setup({ omit: ['setup.sh'] });
    const result = run(env);
    expect(result.status, result.all).toBe(0);
    expect(executions(env)).toBe(1);
    expect(read(env, 'setup.sh')).toBe(LOCAL_SETUP);
    expect(result.err).toContain('setup.sh');
    expect(result.out).toContain('Done.');
  });
});

describe('mismatching sha256', () => {
  it.each([
    'mapping-mcp.js',
    'setup.sh',
    'SKILL.md',
    'AGENTS.mapping.md',
    'watch-comments.mjs',
    'mapping-signature.mjs',
  ])('in %s: exits with an error and nothing changes', (name) => {
    const env = setup();
    write(env, 'tools/mapping-mcp.js', 'old server\n');
    write(env, '.agents/skills/spec-author/SKILL.md', 'old skill\n');
    write(env, 'watch-comments.mjs', OLD_WATCHER);
    write(env, 'tools/mapping-signature.mjs', OLD_EXTRACTOR);
    write(env, 'AGENTS.md', `# Mappings\n\nmy text\n\n${BEGIN}\nold\n${END}\n`);
    const file = join(env.release, name);
    writeFileSync(file, `${readFileSync(file, 'utf8')}tampered\n`);
    const before = snapshot(env.ws);
    const result = run(env);
    expect(result.status).not.toBe(0);
    expect(snapshot(env.ws)).toEqual(before);
    expect(backups(env)).toEqual([]);
    expect(leftovers(env)).toEqual([]);
    expect(executions(env)).toBe(1);
  });
});

describe('signature extractor (tools/mapping-signature.mjs)', () => {
  it('installs the file and the .sha256 in tools/ and prints the summary', () => {
    const env = setup();
    const result = run(env);
    expect(result.status, result.all).toBe(0);
    expect(read(env, 'tools/mapping-signature.mjs')).toBe(RELEASE_EXTRACTOR);
    expect(read(env, 'tools/mapping-signature.mjs.sha256')).toContain(
      sha(RELEASE_EXTRACTOR),
    );
    expect(result.out).toContain('Extractor: installed');
    expect(leftovers(env)).toEqual([]);
  });

  it('second run: no change; different file: updated', () => {
    const env = setup();
    run(env);
    expect(run(env).out).toContain('Extractor: no change');
    write(env, 'tools/mapping-signature.mjs', OLD_EXTRACTOR);
    const result = run(env);
    expect(result.out).toContain('Extractor: updated');
    expect(read(env, 'tools/mapping-signature.mjs')).toBe(RELEASE_EXTRACTOR);
  });

  it('release without the extractor: only the warning, the local file stays and the rest carries on', () => {
    const env = setup({ omit: ['mapping-signature.mjs'] });
    write(env, 'tools/mapping-signature.mjs', OLD_EXTRACTOR);
    const result = run(env);
    expect(result.status, result.all).toBe(0);
    expect(result.err).toContain('mapping-signature.mjs');
    expect(read(env, 'tools/mapping-signature.mjs')).toBe(OLD_EXTRACTOR);
    expect(result.out).toContain(
      'Extractor: not updated (release without the extractor)',
    );
    expect(read(env, 'tools/mapping-mcp.js')).toContain('0.0.0-test');
  });
});

describe('skill', () => {
  it('comes from the same origin as the server (the release), not from raw', () => {
    const env = setup();
    run(env);
    expect(read(env, '.agents/skills/spec-author/SKILL.md')).toBe(RELEASE_SKILL);
  });

  it('absent from the release: falls back to raw, with a warning', () => {
    const env = setup({ omit: ['SKILL.md'] });
    const result = run(env);
    expect(result.status, result.all).toBe(0);
    expect(read(env, '.agents/skills/spec-author/SKILL.md')).toBe(RAW_SKILL);
    expect(result.err).toContain('SKILL.md');
    expect(result.out).toContain('main (old release)');
  });

  it('.claude/skills/spec-author as a copy (real folder) is copied again', () => {
    const env = setup();
    write(env, '.claude/skills/spec-author/SKILL.md', 'old copy\n');
    write(env, '.claude/skills/spec-author/extra.md', 'leftover\n');
    const result = run(env);
    expect(result.status, result.all).toBe(0);
    expect(lstatSync(join(env.ws, '.claude/skills/spec-author')).isDirectory()).toBe(
      true,
    );
    expect(read(env, '.claude/skills/spec-author/SKILL.md')).toBe(RELEASE_SKILL);
    expect(existsSync(join(env.ws, '.claude/skills/spec-author/extra.md'))).toBe(false);
  });

  it('.claude/skills/spec-author as a link stays a link and does not change', () => {
    const env = setup();
    mkdirSync(join(env.ws, '.claude/skills'), { recursive: true });
    mkdirSync(join(env.ws, '.agents/skills/spec-author'), { recursive: true });
    symlinkSync(
      '../../.agents/skills/spec-author',
      join(env.ws, '.claude/skills/spec-author'),
    );
    const result = run(env);
    expect(result.status, result.all).toBe(0);
    expect(readlinkSync(join(env.ws, '.claude/skills/spec-author'))).toBe(
      '../../.agents/skills/spec-author',
    );
    expect(read(env, '.claude/skills/spec-author/SKILL.md')).toBe(RELEASE_SKILL);
  });
});

describe('AGENTS.md block', () => {
  const OLD_BLOCK = `${BEGIN}\nold content\n${END}\n`;

  it.each([
    [
      'with text before and after',
      `# Mappings\r\n\r\nmy text\r\n\r\n${OLD_BLOCK}\r\nowner text\n`,
    ],
    ['no final newline', `# Mappings\n\nmy text\n${OLD_BLOCK}after without newline`],
  ])('only the part between the markers changes (%s)', (_name, original) => {
    const env = setup();
    write(env, 'AGENTS.md', original);
    const result = run(env);
    expect(result.status, result.all).toBe(0);
    const start = original.indexOf(BEGIN);
    const endAt = original.indexOf(END) + END.length;
    const afterOriginal = original.slice(endAt).replace(/^\n/, '');
    expect(read(env, 'AGENTS.md')).toBe(
      original.slice(0, start) + BLOCK.replace(/\n$/, '') + '\n' + afterOriginal,
    );
    expect(result.out).toContain('AGENTS.md: updated');
    expect(backups(env)).toHaveLength(1);
    expect(readFileSync(join(env.ws, backups(env)[0] as string), 'utf8')).toBe(original);
  });
});

describe('old AGENTS.md (no markers)', () => {
  const purpose = 'Document the screens of app X.\n';
  const old = OLD_AGENTS.replace(/<!--[\s\S]*?-->\n/, purpose);

  it('recognized structure: migrates, with backup, preserving "Para que servem"', () => {
    const env = setup();
    write(env, 'AGENTS.md', old);
    const result = run(env);
    expect(result.status, result.all).toBe(0);
    const from = old.indexOf('## Para que servem estes mapeamentos');
    const section = old.slice(from, old.indexOf('## Estrutura'));
    expect(section).toContain(purpose);
    expect(read(env, 'AGENTS.md')).toBe(`# Mappings\n\n${section}${BLOCK}`);
    expect(backups(env)).toHaveLength(1);
    expect(readFileSync(join(env.ws, backups(env)[0] as string), 'utf8')).toBe(old);
    expect(backups(env)[0]).toMatch(/^AGENTS\.md\.bak-\d{8}-\d{6}$/);
    expect(result.out).toContain('AGENTS.md: migrated');
  });

  it('unrecognized structure: backup, block at the end, warning and nothing deleted', () => {
    const env = setup();
    const custom = `${old}\n## Owner section\n\nsomething of mine\n`;
    write(env, 'AGENTS.md', custom);
    const result = run(env);
    expect(result.status, result.all).toBe(0);
    const after = read(env, 'AGENTS.md');
    expect(after.startsWith(custom)).toBe(true);
    expect(after.endsWith(`\n\n${BLOCK}`)).toBe(true);
    expect(backups(env)).toHaveLength(1);
    expect(readFileSync(join(env.ws, backups(env)[0] as string), 'utf8')).toBe(custom);
    expect(result.err).toContain('review AGENTS.md');
    expect(result.out).toContain('not recognized');
  });
});

describe('broken markers', () => {
  it.each([
    ['only the begin', `# M\n\n${BEGIN}\nold\n`],
    ['only the end', `# M\n\nold\n${END}\n`],
    ['out of order', `# M\n\n${END}\nold\n${BEGIN}\n`],
    ['duplicated begin', `# M\n${BEGIN}\na\n${BEGIN}\nb\n${END}\n`],
  ])('%s: file intact, warning and no backup', (_name, original) => {
    const env = setup();
    write(env, 'AGENTS.md', original);
    const result = run(env);
    expect(result.status, result.all).toBe(0);
    expect(read(env, 'AGENTS.md')).toBe(original);
    expect(backups(env)).toEqual([]);
    expect(result.err).toContain('markers');
    expect(result.out).toContain('broken markers: not changed');
  });
});

describe('idempotence', () => {
  it('running again with nothing new changes no file and creates no backup', () => {
    const env = setup();
    const first = run(env);
    expect(first.status, first.all).toBe(0);
    const before = snapshot(env.ws);
    const second = run(env);
    expect(second.status, second.all).toBe(0);
    expect(snapshot(env.ws)).toEqual(before);
    expect(second.out).toContain('AGENTS.md: no change');
    expect(second.out).toContain('Watcher: no change');
  });

  it('migrates a large old AGENTS.md without SIGPIPE (status 141 under load)', () => {
    const env = setup();
    // After "## Estrutura" there is much more than the pipe buffer: `tail` is still writing
    // when `head` has already exited. With `set -o pipefail`, that becomes status 141 (cause of the
    // intermittent failure "expected 141 to be +0").
    write(
      env,
      'AGENTS.md',
      `${OLD_AGENTS}\n${'filler line of the old skeleton\n'.repeat(20000)}`,
    );
    const result = run(env);
    expect(result.status, result.all).toBe(0);
  });

  it('also holds after the migration', () => {
    const env = setup();
    write(env, 'AGENTS.md', OLD_AGENTS);
    expect(run(env).status).toBe(0);
    expect(backups(env)).toHaveLength(1);
    const before = snapshot(env.ws);
    const second = run(env);
    expect(second.status, second.all).toBe(0);
    expect(snapshot(env.ws)).toEqual(before);
    expect(second.out).toContain('AGENTS.md: no change');
  });
});

describe('what is never touched', () => {
  it('projetos/, especializacoes/, CLAUDE.md and the client configs stay the same', () => {
    const env = setup();
    write(env, 'projetos/a/mapping.json', '{"x":1}\n');
    write(env, 'especializacoes/s.json', '{"id":"s"}\n');
    write(env, 'CLAUDE.md', '# my claude\n');
    write(
      env,
      '.mcp.json',
      '{"mcpServers":{"outro":{"command":"x"},"mapping":{"command":"node"}}}\n',
    );
    write(env, '.cursor/mcp.json', '{"mcpServers":{"outro":{"command":"y"}}}\n');
    const paths = [
      'projetos/a/mapping.json',
      'especializacoes/s.json',
      'CLAUDE.md',
      '.mcp.json',
      '.cursor/mcp.json',
    ];
    const before = paths.map((p) => sha(read(env, p)));
    const result = run(env);
    expect(result.status, result.all).toBe(0);
    expect(paths.map((p) => sha(read(env, p)))).toEqual(before);
  });

  it('does not create CLAUDE.md when it does not exist', () => {
    const env = setup();
    rmSync(join(env.ws, 'CLAUDE.md'), { force: true });
    run(env);
    expect(existsSync(join(env.ws, 'CLAUDE.md'))).toBe(false);
  });
});

// Stage #877 (SD1): the release download shows the reason for the failure, retries and, when
// GitHub answers 5xx or does not answer, uses the assets API. A local `node:http` server imitates
// `github.com`, `api.github.com` and the assets CDN; the real `setup.sh` points to it through
// `MAPPING_GITHUB_BASE` and `MAPPING_GITHUB_API`, without `MAPPING_RELEASE_BASE`.
const SLOW = 40_000;

interface MockOptions {
  /** Status of the direct download (file, request number to that URL); 200 serves the file. */
  direct?: (file: string, n: number) => number;
  /** Status of the release JSON (`releases/latest` or `releases/tags/<tag>`). */
  api?: number;
  /** Status of the asset download through the API. */
  asset?: number;
  /** Assets whose content, through the API, comes out tampered. */
  tamper?: string[];
}

interface Mock {
  base: string;
  calls: string[];
  close: () => Promise<void>;
}

const REPO_PATH = '/fabianofranca/mapping';
const API_PATH = '/api/repos/fabianofranca/mapping';

async function startMock(env: Env, options: MockOptions = {}): Promise<Mock> {
  const calls: string[] = [];
  const counts = new Map<string, number>();
  const names = readdirSync(env.release).sort();
  const idOf = (name: string): number => names.indexOf(name) + 1;
  const body = (name: string, tamper: boolean): Buffer => {
    const data = readFileSync(join(env.release, name));
    return tamper ? Buffer.concat([data, Buffer.from('tampered\n')]) : data;
  };
  const server: Server = createServer((req, res) => {
    const url = req.url ?? '';
    calls.push(`${req.method} ${url}`);
    const n = (counts.get(url) ?? 0) + 1;
    counts.set(url, n);
    const send = (
      status: number,
      data: string | Buffer = 'error',
      headers = {},
    ): void => {
      res.writeHead(status, headers);
      res.end(data);
    };
    const direct = new RegExp(
      `^${REPO_PATH}/releases/(?:latest/download|download/[^/]+)/([^/]+)$`,
    ).exec(url);
    if (direct) {
      const file = direct[1] as string;
      const status = options.direct?.(file, n) ?? 200;
      if (status !== 200) return send(status);
      return names.includes(file)
        ? send(200, body(file, false))
        : send(404, 'does not exist');
    }
    if (new RegExp(`^${API_PATH}/releases/(?:latest|tags/[^/]+)$`).test(url)) {
      const status = options.api ?? 200;
      if (status !== 200) return send(status);
      const assets = names.map((name) => ({ name, id: idOf(name) }));
      return send(200, JSON.stringify({ tag_name: 'mcp-v0.0.0', assets }), {
        'content-type': 'application/json',
      });
    }
    const asset = new RegExp(`^${API_PATH}/releases/assets/(\\d+)$`).exec(url);
    if (asset) {
      const status = options.asset ?? 200;
      if (status !== 200) return send(status);
      if (req.headers.accept !== 'application/octet-stream') return send(415);
      return send(302, '', { location: `/cdn/${asset[1]}` });
    }
    const cdn = /^\/cdn\/(\d+)$/.exec(url);
    if (cdn) {
      const name = names[Number(cdn[1]) - 1] as string;
      return send(200, body(name, options.tamper?.includes(name) ?? false));
    }
    return send(404);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return {
    base,
    calls,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

/** Runs `setup.sh` pointing at the local server (asynchronous, so the server can answer). */
function runMock(
  env: Env,
  base: string,
  args: string[] = [],
  extraEnv: Record<string, string> = {},
): Promise<{ status: number | null; out: string; err: string; all: string }> {
  const childEnv: Record<string, string | undefined> = {
    ...process.env,
    MAPPING_GITHUB_BASE: base,
    MAPPING_GITHUB_API: `${base}/api`,
    MAPPING_RAW_BASE: `file://${env.raw}`,
    MAPPING_TEST_COUNT: env.count,
    NO_PROXY: '127.0.0.1,localhost',
    no_proxy: '127.0.0.1,localhost',
    ...extraEnv,
  };
  delete childEnv.MAPPING_RELEASE_BASE;
  Object.assign(childEnv, extraEnv);
  return new Promise((resolve) => {
    const child = spawn('bash', ['setup.sh', ...args], {
      cwd: env.ws,
      env: childEnv as NodeJS.ProcessEnv,
    });
    let out = '';
    let err = '';
    child.stdout.on('data', (chunk: Buffer) => (out += chunk.toString()));
    child.stderr.on('data', (chunk: Buffer) => (err += chunk.toString()));
    child.on('close', (status) => resolve({ status, out, err, all: out + err }));
  });
}

const apiCalls = (mock: Mock): string[] => mock.calls.filter((c) => c.includes('/api/'));
const releaseJsonCalls = (mock: Mock): string[] =>
  mock.calls.filter((c) => /\/releases\/(latest|tags\/[^/]+)$/.test(c));

describe('release download (stage #877)', () => {
  it(
    '504 on the direct download and 200 on the API: installs through the second path, with the warning and sha256 checked',
    async () => {
      const env = setup();
      const mock = await startMock(env, { direct: () => 504 });
      try {
        const result = await runMock(env, mock.base, ['--no-self-update']);
        expect(result.status, result.all).toBe(0);
        expect(result.err).toContain(
          'direct download failed (HTTP 504); using the GitHub assets API',
        );
        expect(result.out).toContain('Server: 0.0.0-test');
        expect(result.out).toContain('Skill: release');
        expect(result.out).toContain('AGENTS.md:');
        expect(read(env, 'tools/mapping-mcp.js')).toContain('0.0.0-test');
        expect(read(env, '.agents/skills/spec-author/SKILL.md')).toBe(RELEASE_SKILL);
        // The release JSON is read once per run, not once per file.
        expect(releaseJsonCalls(mock)).toHaveLength(1);
        expect(leftovers(env)).toEqual([]);
      } finally {
        await mock.close();
      }
    },
    SLOW,
  );

  it(
    '504 on both paths: error with the HTTP code, what to do, both codes, and the folder stays the same',
    async () => {
      const env = setup();
      const mock = await startMock(env, { direct: () => 504, api: 504 });
      try {
        const before = snapshot(env.ws);
        const result = await runMock(env, mock.base);
        expect(result.status).not.toBe(0);
        expect(result.err).toContain('GitHub did not respond (HTTP 504)');
        expect(result.err).toContain('mapping-mcp.js');
        expect(result.err).toContain('Try again in a few minutes');
        expect(result.err).toContain('assets API');
        expect(snapshot(env.ws)).toEqual(before);
        expect(executions(env)).toBe(1);
      } finally {
        await mock.close();
      }
    },
    SLOW,
  );

  it(
    '404 on both paths: says the release does not include the file, without calling the API, folder the same',
    async () => {
      const env = setup({ omit: ['mapping-mcp.js'] });
      const mock = await startMock(env);
      try {
        const before = snapshot(env.ws);
        const result = await runMock(env, mock.base);
        expect(result.status).not.toBe(0);
        expect(result.err).toContain('does not include mapping-mcp.js (HTTP 404)');
        expect(result.err).toContain('https://github.com/fabianofranca/mapping/releases');
        expect(apiCalls(mock)).toEqual([]);
        expect(snapshot(env.ws)).toEqual(before);
      } finally {
        await mock.close();
      }
    },
    SLOW,
  );

  it(
    'network failure (closed port): names the host and the curl reason, with no successful second path',
    async () => {
      const env = setup();
      const closed = await startMock(env);
      const base = closed.base;
      await closed.close();
      const before = snapshot(env.ws);
      const result = await runMock(env, base);
      expect(result.status).not.toBe(0);
      expect(result.err).toContain('no response from 127.0.0.1');
      expect(result.err).toContain('curl: (7)');
      expect(result.err).toContain('Check the network');
      expect(snapshot(env.ws)).toEqual(before);
    },
    SLOW,
  );

  it(
    'temporary failure: 503 on the first attempt and 200 on the second installs without the second path',
    async () => {
      const env = setup();
      const mock = await startMock(env, { direct: (_file, n) => (n === 1 ? 503 : 200) });
      try {
        const result = await runMock(env, mock.base, ['--no-self-update']);
        expect(result.status, result.all).toBe(0);
        expect(result.err).not.toContain('assets API');
        expect(apiCalls(mock)).toEqual([]);
        expect(result.out).toContain('Server: 0.0.0-test');
      } finally {
        await mock.close();
      }
    },
    SLOW,
  );

  it(
    'with a tag, the second path reads releases/tags/<tag>',
    async () => {
      const env = setup();
      const mock = await startMock(env, { direct: () => 504 });
      try {
        const result = await runMock(env, mock.base, ['mcp-v9.9.9', '--no-self-update']);
        expect(result.status, result.all).toBe(0);
        expect(mock.calls).toContain(`GET ${API_PATH}/releases/tags/mcp-v9.9.9`);
        expect(mock.calls.some((c) => c.endsWith('/releases/latest'))).toBe(false);
        expect(
          mock.calls.some((c) =>
            c.startsWith(`GET ${REPO_PATH}/releases/download/mcp-v9.9.9/`),
          ),
        ).toBe(true);
      } finally {
        await mock.close();
      }
    },
    SLOW,
  );

  it(
    'mismatching sha256 on the second path: "does not match" error and the folder stays the same',
    async () => {
      const env = setup();
      const mock = await startMock(env, {
        direct: () => 504,
        tamper: ['mapping-mcp.js'],
      });
      try {
        const before = snapshot(env.ws);
        const result = await runMock(env, mock.base);
        expect(result.status).not.toBe(0);
        expect(result.err).toContain('does not match');
        expect(snapshot(env.ws)).toEqual(before);
        expect(leftovers(env)).toEqual([]);
        expect(executions(env)).toBe(1);
      } finally {
        await mock.close();
      }
    },
    SLOW,
  );

  it(
    'MAPPING_RELEASE_BASE set: 5xx does not trigger the second path',
    async () => {
      const env = setup();
      const mock = await startMock(env, { direct: () => 504 });
      try {
        const before = snapshot(env.ws);
        const result = await runMock(env, mock.base, [], {
          MAPPING_RELEASE_BASE: `${mock.base}${REPO_PATH}/releases/latest/download`,
        });
        expect(result.status).not.toBe(0);
        expect(result.err).toContain('HTTP 504');
        expect(apiCalls(mock)).toEqual([]);
        expect(snapshot(env.ws)).toEqual(before);
      } finally {
        await mock.close();
      }
    },
    SLOW,
  );

  it(
    'missing optional (404 of setup.sh): only warns "old release", now with the HTTP code',
    async () => {
      const env = setup({ omit: ['setup.sh'] });
      const mock = await startMock(env);
      try {
        const result = await runMock(env, mock.base);
        expect(result.status, result.all).toBe(0);
        expect(result.err).toContain('does not include setup.sh');
        expect(result.err).toContain('old release');
        expect(result.err).toContain('HTTP 404');
        expect(apiCalls(mock)).toEqual([]);
      } finally {
        await mock.close();
      }
    },
    SLOW,
  );

  it(
    "release SKILL.md down (5xx on both): error, without falling back to main's skill",
    async () => {
      const env = setup();
      const mock = await startMock(env, {
        direct: (file) => (file.startsWith('SKILL.md') ? 503 : 200),
        asset: 504,
      });
      try {
        const before = snapshot(env.ws);
        const result = await runMock(env, mock.base);
        expect(result.status).not.toBe(0);
        expect(result.err).toContain('SKILL.md');
        expect(result.err).toContain('HTTP 50');
        expect(result.err).not.toContain('using the skill from main');
        expect(snapshot(env.ws)).toEqual(before);
      } finally {
        await mock.close();
      }
    },
    SLOW,
  );

  it('missing file on file://: the message also carries HTTP 404', () => {
    const env = setup({ omit: ['mapping-mcp.js'] });
    const result = run(env);
    expect(result.status).not.toBe(0);
    expect(result.err).toContain('does not include mapping-mcp.js (HTTP 404)');
  });
});
