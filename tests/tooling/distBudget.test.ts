// @vitest-environment node
// Fase CR1 (etapa #1324, decisões 6, 8 e 9), fase TF1 (etapa #1614, decisão 3) e fase TB1 (etapa #1802,
// decisões 1 a 3): `scripts/ci/distBudget.mjs` sempre sobe o teto do `dist/index.html` em passos de 16 KiB
// (nunca "chama o dono") e, quando a subida passa de um limite, diz o motivo numa linha `bug:`; com
// `--write` troca o `indexHtmlMaxBytes` do `scripts/ci/dist-budget.json` e acrescenta a frase ao `history`.
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

/** Roda o script na pasta `cwd` (o diretório temporário, por padrão) e devolve saída e status. */
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

  it('sobe 16 KiB quando excesso, crescimento e subidas cabem nos limites', () => {
    const out = raise({ size: CEILING + 227, main: CEILING - 100 });
    expect(out).toBe(
      `sobe: ${CEILING} → ${CEILING + KIB16} (excesso 227, crescimento 327, subidas desde a revisão ${CEILING + KIB16 - REVIEW})`,
    );
  });

  it('excesso 14.336 sobe 16 KiB numa linha só, sem bug', () => {
    const out = raise({ size: CEILING + 14336, main: CEILING });
    expect(out.split('\n')).toEqual([
      `sobe: ${CEILING} → ${CEILING + KIB16} (excesso 14336, crescimento 14336, subidas desde a revisão ${CEILING + KIB16 - REVIEW})`,
    ]);
    expect(out).not.toContain('bug:');
  });

  it('excesso 14.337 sobe 32 KiB e diz o bug, com 14 KiB e 32 KiB', () => {
    const [sobe, bug, ...rest] = raise({ size: CEILING + 14337, main: CEILING }).split(
      '\n',
    );
    expect(sobe).toMatch(new RegExp(`^sobe: ${CEILING} → ${CEILING + 2 * KIB16} \\(`));
    expect(bug).toMatch(/^bug: /);
    expect(bug).toContain('14 KiB (14336 bytes)');
    expect(bug).toContain('32 KiB');
    expect(bug).not.toContain('cresceu');
    expect(bug).not.toContain('subidas desde');
    expect(rest).toEqual([]);
  });

  it('excesso 30.720 sobe 32 KiB; 30.721 sobe 48 KiB', () => {
    const next = (excess: number) =>
      raise({ size: CEILING + excess, main: CEILING }).split('\n')[0];
    expect(next(30720)).toMatch(
      new RegExp(`^sobe: ${CEILING} → ${CEILING + 2 * KIB16} `),
    );
    expect(next(30721)).toMatch(
      new RegExp(`^sobe: ${CEILING} → ${CEILING + 3 * KIB16} `),
    );
  });

  it('o 48 KiB do excesso 30.721 aparece no motivo do bug', () => {
    const bug = raise({ size: CEILING + 30721, main: CEILING }).split('\n')[1];
    expect(bug).toContain('48 KiB');
  });

  it.each([1, 14336, 14337, 30720, 30721, 50000])(
    'excesso %i: a margem depois da subida fica em [2.048, 2.048 + 16.384)',
    (excess) => {
      const first = raise({ size: CEILING + excess, main: CEILING }).split('\n')[0] ?? '';
      const next = Number(/→ (\d+) /.exec(first)?.[1]);
      const margin = next - (CEILING + excess);
      expect(margin).toBeGreaterThanOrEqual(2048);
      expect(margin).toBeLessThan(2048 + KIB16);
    },
  );

  it('crescimento exatamente 32.768 sobe sem bug; 32.769 sobe 16 KiB com bug que cita 32 KiB', () => {
    const size = CEILING + 100;
    expect(raise({ size, main: size - 32768 })).not.toContain('bug:');
    const lines = raise({ size, main: size - 32769 }).split('\n');
    expect(lines[0]).toMatch(new RegExp(`^sobe: ${CEILING} → ${CEILING + KIB16} `));
    expect(lines[1]).toMatch(/^bug: .*cresceu 32769 bytes.*32 KiB \(32768 bytes\)/);
    expect(lines).toHaveLength(2);
  });

  it('subidas desde a revisão: até 65.536 contando com esta sobe sem bug; 65.537 sobe com bug que cita 64 KiB', () => {
    const atLimit = CEILING + KIB16 - 65536;
    expect(raise({ size: CEILING + 1, review: atLimit })).not.toContain('bug:');
    const lines = raise({ size: CEILING + 1, review: atLimit - 1 }).split('\n');
    expect(lines[0]).toMatch(new RegExp(`^sobe: ${CEILING} → ${CEILING + KIB16} `));
    expect(lines[1]).toMatch(
      /^bug: .*65537 bytes contando com esta.*64 KiB \(65536 bytes\)/,
    );
    expect(lines).toHaveLength(2);
  });

  it('vários limites ao mesmo tempo: uma linha bug só, com os motivos separados por "; "', () => {
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
  });

  it('nunca chama o dono: saída 0 e nenhuma linha começa por "chama o dono", nem com --write', () => {
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

  it('dentro do teto não há o que subir', () => {
    expect(raise({ size: CEILING })).toMatch(/^nada a subir/);
  });

  it('sem --write não mexe no arquivo', () => {
    raise({ size: CEILING + 10 });
    expect(readFileSync(budget, 'utf8')).toBe(fixture());
  });

  it('com --write troca só o indexHtmlMaxBytes e acrescenta a frase como último item do history', () => {
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

  it('o JSON gravado sai igual ao que o Prettier deixa (configuração do repositório, parser json)', async () => {
    raise({ size: CEILING + 227, main: CEILING - 100, write: true });
    const written = readFileSync(budget, 'utf8');
    const config =
      (await resolveConfig(path.join(REPO, 'scripts/ci/dist-budget.json'))) ?? {};
    expect(await format(written, { ...config, parser: 'json' })).toBe(written);
  });

  it('com --write acima de um limite grava o teto novo e a frase com "Acima dos limites"', async () => {
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

  it('com --write acima de um só limite, a frase cita só esse item', () => {
    raise({ size: CEILING + 100, main: CEILING + 100 - 32769, write: true });
    const after = JSON.parse(readFileSync(budget, 'utf8')) as { history: string[] };
    expect(after.history.at(-1)).toMatch(
      / Acima dos limites: crescimento acima de 32 KiB sobre a `main`\.$/,
    );
  });

  it('com --write e nada a subir não altera o arquivo', () => {
    raise({ size: CEILING, write: true });
    expect(readFileSync(budget, 'utf8')).toBe(fixture());
  });

  it('rejeita flag desconhecida e valor ausente ou que começa com --', () => {
    const status = (extra: string[]) =>
      run(raiseArgs({ size: CEILING + 10, extra })).status;
    expect(status(['--mainsize', '5'])).toBe(2);
    expect(status(['--epic'])).toBe(2);
    expect(status(['--epic', '--write'])).toBe(2);
  });

  it('teto que não é múltiplo de 1 KiB não gera número quebrado na frase', () => {
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

  it('--ci sai com 2 e a mensagem que aponta o scripts/ci/dist-budget.json (decisão 3)', () => {
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

  it('--ci sem valor também sai com 2 e a mensagem da etapa #1614', () => {
    const r = run(['raise', '--ci', '--size', '1']);
    expect(r.status).toBe(2);
    expect(r.err).toContain('--ci saiu na etapa #1614');
  });

  it('sem --budget, o raise lê o scripts/ci/dist-budget.json da pasta corrente', () => {
    const sub = path.join(dir, 'raiz');
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

  it('imprime o teto do --budget', () => {
    writeFileSync(budget, fixture());
    expect(run(['ceiling', '--budget', budget])).toMatchObject({
      status: 0,
      out: String(CEILING),
    });
  });

  it('sem --budget, lê o scripts/ci/dist-budget.json da pasta corrente', () => {
    execFileSync('mkdir', ['-p', path.join(dir, 'scripts/ci')]);
    writeFileSync(path.join(dir, 'scripts/ci/dist-budget.json'), fixture(1234567));
    expect(run(['ceiling'])).toMatchObject({ status: 0, out: '1234567' });
  });

  it('o arquivo do repositório é válido, com teto positivo e múltiplo de 16 KiB', () => {
    const r = run(['ceiling'], REPO);
    expect(r.status).toBe(0);
    const n = Number(r.out);
    expect(n).toBeGreaterThan(0);
    expect(n % KIB16).toBe(0);
  });

  const invalid: [string, string][] = [
    ['JSON inválido', '{ não é json'],
    ['sem indexHtmlMaxBytes', JSON.stringify({ history: [] })],
    ['teto que não é número', JSON.stringify({ indexHtmlMaxBytes: '123', history: [] })],
    ['teto que não é inteiro', JSON.stringify({ indexHtmlMaxBytes: 1.5, history: [] })],
    ['teto zero', JSON.stringify({ indexHtmlMaxBytes: 0, history: [] })],
    ['teto negativo', JSON.stringify({ indexHtmlMaxBytes: -5, history: [] })],
    ['sem history', JSON.stringify({ indexHtmlMaxBytes: 10 })],
    ['history que não é lista', JSON.stringify({ indexHtmlMaxBytes: 10, history: 'x' })],
    [
      'history com item que não é string',
      JSON.stringify({ indexHtmlMaxBytes: 10, history: ['a', 3] }),
    ],
  ];
  it.each(invalid)('%s: sai com 2 e a mensagem no stderr', (_name, content) => {
    writeFileSync(budget, content);
    const r = run(['ceiling', '--budget', budget]);
    expect(r.status).toBe(2);
    expect(r.err.trim().length).toBeGreaterThan(0);
    expect(r.out).toBe('');
  });

  it('arquivo inexistente sai com 2', () => {
    expect(run(['ceiling', '--budget', path.join(dir, 'nao-existe.json')]).status).toBe(
      2,
    );
  });
});
