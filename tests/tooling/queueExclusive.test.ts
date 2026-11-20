// @vitest-environment node
// Phase FM2 (stage #1532, decisions 11 to 14): incomplete ficha, exclusive stage, "Drain", sections in Parallel and `slug`.
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { between, section } from '../support/textSlice';

const SCRIPT = '.claude/skills/implementar-fila/painel/painel.py';
const SKILL = '.claude/skills/implementar-fila/SKILL.md';
const DETAIL = '.claude/skills/detalhar-backlog/SKILL.md';
const NOW = '2026-11-10T10:00:00Z';
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

function ficha(dep: string, toca: string, fases = 'FM1:#1:high'): string {
  const parts = [
    `dep=${dep}`,
    'nivel=impact: low',
    'mcp=não',
    'schema=não',
    'formato=não',
  ];
  if (fases) parts.push(`fases=${fases}`);
  if (toca) parts.push(`toca=${toca}`);
  return parts.join(' | ');
}

function stage(issue: string, plan: string, ...extra: string[]) {
  run('row', dir, issue, `title=Stage ${issue}`, `plan=${plan}`, ...extra);
}

function reasons(): string[] {
  return slots().split(' · ').slice(1);
}

function reading(file: string): string {
  return readFileSync(file, 'utf8');
}

describe('painel.py — incomplete ficha (FM2, decision 11)', () => {
  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'exclusive-'));
    run('init', dir);
    run('start', dir, '--paralelo', '9');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it(
    'dep, toca and fases at ? (or without the field) give "ficha incompleta" in the order dep, toca, fases',
    () => {
      stage('#1', 'dep=? | toca=a.ts | fases=FM1:#1:high');
      stage('#2', 'dep=nenhuma | toca=? | fases=FM1:#1:high');
      stage('#3', 'dep=nenhuma | toca=c.ts | fases=?');
      stage('#4', 'dep=? | toca=? | fases=?');
      stage('#5', 'nivel=impact: low | fases=FM1:#1:high');
      stage('#6', 'dep=nenhuma | toca=f.ts | fases=FM1:#1:high');
      expect(reasons().slice(0, 6)).toEqual([
        '#1 ficha incompleta (dep)',
        '#2 ficha incompleta (toca)',
        '#3 ficha incompleta (fases)',
        '#4 ficha incompleta (dep, toca, fases)',
        '#5 ficha incompleta (dep, toca)',
        '#6 começa',
      ]);
    },
    SUBPROCESS_TIMEOUT,
  );

  it('the show prints "fichas a refazer" (or nenhuma)', () => {
    stage('#1', ficha('nenhuma', 'a.ts'));
    expect(run('show', dir)).toContain('fichas a refazer: nenhuma');
    stage('#2', ficha('nenhuma', '?'));
    stage('#3', ficha('?', 'c.ts'));
    const show = run('show', dir);
    expect(show).toContain('fichas a refazer: #2 #3');
    expect(show).toContain('#2 ficha incompleta (toca)');
    run('row', dir, '#2', `plan=${ficha('nenhuma', 'b.ts')}`);
    run('row', dir, '#3', 'status=concluída');
    expect(run('show', dir)).toContain('fichas a refazer: nenhuma');
  });

  it('the hold comes before the incomplete ficha', () => {
    stage('#1', ficha('?', '?'), 'hold=pausada pelo dono');
    expect(reasons()[0]).toBe('#1 pausada pelo dono');
  });

  it('a started stage with toca=? keeps conflicting with every candidate', () => {
    stage('#1', ficha('nenhuma', '?'), 'status=em andamento', 'started=now');
    stage('#2', ficha('nenhuma', 'b.ts'));
    expect(reasons()[0]).toBe('#2 arquivo ? com #1');
  });
});

