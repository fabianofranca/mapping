// @vitest-environment node
// Phase CR1 (stage #1324, decisions 6, 8 and 9), phase TF1 (stage #1614, decision 3) and phase TB1 (stage #1802,
// decisions 1 to 3): `scripts/ci/distBudget.mjs` always raises the `dist/index.html` ceiling in steps of 16 KiB
// (never "chama o dono") and, when the raise passes a limit, gives the reason on a `bug:` line; with
// `--write` it replaces the `indexHtmlMaxBytes` of `scripts/ci/dist-budget.json` and appends the sentence to `history`.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { format, resolveConfig } from 'prettier';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const REPO = process.cwd();
const SCRIPT = path.join(REPO, 'scripts/ci/distBudget.mjs');
const KIB16 = 16384;
const CEILING = 1933312;
const REVIEW = 1900544;

let dir = '';
let budget = '';

const HISTORY = [
  'Orçamento do dist/index.html (autocontido; 1.376.757 bytes, ~1,38 MB em 2026-10-19, com o exemplo embutido: ~80 KB em base64).',
  'Subido para 1.933.312 (1.888 KiB) na etapa #964 (decisão do dono, 2026-11-09): a Ajuda.',
];

const fixture = (ceiling = CEILING): string =>
  `${JSON.stringify({ indexHtmlMaxBytes: ceiling, history: HISTORY }, null, 2)}\n`;

interface RunResult {
  status: number;
  out: string;
  err: string;
}

