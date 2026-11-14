// @vitest-environment node
// Stage #1874, phase CX1: `painel.py context --medir --max <n>` measures the context with `contextUsage.mjs` and writes
// the `pct` with the source; the by-hand number is still accepted (source `manual`, or `get_session`), and `show` states the source
// and flags the by-hand measure and the stale measure (over 70 min).
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const SCRIPT = '.claude/skills/implementar-fila/painel/painel.py';
const NOW = '2026-11-10T10:00:00Z';
const MEDIR = ['--medir', '--max', '1000000'];
const AVISO_MAO = ' — medido à mão: meça com context --medir';
// Tests that spawn several painel.py subprocesses: headroom for CI under load.
const TEMPO = 30_000;

let dir = '';
let scratch = '';
let config = '';

function runAt(
  now: string,
  args: string[],
  env: Record<string, string | undefined> = {},
) {
  const clean: NodeJS.ProcessEnv = { ...process.env };
  delete clean.CLAUDE_CODE_SESSION_ID;
  delete clean.CLAUDE_CONFIG_DIR;
  return spawnSync('python3', [SCRIPT, '--now', now, ...args], {
    encoding: 'utf8',
    env: { ...clean, ...env },
  });
}

/** Runs with the fixture transcript and the `abc` session; `sessao: false` removes the session variable. */
function ctx(
  args: string[],
  opts: { now?: string; sessao?: boolean; config?: string } = {},
) {
  const env: Record<string, string | undefined> = {
    CLAUDE_CONFIG_DIR: opts.config ?? config,
  };
  if (opts.sessao !== false) env.CLAUDE_CODE_SESSION_ID = 'abc';
  return runAt(opts.now ?? NOW, args, env);
}

function ok(args: string[], now = NOW): string {
  const r = runAt(now, args);
  expect(r.status, r.stderr).toBe(0);
  return r.stdout;
}

function meta(): Record<string, unknown> {
  const all = JSON.parse(readFileSync(path.join(dir, 'meta.json'), 'utf8')) as Array<
    Record<string, unknown>
  >;
  return all[0] ?? {};
}

function setMeta(patch: Record<string, unknown>) {
  const file = path.join(dir, 'meta.json');
  const all = JSON.parse(readFileSync(file, 'utf8')) as Array<Record<string, unknown>>;
  all[0] = { ...all[0], ...patch };
  writeFileSync(file, JSON.stringify(all, null, 2) + '\n');
}

/** `contexto: …` do `show`, no instante `now`. */
function line(now = NOW): string {
  const out = ok(['show', dir], now);
  return out.split('\n').find((l) => l.startsWith('contexto:')) ?? '';
}

function transcript(id: string, tokens: number): string {
  const folder = path.join(scratch, 'projects', 'p');
  mkdirSync(folder, { recursive: true });
  const entry = {
    type: 'assistant',
    isSidechain: false,
    message: {
      model: 'claude-sonnet-5-5',
      role: 'assistant',
      usage: {
        input_tokens: 2,
        cache_read_input_tokens: tokens - 2 - 100,
        cache_creation_input_tokens: 100,
      },
    },
  };
  writeFileSync(path.join(folder, `${id}.jsonl`), JSON.stringify(entry) + '\n');
  return scratch;
}

beforeAll(() => {
  scratch = mkdtempSync(path.join(tmpdir(), 'queue-context-cfg-'));
  config = transcript('abc', 112_697);
});
afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});
beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'queue-context-'));
  ok(['init', dir]);
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('painel.py context --medir (CX1, decisions 1, 2 and 4 of #1874)', () => {
  it('measures the session transcript: writes pct, source sessao and contextAt, and prints medido:', () => {
    const r = ctx(['context', dir, ...MEDIR]);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toContain('medido: pct=12 contexto=112697 fonte=sessao');
    expect(meta().context).toBe(12);
    expect(meta().contextFonte).toBe('sessao');
    expect(meta().contextAt).toBe(NOW);
  });

  it('sem CLAUDE_CODE_SESSION_ID grava a fonte recente', () => {
    const r = ctx(['context', dir, ...MEDIR], { sessao: false });
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toContain('fonte=recente');
    expect(meta().contextFonte).toBe('recente');
  });

  it('o pct acima de 100 grava 100', () => {
    const r = ctx(['context', dir, '--medir', '--max', '1000']);
    expect(r.status, r.stderr).toBe(0);
    expect(meta().context).toBe(100);
  });

  it('without a transcript: code 2, the script reason and the exception path on stderr, meta unchanged', () => {
    const antes = readFileSync(path.join(dir, 'meta.json'), 'utf8');
    const r = ctx(['context', dir, ...MEDIR], {
      config: path.join(scratch, 'nao-existe'),
    });
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('sem medida (transcript abc.jsonl não achado em');
    expect(r.stderr).toContain('context <pasta> <pct> --fonte get_session');
    expect(readFileSync(path.join(dir, 'meta.json'), 'utf8')).toBe(antes);
  });
});

