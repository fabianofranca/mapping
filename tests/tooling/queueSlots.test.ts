// @vitest-environment node
// Phases VG1 and VG2 (stage #1440). VG1: the panel computes the "Vagas k/N" note with the reason for each `ready`
// that has not started, says which ones start now and keeps the coordinator's context (alert above 35%).
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { between, section } from '../support/textSlice';

const SCRIPT = '.claude/skills/implementar-fila/painel/painel.py';
const PAGE = '.claude/skills/implementar-fila/painel/index.html';
const NOW = '2026-11-10T10:00:00Z';
// Tests that spawn dozens of painel.py subprocesses: headroom for CI under load.
const SUBPROCESS_TIMEOUT = 30_000;

let dir = '';

function run(...args: string[]): string {
  return execFileSync('python3', [SCRIPT, '--now', NOW, ...args], { encoding: 'utf8' });
}

function runRaw(...args: string[]) {
  return spawnSync('python3', [SCRIPT, '--now', NOW, ...args], { encoding: 'utf8' });
}

function json(name: string): Array<Record<string, unknown>> {
  return JSON.parse(readFileSync(path.join(dir, `${name}.json`), 'utf8')) as Array<
    Record<string, unknown>
  >;
}

function slots(): string {
  return String(json('meta')[0]?.vagas);
}

function ficha(dep: string, toca: string, schema = 'não'): string {
  return `dep=${dep} | nivel=impact: low | mcp=não | schema=${schema} | toca=${toca}`;
}

function stage(issue: string, plan: string, ...extra: string[]) {
  run('row', dir, issue, `title=Stage ${issue}`, `plan=${plan}`, ...extra);
}