/** Runs the script in the `cwd` folder (the temporary directory, by default) and returns output and status. */
function run(args: string[], cwd = dir): RunResult {
  try {
    const out = execFileSync('node', [SCRIPT, ...args], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { status: 0, out: out.trim(), err: '' };
  } catch (e) {
    const x = e as { status: number; stdout: string; stderr: string };
    return { status: x.status, out: String(x.stdout ?? '').trim(), err: x.stderr };
  }
}

function raiseArgs(opts: {
  size: number;
  main?: number;
  review?: number;
  write?: boolean;
  extra?: string[];
}): string[] {
  return [
    'raise',
    '--budget',
    budget,
    '--size',
    String(opts.size),
    '--main-size',
    String(opts.main ?? opts.size - 1000),
    '--review-ceiling',
    String(opts.review ?? REVIEW),
    ...(opts.write ? ['--write', '--epic', 'ci-resiliente', '--date', '2026-11-10'] : []),
    ...(opts.extra ?? []),
  ];
}

function raise(opts: Parameters<typeof raiseArgs>[0]): string {
  const r = run(raiseArgs(opts));
  if (r.status !== 0)
    throw Object.assign(new Error(r.err), { status: r.status, stderr: r.err });
  return r.out;
}

describe('distBudget.mjs raise (CR1, TF1)', () => {
  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'dist-budget-'));
    budget = path.join(dir, 'dist-budget.json');
    writeFileSync(budget, fixture());
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('raises 16 KiB when excess, growth and raises fit the limits', () => {
    const out = raise({ size: CEILING + 227, main: CEILING - 100 });
    expect(out).toBe(
      `sobe: ${CEILING} → ${CEILING + KIB16} (excesso 227, crescimento 327, subidas desde a revisão ${CEILING + KIB16 - REVIEW})`,
    );
  });

  it('excess 14,336 raises 16 KiB on a single line, with no bug', () => {
    const out = raise({ size: CEILING + 14336, main: CEILING });
    expect(out.split('\n')).toEqual([
      `sobe: ${CEILING} → ${CEILING + KIB16} (excesso 14336, crescimento 14336, subidas desde a revisão ${CEILING + KIB16 - REVIEW})`,
    ]);
    expect(out).not.toContain('bug:');
  });

  it('excess 14,337 raises 32 KiB and states the bug, with 14 KiB and 32 KiB', () => {
    const [raised, bug, ...rest] = raise({ size: CEILING + 14337, main: CEILING }).split(
      '\n',
    );
    expect(raised).toMatch(new RegExp(`^sobe: ${CEILING} → ${CEILING + 2 * KIB16} \\(`));
    expect(bug).toMatch(/^bug: /);
    expect(bug).toContain('14 KiB (14336 bytes)');
    expect(bug).toContain('32 KiB');
    expect(bug).not.toContain('cresceu');
    expect(bug).not.toContain('subidas desde');
    expect(rest).toEqual([]);
  });

  it('excess 30,720 raises 32 KiB; 30,721 raises 48 KiB', () => {
    const next = (excess: number) =>
      raise({ size: CEILING + excess, main: CEILING }).split('\n')[0];
    expect(next(30720)).toMatch(
      new RegExp(`^sobe: ${CEILING} → ${CEILING + 2 * KIB16} `),
    );
    expect(next(30721)).toMatch(
      new RegExp(`^sobe: ${CEILING} → ${CEILING + 3 * KIB16} `),
    );
    expect(next(30721)).toContain(
      `subidas desde a revisão ${CEILING + 3 * KIB16 - REVIEW})`,
    );
  });

  it('the 48 KiB of excess 30,721 appears in the bug reason', () => {
    const bug = raise({ size: CEILING + 30721, main: CEILING }).split('\n')[1];
    expect(bug).toContain('48 KiB');
  });

  it.each([1, 14336, 14337, 30720, 30721, 50000])(
    'excess %i: the margin after the raise stays in [2,048, 2,048 + 16,384)',
    (excess) => {
      const first = raise({ size: CEILING + excess, main: CEILING }).split('\n')[0] ?? '';
      const next = Number(/→ (\d+) /.exec(first)?.[1]);
      const margin = next - (CEILING + excess);
      expect(margin).toBeGreaterThanOrEqual(2048);
      expect(margin).toBeLessThan(2048 + KIB16);
    },
  );

  it('growth of exactly 32,768 raises with no bug; 32,769 raises 16 KiB with a bug that cites 32 KiB', () => {
    const size = CEILING + 100;
    expect(raise({ size, main: size - 32768 })).not.toContain('bug:');
    const lines = raise({ size, main: size - 32769 }).split('\n');
    expect(lines[0]).toMatch(new RegExp(`^sobe: ${CEILING} → ${CEILING + KIB16} `));
    expect(lines[1]).toMatch(/^bug: .*cresceu 32769 bytes.*32 KiB \(32768 bytes\)/);
    expect(lines).toHaveLength(2);
  });

  it('raises since the review: up to 65,536 counting this one raises with no bug; 65,537 raises with a bug that cites 64 KiB', () => {
    const atLimit = CEILING + KIB16 - 65536;
    expect(raise({ size: CEILING + 1, review: atLimit })).not.toContain('bug:');
    const lines = raise({ size: CEILING + 1, review: atLimit - 1 }).split('\n');
    expect(lines[0]).toMatch(new RegExp(`^sobe: ${CEILING} → ${CEILING + KIB16} `));
    expect(lines[1]).toMatch(
      /^bug: .*65537 bytes contando com esta.*64 KiB \(65536 bytes\)/,
    );
    expect(lines).toHaveLength(2);
  });

  it('several limits at once: a single bug line, with the reasons separated by "; "', () => {
    const size = CEILING + 20000;
    const lines = raise({ size, main: size - 40000, review: CEILING - 100000 }).split(
      '\n',
    );
    expect(lines).toHaveLength(2);
    expect(lines[1]).toMatch(/^bug: /);
    const reasons = (lines[1] ?? '').slice('bug: '.length).split('; ');
    expect(reasons).toHaveLength(3);
    expect(reasons[0]).toContain('excesso');
    expect(reasons[1]).toContain('cresceu');
    expect(reasons[2]).toContain('subidas desde');
    // `since` uses the new ceiling (2 steps), not just the first: 2 × 16,384 + 100,000.
    expect(reasons[0]).toContain('a subida foi de 32 KiB');
    expect(reasons[2]).toContain(`somam ${2 * KIB16 + 100000} bytes contando com esta`);
    expect(lines[0]).toContain(`subidas desde a revisão ${2 * KIB16 + 100000})`);
  });

  it('never calls the owner: exit 0 and no line starts with "chama o dono", not even with --write', () => {
    const cases = [
      { size: CEILING + 14337, main: CEILING },
      { size: CEILING + 50000, main: CEILING - 100000, review: CEILING - 200000 },
      { size: CEILING + 1, main: CEILING - 32769 },
      { size: CEILING + 1, review: CEILING + KIB16 - 65537 },
    ];
    for (const c of cases) {
      for (const write of [false, true]) {
        writeFileSync(budget, fixture());
        const r = run(raiseArgs({ ...c, write }));
        expect(r.status).toBe(0);
        for (const line of r.out.split('\n')) expect(line).not.toMatch(/^chama o dono/);
      }
    }
  });

  it('within the ceiling there is nothing to raise', () => {
    expect(raise({ size: CEILING })).toMatch(/^nada a subir/);
  });

  it('without --write it does not touch the file', () => {
    raise({ size: CEILING + 10 });
    expect(readFileSync(budget, 'utf8')).toBe(fixture());
  });

  it('with --write it replaces only the indexHtmlMaxBytes and appends the sentence as the last item of history', () => {
    raise({ size: CEILING + 227, main: CEILING - 100, write: true });
    const after = JSON.parse(readFileSync(budget, 'utf8')) as {
      indexHtmlMaxBytes: number;
      history: string[];
    };
    expect(after.indexHtmlMaxBytes).toBe(CEILING + KIB16);
    expect(after.history).toHaveLength(HISTORY.length + 1);
    expect(after.history.slice(0, HISTORY.length)).toEqual(HISTORY);
    expect(after.history.at(-1)).toBe(
      'Subido para 1.949.696 (1.904 KiB) pela regra do orçamento (2026-11-10, épico `ci-resiliente`): excesso de 227 bytes, crescimento de 327 bytes sobre a `main`.',
    );
    expect(Object.keys(after)).toEqual(['indexHtmlMaxBytes', 'history']);
  });

  it('the written JSON comes out the same as Prettier leaves it (repository config, json parser)', async () => {
    raise({ size: CEILING + 227, main: CEILING - 100, write: true });
    const written = readFileSync(budget, 'utf8');
    const config =
      (await resolveConfig(path.join(REPO, 'scripts/ci/dist-budget.json'))) ?? {};
    expect(await format(written, { ...config, parser: 'json' })).toBe(written);
  });

  it('with --write above a limit it writes the new ceiling and the sentence with "Acima dos limites"', async () => {
    const size = CEILING + 20000;
    const out = raise({
      size,
      main: size - 40000,
      review: CEILING - 100000,
      write: true,
    });
    expect(out.split('\n')).toHaveLength(2);
    const written = readFileSync(budget, 'utf8');
    const after = JSON.parse(written) as { indexHtmlMaxBytes: number; history: string[] };
    expect(after.indexHtmlMaxBytes).toBe(CEILING + 2 * KIB16);
    expect(after.history).toHaveLength(HISTORY.length + 1);
    expect(after.history.slice(0, HISTORY.length)).toEqual(HISTORY);
    expect(after.history.at(-1)).toBe(
      'Subido para 1.966.080 (1.920 KiB) pela regra do orçamento (2026-11-10, épico `ci-resiliente`): excesso de 20000 bytes, crescimento de 40000 bytes sobre a `main`. Acima dos limites: excesso acima de 14 KiB; crescimento acima de 32 KiB sobre a `main`; subidas desde a revisão do dono acima de 64 KiB.',
    );
    const config =
      (await resolveConfig(path.join(REPO, 'scripts/ci/dist-budget.json'))) ?? {};
    expect(await format(written, { ...config, parser: 'json' })).toBe(written);
  });

  it('with --write above a single limit, the sentence cites only that item', () => {
    raise({ size: CEILING + 100, main: CEILING + 100 - 32769, write: true });
    const after = JSON.parse(readFileSync(budget, 'utf8')) as { history: string[] };
    expect(after.history.at(-1)).toMatch(
      / Acima dos limites: crescimento acima de 32 KiB sobre a `main`\.$/,
    );
  });

  it('with --write and nothing to raise it does not change the file', () => {
    raise({ size: CEILING, write: true });
    expect(readFileSync(budget, 'utf8')).toBe(fixture());
  });

  it('rejects an unknown flag and a missing value or one that starts with --', () => {
    const status = (extra: string[]) =>
      run(raiseArgs({ size: CEILING + 10, extra })).status;
    expect(status(['--mainsize', '5'])).toBe(2);
    expect(status(['--epic'])).toBe(2);
    expect(status(['--epic', '--write'])).toBe(2);
  });

  it('a ceiling that is not a multiple of 1 KiB produces no broken number in the sentence', () => {
    const odd = CEILING + 512;
    writeFileSync(budget, fixture(odd));
    raise({ size: odd + 10, main: odd, write: true });
    const after = JSON.parse(readFileSync(budget, 'utf8')) as {
      indexHtmlMaxBytes: number;
      history: string[];
    };
    expect(after.indexHtmlMaxBytes).toBe(odd + KIB16);
    expect(after.history.at(-1)).not.toMatch(/\d+\.\d+\.\d+ KiB/);
    expect(after.history.at(-1)).toContain('(1.904,5 KiB)');
  });

  it('--ci exits with 2 and the message that points to scripts/ci/dist-budget.json (decision 3)', () => {
    const r = run([
      'raise',
      '--ci',
      '.github/workflows/ci.yml',
      ...raiseArgs({ size: 1 }).slice(1),
    ]);
    expect(r.status).toBe(2);
    expect(r.err).toContain('--ci saiu na etapa #1614');
    expect(r.err).toContain('scripts/ci/dist-budget.json');
  });

  it('--ci with no value also exits with 2 and the stage #1614 message', () => {
    const r = run(['raise', '--ci', '--size', '1']);
    expect(r.status).toBe(2);
    expect(r.err).toContain('--ci saiu na etapa #1614');
  });

  it('without --budget, raise reads scripts/ci/dist-budget.json from the current folder', () => {
    const sub = path.join(dir, 'root');
    execFileSync('mkdir', ['-p', path.join(sub, 'scripts/ci')]);
    writeFileSync(path.join(sub, 'scripts/ci/dist-budget.json'), fixture());
    const args = raiseArgs({ size: CEILING + 227, main: CEILING - 100, write: true });
    const noBudget = args.filter(
      (_, i) => args[i] !== '--budget' && args[i - 1] !== '--budget',
    );
    const r = run(noBudget, sub);
    expect(r.status).toBe(0);
    expect(r.out).toMatch(/^sobe:/);
    const after = JSON.parse(
      readFileSync(path.join(sub, 'scripts/ci/dist-budget.json'), 'utf8'),
    );
    expect(after.indexHtmlMaxBytes).toBe(CEILING + KIB16);
  });
});

