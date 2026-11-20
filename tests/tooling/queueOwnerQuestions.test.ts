// @vitest-environment node
// Phase QT1 (stage #2070, decisions 4 and 5): the coordinator's in-run questions to the owner live in the panel
// (`painel.py pergunta`, `meta.perguntas`) and show in the `perguntas ao dono:` line of `show`.
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const SCRIPT = '.claude/skills/implementar-fila/painel/painel.py';
const T0 = '2026-11-19T10:00:00Z';
const T3H = '2026-11-19T13:05:00Z';

let dir = '';

function runAt(now: string, ...args: string[]): string {
  return execFileSync('python3', [SCRIPT, '--now', now, ...args], { encoding: 'utf8' });
}

function tryRun(now: string, ...args: string[]) {
  const r = spawnSync('python3', [SCRIPT, '--now', now, ...args], { encoding: 'utf8' });
  return { code: r.status, out: r.stdout, err: r.stderr };
}

type Entry = Record<string, unknown>;

function readJson(d: string, name: string): Entry[] {
  return JSON.parse(readFileSync(path.join(d, `${name}.json`), 'utf8')) as Entry[];
}

function questions(d = dir): Entry[] {
  return (readJson(d, 'meta')[0]!.perguntas ?? []) as Entry[];
}

function logTexts(d = dir): string[] {
  return readJson(d, 'log').map((e) => String(e.text));
}

function apply(now: string, lines: string[]) {
  const file = path.join(dir, 'lote.txt');
  writeFileSync(file, lines.join('\n') + '\n');
  return tryRun(now, 'apply', dir, file);
}

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'painel-perg-'));
  runAt(T0, 'init', dir);
  runAt(T0, 'row', dir, '#7', 'title=Stage seven', 'status=em andamento');
  runAt(T0, 'row', dir, '#8', 'title=Stage eight');
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('painel.py pergunta — open (decision 4)', () => {
  it('(a) writes meta.perguntas with issue, verbo, texto and at; the same row and verb again changes nothing', () => {
    runAt(T0, 'pergunta', dir, '#7', 'segurar', 'texto=#7 started despite the note');
    expect(questions()).toEqual([
      { issue: '#7', verbo: 'segurar', texto: '#7 started despite the note', at: T0 },
    ]);
    runAt(T3H, 'pergunta', dir, '#7', 'segurar', 'texto=outro texto');
    expect(questions()).toEqual([
      { issue: '#7', verbo: 'segurar', texto: '#7 started despite the note', at: T0 },
    ]);
    runAt(T3H, 'pergunta', dir, '#7', 'reabrir', 'texto=CI preso');
    expect(questions()).toHaveLength(2);
  });

  it('(a) `soltar` is a valid verb and shows under `perguntas ao dono:` (#2204, decision 4)', () => {
    runAt(
      T0,
      'pergunta',
      dir,
      '#8',
      'soltar',
      'texto=#8 depende de #7, recusada. Responda `soltar #8`',
    );
    expect(questions()).toEqual([
      {
        issue: '#8',
        verbo: 'soltar',
        texto: '#8 depende de #7, recusada. Responda `soltar #8`',
        at: T0,
      },
    ]);
    expect(runAt(T3H, 'show', dir)).toContain(
      '  #8 soltar (há 3 h): #8 depende de #7, recusada. Responda `soltar #8`',
    );
    runAt(T3H, 'pergunta', dir, '#8', 'soltar', 'texto=outro');
    expect(questions()).toHaveLength(1); // an open question is not asked again
    runAt(T3H, 'pergunta', dir, '#8', 'soltar', '--fim', 'resposta=esperar #8');
    expect(questions()).toHaveLength(0);
  });

  it('(a) an unknown verb, a missing texto or a row outside the queue give Erro (code 2) and write nothing', () => {
    const bad = [
      tryRun(T0, 'pergunta', dir, '#7', 'apagar', 'texto=x'),
      tryRun(T0, 'pergunta', dir, '#7', 'segurar'),
      tryRun(T0, 'pergunta', dir, '#7', 'segurar', 'texto= '),
      tryRun(T0, 'pergunta', dir, '#99', 'segurar', 'texto=x'),
    ];
    for (const r of bad) {
      expect(r.code).toBe(2);
      expect(r.err).toContain('erro:');
    }
    expect(questions()).toHaveLength(0);
    expect(readJson(dir, 'log')).toHaveLength(0);
  });
});

