// @vitest-environment node
// Phase FM1 (stage #1532): the batch panel (`apply`), what is left to publish (`meta.unpublished`,
// `published`, `touch`) and the rule of publishing every turn that wrote, written in the skill.
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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

/** Runs with `input` on stdin and returns the exit code and both outputs, without throwing. */
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
  "row '#10' title='Stage ten' status='em andamento' stage=Fases",
  "phase '#10' FM1=open",
  'log "phase opened"',
  'current "FM1 opened"',
].join('\n');

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'painel-batch-'));
  runAt('2026-11-09T10:00:00Z', 'init', dir);
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('painel.py apply (FM1, decision 2)', () => {
  it('writes several lines (row, phase, log, current) and prints a single alterados: line', () => {
    const file = path.join(dir, 'batch.txt');
    writeFileSync(file, BATCH + '\n');
    const out = runAt('2026-11-09T11:00:00Z', 'apply', dir, file);
    expect(out.match(/^alterados:/gm)).toHaveLength(1);
    expect(out).toContain('queue.json');
    expect(out).toContain('meta.json');
    expect(out).toContain('log.json');
    const row = json('queue')[0]!;
    expect(row.title).toBe('Stage ten');
    expect(row.status).toBe('em andamento');
    expect(row.phases).toBe('FM1:open');
    expect(json('log')[0]?.text).toBe('phase opened');
    expect(meta().current).toBe('FM1 opened');
  });

  it('reads the batch from stdin with "-", ignores empty lines and lines with #', () => {
    const input = `# comment\n\n${BATCH}\n   \n# other\n`;
    const r = tryRun(input, '--now', '2026-11-09T11:00:00Z', 'apply', dir, '-');
    expect(r.code).toBe(0);
    expect(r.out.match(/^alterados:/gm)).toHaveLength(1);
    expect(json('queue')).toHaveLength(1);
    expect(json('log')).toHaveLength(1);
  });

  it.each([
    ['unknown field', "row '#10' title=Ok\nrow '#10' bogus=1\nlog x", 2],
    ['invalid subcommand', "log ok\nnaoexiste '#10'", 2],
    ['show', 'log ok\nshow', 2],
    ['apply inside apply', 'log ok\napply x y', 2],
  ])(
    'a line with an error (%s) writes nothing, exits with 2 and cites the line number',
    (_name, input, line) => {
      const before = snapshot();
      const r = tryRun(input, '--now', '2026-11-09T11:00:00Z', 'apply', dir, '-');
      expect(r.code).toBe(2);
      expect(r.err).toMatch(new RegExp(`linha ${line}\\b`));
      expect(snapshot()).toEqual(before);
    },
  );

  it('-h inside the batch is an error (code 2, cites the line) and writes nothing', () => {
    const before = snapshot();
    const r = tryRun("log ok\nrow '#1' -h\n", 'apply', dir, '-');
    expect(r.code).toBe(2);
    expect(r.err).toMatch(/linha 2\b/);
    expect(snapshot()).toEqual(before);
  });

  it('only open_session and cmd_apply create Sessao: the other commands go in the batch', () => {
    const src = readFileSync(SCRIPT, 'utf8');
    const uses = src
      .split('\n')
      .filter((l) => /\bSessao\(/.test(l) && !l.includes('class Sessao'));
    expect(uses).toHaveLength(2);
  });

  it('the line numbering counts empty lines and comments', () => {
    const r = tryRun("# a\n\nlog ok\nrow '#1' bogus=1\n", 'apply', dir, '-');
    expect(r.code).toBe(2);
    expect(r.err).toMatch(/linha 4\b/);
  });

  it('splits the arguments with shlex, like the command line', () => {
    tryRun(`log "text with spaces and 'quotes'"\n`, 'apply', dir, '-');
    expect(json('log')[0]?.text).toBe("text with spaces and 'quotes'");
  });
});

describe('meta.unpublished, published and touch (FM1, decision 3)', () => {
  it('each write adds the files and keeps the since of the first unpublished one', () => {
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

  it('apply also marks the files it wrote', () => {
    tryRun(BATCH, '--now', '2026-11-09T10:30:00Z', 'apply', dir, '-');
    expect(unpublished()?.since).toBe('2026-11-09T10:30:00Z');
    expect(unpublished()?.files).toEqual(['queue.json', 'meta.json', 'log.json']);
  });

  it('show prints "não publicado desde <HH:MM>: <files>" and, after published, "nenhum"', () => {
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

  it('published without confirming (the session died before the batch): show still says what is missing (defect 1 of CL1)', () => {
    runAt('2026-11-09T10:05:00Z', 'row', dir, '#10', 'title=X');
    runAt('2026-11-09T10:41:00Z', 'published', dir);
    expect(runAt('2026-11-09T10:50:00Z', 'show', dir)).toMatch(
      /^não publicado desde 10:05: queue\.json meta\.json$/m,
    );
  });

  it('published --done after the batch resets; a write between published and --done is not lost', () => {
    runAt('2026-11-09T10:05:00Z', 'row', dir, '#10', 'title=X');
    runAt('2026-11-09T10:41:00Z', 'published', dir);
    runAt('2026-11-09T10:42:00Z', 'log', dir, 'new');
    runAt('2026-11-09T10:43:00Z', 'published', dir, '--done');
    expect(runAt('2026-11-09T10:44:00Z', 'show', dir)).toMatch(
      /^não publicado desde 10:05: queue\.json meta\.json log\.json$/m,
    );
    runAt('2026-11-09T10:45:00Z', 'published', dir);
    runAt('2026-11-09T10:46:00Z', 'published', dir, '--done');
    expect(run('show', dir)).toMatch(/^não publicado: nenhum$/m);
  });

  it('the published copy (downloaded on resume) says "não publicado" until published --done; without publishing, it stays unpublished (PP1, decision 4 of #1595)', () => {
    runAt('2026-11-09T10:05:00Z', 'row', dir, '#10', 'title=X');
    runAt('2026-11-09T10:41:00Z', 'published', dir); // the upload that succeeded; --done only counts on the local panel
    const copy = mkdtempSync(path.join(tmpdir(), 'painel-copy-'));
    try {
      for (const n of ['queue', 'meta', 'log']) {
        copyFileSync(path.join(dir, `${n}.json`), path.join(copy, `${n}.json`));
      }
      expect(runAt('2026-11-09T10:50:00Z', 'show', copy)).toMatch(
        /^não publicado desde 10:05: queue\.json meta\.json$/m,
      );
      runAt('2026-11-09T10:51:00Z', 'published', copy, '--done');
      expect(runAt('2026-11-09T10:52:00Z', 'show', copy)).toMatch(
        /^não publicado: nenhum$/m,
      );

      // old panel: the copy does not carry `publishing`
      const old = JSON.parse(readFileSync(path.join(dir, 'meta.json'), 'utf8')) as Array<
        Record<string, unknown>
      >;
      delete old[0]!.publishing;
      writeFileSync(path.join(copy, 'meta.json'), JSON.stringify(old));
      const out = runAt('2026-11-09T10:53:00Z', 'published', copy, '--done');
      expect(out).toMatch(/^nada em voo/m);
      expect(runAt('2026-11-09T10:54:00Z', 'show', copy)).toMatch(
        /^não publicado desde 10:05:/m,
      );
    } finally {
      rmSync(copy, { recursive: true, force: true });
    }
  });

  it('show of a new panel, with no write, says "nenhum"', () => {
    expect(run('show', dir)).toMatch(/^não publicado: nenhum$/m);
  });

  it('published prints at: equal to the clock, writes publishedAt and only --done clears the mark', () => {
    runAt('2026-11-09T10:05:00Z', 'row', dir, '#10', 'title=X');
    const out = runAt('2026-11-09T10:41:07Z', 'published', dir);
    expect(out).toMatch(/^at: 2026-11-09T10:41:07Z$/m);
    expect(out).toMatch(/queue\.json/);
    expect(meta().publishedAt).toBe('2026-11-09T10:41:07Z');
    expect(unpublished()?.files).toEqual(['queue.json', 'meta.json']);
    runAt('2026-11-09T10:41:20Z', 'published', dir, '--done');
    expect(unpublished()?.files ?? []).toEqual([]);
  });

  it('published without --now uses the real clock, in ISO UTC', () => {
    const out = run('published', dir);
    expect(out).toMatch(/^at: \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/m);
  });

  it('touch marks the three files again', () => {
    runAt('2026-11-09T10:05:00Z', 'published', dir);
    runAt('2026-11-09T10:06:00Z', 'published', dir, '--done');
    expect(unpublished()?.files ?? []).toEqual([]);
    runAt('2026-11-09T12:00:00Z', 'touch', dir);
    expect(unpublished()).toEqual({
      since: '2026-11-09T12:00:00Z',
      files: ['queue.json', 'meta.json', 'log.json'],
    });
  });

  it('context alone marks nothing as unpublished, and together with another command the other one counts', () => {
    runAt('2026-11-09T10:05:00Z', 'context', dir, '40');
    expect(unpublished()).toBeUndefined();
    expect(run('show', dir)).toMatch(/^não publicado: nenhum$/m);
    tryRun('context 41\nlog x\n', '--now', '2026-11-09T10:06:00Z', 'apply', dir, '-');
    expect(unpublished()?.files).toEqual(['meta.json', 'log.json']);
  });

  it('show does not break with unpublished without since', () => {
    const file = path.join(dir, 'meta.json');
    const m = json('meta');
    m[0]!.unpublished = { files: ['meta.json'] };
    writeFileSync(file, JSON.stringify(m));
    expect(run('show', dir)).toMatch(/^não publicado desde —: meta\.json$/m);
  });

  it('the other commands keep the output (one alterados: line)', () => {
    expect(run('log', dir, 'x')).toBe('alterados: meta.json log.json\n');
    expect(run('row', dir, '#1', 'title=Y')).toBe('alterados: queue.json meta.json\n');
  });
});

describe('implementar-fila/SKILL.md: publish every turn that wrote (FM1, decision 3)', () => {
  const skill = readFileSync('.claude/skills/implementar-fila/SKILL.md', 'utf8');
  const economy = section(skill, '## Context economy');
  const panel = section(skill, '## Panel');
  const fallback = skill.slice(skill.indexOf('**Fallback checks:**'));

  it('item 7 says to publish per turn, even with the cycle subagent running', () => {
    const item7 = economy.split('\n').find((l) => l.startsWith('7. '))!;
    expect(item7).toMatch(/per turn/);
    expect(item7).toMatch(/even with the cycle's subagent/);
    expect(item7).toMatch(/"It goes into the next publication" does not hold/);
    expect(item7).not.toMatch(/There are never two publications in the same cycle/);
  });

  it('the command list has apply, published and touch', () => {
    expect(panel).toMatch(/painel\.py apply <folder> <file\|->/);
    expect(panel).toMatch(/painel\.py published <folder>/);
    expect(panel).toMatch(/painel\.py touch <folder>/);
    expect(panel).toMatch(/heredoc/);
  });

  it('"Publishing an update" cites published before the batch and its at', () => {
    const pub = panel.slice(panel.indexOf('**Publishing an update:**'));
    const iPublished = pub.indexOf('painel.py published');
    const iBatch = pub.indexOf('ArtifactData');
    expect(iPublished).toBeGreaterThan(-1);
    expect(iBatch).toBeGreaterThan(iPublished);
    expect(pub).toMatch(/`updated\.at`/);
    expect(pub).toMatch(/`edit\.at`/);
    expect(pub).toMatch(/`at: <ISO UTC>`/);
    expect(pub).toMatch(/painel\.py touch/);
    expect(pub).toMatch(/painel\.py published <folder> --done/);
    expect(pub).toMatch(/one publication per turn, at the end/);
    expect(pub).not.toMatch(/There are never two publications in the same cycle/);
  });

  it('the fallback checks publish when show lists an unpublished file', () => {
    expect(fallback).toMatch(
      /publishes[^\n]*unpublished file|unpublished file[^\n]*publishes/,
    );
  });
});