describe('painel.py — vagas (VG1, #1440)', () => {
  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'vagas-'));
    run('init', dir);
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('start --paralelo N writes meta.paralelo, repeating it leaves runStart alone and, without the field, the count uses 2', () => {
    stage('#1', ficha('nenhuma', 'a.ts'));
    stage('#2', ficha('nenhuma', 'b.ts'));
    stage('#3', ficha('nenhuma', 'c.ts'));
    run('log', dir, 'x');
    expect(slots()).toBe('Vagas 0/2 · #1 começa · #2 começa · #3 vagas cheias');
    run('start', dir, '--paralelo', '3');
    const first = json('meta')[0]?.runStart;
    expect(json('meta')[0]?.paralelo).toBe(3);
    expect(first).toBe(NOW);
    execFileSync('python3', [
      SCRIPT,
      '--now',
      '2026-11-10T11:00:00Z',
      'start',
      dir,
      '--paralelo',
      '4',
    ]);
    expect(json('meta')[0]?.runStart).toBe(NOW);
    expect(json('meta')[0]?.paralelo).toBe(4);
  });

  it('hold is a row field, accepted by row and shown by show #n', () => {
    stage('#1', ficha('nenhuma', 'a.ts'), 'hold=pausada pelo dono');
    expect(json('queue')[0]?.hold).toBe('pausada pelo dono');
    expect(run('show', dir, '#1')).toContain('hold: pausada pelo dono');
    expect(slots()).toContain('#1 pausada pelo dono');
    run('row', dir, '#1', 'hold=');
    expect(slots()).toContain('#1 começa');
  });

  it('merged appends to meta.merged without repeating and refuses an invalid #N (code 2)', () => {
    run('merged', dir, '#7');
    run('merged', dir, '#7');
    run('merged', dir, '#8');
    expect(json('meta')[0]?.merged).toEqual(['#7', '#8']);
    const bad = runRaw('merged', dir, '7x');
    expect(bad.status).toBe(2);
  });

  it('dependency state: :main, meta.merged and a concluída row satisfy; :aberta, no state and ? do not', () => {
    run('merged', dir, '#20');
    run('row', dir, '#30', 'status=concluída');
    stage('#1', ficha('#10:main', 'a.ts'));
    stage('#2', ficha('#11:aberta', 'b.ts'));
    stage('#3', ficha('#12', 'c.ts'));
    stage('#4', ficha('#20', 'd.ts'));
    stage('#5', ficha('#30', 'e.ts'));
    stage('#6', ficha('nenhuma', 'f.ts'));
    stage('#7', ficha('?', 'g.ts'));
    stage('#8', ficha('#11:aberta,#12', 'h.ts'));
    run('start', dir, '--paralelo', '9');
    expect(slots()).toBe(
      'Vagas 0/9 · #1 começa · #2 dep #11 · #3 dep #12 · #4 começa · #5 começa · #6 começa · #7 ficha incompleta (dep) · #8 dep #11, #12 · nenhuma ready elegível',
    );
  });

  it('the count: taken, started, order of the reasons, a candidate that starts counts for the following ones', () => {
    run('start', dir, '--paralelo', '3');
    stage(
      '#1',
      ficha('nenhuma', 'docs/TESTING.md#R12'),
      'status=em andamento',
      'started=now',
    );
    stage('#2', ficha('nenhuma', 'docs/TESTING.md#R25'));
    stage('#3', ficha('nenhuma', 'docs/TESTING.md#R12'));
    stage('#4', ficha('#9:aberta', 'docs/TESTING.md#R12'));
    stage('#5', ficha('nenhuma', 'x.ts', 'v19'), 'status=esperando dono');
    stage('#6', ficha('nenhuma', 'y.ts', 'v19'));
    stage('#7', ficha('nenhuma', 'docs/TESTING.md#R25'));
    stage('#8', ficha('nenhuma', 'z.ts'));
    const out = slots();
    expect(out).toBe(
      'Vagas 1/3 · #2 começa · #3 arquivo docs/TESTING.md#R12 com #1 · #4 dep #9 · #6 schema com #5 · #7 arquivo docs/TESTING.md#R25 com #2 · #8 começa',
    );
    const show = run('show', dir);
    expect(show).toContain(`vagas: ${out}`);
    expect(show).toContain('começar agora: #2 #8');
  });

  it('aguardando with started counts as started and not merged; the hold reason comes before the dep', () => {
    run('start', dir, '--paralelo', '5');
    stage('#1', ficha('nenhuma', 'a.ts'), 'started=now');
    stage('#2', ficha('nenhuma', 'a.ts'));
    stage('#3', ficha('#99:aberta', 'q.ts'), 'hold=ordem do dono (por último)');
    expect(slots()).toBe(
      'Vagas 0/5 · #2 arquivo a.ts com #1 · #3 ordem do dono (por último) · nenhuma ready elegível',
    );
    expect(run('show', dir)).toContain('começar agora: nenhuma');
  });

  it('nenhuma ready elegível when a slot is left; vagas cheias without a slot', () => {
    run('start', dir, '--paralelo', '1');
    stage('#1', ficha('nenhuma', 'a.ts'), 'status=em andamento');
    stage('#2', ficha('nenhuma', 'b.ts'));
    expect(slots()).toBe('Vagas 1/1 · #2 vagas cheias');
    run('row', dir, '#2', 'status=concluída');
    expect(slots()).toBe('Vagas 1/1');
    run('row', dir, '#1', 'status=concluída');
    expect(slots()).toBe('Vagas 0/1 · nenhuma ready elegível');
  });

  it(
    'Toca em: comparison: script, whole file, ignored ones, folder, backticks and ?',
    () => {
      run('start', dir, '--paralelo', '9');
      const reason = (a: string, b: string): string => {
        run('init', dir, '--force');
        run('start', dir, '--paralelo', '9');
        stage('#1', ficha('nenhuma', a), 'status=em andamento');
        stage('#2', ficha('nenhuma', b));
        return slots().split(' · ')[1] ?? '';
      };
      expect(reason('docs/TESTING.md#R12', 'docs/TESTING.md#R25')).toBe('#2 começa');
      expect(reason('docs/TESTING.md#R12', 'docs/TESTING.md#R12')).toBe(
        '#2 arquivo docs/TESTING.md#R12 com #1',
      );
      expect(reason('docs/TESTING.md#R12', 'docs/TESTING.md')).toBe(
        '#2 ficha incompleta (toca: docs/TESTING.md)',
      );
      expect(reason('docs/TESTING.md', 'docs/TESTING.md#R12')).toBe(
        '#2 arquivo docs/TESTING.md#R12 com #1',
      );
      expect(reason('docs/TESTING-NUVEM.md#blocos', 'docs/TESTING-NUVEM.md#blocos')).toBe(
        '#2 começa',
      );
      expect(
        reason(
          'docs/TESTING-NUVEM.md#full-round-in-blocks',
          'docs/TESTING-NUVEM.md#full-round-in-blocks',
        ),
      ).toBe('#2 começa');
      expect(reason('mcp/version.ts', 'mcp/version.ts')).toBe('#2 começa');
      expect(reason('changelog/a.md', 'changelog/a.md')).toBe('#2 começa');
      expect(reason('docs/design-system/a.md', 'docs/design-system/a.md')).toBe(
        '#2 começa',
      );
      expect(reason('docs/TESTING-NUVEM.md', 'docs/TESTING-NUVEM.md#environment')).toBe(
        '#2 arquivo docs/TESTING-NUVEM.md#environment com #1',
      );
      expect(reason('tests/tooling/', 'tests/tooling/a.test.ts')).toBe(
        '#2 arquivo tests/tooling/a.test.ts com #1',
      );
      expect(reason('tests/tooling/**', 'tests/tooling/a.test.ts')).toBe(
        '#2 arquivo tests/tooling/a.test.ts com #1',
      );
      expect(reason('tests/tooling/a.test.ts', 'tests/tooling/**')).toBe(
        '#2 ficha incompleta (toca: tests/tooling/**)',
      );
      expect(reason('`./src/a.ts`, `src/b.ts`', ' src/a.ts ')).toBe(
        '#2 arquivo src/a.ts com #1',
      );
      expect(reason('src/a.ts', '?')).toBe('#2 ficha incompleta (toca)');
      expect(reason('src/i18n/pt-BR.ts', 'src/i18n/pt-BR.ts')).toBe(
        '#2 arquivo src/i18n/pt-BR.ts com #1',
      );
    },
    SUBPROCESS_TIMEOUT,
  );

  it('the issue text (decision 1.5) becomes a test and every write recalculates it, including log and current', () => {
    run('start', dir, '--paralelo', '5');
    stage('#1219', ficha('nenhuma', 'docs/TESTING.md'), 'status=em andamento');
    stage('#1390', ficha('#1384:aberta', 'a.ts'));
    stage('#1273', ficha('nenhuma', 'docs/TESTING.md#R9'));
    stage('#1232', ficha('nenhuma', 'b.ts'));
    const esperado =
      'Vagas 1/5 · #1390 dep #1384 · #1273 arquivo docs/TESTING.md#R9 com #1219 · #1232 começa · nenhuma ready elegível';
    expect(slots()).toBe(esperado);
    run('merged', dir, '#1384');
    expect(slots()).toBe(
      'Vagas 1/5 · #1390 começa · #1273 arquivo docs/TESTING.md#R9 com #1219 · #1232 começa · nenhuma ready elegível',
    );
    run('row', dir, '#1219', 'status=concluída');
    run('log', dir, 'oi');
    expect(slots()).toBe(
      'Vagas 0/5 · #1390 começa · #1273 começa · #1232 começa · nenhuma ready elegível',
    );
    run('row', dir, '#1273', 'status=em andamento');
    run('current', dir, 'x');
    expect(slots()).toBe(
      'Vagas 1/5 · #1390 começa · #1232 começa · nenhuma ready elegível',
    );
  });

  it('issue acceptance: example queue with paralelo 3', () => {
    run('start', dir, '--paralelo', '3');
    stage('#1', ficha('nenhuma', 'docs/TESTING.md#R12'), 'status=em andamento');
    stage('#2', ficha('nenhuma', 'docs/TESTING.md#R25'));
    stage('#3', ficha('nenhuma', 'docs/TESTING.md#R12'));
    stage('#4', ficha('#5:aberta', 'src/x.ts'));
    expect(run('show', dir)).toContain(
      'vagas: Vagas 1/3 · #2 começa · #3 arquivo docs/TESTING.md#R12 com #1 · #4 dep #5 · nenhuma ready elegível',
    );
    expect(run('show', dir)).toContain('começar agora: #2');
  });

  it('context writes meta.context and contextAt; an integer from 0 to 100, otherwise a usage error (code 2)', () => {
    run('context', dir, '55');
    expect(json('meta')[0]?.context).toBe(55);
    expect(json('meta')[0]?.contextAt).toBe(NOW);
    for (const bad of ['101', '-1', 'x', '5.5', '']) {
      expect(runRaw('context', dir, bad).status).toBe(2);
    }
  });

  it('show: contexto — no record, 35% without an alert, 36% with the switch alert', () => {
    expect(run('show', dir)).toContain('contexto: —');
    run('context', dir, '35');
    const ok = run('show', dir);
    expect(ok).toContain(
      `contexto: 35% (${NOW}, manual) — medido à mão: meça com context --medir`,
    );
    expect(ok).not.toContain('troque de sessão');
    run('context', dir, '36');
    expect(run('show', dir)).toContain(
      `contexto: 36% (${NOW}, manual) — acima de 35%: troque de sessão agora ("Troca de sessão") — medido à mão: meça com context --medir`,
    );
  });

  it('show prints vagas and começar agora after atual:', () => {
    run('current', dir, 'rodando');
    const lines = run('show', dir).split('\n');
    const i = lines.findIndex((l) => l.startsWith('atual:'));
    expect(lines[i + 1]).toMatch(/^vagas: /);
    expect(lines[i + 2]).toBe('começar agora: nenhuma');
  });

  it('the page shows the note in the subtitle and the "Progress" card from meta.grafoNos', () => {
    const html = readFileSync(PAGE, 'utf8');
    expect(html).toContain('id="mp-andamento"');
    expect(html).toContain('<h2>Progress</h2>');
    expect(html).toContain('m.grafoNos');
    expect(html).toContain('m.vagas');
    expect(html).not.toContain('Why there is a free slot');
    expect(html).not.toContain('id="mp-vagas"');
    expect(html).not.toContain('Dependencies and order of entry');
    expect(html).not.toContain('Step by step');
    expect(html).not.toContain('id="mp-table"');
    expect(html.indexOf('id="mp-andamento"')).toBeLessThan(
      html.indexOf('id="mp-concluidas"'),
    );
  });
});

