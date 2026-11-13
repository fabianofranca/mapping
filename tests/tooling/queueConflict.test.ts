// @vitest-environment node
// Fase VR1 (etapa #1864, decisão 9): `painel.py conflito "<toca>" [--pasta <dir>] [--com "#N=<toca>"]…` confere
// um "Toca em:" contra as etapas começadas e não mescladas da pasta, as que o `show` lista em `começar agora:`
// e cada `--com`, com o mesmo cálculo da fila. Só leitura: `livre` (0), `conflito: … com #N (…)` (1) ou
// `inválida: <citação> — <motivo>` (2).
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const SCRIPT = '.claude/skills/implementar-fila/painel/painel.py';
const NOW = '2026-11-13T10:00:00Z';
const SEM_VAGA_CHEIA = '9';
const TEMPO_SUBPROCESSOS = 30_000;
const SECAO = 'docs/FLOW.md#ci-e-preview';

let dir = '';

function runRaw(...args: string[]) {
  return spawnSync('python3', [SCRIPT, '--now', NOW, ...args], { encoding: 'utf8' });
}

function run(...args: string[]): string {
  const r = runRaw(...args);
  if (r.status !== 0) throw new Error(`${args.join(' ')}: ${r.stderr}${r.stdout}`);
  return r.stdout;
}

function ficha(toca: string): string {
  return `dep=nenhuma | nivel=impact: low | mcp=não | schema=não | toca=${toca}`;
}

function etapa(issue: string, toca: string, ...extra: string[]) {
  run('row', dir, issue, `title=Etapa ${issue}`, `plan=${ficha(toca)}`, ...extra);
}

function conflito(toca: string, ...extra: string[]) {
  return runRaw('conflito', toca, ...extra);
}

function arquivos(): string[] {
  return ['queue', 'meta', 'log'].map((n) =>
    readFileSync(path.join(dir, `${n}.json`), 'utf8'),
  );
}