describe('painel.py pergunta — review fixes', () => {
  it('a stray pair is an Erro: resposta= without --fim, texto= with --fim, pairs before --fim', () => {
    runAt(T0, 'pergunta', dir, '#7', 'segurar', 'texto=x');
    for (const args of [
      ['pergunta', dir, '#7', 'segurar', 'resposta=sim'],
      ['pergunta', dir, '#7', 'segurar', '--fim', 'texto=q'],
      ['pergunta', dir, '#7', 'segurar', 'resposta=sim', '--fim'],
    ]) {
      const r = tryRun(T3H, ...args);
      expect(r.code).toBe(2);
    }
    expect(questions()).toHaveLength(1);
  });

  it('a question cannot be opened on a row in a final status', () => {
    runAt(T0, 'row', dir, '#7', 'status=concluída');
    const r = tryRun(T0, 'pergunta', dir, '#7', 'segurar', 'texto=x');
    expect(r.code).toBe(2);
    expect(questions()).toHaveLength(0);
  });
});

describe('painel.py pergunta --fim (decision 4)', () => {
  it('(b) removes the question and writes the log line with the answer', () => {
    runAt(T0, 'pergunta', dir, '#7', 'segurar', 'texto=x');
    runAt(T3H, 'pergunta', dir, '#7', 'segurar', '--fim', 'resposta=seguir #7');
    expect(questions()).toHaveLength(0);
    expect(logTexts()).toContain('pergunta #7 segurar fechada: seguir #7');
  });

  it('(b) --fim on a question that is not open is a no-op with code 0', () => {
    const r = tryRun(T0, 'pergunta', dir, '#7', 'segurar', '--fim', 'resposta=seguir #7');
    expect(r.code).toBe(0);
    expect(questions()).toHaveLength(0);
    expect(logTexts().filter((t) => t.startsWith('pergunta'))).toHaveLength(0);
  });

  it('(b) --fim without resposta writes the log line without it and keeps the other questions', () => {
    runAt(T0, 'pergunta', dir, '#7', 'segurar', 'texto=x');
    runAt(T0, 'pergunta', dir, '#8', 'refazer', 'texto=y');
    runAt(T3H, 'pergunta', dir, '#7', 'segurar', '--fim');
    expect(questions().map((q) => q.issue)).toEqual(['#8']);
    expect(logTexts().some((t) => t.startsWith('pergunta #7 segurar fechada'))).toBe(
      true,
    );
  });
});

describe('painel.py apply with pergunta', () => {
  it('(c) both forms work inside apply', () => {
    const open = apply(T0, [
      'pergunta #7 segurar texto="a pergunta"',
      'pergunta #8 ampliar texto="outra"',
    ]);
    expect(open.code).toBe(0);
    expect(questions()).toHaveLength(2);
    const close = apply(T3H, [
      'pergunta #7 segurar --fim resposta="seguir #7"',
      'log "ok"',
    ]);
    expect(close.code).toBe(0);
    expect(questions().map((q) => q.issue)).toEqual(['#8']);
    expect(logTexts()).toContain('pergunta #7 segurar fechada: seguir #7');
  });

  it('(c) a bad pergunta line fails the whole batch (code 2, nothing written)', () => {
    const r = apply(T0, [
      'pergunta #7 segurar texto="x"',
      'pergunta #7 apagar texto="y"',
    ]);
    expect(r.code).toBe(2);
    expect(r.err).toContain('linha 2');
    expect(questions()).toHaveLength(0);
  });
});

describe('row with a final status closes the open questions (decision 4)', () => {
  it.each(['concluída', 'falhou', 'recusada'])('(d) status=%s', (status) => {
    runAt(T0, 'pergunta', dir, '#7', 'segurar', 'texto=x');
    runAt(T0, 'pergunta', dir, '#7', 'reabrir', 'texto=y');
    runAt(T0, 'pergunta', dir, '#8', 'refazer', 'texto=z');
    runAt(T3H, 'row', dir, '#7', `status=${status}`);
    expect(questions().map((q) => q.issue)).toEqual(['#8']);
    expect(logTexts()).toContain(`pergunta #7 segurar fechada: etapa ${status}`);
    expect(logTexts()).toContain(`pergunta #7 reabrir fechada: etapa ${status}`);
  });

  it('(d) a non-final status keeps the questions', () => {
    runAt(T0, 'pergunta', dir, '#7', 'segurar', 'texto=x');
    runAt(T3H, 'row', dir, '#7', 'status=esperando dono');
    expect(questions()).toHaveLength(1);
  });
});

