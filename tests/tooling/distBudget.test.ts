// @vitest-environment node
// Fase CR1 (etapa #1324, decisões 6, 8 e 9): `scripts/ci/distBudget.mjs raise` decide se o teto do
// `dist/index.html` sobe sozinho (16 KiB) ou se chama o dono, e com `--write` troca o número no
// `ci.yml` e acrescenta a frase ao comentário.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const SCRIPT = 'scripts/ci/distBudget.mjs';
const KIB16 = 16384;
const CEILING = 1933312;
const REVIEW = 1900544;

let dir = '';
let ci = '';

const FIXTURE = [
  'jobs:',
  '  build:',
  '    env:',
  '      # Orçamento do dist/index.html. Subido para 1.933.312 (1.888 KiB) na etapa #964 (decisão do dono, 2026-11-09): a Ajuda.',
  `      INDEX_HTML_MAX_BYTES: ${CEILING}`,
  '    steps: []',
  '',
].join('\n');

function raise(opts: {
  size: number;
  main?: number;
  review?: number;
  write?: boolean;
  extra?: string[];
}): string {
  const args = [
    SCRIPT,
    'raise',
    '--ci',
    ci,
    '--size',
    String(opts.size),
    '--main-size',
    String(opts.main ?? opts.size - 1000),
    '--review-ceiling',
    String(opts.review ?? REVIEW),
    ...(opts.write ? ['--write', '--epic', 'ci-resiliente', '--date', '2026-11-10'] : []),
    ...(opts.extra ?? []),
  ];
  return execFileSync('node', args, { encoding: 'utf8' }).trim();
}

describe('distBudget.mjs raise (CR1)', () => {
  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'dist-budget-'));
    ci = path.join(dir, 'ci.yml');
    writeFileSync(ci, FIXTURE);
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

  it('excesso exatamente 16.384 sobe; 16.385 chama o dono', () => {
    expect(raise({ size: CEILING + KIB16, main: CEILING })).toMatch(/^sobe:/);
    expect(raise({ size: CEILING + KIB16 + 1, main: CEILING })).toMatch(
      /^chama o dono: .*excesso/,
    );
  });

  it('crescimento exatamente 32.768 sobe; 32.769 chama o dono', () => {
    const size = CEILING + 100;
    expect(raise({ size, main: size - 32768 })).toMatch(/^sobe:/);
    expect(raise({ size, main: size - 32769 })).toMatch(/^chama o dono: .*cresceu/);
  });

  it('subidas desde a revisão: até 65.536 contando com esta; 65.537 chama o dono', () => {
    const atLimit = CEILING + KIB16 - 65536;
    expect(raise({ size: CEILING + 1, review: atLimit })).toMatch(/^sobe:/);
    expect(raise({ size: CEILING + 1, review: atLimit - 1 })).toMatch(
      /^chama o dono: .*64 KiB/,
    );
  });

  it('dentro do teto não há o que subir', () => {
    expect(raise({ size: CEILING })).toMatch(/^nada a subir/);
  });

  it('sem --write não mexe no ci.yml', () => {
    raise({ size: CEILING + 10 });
    expect(readFileSync(ci, 'utf8')).toBe(FIXTURE);
  });

  it('com --write troca só o INDEX_HTML_MAX_BYTES e acrescenta a frase ao comentário', () => {
    raise({ size: CEILING + 227, main: CEILING - 100, write: true });
    const after = readFileSync(ci, 'utf8');
    const novo = CEILING + KIB16;
    expect(after).toContain(`INDEX_HTML_MAX_BYTES: ${novo}\n`);
    expect(after).not.toContain(`INDEX_HTML_MAX_BYTES: ${CEILING}\n`);
    expect(after).toContain(
      ' Subido para 1.949.696 (1.904 KiB) pela regra do orçamento (2026-11-10, épico `ci-resiliente`): excesso de 227 bytes, crescimento de 327 bytes sobre a `main`.',
    );
    const lines = FIXTURE.split('\n');
    const afterLines = after.split('\n');
    expect(afterLines).toHaveLength(lines.length);
    afterLines.forEach((line, i) => {
      if (i !== 3 && i !== 4) expect(line).toBe(lines[i]);
    });
  });

  it('com --write fora dos limites não altera o ci.yml', () => {
    const out = raise({ size: CEILING + KIB16 + 1, main: CEILING, write: true });
    expect(out).toMatch(/^chama o dono/);
    expect(readFileSync(ci, 'utf8')).toBe(FIXTURE);
  });
});
