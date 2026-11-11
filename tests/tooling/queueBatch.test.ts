// @vitest-environment node
// Fase FM1 (etapa #1532): o painel em lote (`apply`), o que falta publicar (`meta.unpublished`,
// `published`, `touch`) e a regra de publicar a cada turno que gravou, escrita no skill.
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { section } from '../support/textSlice';

const SCRIPT = '.claude/skills/implementar-fila/painel/painel.py';

let dir = '';

function run(...args: string[]): string {
  return execFileSync('python3', [SCRIPT, ...args], { encoding: 'utf8' });
}

function runAt(now: string, ...args: string[]): string {
  return run('--now', now, ...args);
}

/** Roda com `input` no stdin e devolve o código de saída e as duas saídas, sem lançar. */
function tryRun(input: string | undefined, ...args: string[]) {
  const r = spawnSync('python3', [SCRIPT, ...args], { encoding: 'utf8', input });
  return { code: r.status, out: r.stdout, err: r.stderr };
}

function json(name: string): Array<Record<string, unknown>> {
  return JSON.parse(readFileSync(path.join(dir, `${name}.json`), 'utf8')) as Array<
    Record<string, unknown>
  >;
}

function meta(): Record<string, unknown> {
  return json('meta')[0]!;
}

function unpublished(): { since: string; files: string[] } | undefined {
  return meta().unpublished as { since: string; files: string[] } | undefined;
}

function snapshot(): string[] {
  return ['queue', 'meta', 'log'].map((n) =>
    readFileSync(path.join(dir, `${n}.json`), 'utf8'),
  );
}