describe('painel.py context — usage errors and by-hand number (CX1, decisions 1 and 3)', () => {
  const casos: Array<[string, string[]]> = [
    ['--medir without --max', ['--medir']],
    ['--max without --medir', ['20', '--max', '1000000']],
    ['--medir with <pct>', ['20', ...MEDIR]],
    ['neither <pct> nor --medir', []],
    ['--fonte with --medir', [...MEDIR, '--fonte', 'get_session']],
    ['--fonte with another value', ['20', '--fonte', 'sessao']],
    ['--max with a Unicode digit', ['--medir', '--max', '²']],
  ];
  it.each(casos)('%s: code 2 and nothing written', (_nome, args) => {
    const antes = readFileSync(path.join(dir, 'meta.json'), 'utf8');
    const r = ctx(['context', dir, ...args]);
    expect(r.status, r.stdout).toBe(2);
    expect(readFileSync(path.join(dir, 'meta.json'), 'utf8')).toBe(antes);
  });

  it('context <pct> grava a fonte manual, e o show avisa que foi medido à mão', () => {
    ok(['context', dir, '20']);
    expect(meta().contextFonte).toBe('manual');
    expect(line()).toBe(`contexto: 20% (${NOW}, manual)${AVISO_MAO}`);
  });

  it('context <pct> --fonte get_session grava get_session, sem aviso de fonte', () => {
    ok(['context', dir, '20', '--fonte', 'get_session']);
    expect(meta().contextFonte).toBe('get_session');
    expect(line()).toBe(`contexto: 20% (${NOW}, get_session)`);
  });

  it('a medida do script aparece no show sem aviso', () => {
    ctx(['context', dir, ...MEDIR]);
    expect(line()).toBe(`contexto: 12% (${NOW}, sessao)`);
  });
});

describe('painel.py show — context warnings (CX1, decision 5)', () => {
  it('stale measure: exactly 70 min is not, 71 min is', () => {
    ctx(['context', dir, ...MEDIR]);
    expect(line('2026-11-10T11:10:00Z')).toBe(`contexto: 12% (${NOW}, sessao)`);
    expect(line('2026-11-10T11:11:00Z')).toBe(
      `contexto: 12% (${NOW}, sessao) — medida velha (há 71 min): meça com context --medir`,
    );
  });

  it('registro antigo sem contextFonte mostra — e o aviso de medido à mão', () => {
    setMeta({ context: 20, contextAt: NOW });
    expect(line()).toBe(`contexto: 20% (${NOW}, —)${AVISO_MAO}`);
  });

  it('acima de 35% com a fonte manual: o alerta de troca vem antes do aviso de fonte', () => {
    ok(['context', dir, '36']);
    expect(line()).toBe(
      `contexto: 36% (${NOW}, manual) — acima de 35%: troque de sessão agora ("Troca de sessão")${AVISO_MAO}`,
    );
  });

  it('sem registro a linha continua contexto: —', () => {
    expect(line()).toBe('contexto: —');
  });
});

describe('painel.py apply with context --medir (CX1, decision 2)', () => {
  it(
    'a linha context --medir --max grava como o comando solto',
    () => {
      const lote = path.join(scratch, 'lote.txt');
      writeFileSync(lote, `context ${MEDIR.join(' ')}\n`);
      const r = ctx(['apply', dir, lote]);
      expect(r.status, r.stderr).toBe(0);
      expect(meta().context).toBe(12);
      expect(meta().contextFonte).toBe('sessao');
    },
    TEMPO,
  );

  it('a medida que falha derruba o lote inteiro, sem gravar', () => {
    const lote = path.join(scratch, 'lote2.txt');
    writeFileSync(lote, `log "x"\ncontext ${MEDIR.join(' ')}\n`);
    const antes = readFileSync(path.join(dir, 'log.json'), 'utf8');
    const r = ctx(['apply', dir, lote], { config: path.join(scratch, 'nao-existe') });
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('linha 2');
    expect(readFileSync(path.join(dir, 'log.json'), 'utf8')).toBe(antes);
  });
});
