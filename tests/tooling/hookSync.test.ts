// @vitest-environment node
// Stage #2635, phase CT2 (decisions 1 to 5): `scripts/ci/hookSync.mjs` tells whether `main` changed a hook
// file since the epic's base, so the coordinator brings `main` into the epic (sync session `SM<k>`) before
// the next session. The script runs with `spawnSync` over a temporary git repository; the rest is a text
// test of the skill and of `docs/FLOW.md`.
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, normalize, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// @ts-expect-error .mjs module without type declarations
import { HOOK_FILES as hookFilesUntyped } from '../../scripts/ci/hookSync.mjs';
import { between, section } from '../support/textSlice';

const HOOK_FILES = hookFilesUntyped as string[];
const SCRIPT = resolve('scripts/ci/hookSync.mjs');
const SKILL = readFileSync('.claude/skills/implementar-fila/SKILL.md', 'utf8');
const FLOW = readFileSync('docs/FLOW.md', 'utf8');
const TIMEOUT = 30_000;

let tmp = '';
let seq = 0;

const git = (cwd: string, ...args: string[]): string => {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`);
  return r.stdout.trim();
};

const write = (repo: string, file: string, content: string): void => {
  mkdirSync(dirname(join(repo, file)), { recursive: true });
  writeFileSync(join(repo, file), content);
};

const commit = (repo: string, message: string, files: Record<string, string>): void => {
  for (const [file, content] of Object.entries(files)) write(repo, file, content);
  git(repo, 'add', '-A');
  git(repo, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', message);
};

/** A repository whose `main` has one commit with every hook file; `epic` branches from it. */
function repo(): string {
  const dir = join(tmp, `r${seq++}`);
  mkdirSync(dir);
  git(dir, 'init', '-q', '-b', 'main');
  const base: Record<string, string> = { 'README.md': 'x\n' };
  for (const f of HOOK_FILES) base[f] = 'v1\n';
  commit(dir, 'base', base);
  git(dir, 'branch', 'epic');
  return dir;
}

const run = (cwd: string, ...args: string[]) => {
  const r = spawnSync('node', [SCRIPT, ...args], { cwd, encoding: 'utf8' });
  return { code: r.status, out: r.stdout.trim(), err: r.stderr.trim() };
};

beforeAll(() => {
  tmp = mkdtempSync(join(tmpdir(), 'hooksync-'));
});
afterAll(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe('hookSync.mjs (decision 1)', () => {
  it(
    'in sync: no hook file changed on main since the base',
    () => {
      const dir = repo();
      commit(dir, 'unrelated on main', { 'src/a.ts': 'a\n' });
      expect(run(dir, 'epic', '--main', 'main')).toEqual({
        code: 0,
        out: 'hook in sync',
        err: '',
      });
    },
    TIMEOUT,
  );

  it(
    'a hook file changed on main: lists the files, comma separated, exit 1',
    () => {
      const dir = repo();
      commit(dir, 'hook edit on main', {
        'scripts/ci/contextGuard.mjs': 'v2\n',
        '.claude/settings.json': 'v2\n',
        'src/a.ts': 'a\n',
      });
      const r = run(dir, 'epic', '--main', 'main');
      expect(r.code).toBe(1);
      expect(r.out).toBe(
        'bring main: .claude/settings.json, scripts/ci/contextGuard.mjs',
      );
    },
    TIMEOUT,
  );

  it(
    'only the epic changed a hook file: hook in sync, so a stage that edits the hook does not loop',
    () => {
      const dir = repo();
      git(dir, 'switch', '-q', 'epic');
      commit(dir, 'hook edit on the epic', { '.claude/settings.json': 'epic\n' });
      git(dir, 'switch', '-q', 'main');
      commit(dir, 'unrelated on main', { 'src/a.ts': 'a\n' });
      expect(run(dir, 'epic', '--main', 'main').out).toBe('hook in sync');
    },
    TIMEOUT,
  );

  it(
    'a hook change already merged into the epic is in sync (the base moved)',
    () => {
      const dir = repo();
      commit(dir, 'hook edit on main', { '.claude/settings.json': 'v2\n' });
      git(dir, 'switch', '-q', 'epic');
      git(
        dir,
        '-c',
        'user.name=t',
        '-c',
        'user.email=t@t',
        'merge',
        '-q',
        '--no-edit',
        'main',
      );
      git(dir, 'switch', '-q', 'main');
      expect(run(dir, 'epic', '--main', 'main').code).toBe(0);
    },
    TIMEOUT,
  );

  it(
    'the default --main is origin/main',
    () => {
      const dir = repo();
      git(dir, 'update-ref', 'refs/remotes/origin/main', 'main');
      commit(dir, 'hook edit on main', { '.claude/settings.json': 'v2\n' });
      git(dir, 'update-ref', 'refs/remotes/origin/main', 'main');
      const r = run(dir, 'epic');
      expect(r.code).toBe(1);
      expect(r.out).toBe('bring main: .claude/settings.json');
    },
    TIMEOUT,
  );

  it(
    'no merge base (unrelated histories, as in a shallow clone): bring main: no base, exit 1',
    () => {
      const dir = repo();
      git(dir, 'switch', '-q', '--orphan', 'other');
      commit(dir, 'unrelated root', { 'x.txt': 'x\n' });
      const r = run(dir, 'other', '--main', 'main');
      expect(r.code).toBe(1);
      expect(r.out).toMatch(/^bring main: no base \(.+\)$/);
    },
    TIMEOUT,
  );

  it(
    'a ref that does not exist is the safe side too: no base, exit 1',
    () => {
      const dir = repo();
      const r = run(dir, 'missing-epic', '--main', 'main');
      expect(r.code).toBe(1);
      expect(r.out).toMatch(/^bring main: no base \(.+\)$/);
    },
    TIMEOUT,
  );

  it(
    'a usage error exits 2 with the message on stderr',
    () => {
      const dir = repo();
      for (const args of [
        [],
        ['epic', '--main'],
        ['epic', '--wat'],
        ['a', 'b'],
        ['--main', 'main'],
      ]) {
        const r = run(dir, ...args);
        expect(r.code, args.join(' ')).toBe(2);
        expect(r.out).toBe('');
        expect(r.err).toMatch(/^Uso: node scripts\/ci\/hookSync\.mjs <epic-ref>/);
      }
    },
    TIMEOUT,
  );
});

describe('HOOK_FILES (decision 1)', () => {
  const settings = JSON.parse(readFileSync('.claude/settings.json', 'utf8')) as {
    hooks: Record<string, { hooks: { command: string }[] }[]>;
  };

  it('contains .claude/settings.json', () => {
    expect(HOOK_FILES).toContain('.claude/settings.json');
  });

  it('contains every hook path of .claude/settings.json', () => {
    const commands = Object.values(settings.hooks).flatMap((groups) =>
      groups.flatMap((g) => g.hooks.map((h) => h.command)),
    );
    const paths = commands.flatMap((c) =>
      [...c.matchAll(/\$CLAUDE_PROJECT_DIR\/([^"\s]+)/g)].map((m) => m[1]!),
    );
    expect(paths.length).toBeGreaterThan(0);
    for (const p of paths) expect(HOOK_FILES, p).toContain(p);
  });

  it('contains every relative import of the listed .mjs files', () => {
    const missing: string[] = [];
    for (const file of HOOK_FILES.filter((f) => f.endsWith('.mjs'))) {
      const source = readFileSync(file, 'utf8');
      const imports = [
        ...source.matchAll(/(?:from\s+|import\s*\(\s*)['"](\.{1,2}\/[^'"]+)['"]/g),
      ].map((m) => normalize(join(dirname(file), m[1]!)).replaceAll('\\', '/'));
      for (const target of imports)
        if (!HOOK_FILES.includes(target)) missing.push(`${file} -> ${target}`);
    }
    expect(missing).toEqual([]);
  });

  it('lists files that exist, with no duplicates', () => {
    expect(HOOK_FILES.filter((f) => !existsSync(f))).toEqual([]);
    expect(new Set(HOOK_FILES).size).toBe(HOOK_FILES.length);
  });
});

describe('texts (decisions 2 to 4)', () => {
  const perStage = section(SKILL, '## 3. Per stage');
  const orchestrator = section(FLOW, '## Orchestrator — step by step');
  const command = 'node scripts/ci/hookSync.mjs origin/epic/<name>';
  const fetch = 'git fetch -q --depth=500 origin main epic/<name>';

  it('the skill "3. Per stage" carries the command, the fetch and the points of decision 2', () => {
    expect(perStage.includes(command), command).toBe(true);
    expect(perStage.includes(fetch), fetch).toBe(true);
    for (const point of [
      'phase session',
      'successor',
      'fix and retest',
      'tester',
      'hook in sync',
      'bring main:',
    ]) {
      expect(perStage.includes(point), point).toBe(true);
    }
    // not before the closing, a fast track or an SM<k> itself (the "Out" of the stage)
    expect(/not before the closing, a fast track or an `SM<k>`/i.test(perStage)).toBe(
      true,
    );
  });

  it('the skill carries the panel lines of decision 4', () => {
    for (const line of [
      "row '#n' child=<id> childAt=now",
      "phase '#n' SM<k>=open",
      'kind=sincronização label=SM<k>',
      "phase '#n' SM<k>=ok",
      '`log`',
    ]) {
      expect(perStage.includes(line), line).toBe(true);
    }
    expect(
      perStage.includes('Main before a session (hook files)'),
      'Main before a session (hook files)',
    ).toBe(true);
  });

  it('review: the tester check runs once per batch and an open SM<k> holds the whole batch', () => {
    for (const [name, text] of [
      ['skill', perStage],
      ['orchestrator', orchestrator],
    ] as const) {
      expect(text.includes('once per batch'), `${name}: once per batch`).toBe(true);
      expect(
        text.includes('already open'),
        `${name}: an open SM<k> holds the batch`,
      ).toBe(true);
    }
  });

  it('review: a failing fetch is treated like no base, never run on stale refs', () => {
    const sub = section(FLOW, '### Main before a session (hook files)');
    for (const [name, text] of [
      ['skill', perStage],
      ['orchestrator', orchestrator],
      ['subsection', sub],
    ] as const) {
      expect(text.includes('fetch fails'), `${name}: fetch fails`).toBe(true);
      expect(text.includes('stale'), `${name}: stale refs`).toBe(true);
    }
  });

  it('review: the sync template keeps both sides of a conflict in a hook file', () => {
    const sub = section(FLOW, '### Main before a session (hook files)');
    expect(sub.includes('unless the stage itself edits it')).toBe(false);
    expect(sub.includes('keep both changes in a hook file')).toBe(true);
  });

  it('FLOW "Orchestrator — step by step" runs the same check before each session', () => {
    expect(orchestrator.includes(command), command).toBe(true);
    expect(orchestrator.includes(fetch), fetch).toBe(true);
    expect(
      orchestrator.includes('Main before a session (hook files)'),
      'Main before a session (hook files)',
    ).toBe(true);
    expect(
      orchestrator.includes('hook in sync') || orchestrator.includes('bring main:'),
    ).toBe(true);
  });

  it('FLOW has the subsection right after "Main before the tester (early start)"', () => {
    const tester = section(FLOW, '## For the tester');
    const early = tester.indexOf('### Main before the tester (early start)');
    const hook = tester.indexOf('### Main before a session (hook files)');
    expect(early).toBeGreaterThan(0);
    expect(hook).toBeGreaterThan(early);
    expect(tester.slice(early + 1, hook)).not.toMatch(/^### /m);
  });

  describe('the subsection template and notice (decision 3)', () => {
    const sub = section(FLOW, '### Main before a session (hook files)');
    const early = section(FLOW, '### Main before the tester (early start)');
    const template = (text: string): string =>
      between(text, '```text\n', '\n```').replace('```text\n', '');
    const body = template(sub);
    const earlyBody = template(early);

    it('is Sonnet medium on source_revision epic/<name>, with no /code-review and never plan', () => {
      expect(sub).toMatch(/Sonnet/);
      expect(sub).toMatch(/`effort` `medium`/);
      expect(sub).toContain('`source_revision` = `epic/<name>`');
      expect(sub).toMatch(/no `\/code-review` item/);
      expect(sub).toMatch(/never `permission_mode: plan`/);
    });

    it('the template is in a portuguese-guard block', () => {
      const guardOpen = sub.indexOf(`<!-- ${'portuguese-guard:' + 'begin'}`);
      expect(guardOpen).toBeGreaterThanOrEqual(0);
      expect(guardOpen).toBeLessThan(sub.indexOf('```text'));
      expect(sub).toContain(`<!-- ${'portuguese-guard:' + 'end'} -->`);
    });

    it('keeps the opening form of the early-start template (role nenhum for the context hook)', () => {
      const opening = earlyBody.slice(0, earlyBody.indexOf('SM<k> —') + 'SM<k> —'.length);
      expect(opening).toMatch(/^\S+ \S+ o agente da \S+ SM<k> —$/);
      expect(body.startsWith(`${opening} `)).toBe(true);
    });

    it('carries items 2 to 6 of the early-start template', () => {
      for (const n of [2, 3, 4, 5, 6]) {
        expect(body, `item ${n}`).toContain(`\n${n}. `);
      }
      expect(body).toContain('git fetch origin main && git merge origin/main');
      expect(body).toContain('Parte de #<etapa>');
      expect(body).toContain('Already up to date');
    });

    it('gives the reason as the hook files changed on main', () => {
      expect(body).toContain('the hook files changed on main: <files of hookSync>');
    });

    it('carries the same notice as the early start', () => {
      const notice = 'Sincronização SM<k> pronta: <PR>; conflitos: <k> (<files>|nenhum)';
      expect(body).toContain(notice);
      expect(earlyBody).toContain(notice);
    });

    it('the early-start template keeps its original reason line', () => {
      expect(earlyBody).toContain('The stage ran its phases from an older `main`');
    });
  });
});