// Phase VG2 (stage #1440): the skills and PROCESS.md use the slots note, the context and the per-script comparison.
describe('implementar-fila and detalhar-backlog: slots, context and scripts (VG2, #1440)', () => {
  const queue = readFileSync('.claude/skills/implementar-fila/SKILL.md', 'utf8');
  const detalhar = readFileSync('.claude/skills/detalhar-backlog/SKILL.md', 'utf8');
  const processDoc = readFileSync('docs/PROCESS.md', 'utf8');

  it('"Stage ficha" asks for the state of the dependencies and the toca per script (decision 7)', () => {
    const ficha = section(queue, '### Stage ficha');
    expect(ficha).toContain(':main');
    expect(ficha).toContain(':aberta');
    expect(ficha).toContain('docs/TESTING.md#R');
    expect(ficha).toContain('docs/TESTING-NUVEM.md#full-round-in-blocks');
  });

  it('"1. Start" and "In the new session" run start --paralelo N (decision 1.1)', () => {
    expect(between(queue, '## 2. Queue', '## 3. Per stage')).toContain(
      'painel.py start <folder> --paralelo N',
    );
    expect(between(queue, '**In the new session**', '## End')).toMatch(
      /start <(folder|pasta)> --paralelo N/,
    );
  });

  it('"Fallback checks" starts with the context and then uses começar agora (decisions 3.1 and 3.3)', () => {
    const fallback = between(queue, '**Fallback checks:**', '**Red CI');
    expect(fallback).toContain('painel.py context');
    expect(fallback).toContain('começar agora');
    expect(fallback.indexOf('painel.py context')).toBeLessThan(
      fallback.indexOf('skill changed on `main`'),
    );
    expect(fallback).toMatch(/With no overdue ones, no `começar agora`/);
  });

  it('"Parallel" points to painel.py, the script and the blocks table (decisions 4 to 6 and 8)', () => {
    const parallel = section(queue, '## Parallel');
    expect(parallel).toContain('painel.py');
    expect(parallel).toContain('docs/TESTING.md#R12');
    expect(parallel).toContain('docs/TESTING-NUVEM.md#full-round-in-blocks');
    expect(parallel).toContain('vagas:');
    expect(parallel).toContain('começar agora:');
  });

  it('"Panel" lists the new commands and the new lines of the show (decision 10)', () => {
    const panel = section(queue, '## Panel');
    for (const term of [
      'start <folder> --paralelo N',
      'hold=',
      "merged <folder> '#N'",
      'context <folder> <pct>',
      'contexto:',
    ]) {
      expect(panel).toContain(term);
    }
  });

  it('"Queue changes" has the state note, the Seguir/Segurar and the hold (decisions 9 and 3.4)', () => {
    const changes = section(queue, '## Queue changes during the run');
    expect(changes).toContain('Seguir (Recomendado)');
    expect(changes).toContain('Segurar');
    expect(changes).toContain('hold=');
    expect(changes).toContain('pausada pelo dono');
    expect(changes).toContain('ordem do dono (');
  });

  it('"Session switch" keeps Above 35%, switches right away and loses the child notice (decisions 3.1 and 3.2)', () => {
    const switchSection = section(queue, '## Session switch');
    expect(switchSection).toContain('Above 35%');
    expect(switchSection).toContain('right away');
    expect(switchSection).not.toContain('at each child notice');
  });

  it('"Between stages" marks the dependency outside the queue as merged and starts what começar agora lists', () => {
    const between7 = between(queue, '7. **Between stages:**', '**Archive the sessions**');
    expect(between7).toContain('painel.py merged');
    expect(between7).toContain('começar agora');
  });

  it('detalhar-backlog compares the Toca em: per script (decision 11)', () => {
    const steps = between(detalhar, '3. Draft the whole plan', '5. Product decision');
    expect(steps).toContain('docs/TESTING.md#R12');
    expect(steps).toContain('docs/TESTING-NUVEM.md#full-round-in-blocks');
    expect(steps).toContain('file in common');
    expect(detalhar).toContain('mcp/version.ts');
  });

  it('PROCESS.md cites the script in the Toca em: of the detailing (decision 12)', () => {
    const detail =
      processDoc.split('\n').find((l) => l.includes('**Detailing a stage:**')) ?? '';
    expect(detail).toContain('docs/TESTING.md#R12');
    expect(detail).toContain('docs/TESTING-NUVEM.md#full-round-in-blocks');
  });

  it('review findings: pause without clearing hold, lineage, context of the new session, closed dep and merged in the check', () => {
    const changes = section(queue, '## Queue changes during the run');
    expect(changes).toContain('has no `hold`');
    expect(changes).toContain('only on the `pausada pelo dono`');
    const fallback = between(queue, '**Fallback checks:**', '**Red CI');
    expect(fallback).toContain('Lineage limit');
    expect(fallback).toContain('painel.py merged');
    expect(fallback).toContain('does not publish');
    const fresh = between(queue, '**In the new session**', '## End');
    expect(fresh).toContain('painel.py context');
    expect(section(queue, '### Stage ficha')).toContain('closed as completed');
  });
});