describe('painel.py — exclusive stage (FM2, decision 12)', () => {
  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'exclusive-'));
    run('init', dir);
    run('start', dir, '--paralelo', '9');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('row exclusive=sim writes the field and exclusive= clears it; any other value is an error', () => {
    stage('#1', ficha('nenhuma', 'a.ts'));
    run('row', dir, '#1', 'exclusive=sim');
    expect(json('queue')[0]?.exclusive).toBe('sim');
    expect(run('show', dir, '#1')).toContain('exclusive: sim');
    run('row', dir, '#1', 'exclusive=');
    expect(json('queue')[0]?.exclusive).toBe('');
    expect(runRaw('row', dir, '#1', 'exclusive=talvez').status).toBe(2);
  });

  it(
    'does not start with a started and unmerged stage (em andamento, esperando dono, falhou, aguardando with started)',
    () => {
      for (const extra of [
        ['status=em andamento'],
        ['status=esperando dono'],
        ['status=falhou'],
        ['status=aguardando', 'started=now'],
      ]) {
        run('init', dir, '--force');
        run('start', dir, '--paralelo', '9');
        stage('#1', ficha('nenhuma', 'a.ts'), ...extra, 'started=now');
        stage('#2', ficha('nenhuma', 'b.ts'), 'exclusive=sim');
        expect(reasons()[0]).toBe('#2 exclusiva (espera a fila esvaziar)');
        run('row', dir, '#1', 'status=concluída');
        expect(reasons()[0]).toBe('#2 começa');
      }
    },
    SUBPROCESS_TIMEOUT,
  );

  it('does not start when a non-exclusive one starts in the same calculation; before it, it starts and holds it', () => {
    stage('#1', ficha('nenhuma', 'a.ts'));
    stage('#2', ficha('nenhuma', 'b.ts'), 'exclusive=sim');
    expect(reasons().slice(0, 2)).toEqual([
      '#1 começa',
      '#2 exclusiva (espera a fila esvaziar)',
    ]);
    run('init', dir, '--force');
    run('start', dir, '--paralelo', '9');
    stage('#2', ficha('nenhuma', 'b.ts'), 'exclusive=sim');
    stage('#1', ficha('nenhuma', 'a.ts'));
    run('row', dir, '#2', 'order=1');
    run('row', dir, '#1', 'order=2');
    expect(reasons().slice(0, 2)).toEqual(['#2 começa', '#1 exclusiva #2 em andamento']);
  });

  it('the exclusive at the front holds the candidates after it (#1813)', () => {
    stage('#1', ficha('nenhuma', 'a.ts'), 'status=em andamento', 'started=now');
    stage('#2', ficha('nenhuma', 'b.ts'), 'exclusive=sim');
    stage('#3', ficha('nenhuma', 'c.ts'));
    expect(reasons().slice(0, 2)).toEqual([
      '#2 exclusiva (espera a fila esvaziar)',
      '#3 segurada para a exclusiva #2',
    ]);
  });

  it('with the exclusive started, no other one starts', () => {
    stage(
      '#1',
      ficha('nenhuma', 'a.ts'),
      'exclusive=sim',
      'status=em andamento',
      'started=now',
    );
    stage('#2', ficha('nenhuma', 'b.ts'));
    stage('#3', ficha('nenhuma', 'c.ts'), 'exclusive=sim');
    expect(reasons().slice(0, 2)).toEqual([
      '#2 exclusiva #1 em andamento',
      '#3 exclusiva #1 em andamento',
    ]);
    expect(run('show', dir)).toContain('começar agora: nenhuma');
  });

  it(
    'with the exclusive started and stopped (falhou, esperando dono, aguardando), the reason says the state and the queue stays held (PP1, decisions 2 and 3 of #1595)',
    () => {
      const cases: Array<[string[], string]> = [
        [['status=falhou'], 'exclusiva #1 falhou'],
        [['status=esperando dono'], 'exclusiva #1 esperando dono'],
        [['status=aguardando', 'started=now'], 'exclusiva #1 aguardando'],
      ];
      for (const [extra, reason] of cases) {
        run('init', dir, '--force');
        run('start', dir, '--paralelo', '9');
        stage('#1', ficha('nenhuma', 'a.ts'), 'exclusive=sim', 'started=now', ...extra);
        stage('#2', ficha('nenhuma', 'b.ts'));
        stage('#3', ficha('nenhuma', 'c.ts'), 'exclusive=sim');
        expect(reasons().slice(0, 2)).toEqual([`#2 ${reason}`, `#3 ${reason}`]);
        expect(run('show', dir)).toContain('começar agora: nenhuma');
      }
    },
    SUBPROCESS_TIMEOUT,
  );

  it('the way out of a stopped exclusive belongs to the owner: exclusive= on its row frees the queue', () => {
    stage(
      '#1',
      ficha('nenhuma', 'a.ts'),
      'exclusive=sim',
      'status=falhou',
      'started=now',
    );
    stage('#2', ficha('nenhuma', 'b.ts'));
    expect(reasons()[0]).toBe('#2 exclusiva #1 falhou');
    run('row', dir, '#1', 'exclusive=');
    run('log', dir, 'exclusiva #1 liberada pelo dono');
    expect(reasons()[0]).toBe('#2 começa');
    expect(run('show', dir)).toContain('começar agora: #2');
  });

  it('two exclusives start one at a time, in order', () => {
    stage('#1', ficha('nenhuma', 'a.ts'), 'exclusive=sim');
    stage('#2', ficha('nenhuma', 'b.ts'), 'exclusive=sim');
    expect(reasons().slice(0, 2)).toEqual(['#1 começa', '#2 exclusiva #1 em andamento']);
    expect(run('show', dir)).toContain('começar agora: #1');
  });

  it('the hold comes before exclusive in the reason', () => {
    stage('#1', ficha('nenhuma', 'a.ts'), 'status=em andamento', 'started=now');
    stage('#2', ficha('nenhuma', 'b.ts'), 'exclusive=sim', 'hold=esperando dono (x)');
    expect(reasons()[0]).toBe('#2 esperando dono (x)');
  });
});