describe('painel.py show — perguntas ao dono (decision 5)', () => {
  it('(e) prints "nenhuma" with nothing open', () => {
    expect(runAt(T0, 'show', dir)).toContain('perguntas ao dono: nenhuma');
  });

  it('(e) counts the row questions and the SUP in perguntado ao dono, with the age in hours; other SUP states are not listed', () => {
    runAt(
      T0,
      'pergunta',
      dir,
      '#7',
      'segurar',
      'texto=#7 started despite the note. Responda `segurar #7`',
    );
    runAt(
      T0,
      'sup',
      dir,
      'SUP-1',
      'tipo=B',
      'pedido=swap the order',
      'estado=perguntado ao dono',
    );
    runAt(T0, 'sup', dir, 'SUP-2', 'tipo=A', 'pedido=hold #8', 'estado=enviado');
    runAt(T0, 'sup', dir, 'SUP-3', 'tipo=B', 'pedido=outra', 'estado=perguntado ao dono');
    runAt(T0, 'sup', dir, 'SUP-3', 'estado=negado');
    const out = runAt(T3H, 'show', dir);
    expect(out).toContain('perguntas ao dono: 2');
    expect(out).toContain(
      '  #7 segurar (há 3 h): #7 started despite the note. Responda `segurar #7`',
    );
    expect(out).toContain('  SUP-1 (há 3 h): swap the order');
    expect(out).not.toContain('SUP-2 (há');
    expect(out).not.toContain('SUP-3 (há');
    const lines = out.split('\n');
    const i = lines.findIndex((l) => l.startsWith('perguntas ao dono:'));
    expect(lines[i - 1]).toMatch(/^pedidos do supervisor:/);
  });
});

describe('open questions do not change the queue plan (decision 4)', () => {
  it('(f) vagas, começar agora, atrasadas and esperando o coordenador are the same', () => {
    const keys = ['vagas:', 'começar agora:', 'atrasadas:', 'esperando o coordenador:'];
    const pick = (out: string) =>
      out.split('\n').filter((l) => keys.some((k) => l.startsWith(k)));
    const before = pick(runAt(T3H, 'show', dir));
    runAt(T0, 'pergunta', dir, '#7', 'segurar', 'texto=x');
    runAt(T0, 'pergunta', dir, '#8', 'refazer', 'texto=y');
    expect(pick(runAt(T3H, 'show', dir))).toEqual(before);
    expect(before).toHaveLength(4);
  });
});

describe('painel.py show #n (decision 5)', () => {
  it('(g) prints the row open questions', () => {
    runAt(T0, 'pergunta', dir, '#7', 'segurar', 'texto=a pergunta do 7');
    runAt(T0, 'pergunta', dir, '#8', 'refazer', 'texto=a do 8');
    const out = runAt(T3H, 'show', dir, '#7');
    expect(out).toContain('perguntas ao dono: 1');
    expect(out).toContain('#7 segurar (há 3 h): a pergunta do 7');
    expect(out).not.toContain('a do 8');
  });
});

describe('import and upgrade (decision 4)', () => {
  it('(h) import brings the open questions of the imported rows and drops those of the rows it does not', () => {
    runAt(T0, 'pergunta', dir, '#7', 'segurar', 'texto=fica');
    runAt(T0, 'row', dir, '#9', 'title=Done', 'status=concluída');
    // a question is closed by the final status, so open it by hand on a row that import drops
    const metaPath = path.join(dir, 'meta.json');
    const meta = readJson(dir, 'meta');
    (meta[0]!.perguntas as Entry[]).push({
      issue: '#9',
      verbo: 'refazer',
      texto: 'cai',
      at: T0,
    });
    writeFileSync(metaPath, JSON.stringify(meta));
    const fresh = mkdtempSync(path.join(tmpdir(), 'painel-perg-new-'));
    try {
      runAt(T3H, 'init', fresh);
      runAt(T3H, 'import', fresh, dir);
      expect(questions(fresh)).toEqual([
        { issue: '#7', verbo: 'segurar', texto: 'fica', at: T0 },
      ]);
    } finally {
      rmSync(fresh, { recursive: true, force: true });
    }
  });

  it('(h) upgrade on a panel without perguntas writes nothing new', () => {
    const before = readJson(dir, 'meta')[0]!;
    expect(before.perguntas).toBeUndefined();
    runAt(T3H, 'upgrade', dir);
    expect(readJson(dir, 'meta')[0]!.perguntas).toBeUndefined();
  });
});

describe('help', () => {
  it('--help lists pergunta', () => {
    expect(runAt(T0, '--help')).toContain('pergunta');
  });
});