const BATCH = [
  "row '#10' title='Etapa dez' status='em andamento' stage=Fases",
  "phase '#10' FM1=open",
  'log "fase aberta"',
  'current "FM1 aberta"',
].join('\n');

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'painel-lote-'));
  runAt('2026-11-09T10:00:00Z', 'init', dir);
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('painel.py apply (FM1, decisão 2)', () => {
  it('grava várias linhas (row, phase, log, current) e imprime uma só linha alterados:', () => {
    const file = path.join(dir, 'lote.txt');
    writeFileSync(file, BATCH + '\n');
    const out = runAt('2026-11-09T11:00:00Z', 'apply', dir, file);
    expect(out.match(/^alterados:/gm)).toHaveLength(1);
    expect(out).toContain('queue.json');
    expect(out).toContain('meta.json');
    expect(out).toContain('log.json');
    const row = json('queue')[0]!;
    expect(row.title).toBe('Etapa dez');
    expect(row.status).toBe('em andamento');
    expect(row.phases).toBe('FM1:open');
    expect(json('log')[0]?.text).toBe('fase aberta');
    expect(meta().current).toBe('FM1 aberta');
  });

  it('lê o lote do stdin com "-", ignora linha vazia e linha com #', () => {
    const input = `# comentário\n\n${BATCH}\n   \n# outro\n`;
    const r = tryRun(input, '--now', '2026-11-09T11:00:00Z', 'apply', dir, '-');
    expect(r.code).toBe(0);
    expect(r.out.match(/^alterados:/gm)).toHaveLength(1);
    expect(json('queue')).toHaveLength(1);
    expect(json('log')).toHaveLength(1);
  });

  it.each([
    ['campo desconhecido', "row '#10' title=Ok\nrow '#10' bogus=1\nlog x", 2],
    ['subcomando inválido', "log ok\nnaoexiste '#10'", 2],
    ['show', 'log ok\nshow', 2],
    ['apply dentro de apply', 'log ok\napply x y', 2],
  ])(
    'linha com erro (%s) não grava nada, sai com 2 e cita o número da linha',
    (_nome, input, line) => {
      const before = snapshot();
      const r = tryRun(input, '--now', '2026-11-09T11:00:00Z', 'apply', dir, '-');
      expect(r.code).toBe(2);
      expect(r.err).toMatch(new RegExp(`linha ${line}\\b`));
      expect(snapshot()).toEqual(before);
    },
  );

  it('-h dentro do lote é erro (código 2, cita a linha) e não grava nada', () => {
    const before = snapshot();
    const r = tryRun("log ok\nrow '#1' -h\n", 'apply', dir, '-');
    expect(r.code).toBe(2);
    expect(r.err).toMatch(/linha 2\b/);
    expect(snapshot()).toEqual(before);
  });

  it('só open_session e cmd_apply criam Sessao: os outros comandos entram no lote', () => {
    const src = readFileSync(SCRIPT, 'utf8');
    const uses = src
      .split('\n')
      .filter((l) => /\bSessao\(/.test(l) && !l.includes('class Sessao'));
    expect(uses).toHaveLength(2);
  });

  it('a numeração da linha conta as linhas vazias e os comentários', () => {
    const r = tryRun("# a\n\nlog ok\nrow '#1' bogus=1\n", 'apply', dir, '-');
    expect(r.code).toBe(2);
    expect(r.err).toMatch(/linha 4\b/);
  });

  it('separa os argumentos com shlex, como a linha de comando', () => {
    tryRun(`log "texto com espaços e 'aspas'"\n`, 'apply', dir, '-');
    expect(json('log')[0]?.text).toBe("texto com espaços e 'aspas'");
  });
});

describe('meta.unpublished, published e touch (FM1, decisão 3)', () => {
  it('cada gravação soma os arquivos e mantém o since da primeira não publicada', () => {
    runAt('2026-11-09T10:05:00Z', 'log', dir, 'a');
    expect(unpublished()).toEqual({
      since: '2026-11-09T10:05:00Z',
      files: ['meta.json', 'log.json'],
    });
    runAt('2026-11-09T10:20:00Z', 'row', dir, '#10', 'title=X');
    expect(unpublished()).toEqual({
      since: '2026-11-09T10:05:00Z',
      files: ['queue.json', 'meta.json', 'log.json'],
    });
  });

  it('o apply também marca os arquivos que gravou', () => {
    tryRun(BATCH, '--now', '2026-11-09T10:30:00Z', 'apply', dir, '-');
    expect(unpublished()?.since).toBe('2026-11-09T10:30:00Z');
    expect(unpublished()?.files).toEqual(['queue.json', 'meta.json', 'log.json']);
  });

  it('o show imprime "não publicado desde <HH:MM>: <arquivos>" e, depois do published, "nenhum"', () => {
    runAt('2026-11-09T10:05:00Z', 'log', dir, 'a');
    expect(runAt('2026-11-09T10:40:00Z', 'show', dir)).toMatch(
      /^não publicado desde 10:05: meta\.json log\.json$/m,
    );
    runAt('2026-11-09T10:41:00Z', 'published', dir);
    runAt('2026-11-09T10:41:30Z', 'published', dir, '--done');
    expect(runAt('2026-11-09T10:42:00Z', 'show', dir)).toMatch(
      /^não publicado: nenhum$/m,
    );
  });

  it('published sem confirmar (sessão morreu antes do batch): o show ainda diz o que falta (defeito 1 da CL1)', () => {
    runAt('2026-11-09T10:05:00Z', 'row', dir, '#10', 'title=X');
    runAt('2026-11-09T10:41:00Z', 'published', dir);
    expect(runAt('2026-11-09T10:50:00Z', 'show', dir)).toMatch(
      /^não publicado desde 10:05: queue\.json meta\.json$/m,
    );
  });

  it('published --done depois do batch zera; gravação entre o published e o --done não se perde', () => {
    runAt('2026-11-09T10:05:00Z', 'row', dir, '#10', 'title=X');
    runAt('2026-11-09T10:41:00Z', 'published', dir);
    runAt('2026-11-09T10:42:00Z', 'log', dir, 'nova');
    runAt('2026-11-09T10:43:00Z', 'published', dir, '--done');
    expect(runAt('2026-11-09T10:44:00Z', 'show', dir)).toMatch(
      /^não publicado desde 10:05: queue\.json meta\.json log\.json$/m,
    );
    runAt('2026-11-09T10:45:00Z', 'published', dir);
    runAt('2026-11-09T10:46:00Z', 'published', dir, '--done');
    expect(run('show', dir)).toMatch(/^não publicado: nenhum$/m);
  });

  it('o show de um painel novo, sem gravação, diz "nenhum"', () => {
    expect(run('show', dir)).toMatch(/^não publicado: nenhum$/m);
  });

  it('published imprime at: igual ao relógio, grava publishedAt e só o --done limpa a marca', () => {
    runAt('2026-11-09T10:05:00Z', 'row', dir, '#10', 'title=X');
    const out = runAt('2026-11-09T10:41:07Z', 'published', dir);
    expect(out).toMatch(/^at: 2026-11-09T10:41:07Z$/m);
    expect(out).toMatch(/queue\.json/);
    expect(meta().publishedAt).toBe('2026-11-09T10:41:07Z');
    expect(unpublished()?.files).toEqual(['queue.json', 'meta.json']);
    runAt('2026-11-09T10:41:20Z', 'published', dir, '--done');
    expect(unpublished()?.files ?? []).toEqual([]);
  });

  it('o published sem --now usa o relógio real, em ISO UTC', () => {
    const out = run('published', dir);
    expect(out).toMatch(/^at: \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/m);
  });

  it('touch marca de novo os três arquivos', () => {
    runAt('2026-11-09T10:05:00Z', 'published', dir);
    runAt('2026-11-09T10:06:00Z', 'published', dir, '--done');
    expect(unpublished()?.files ?? []).toEqual([]);
    runAt('2026-11-09T12:00:00Z', 'touch', dir);
    expect(unpublished()).toEqual({
      since: '2026-11-09T12:00:00Z',
      files: ['queue.json', 'meta.json', 'log.json'],
    });
  });

  it('context sozinho não marca nada como não publicado, e junto de outro comando vale o outro', () => {
    runAt('2026-11-09T10:05:00Z', 'context', dir, '40');
    expect(unpublished()).toBeUndefined();
    expect(run('show', dir)).toMatch(/^não publicado: nenhum$/m);
    tryRun('context 41\nlog x\n', '--now', '2026-11-09T10:06:00Z', 'apply', dir, '-');
    expect(unpublished()?.files).toEqual(['meta.json', 'log.json']);
  });

  it('o show não quebra com unpublished sem since', () => {
    const file = path.join(dir, 'meta.json');
    const m = json('meta');
    m[0]!.unpublished = { files: ['meta.json'] };
    writeFileSync(file, JSON.stringify(m));
    expect(run('show', dir)).toMatch(/^não publicado desde —: meta\.json$/m);
  });

  it('os outros comandos mantêm a saída (uma linha alterados:)', () => {
    expect(run('log', dir, 'x')).toBe('alterados: meta.json log.json\n');
    expect(run('row', dir, '#1', 'title=Y')).toBe('alterados: queue.json meta.json\n');
  });
});

describe('implementar-fila/SKILL.md: publicar a cada turno que gravou (FM1, decisão 3)', () => {
  const skill = readFileSync('.claude/skills/implementar-fila/SKILL.md', 'utf8');
  const economia = section(skill, '## Economia de contexto');
  const painel = section(skill, '## Painel');
  const reserva = skill.slice(skill.indexOf('**Conferências de reserva:**'));

  it('o item 7 manda publicar por turno, mesmo com o subagente do ciclo rodando', () => {
    const item7 = economia.split('\n').find((l) => l.startsWith('7. '))!;
    expect(item7).toMatch(/por turno/);
    expect(item7).toMatch(/mesmo com o subagente/);
    expect(item7).toMatch(/"Entra na próxima publicação" não vale/);
    expect(item7).not.toMatch(/Nunca há duas publicações no mesmo ciclo/);
  });

  it('a lista de comandos traz apply, published e touch', () => {
    expect(painel).toMatch(/painel\.py apply <pasta> <arquivo\|->/);
    expect(painel).toMatch(/painel\.py published <pasta>/);
    expect(painel).toMatch(/painel\.py touch <pasta>/);
    expect(painel).toMatch(/heredoc/);
  });

  it('"Publicar uma atualização" cita o published antes do batch e o at dele', () => {
    const pub = painel.slice(painel.indexOf('**Publicar uma atualização:**'));
    const iPublished = pub.indexOf('painel.py published');
    const iBatch = pub.indexOf('ArtifactData');
    expect(iPublished).toBeGreaterThan(-1);
    expect(iBatch).toBeGreaterThan(iPublished);
    expect(pub).toMatch(/`updated\.at`/);
    expect(pub).toMatch(/`edit\.at`/);
    expect(pub).toMatch(/`at: <ISO UTC>`/);
    expect(pub).toMatch(/painel\.py touch/);
    expect(pub).toMatch(/painel\.py published <pasta> --done/);
    expect(pub).toMatch(/uma publicação por turno, no fim/);
    expect(pub).not.toMatch(/Nunca há duas publicações no mesmo ciclo/);
  });

  it('as conferências de reserva publicam quando o show mostra arquivo não publicado', () => {
    expect(reserva).toMatch(
      /publica[^\n]*arquivo não publicado|arquivo não publicado[^\n]*publica/,
    );
  });
});