describe('painel.py — an exclusive at the front drains the queue (#1813)', () => {
  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'exclusive-'));
    run('init', dir);
    run('start', dir, '--paralelo', '9');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('the draining and the start: the show says who drains; with the queue empty, the exclusive starts', () => {
    stage('#1', ficha('nenhuma', 'a.ts'), 'status=em andamento', 'started=now');
    stage('#2', ficha('nenhuma', 'b.ts'), 'exclusive=sim');
    stage('#3', ficha('nenhuma', 'c.ts'));
    expect(reasons().slice(0, 2)).toEqual([
      '#2 exclusiva (espera a fila esvaziar)',
      '#3 segurada para a exclusiva #2',
    ]);
    const show = run('show', dir);
    expect(show).toContain('começar agora: nenhuma\ndrenando para a exclusiva: #2\n');
    run('row', dir, '#1', 'status=concluída');
    expect(reasons().slice(0, 2)).toEqual(['#2 começa', '#3 exclusiva #2 em andamento']);
    expect(run('show', dir)).toContain(
      'começar agora: #2\ndrenando para a exclusiva: nenhuma\n',
    );
  });

  it('an ordinary one at the front that waits for a file counts: there is no draining and the later ones go on', () => {
    stage('#1', ficha('nenhuma', 'a.ts'), 'status=em andamento', 'started=now');
    stage('#2', ficha('nenhuma', 'a.ts'));
    stage('#3', ficha('nenhuma', 'c.ts'), 'exclusive=sim');
    stage('#4', ficha('nenhuma', 'd.ts'));
    expect(reasons().slice(0, 3)).toEqual([
      '#2 arquivo a.ts com #1',
      '#3 exclusiva (espera a fila esvaziar)',
      '#4 começa',
    ]);
    expect(run('show', dir)).toContain('drenando para a exclusiva: nenhuma');
  });

  it('hold, incomplete ficha and dep do not count; an ordinary one that starts in the same calculation does not take the exclusive off the front', () => {
    stage('#1', ficha('nenhuma', 'a.ts'), 'status=em andamento', 'started=now');
    stage('#2', ficha('#1:aberta', 'b.ts'));
    stage('#3', ficha('nenhuma', 'c.ts'), 'hold=esperando dono (x)');
    stage('#4', ficha('?', 'd.ts'));
    stage('#5', ficha('nenhuma', 'e.ts'), 'exclusive=sim');
    stage('#6', ficha('nenhuma', 'f.ts'));
    expect(reasons().slice(0, 5)).toEqual([
      '#2 dep #1',
      '#3 esperando dono (x)',
      '#4 ficha incompleta (dep)',
      '#5 exclusiva (espera a fila esvaziar)',
      '#6 segurada para a exclusiva #5',
    ]);
    run('row', dir, '#1', 'status=concluída');
    expect(reasons().slice(0, 5)).toEqual([
      '#2 começa',
      '#3 esperando dono (x)',
      '#4 ficha incompleta (dep)',
      '#5 exclusiva (espera a fila esvaziar)',
      '#6 segurada para a exclusiva #5',
    ]);
    expect(run('show', dir)).toContain('drenando para a exclusiva: #5');
  });

  it('an exclusive with an open dependency does not drain', () => {
    stage('#1', ficha('nenhuma', 'a.ts'), 'status=em andamento', 'started=now');
    stage('#2', ficha('#1:aberta', 'b.ts'), 'exclusive=sim');
    stage('#3', ficha('nenhuma', 'c.ts'));
    expect(reasons().slice(0, 2)).toEqual(['#2 dep #1', '#3 começa']);
    expect(run('show', dir)).toContain('drenando para a exclusiva: nenhuma');
  });

  it('with two exclusives, the first drains and the second is held', () => {
    stage('#1', ficha('nenhuma', 'a.ts'), 'status=em andamento', 'started=now');
    stage('#2', ficha('nenhuma', 'b.ts'), 'exclusive=sim');
    stage('#3', ficha('nenhuma', 'c.ts'), 'exclusive=sim');
    expect(reasons().slice(0, 2)).toEqual([
      '#2 exclusiva (espera a fila esvaziar)',
      '#3 segurada para a exclusiva #2',
    ]);
  });

  it('the skill texts describe the draining', () => {
    const skill = reading(SKILL);
    const changes = section(skill, '## Queue changes during the run');
    expect(changes).toContain('segurada para a exclusiva');
    expect(changes).toContain('drenando para a exclusiva');
    expect(changes).toContain('severity: high');
    const panel = section(skill, '## Panel');
    expect(panel).toContain('segurada para a exclusiva');
    expect(panel).toContain('drenando para a exclusiva');
  });
});