describe('painel.py conflito (VR1, #1864)', () => {
  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'conflito-'));
    run('init', dir);
    run('start', dir, '--paralelo', SEM_VAGA_CHEIA);
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('sem --pasta nem --com dá livre e 0', () => {
    const r = conflito(SECAO);
    expect(r.stdout).toBe('livre\n');
    expect(r.status).toBe(0);
  });

  it(
    'etapa em andamento com a mesma seção dá conflito, e a seção diferente do mesmo .md dá livre',
    () => {
      etapa('#7', SECAO, 'status=em andamento', 'started=2026-11-13T09:00:00Z');
      const r = conflito(SECAO, '--pasta', dir);
      expect(r.stdout).toBe(`conflito: ${SECAO} com #7 (em andamento)\n`);
      expect(r.status).toBe(1);
      const outra = conflito('docs/FLOW.md#fase-de-correcao', '--pasta', dir);
      expect(outra.stdout).toBe('livre\n');
      expect(outra.status).toBe(0);
    },
    TEMPO_SUBPROCESSOS,
  );

  it(
    'esperando dono e falhou contam; concluída e aguardando sem started não',
    () => {
      etapa('#1', 'src/a.ts', 'status=esperando dono', 'started=2026-11-13T09:00:00Z');
      etapa('#2', 'src/b.ts', 'status=falhou', 'started=2026-11-13T09:00:00Z');
      etapa(
        '#3',
        'src/c.ts',
        'status=concluída',
        'started=2026-11-13T09:00:00Z',
        'ended=2026-11-13T09:30:00Z',
      );
      etapa('#4', 'src/d.ts', 'hold=pausada pelo dono');
      const r = conflito('src/a.ts, src/b.ts, src/c.ts, src/d.ts', '--pasta', dir);
      expect(r.stdout.trim().split('\n')).toEqual([
        'conflito: src/a.ts com #1 (esperando dono)',
        'conflito: src/b.ts com #2 (falhou)',
      ]);
      expect(r.status).toBe(1);
    },
    TEMPO_SUBPROCESSOS,
  );

  it(
    'aguardando com started conta; a etapa mesclada (meta.merged) não',
    () => {
      etapa('#5', 'src/e.ts', 'started=2026-11-13T09:00:00Z');
      etapa('#6', 'src/f.ts', 'status=em andamento', 'started=2026-11-13T09:00:00Z');
      run('merged', dir, '#6');
      const r = conflito('src/e.ts, src/f.ts', '--pasta', dir);
      expect(r.stdout).toBe('conflito: src/e.ts com #5 (aguardando)\n');
      expect(r.status).toBe(1);
    },
    TEMPO_SUBPROCESSOS,
  );

  it(
    'a etapa que o show lista em começar agora conta',
    () => {
      etapa('#8', 'src/g.ts');
      expect(run('show', dir)).toContain('começar agora: #8');
      const r = conflito('src/g.ts', '--pasta', dir);
      expect(r.stdout).toBe('conflito: src/g.ts com #8 (começa agora)\n');
      expect(r.status).toBe(1);
    },
    TEMPO_SUBPROCESSOS,
  );

  it('--com com arquivo em comum dá conflito fora do painel, e vários --com se somam', () => {
    const r = conflito(
      'src/a.ts',
      '--com',
      '#9=src/a.ts, src/z.ts',
      '--com',
      '#10=src/y.ts',
    );
    expect(r.stdout).toBe('conflito: src/a.ts com #9 (fora do painel)\n');
    expect(r.status).toBe(1);
    const dois = conflito(
      'src/a.ts, src/y.ts',
      '--com',
      '#9=src/a.ts',
      '--com',
      '#10=src/y.ts',
    );
    expect(dois.stdout.trim().split('\n')).toEqual([
      'conflito: src/a.ts com #9 (fora do painel)',
      'conflito: src/y.ts com #10 (fora do painel)',
    ]);
    expect(dois.status).toBe(1);
  });

  it('o que a ficha não conta fica de fora: changelog, design system, mcp/version.ts e a tabela de blocos', () => {
    const ignoradas = [
      'changelog/x.md',
      'docs/design-system/x.md',
      'mcp/version.ts',
      'docs/TESTING-NUVEM.md#blocos',
    ].join(', ');
    const r = conflito(ignoradas, '--com', `#9=${ignoradas}`);
    expect(r.stdout).toBe('livre\n');
    expect(r.status).toBe(0);
  });

  it('citação inválida dá inválida: <citação> — <motivo> e 2, sem conferir conflito', () => {
    const pasta = conflito('src/model/', '--com', '#9=src/model/a.ts');
    expect(pasta.stdout).toBe('inválida: src/model/ — pasta\n');
    expect(pasta.status).toBe(2);
    const doc = conflito(`src/a.ts, docs/FLOW.md`);
    expect(doc.stdout).toBe('inválida: docs/FLOW.md — documento inteiro\n');
    expect(doc.status).toBe(2);
  });

  it('--com sem o formato #N=<toca> é erro de uso (2)', () => {
    const r = conflito('src/a.ts', '--com', 'src/a.ts');
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('erro:');
  });

  it('o apply recusa conflito como os outros de só leitura', () => {
    etapa('#7', 'src/a.ts');
    const r = spawnSync('python3', [SCRIPT, '--now', NOW, 'apply', dir, '-'], {
      encoding: 'utf8',
      input: 'conflito "src/a.ts"\n',
    });
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('`conflito` não entra no lote');
  });

  it(
    'nada se grava: os arquivos da pasta ficam iguais',
    () => {
      etapa('#7', SECAO, 'status=em andamento', 'started=2026-11-13T09:00:00Z');
      etapa('#8', 'src/g.ts');
      const antes = arquivos();
      conflito(SECAO, '--pasta', dir, '--com', '#9=src/g.ts');
      conflito('src/model/', '--pasta', dir);
      expect(arquivos()).toEqual(antes);
    },
    TEMPO_SUBPROCESSOS,
  );

  it('o help e a docstring descrevem o subcomando', () => {
    const doc = readFileSync(SCRIPT, 'utf8');
    expect(doc).toContain('conflito "<toca>" [--pasta <dir>] [--com "#N=<toca>"]');
    const help = runRaw('conflito', '-h').stdout;
    expect(help).toContain('--pasta');
    expect(help).toContain('--com');
  });
});