describe('distBudget.mjs ceiling (TF1)', () => {
  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'dist-budget-'));
    budget = path.join(dir, 'dist-budget.json');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('prints the ceiling of --budget', () => {
    writeFileSync(budget, fixture());
    expect(run(['ceiling', '--budget', budget])).toMatchObject({
      status: 0,
      out: String(CEILING),
    });
  });

  it('without --budget, it reads scripts/ci/dist-budget.json from the current folder', () => {
    execFileSync('mkdir', ['-p', path.join(dir, 'scripts/ci')]);
    writeFileSync(path.join(dir, 'scripts/ci/dist-budget.json'), fixture(1234567));
    expect(run(['ceiling'])).toMatchObject({ status: 0, out: '1234567' });
  });

  it('the repository file is valid, with a positive ceiling that is a multiple of 16 KiB', () => {
    const r = run(['ceiling'], REPO);
    expect(r.status).toBe(0);
    const n = Number(r.out);
    expect(n).toBeGreaterThan(0);
    expect(n % KIB16).toBe(0);
  });

  const invalid: [string, string][] = [
    ['invalid JSON', '{ not json'],
    ['without indexHtmlMaxBytes', JSON.stringify({ history: [] })],
    [
      'a ceiling that is not a number',
      JSON.stringify({ indexHtmlMaxBytes: '123', history: [] }),
    ],
    [
      'a ceiling that is not an integer',
      JSON.stringify({ indexHtmlMaxBytes: 1.5, history: [] }),
    ],
    ['zero ceiling', JSON.stringify({ indexHtmlMaxBytes: 0, history: [] })],
    ['negative ceiling', JSON.stringify({ indexHtmlMaxBytes: -5, history: [] })],
    ['without history', JSON.stringify({ indexHtmlMaxBytes: 10 })],
    [
      'history that is not a list',
      JSON.stringify({ indexHtmlMaxBytes: 10, history: 'x' }),
    ],
    [
      'history with an item that is not a string',
      JSON.stringify({ indexHtmlMaxBytes: 10, history: ['a', 3] }),
    ],
  ];
  it.each(invalid)('%s: exits with 2 and the message on stderr', (_name, content) => {
    writeFileSync(budget, content);
    const r = run(['ceiling', '--budget', budget]);
    expect(r.status).toBe(2);
    expect(r.err.trim().length).toBeGreaterThan(0);
    expect(r.out).toBe('');
  });

  it('a missing file exits with 2', () => {
    expect(
      run(['ceiling', '--budget', path.join(dir, 'does-not-exist.json')]).status,
    ).toBe(2);
  });
});