describe('painel.py — sections in Parallel (FM2, decision 14)', () => {
  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'exclusive-'));
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
    return reasons()[0] ?? '';
  };

  it(
    'FLOW.md, PROCESS.md and SKILL.md are compared by section; TESTING.md as before',
    () => {
      expect(reason('docs/FLOW.md#fix-phase', 'docs/FLOW.md#for-the-tester')).toBe(
        '#2 começa',
      );
      expect(reason('docs/FLOW.md#fix-phase', 'docs/FLOW.md#fix-phase')).toBe(
        '#2 arquivo docs/FLOW.md#fix-phase com #1',
      );
      expect(reason('docs/FLOW.md', 'docs/FLOW.md#fix-phase')).toBe(
        '#2 arquivo docs/FLOW.md#fix-phase com #1',
      );
      expect(reason('docs/FLOW.md#fix-phase', 'docs/FLOW.md')).toBe(
        '#2 ficha incompleta (toca: docs/FLOW.md)',
      );
      expect(reason('docs/FLOW.md', 'docs/FLOW.md')).toBe(
        '#2 ficha incompleta (toca: docs/FLOW.md)',
      );
      const skill = '.claude/skills/implementar-fila/SKILL.md';
      expect(reason(`${skill}#parallel`, `${skill}#panel`)).toBe('#2 começa');
      expect(reason(`${skill}#parallel`, `${skill}#parallel`)).toBe(
        `#2 arquivo ${skill}#parallel com #1`,
      );
      expect(reason(`${skill}#parallel`, skill)).toBe(
        `#2 ficha incompleta (toca: ${skill})`,
      );
      const other = '.claude/skills/detalhar-backlog/SKILL.md';
      expect(reason(`${skill}#parallel`, `${other}#arguments`)).toBe('#2 começa');
      expect(reason('docs/PROCESS.md#stages', 'docs/PROCESS.md#workflow')).toBe(
        '#2 começa',
      );
      expect(reason('docs/PROCESS.md#stages', 'docs/PROCESS.md#stages')).toBe(
        '#2 arquivo docs/PROCESS.md#stages com #1',
      );
      expect(reason('docs/PROCESS.md', 'docs/PROCESS.md#stages')).toBe(
        '#2 arquivo docs/PROCESS.md#stages com #1',
      );
      expect(reason('docs/TESTING.md#R12', 'docs/TESTING.md#R6')).toBe('#2 começa');
      expect(reason('docs/TESTING.md#R12', 'docs/TESTING.md')).toBe(
        '#2 ficha incompleta (toca: docs/TESTING.md)',
      );
    },
    SUBPROCESS_TIMEOUT,
  );
});