// Phase VG3 (stage #1440): fixes from the epic's final review.
describe('painel.py — final review fixes (VG3, #1440)', () => {
  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'vagas-'));
    run('init', dir);
    run('start', dir, '--paralelo', '9');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  const reason = (a: string, b: string): string => {
    run('init', dir, '--force');
    run('start', dir, '--paralelo', '9');
    stage('#1', ficha('nenhuma', a), 'status=em andamento');
    stage('#2', ficha('nenhuma', b));
    return slots().split(' · ')[1] ?? '';
  };

  it(
    'finding 2: glob (src/i18n/*, *.ts) and folder without a trailing slash match what is under them',
    () => {
      expect(reason('src/i18n/*', 'src/i18n/pt-BR.ts')).toBe(
        '#2 arquivo src/i18n/pt-BR.ts com #1',
      );
      expect(reason('src/i18n/pt-BR.ts', 'src/i18n/pt*.ts')).toBe(
        '#2 arquivo src/i18n/pt*.ts com #1',
      );
      expect(reason('src/model/*.ts', 'src/model/a.ts')).toBe(
        '#2 arquivo src/model/a.ts com #1',
      );
      expect(reason('src/model/*.ts', 'src/store/a.ts')).toBe('#2 começa');
      expect(reason('src/model', 'src/model/a.ts')).toBe(
        '#2 arquivo src/model/a.ts com #1',
      );
      expect(reason('src/model', 'src/modelo/a.ts')).toBe('#2 começa');
    },
    SUBPROCESS_TIMEOUT,
  );

  it('finding 3: a parenthesized note after the path is discarded, even with a comma inside', () => {
    expect(reason('src/store/session.ts (novo método)', 'src/store/session.ts')).toBe(
      '#2 arquivo src/store/session.ts com #1',
    );
    expect(reason('src/a.ts (um, dois), src/b.ts', 'src/b.ts')).toBe(
      '#2 arquivo src/b.ts com #1',
    );
  });

  it('finding 4: different anchors separate the .md of docs/ and of the root; in other files they conflict', () => {
    expect(
      reason(
        'docs/ARCHITECTURE.md#performance',
        'docs/ARCHITECTURE.md#spaces-containment-and-gestures',
      ),
    ).toBe('#2 começa');
    expect(reason('viewer/README.md#X', 'viewer/README.md#Y')).toBe(
      '#2 arquivo viewer/README.md#Y com #1',
    );
    expect(reason('docs/TESTING.md#R1', 'docs/TESTING.md#R2')).toBe('#2 começa');
  });

  it('finding 5: an empty item in the dependency is ignored; hold goes away when the stage stops waiting', () => {
    stage('#1', ficha('#12:main,', 'a.ts'));
    stage('#2', ficha('#12:main,,#13:main', 'b.ts'));
    expect(slots()).toBe('Vagas 0/9 · #1 começa · #2 começa · nenhuma ready elegível');
    stage('#3', ficha('nenhuma', 'c.ts'), 'hold=pausada pelo dono');
    run('row', dir, '#3', 'status=em andamento');
    expect(json('queue').find((r) => r.issue === '#3')?.hold).toBe('');
    run('row', dir, '#3', 'status=aguardando', 'hold=ordem do dono (por último)');
    expect(json('queue').find((r) => r.issue === '#3')?.hold).toBe(
      'ordem do dono (por último)',
    );
  });

  it('finding 10: meta.vagasItens keeps each piece whole, even with " · " in the hold, and the page uses it', () => {
    stage('#1', ficha('nenhuma', 'a.ts'), 'hold=ordem do dono (a · b)');
    stage('#2', ficha('nenhuma', 'b.ts'));
    expect(json('meta')[0]?.vagasItens).toEqual([
      'Vagas 0/9',
      '#1 ordem do dono (a · b)',
      '#2 começa',
      'nenhuma ready elegível',
    ]);
    const html = readFileSync(PAGE, 'utf8');
    expect(html).toContain('m.vagasItens');
  });
});