describe('painel.py — every .md of docs/ and of the root by section (TS1, decisions 1, 2, 4, 5 and 8)', () => {
  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'exclusive-'));
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
    return reasons()[0] ?? '';
  };

  it('the .md of docs/ are compared by section; without an anchor or with the same anchor they conflict', () => {
    const doc = 'docs/ARCHITECTURE.md';
    expect(reason(`${doc}#performance`, `${doc}#session-and-saving`)).toBe('#2 começa');
    expect(reason(`${doc}#performance`, `${doc}#performance`)).toBe(
      `#2 arquivo ${doc}#performance com #1`,
    );
    expect(reason(doc, `${doc}#performance`)).toBe(
      `#2 arquivo ${doc}#performance com #1`,
    );
    expect(reason(`${doc}#performance`, doc)).toBe(`#2 ficha incompleta (toca: ${doc})`);
  });

  it('the root .md are compared by section, with ./ normalized and a new root .md', () => {
    expect(reason('CLAUDE.md#architecture-rules', 'CLAUDE.md#workflow-summary')).toBe(
      '#2 começa',
    );
    expect(reason('CLAUDE.md#stack', 'CLAUDE.md#stack')).toBe(
      '#2 arquivo CLAUDE.md#stack com #1',
    );
    expect(reason('CLAUDE.md', 'CLAUDE.md#project')).toBe(
      '#2 arquivo CLAUDE.md#project com #1',
    );
    expect(reason('CLAUDE.md#project', 'CLAUDE.md')).toBe(
      '#2 ficha incompleta (toca: CLAUDE.md)',
    );
    expect(reason('README.md#how-to-test', 'README.md#documentation')).toBe('#2 começa');
    expect(reason('README.md', 'README.md#documentation')).toBe(
      '#2 arquivo README.md#documentation com #1',
    );
    expect(reason('./CLAUDE.md#stack', 'CLAUDE.md#code')).toBe('#2 começa');
    expect(reason('AGENTS.md#a', 'AGENTS.md#b')).toBe('#2 começa');
  });

  it('docs/TESTING-NUVEM.md by section; #blocos (ignored literal) does not count; docs/design-system/ does not count', () => {
    expect(
      reason('docs/TESTING-NUVEM.md#report', 'docs/TESTING-NUVEM.md#environment'),
    ).toBe('#2 começa');
    expect(reason('docs/TESTING-NUVEM.md#blocos', 'docs/TESTING-NUVEM.md#report')).toBe(
      '#2 começa',
    );
    expect(reason('docs/design-system/x.md', 'docs/design-system/x.md')).toBe(
      '#2 começa',
    );
  });

  it('a new subfolder of docs/ is also compared by section', () => {
    expect(reason('docs/guides/a.md#x', 'docs/guides/a.md#y')).toBe('#2 começa');
    expect(reason('docs/guides/a.md#x', 'docs/guides/a.md#x')).toBe(
      '#2 arquivo docs/guides/a.md#x com #1',
    );
  });

  it('a folder and a glob keep covering everything they match, with or without an anchor', () => {
    expect(reason('docs/', 'docs/ARCHITECTURE.md#performance')).toBe(
      '#2 arquivo docs/ARCHITECTURE.md#performance com #1',
    );
    expect(reason('docs/*.md', 'docs/FLOW.md#fix-phase')).toBe(
      '#2 arquivo docs/FLOW.md#fix-phase com #1',
    );
    expect(reason('*.md', 'CLAUDE.md#stack')).toBe('#2 arquivo CLAUDE.md#stack com #1');
    const glob = 'tests/storage/folder*.test.ts';
    expect(reason(`${glob}#a`, `${glob}#b`)).toBe(`#2 arquivo ${glob}#b com #1`);
    expect(reason('*.md#a', '*.md#b')).toBe('#2 ficha incompleta (toca: *.md#b)');
  });

  it('outside docs/ and the root, or not .md: whole file (different anchors conflict)', () => {
    for (const f of [
      'viewer/README.md',
      'examples/README.md',
      'mappings-workspace/AGENTS.md',
      'libraries/kotlin/docs/x.md',
      'docs/x.schema.json',
    ]) {
      expect(reason(`${f}#a`, `${f}#b`)).toBe(`#2 arquivo ${f}#b com #1`);
    }
  });

  it('TESTING.md keeps going by script', () => {
    expect(reason('docs/TESTING.md#R1', 'docs/TESTING.md#R2')).toBe('#2 começa');
    expect(reason('docs/TESTING.md', 'docs/TESTING.md#R2')).toBe(
      '#2 arquivo docs/TESTING.md#R2 com #1',
    );
  });

  it('the skill, PROCESS and FLOW texts state the new rule', () => {
    const skill = reading(SKILL);
    const parallel = section(skill, '## Parallel');
    expect(parallel).toContain('docs/ARCHITECTURE.md#performance');
    expect(parallel).toContain('CLAUDE.md#');
    expect(parallel).not.toContain('the `docs/ARCHITECTURE.md` count as a whole file');
    expect(parallel).not.toContain('The `CLAUDE.md` and the other files count whole');

    const ficha = section(skill, '### Stage ficha');
    expect(ficha).toContain('docs/*.md');
    expect(ficha).toContain('CLAUDE.md#');
    expect(ficha).not.toContain('The `CLAUDE.md` and the other files stay whole');

    const steps = between(
      reading(DETAIL),
      '3. Draft the whole plan',
      '5. Product decision',
    );
    expect(steps).toContain('docs/ARCHITECTURE.md#');
    expect(steps).toContain('CLAUDE.md#');
    expect(steps).not.toContain('including the `CLAUDE.md`, without an anchor');

    const detailing = between(reading('docs/PROCESS.md'), '**Detailing a stage:**', '\n');
    expect(detailing).toContain('docs/ARCHITECTURE.md#');
    expect(detailing).toContain('CLAUDE.md#');

    const owner = section(
      reading('docs/FLOW.md'),
      '## For the owner, in the three chats',
    );
    expect(owner).toContain('docs/*.md');
    expect(owner).toContain('CLAUDE.md');
  });
});

describe('painel.py slug (FM2, decision 14)', () => {
  it('the ## title in lowercase, without accents, with - between the runs and without - at the ends', () => {
    expect(run('slug', '3. Per stage').trim()).toBe('3-per-stage');
    expect(run('slug', 'For the owner, in the three chats').trim()).toBe(
      'for-the-owner-in-the-three-chats',
    );
    // accent stripping needs accented input, so these two stay in Portuguese
    expect(run('slug', 'Mudanças na fila durante a execução').trim()).toBe(
      'mudancas-na-fila-durante-a-execucao',
    );
    expect(run('slug', '  ¿Quê? (já)!  ').trim()).toBe('que-ja');
  });

  it('does not enter the batch and does not accept a folder', () => {
    dir = mkdtempSync(path.join(tmpdir(), 'exclusive-'));
    try {
      run('init', dir);
      const r = spawnSync('python3', [SCRIPT, 'apply', dir, '-'], {
        input: 'slug "x"\n',
        encoding: 'utf8',
      });
      expect(r.status).toBe(2);
      expect(r.stderr).toContain('linha 1');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('skill and FLOW texts (FM2)', () => {
  it('implementar-fila cites the exclusive stage, "Drain", fichas a refazer and the Toca em of the dependent bug', () => {
    const skill = reading(SKILL);
    expect(skill).toContain('exclusive=sim');
    expect(skill).toContain('Drain');
    expect(skill).toContain('Fila drenada');
    expect(skill).toContain('fichas a refazer');
    expect(skill).toContain('ficha incompleta');
    expect(skill).toContain('painel.py slug');
    const step4 = between(
      skill,
      '**A finding that depends on code of another epic**',
      '## Queue changes during the run',
    );
    expect(step4).toContain('**Toca em:**');
    expect(step4).toContain('**Fases:**');
  });

  it('the Parallel and step 4 of detalhar-backlog cite the section', () => {
    expect(section(reading(SKILL), '## Parallel')).toContain('docs/FLOW.md#');
    const detail = reading(DETAIL);
    expect(detail).toContain('SKILL.md#');
    expect(detail).toContain('`##`');
  });

  it('item 2 of "For the owner" cites the comparison by section', () => {
    const flow = reading('docs/FLOW.md');
    expect(section(flow, '## For the owner, in the three chats')).toContain(
      'per `##` section',
    );
  });
});
