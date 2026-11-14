// @vitest-environment node
// Phase FC1 (stage #1285): the queue panel keeps the ficha of each stage (`plan`), the child sessions
// that owe a notice (`child`, `childAt`) and the fallback check (`reserve`), and the `show` summarizes
// everything without printing the whole JSON, so the coordinator does not fill the context.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { between, section } from '../support/textSlice';

const SCRIPT = '.claude/skills/implementar-fila/painel/painel.py';

let dir = '';

function run(...args: string[]): string {
  return execFileSync('python3', [SCRIPT, ...args], { encoding: 'utf8' });
}

function runAt(now: string, ...args: string[]): string {
  return run('--now', now, ...args);
}

function json(name: string): unknown {
  return JSON.parse(readFileSync(path.join(dir, `${name}.json`), 'utf8'));
}

describe('painel.py (FC1)', () => {
  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'painel-'));
    runAt('2026-11-09T10:00:00Z', 'init', dir);
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('the row keeps the ficha (plan) and the show of one row prints it', () => {
    run('row', dir, '#10', 'title=Stage ten', 'plan=dep=nenhuma; fases=AB1:#11');
    const queue = json('queue') as Array<Record<string, unknown>>;
    expect(queue[0]?.plan).toBe('dep=nenhuma; fases=AB1:#11');
    const out = run('show', dir, '#10');
    expect(out).toContain('#10');
    expect(out).toContain('dep=nenhuma; fases=AB1:#11');
  });

  it('child and childAt=now register the child; show lists only the overdue ones (more than 30 min; decision 5 of #1324)', () => {
    runAt(
      '2026-11-09T10:00:00Z',
      'row',
      dir,
      '#10',
      'status=em andamento',
      'child=session_a',
      'childAt=now',
    );
    runAt(
      '2026-11-09T10:50:00Z',
      'row',
      dir,
      '#20',
      'status=em andamento',
      'child=session_b',
      'childAt=now',
    );
    const out = runAt('2026-11-09T11:10:00Z', 'show', dir);
    expect(out).toMatch(/atrasadas:[^\n]*#10[^\n]*session_a/);
    expect(out).not.toMatch(/atrasadas:[^\n]*#20/);
  });

  it('overdue is only a child with more than 30 min: 30 does not count, 31 does (decision 5 of #1324)', () => {
    runAt('2026-11-09T10:00:00Z', 'row', dir, '#10', 'child=session_a', 'childAt=now');
    expect(runAt('2026-11-09T10:30:00Z', 'show', dir)).toMatch(/atrasadas: nenhuma/);
    expect(runAt('2026-11-09T10:31:00Z', 'show', dir)).toMatch(/atrasadas:[^\n]*#10/);
  });

  it('an empty child= clears childAt and the stage stops being overdue', () => {
    runAt('2026-11-09T10:00:00Z', 'row', dir, '#10', 'child=session_a', 'childAt=now');
    run('row', dir, '#10', 'child=');
    const queue = json('queue') as Array<Record<string, unknown>>;
    expect(queue[0]?.childAt).toBe('');
    const out = runAt('2026-11-09T12:00:00Z', 'show', dir);
    expect(out).toMatch(/atrasadas: nenhuma/);
  });

  it('reserve keeps the check id in the meta and the show displays it', () => {
    const changed = run('reserve', dir, 'trig_abc');
    expect(changed).toContain('meta.json');
    const meta = json('meta') as Array<Record<string, unknown>>;
    expect(meta[0]?.reserve).toBe('trig_abc');
    expect(run('show', dir)).toContain('reserva: trig_abc');
  });

  it('a child with wait is not overdue and appears in "esperando o coordenador" (RS1, decision 5)', () => {
    runAt('2026-11-09T10:00:00Z', 'row', dir, '#10', 'child=session_a', 'childAt=now');
    runAt('2026-11-09T10:01:00Z', 'row', dir, '#10', 'wait=product question');
    const out = runAt('2026-11-09T12:00:00Z', 'show', dir);
    expect(out).toMatch(/atrasadas: nenhuma/);
    expect(out).toMatch(/esperando o coordenador: #10 \(product question\)/);
  });

  it('with no child waiting, the show says "esperando o coordenador: nenhuma"', () => {
    expect(run('show', dir)).toMatch(/esperando o coordenador: nenhuma/);
  });

  it('wait= with childAt=now puts the child back in the count', () => {
    runAt(
      '2026-11-09T10:00:00Z',
      'row',
      dir,
      '#10',
      'child=session_a',
      'childAt=now',
      'wait=CI travado',
    );
    runAt('2026-11-09T12:00:00Z', 'row', dir, '#10', 'wait=', 'childAt=now');
    expect(runAt('2026-11-09T12:20:00Z', 'show', dir)).toMatch(/atrasadas: nenhuma/);
    const out = runAt('2026-11-09T12:31:00Z', 'show', dir);
    expect(out).toMatch(/atrasadas:[^\n]*#10/);
    expect(out).toMatch(/esperando o coordenador: nenhuma/);
  });

  it('switching the child (recreated session) without passing wait also clears the wait', () => {
    runAt(
      '2026-11-09T10:00:00Z',
      'row',
      dir,
      '#10',
      'child=session_a',
      'childAt=now',
      'wait=question',
    );
    runAt('2026-11-09T10:05:00Z', 'row', dir, '#10', 'child=session_b', 'childAt=now');
    const queue = json('queue') as Array<Record<string, unknown>>;
    expect(queue[0]?.wait).toBe('');
    expect(runAt('2026-11-09T10:40:00Z', 'show', dir)).toMatch(/atrasadas:[^\n]*#10/);
  });

  it('an empty child= clears the wait', () => {
    runAt(
      '2026-11-09T10:00:00Z',
      'row',
      dir,
      '#10',
      'child=session_a',
      'childAt=now',
      'wait=call the owner',
    );
    run('row', dir, '#10', 'child=');
    const queue = json('queue') as Array<Record<string, unknown>>;
    expect(queue[0]?.wait).toBe('');
    expect(run('show', dir)).toMatch(/esperando o coordenador: nenhuma/);
  });

  it('an invalid childAt is refused', () => {
    expect(() => run('row', dir, '#10', 'childAt=yesterday')).toThrow();
  });
});

// Stage #1298 (FT1) and #1315 (FC2); decision 11 of #1322 (FS1) only changes the criterion: a large skill switches the session.
describe('implementar-fila: new skill on main and session switch (FT1, FC2)', () => {
  const skill = readFileSync('.claude/skills/implementar-fila/SKILL.md', 'utf8');
  const switching = section(skill, '## Session switch');
  const CHECK =
    'git fetch -q origin main && git diff --quiet HEAD origin/main -- .claude/skills/implementar-fila/SKILL.md';

  it('"Session switch" says to pull and reread the whole SKILL.md (decision 5; decision 11 of #1322)', () => {
    expect(switching).toContain(CHECK);
    expect(switching).toContain('git pull -q --ff-only origin main');
    expect(switching).toMatch(/reread the whole `SKILL.md`/);
    expect(switching).not.toContain('even below 60%');
    expect(switching).not.toContain('skill updated on main');
  });

  it('the switch is by context above 35% or by a large skill (decision 6; decision 11 of #1322)', () => {
    expect(switching).toMatch(/Session switch for context or for a large skill/);
    expect(switching).toMatch(/Above 35%/);
  });

  it('before creating the successor it checks lineage.depth + 2 > limit (decision 7)', () => {
    expect(switching).toContain('lineage.depth');
    expect(switching).toContain('lineage.limit');
    expect(switching).toContain('depth + 2 > limit');
    expect(switching).toMatch(/aguardando o dono abrir a sessão nova da fila/);
  });

  it('the fallback check and the "Between stages" step do the same check', () => {
    const between7 = between(skill, '7. **Between stages:**', '**Fallback checks:**');
    expect(between7).toMatch(/skill changed on `main`/);
    const check = between(skill, '**Fallback checks:**', '**Red CI');
    expect(check).toMatch(/skill changed on `main`/);
  });
});

// Stage #1315 (FC2): context fine-tuning, archiving of the sessions and waiting for a workflow.
describe('implementar-fila: coordinator fine-tuning (FC2)', () => {
  const skill = readFileSync('.claude/skills/implementar-fila/SKILL.md', 'utf8');
  const flow = readFileSync('docs/FLOW.md', 'utf8');
  const detalhar = readFileSync('.claude/skills/detalhar-backlog/SKILL.md', 'utf8');
  const TITLES = [
    'For the phase session',
    'Fix phase',
    'For the tester',
    'Directed round in groups',
    'Retest together',
    'Full round in 5 blocks',
  ];

  it('lists the exact titles of the FLOW.md messages and the read command (decision 2)', () => {
    for (const title of TITLES) {
      expect(skill).toContain(`"${title}"`);
      expect(flow).toMatch(new RegExp(`^## ${title}$`, 'm'));
    }
    expect(skill).toContain(
      "awk '/^## <title>$/{f=1;print;next} /^## /{f=0} f' docs/FLOW.md",
    );
    expect(skill).toMatch(/never by `grep`/);
  });

  it('the panel is published once per turn that wrote, even with the subagent running (decision 3 of #1532)', () => {
    expect(skill).toMatch(/once per turn, at the end/);
    expect(skill).toMatch(/even with the cycle's subagent still running/);
    expect(skill).toMatch(/only with the changed files/);
    expect(skill).toMatch(
      /The hourly check with no overdue ones and no unpublished file does not publish/i,
    );
    expect(skill).not.toMatch(/There are never two publications in the same cycle/);
  });

  it('the chat stays almost silent (decision 3)', () => {
    expect(skill).toMatch(/The chat stays almost silent/);
    expect(skill).toMatch(/writes no summary/);
  });

  it('one subagent per cycle for the GitHub tasks (decision 4)', () => {
    expect(skill).toMatch(/One subagent per cycle/);
    expect(skill).toMatch(/one line per task/);
  });

  it('archives each child when it finishes, registers the sessions and archives the previous one (decision 8)', () => {
    expect(skill).toContain('archive_session');
    expect(skill).toContain("painel.py session <folder> '#n' <id>");
    expect(skill).toMatch(/<código> arquivada/);
    expect(skill).toMatch(/not archived/i);
    expect(skill).toMatch(/arquiva a `anterior`/);
    expect(skill).toMatch(/does not archive itself/);
  });

  it('the wait for a workflow follows the measured duration (decision 10)', () => {
    expect(skill).toMatch(/in the same cycle as the merge/);
    expect(skill).toMatch(/`release` job skipped/);
    expect(skill).toMatch(/5 min after the merge/);
    expect(skill).toMatch(/every 1 min/);
    expect(skill).toMatch(/does not hold the next epic's merge/);
  });

  it('the label swap sends the complete list (decision 11), in the skill and in detalhar-backlog', () => {
    for (const text of [skill, detalhar]) {
      expect(text).toMatch(/replaces all the (issue's )?labels/);
      expect(text).toMatch(/(complete|full) list/);
      expect(text).toMatch(/`severity:`/);
    }
  });

  it('detalhar-backlog archives each detailing or grouping subagent (decision 9)', () => {
    expect(detalhar).toContain('archive_session');
    expect(detalhar).toMatch(/arquiva/i);
    expect(detalhar).toMatch(/final summary/);
  });

  it('FLOW.md says how the switch and the archiving work', () => {
    const line = flow
      .split('\n')
      .find((l) => l.startsWith('To implement all the `ready` ones in sequence'));
    expect(line).toMatch(/by context/);
    expect(line).toMatch(/lineage limit/);
    expect(line).toMatch(/archived/);
  });
});

describe('painel.py: sessions per stage (FC2, decision 8)', () => {
  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'painel-'));
    runAt('2026-11-09T10:00:00Z', 'init', dir);
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('session appends the id to sessions without repeating, and the stage show displays it', () => {
    run('row', dir, '#10', 'title=Stage ten');
    run('session', dir, '#10', 'session_a');
    run('session', dir, '#10', 'session_b');
    const out = run('session', dir, '#10', 'session_a');
    expect(out).toContain('queue.json');
    const queue = json('queue') as Array<Record<string, unknown>>;
    expect(queue[0]?.sessions).toBe('session_a session_b');
    expect(run('show', dir, '#10')).toContain('sessions: session_a session_b');
  });

  it('session on a stage outside the queue is refused', () => {
    expect(() => run('session', dir, '#99', 'session_a')).toThrow();
  });
});

// Etapa #1324 (CR1): CI resiliente do lado da fase e do coordenador.
describe('CI resiliente: fase, conferência e teto do dist (CR1)', () => {
  const skill = readFileSync('.claude/skills/implementar-fila/SKILL.md', 'utf8');
  const flow = readFileSync('docs/FLOW.md', 'utf8');
  const detalhar = readFileSync('.claude/skills/detalhar-backlog/SKILL.md', 'utf8');
  const processDoc = readFileSync('docs/PROCESS.md', 'utf8');
  const fase = section(flow, '## Para a sessão da fase');
  // O item 6 é uma lista: o bloco vai do "6." até o "7." (etapa #1466, decisão 9).
  const item6 = between(fase, '\n6. ', '\n7. ');
  const leitura = between(item6, '**Leitura do CI:**', '\n   - **');
  const reserva = between(skill, '**Conferências de reserva:**', '**CI vermelho');
  const ciVermelho = between(
    skill,
    '**CI vermelho',
    '## Mudanças na fila durante a execução',
  );

  it('"Para a sessão da fase": send_later de 4 min e de 2 em 2 min, segunda reexecução pela fase e aviso (decisões 1 e 2)', () => {
    expect(item6).toMatch(/primeira conferência com um `send_later` de 4 min/);
    expect(item6).toMatch(/de 2 em 2 min até 20 min/);
    expect(item6).toMatch(/depois disso, de 8 em 8/);
    expect(item6).not.toMatch(/`send_later` de 8 min/);
    expect(item6).toMatch(/nunca encerre o turno/i);
    expect(item6).toContain('ci-rerun.yml');
    expect(item6).toContain('node scripts/ci/ciRerun.mjs decide');
    expect(item6).toContain('gh run rerun <id> --failed');
    expect(item6).toMatch(/depois de \*\*2 reexecuções sem sucesso\*\*/);
    expect(item6).toContain('CI travado: <link da execução>, tentativas 1 a 3');
    expect(item6).toMatch(/falha legítima/i);
  });

  it('Leitura do CI: check runs, sem get_status, commit atual e só o workflow CI (decisões 1 a 4)', () => {
    expect(leitura).toContain('`get_check_runs`');
    expect(leitura).toMatch(/nunca com `get_status`/);
    expect(leitura).toMatch(/`perPage` 100/);
    for (const job of ['epic', 'static', 'test', 'coverage', 'build', 'check', 'e2e'])
      expect(leitura).toContain(`\`${job}\``);
    expect(leitura).toMatch(/`queued` ou `in_progress`/);
    expect(leitura).toMatch(/`failure`, `cancelled` ou `timed_out`/);
    expect(leitura).toMatch(/execução mais recente de cada job/);
    expect(leitura).toMatch(/outros workflows não contam/);
    expect(leitura).toMatch(/verde de um commit anterior não vale/);
    expect(leitura).toMatch(
      /Sem `check` e `e2e` \(e `epic`, no PR de épico\) em `success` e sem falha, o CI ainda roda/,
    );
    expect(leitura).not.toMatch(/Ignore os check runs `skipped`/);
    expect(leitura).not.toMatch(/nenhum outro com/);
  });

  it('o item 6 é uma lista com Espera do CI, Leitura do CI, Runner abandonado e Teto; a fase mescla o próprio PR (decisões 9 e 12)', () => {
    for (const sub of [
      'Espera do CI',
      'Leitura do CI',
      'Runner abandonado',
      'Teto do `dist/index.html`',
    ])
      expect(item6).toContain(`   - **${sub}:**`);
    expect(item6).toMatch(/mescle o próprio PR no épico/);
    expect(item6).toMatch(/nunca deixado para o coordenador/);
    expect(item6).toMatch(/cada push[^\n]*recomeça a contagem/);
    expect(item6).toMatch(/nunca rebase/);
    const item7 = between(fase, '\n7. ', '\n8. ');
    expect(item7).toMatch(/PR mesclado/);
    const correcao = section(flow, '## Fase de correção');
    expect(correcao).toMatch(/mescla o próprio PR/);
  });

  it('o verde exige cada job do ci.yml fora do needs do check, junto com success (achado 6, decisão 11)', () => {
    const ci = readFileSync('.github/workflows/ci.yml', 'utf8');
    const afterJobs = ci.slice(ci.indexOf('\njobs:\n'));
    const jobs = [...afterJobs.matchAll(/^ {2}([\w-]+):\s*$/gm)].map((m) => m[1]!);
    expect(jobs).toContain('check');
    const needsLine = afterJobs.match(
      /^ {2}check:\n(?:(?: {4}|\n).*\n)*? {4}needs: \[([^\]]*)\]/m,
    );
    if (needsLine === null) throw new Error('needs do job check não achado');
    const needs = needsLine[1]!.split(',').map((n) => n.trim());
    for (const job of jobs) expect(leitura).toContain(`\`${job}\``);
    const verde = between(leitura, 'Verde = ', 'O `check` não espera');
    const fora = jobs.filter((j) => j !== 'check' && !needs.includes(j));
    expect(fora).toContain('e2e');
    expect(fora).toContain('epic');
    for (const job of fora) {
      expect(verde).toContain(`\`${job}\``);
      expect(verde).toContain('`success`');
    }
  });

  it('o briefing do Merge aponta para a Leitura do CI e não repete a definição (decisão 10)', () => {
    const conferencia = between(
      skill,
      'Quem confere o CI e se o PR pode ser mesclado',
      '\n\n',
    );
    expect(conferencia).toContain('Leitura do CI');
    expect(conferencia).toContain('docs/FLOW.md');
    expect(conferencia).not.toContain('nenhum outro com');
    expect(conferencia).not.toMatch(/ignore os `skipped`/i);
    expect(skill).not.toMatch(/Ignore os check runs `skipped`/);
    expect(flow).not.toMatch(/Ignore os check runs `skipped`/);
  });

  it('PR que espera o coordenador: send_later, gatilhos, log do aviso e merge no mesmo turno (#1476, decisões 12 a 15)', () => {
    const espera = between(skill, '**PR que espera o coordenador:**', '\n\n');
    expect(espera).toMatch(/`send_later` de 4 min/);
    expect(espera).toMatch(/de 2 em 2 min até 20 min/);
    expect(espera).toMatch(/de 8 em 8/);
    expect(espera).toMatch(/push do coordenador/);
    expect(espera).toMatch(/deixou o merge/);
    expect(espera).toMatch(/recomeça a cadeia/);
    expect(espera).toMatch(/Leitura do CI/);
    expect(reserva).toMatch(/`send_later` por PR que espera o coordenador/);
    expect(reserva).toMatch(/Nada de `send_later` por filha/);
    expect(reserva).toMatch(/Pior caso de detecção:[^\n]*PR que espera o coordenador/);
    expect(reserva).toMatch(/não usa `subscribe_pr_activity`/);
    const economia = section(skill, '## Economia de contexto');
    const item7 = economia.split('\n').find((l) => l.startsWith('7. '));
    expect(item7).toMatch(/outro ciclo/);
    expect(item7).toMatch(/linha no `log`/);
    expect(item7).toMatch(/mesmo turno/);
    const fases = between(skill, '2. **Fases**', '3. **Testador.**');
    expect(fases).toMatch(/mescla[^\n]*mesmo turno/);
  });

  it('"Para o dono, nos três chats": resumos do Depende de, do paralelo e da conferência (#1442, decisão 18)', () => {
    const dono = section(flow, '## Para o dono, nos três chats');
    expect(dono).toMatch(/`Depende de`[^\n]*`docs\/TESTING\.md` por roteiro/);
    expect(dono).toContain('docs/TESTING-NUVEM.md#blocos');
    expect(dono).toMatch(/`paralelo=N`[^\n]*`Vagas k\/N`/);
    expect(dono).not.toMatch(/arquivos disjuntos/);
    expect(dono).toMatch(/conferência de hora em hora[^\n]*contexto[^\n]*35%/);
  });

  it('"Para a sessão da fase": margem e teto do dist para a fase (decisões 3, 6, 7 e 8)', () => {
    expect(item6).toMatch(/abaixo de 2 KiB/);
    expect(item6).toMatch(/enxugar/);
    expect(item6).toContain('node scripts/ci/distBudget.mjs raise');
    // Etapa #1614 (decisão 5): o teto mora no `scripts/ci/dist-budget.json`; o `--ci` saiu do comando.
    expect(item6).toContain('scripts/ci/dist-budget.json');
    expect(item6).not.toContain('--ci .github/workflows/ci.yml');
    expect(item6).not.toMatch(/INDEX_HTML_MAX_BYTES[^\n]*do `ci\.yml`/);
    // Decisão 6: a transição de um branch que subiu o teto no `ci.yml` antes da etapa.
    expect(item6).toMatch(/ficando com o `ci\.yml` da `main`/);
    expect(item6).toMatch(/`history`/);
    expect(item6).toMatch(/16 KiB/);
    expect(item6).toMatch(/até 14 KiB/);
    expect(item6).toMatch(/32 KiB/);
    expect(item6).toMatch(/64 KiB/);
    expect(item6).toMatch(/`send_message`/);
  });

  it('"Para a sessão da fase": o teto sempre sobe e a fase abre o `bug` do teto (#1802, decisões 1 a 6)', () => {
    const teto = between(item6, '   - **Teto do `dist/index.html`:**', '**Transição:**');
    expect(teto).not.toMatch(/chama o dono/);
    expect(teto).not.toContain('peça a autorização ao dono');
    expect(teto).toMatch(/sempre sobe/);
    expect(teto).toContain('`bug:`');
    expect(teto).toContain('Teto do dist/index.html acima dos limites');
    expect(teto).toContain('`severity: low`');
    expect(teto).toContain('is:issue in:title');
    expect(teto).toMatch(/um por subida/);
    expect(teto).toMatch(/depois do commit[^\n]*antes do aviso/);
    expect(teto).toContain('Teto do `dist/index.html` subiu');
    expect(teto).toContain('acima dos limites, `bug` #<n> para o dono revisar');
    // o número do `bug` só existe depois de aberto: o 1º commit leva a linha sem ele, e o 2º o completa antes do push
    expect(teto).toMatch(/termina em "; acima dos limites, `bug` para o dono revisar"/);
    expect(teto).toMatch(/segundo commit completa a linha[^\n]*só então o push/);
    expect(teto).toMatch(/sem `PushNotification`|o dono olha depois/);
    expect(teto).toContain('#1493');
    expect(teto).toMatch(/outra falha/);
  });

  it('o CI de uma fase fica só no item 6 (decisão do dono)', () => {
    const outros = fase
      .split('\n')
      .filter((l) => /^\d+\. /.test(l) && !l.startsWith('6. '));
    expect(outros.length).toBeGreaterThan(0);
    for (const linha of outros) {
      expect(linha).not.toContain('send_later');
      expect(linha).not.toContain('ci-rerun.yml');
      expect(linha).not.toContain('distBudget.mjs');
    }
  });

  it('"Conferências de reserva": 30 min, review_ready/idle sem aviso e send_message antes de recriar (decisão 5)', () => {
    expect(reserva).toMatch(/mais de 30 min/);
    expect(reserva).not.toMatch(/mais de 60 min/);
    expect(reserva).toContain('`review_ready`');
    expect(reserva).toContain('`idle`');
    const msg = 'Conferência da fila: a fase não avisou. Retome do ponto em que parou';
    expect(reserva).toContain(msg);
    expect(reserva).toMatch(
      new RegExp(
        `${msg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*crie a sessão de novo`,
      ),
    );
    expect(reserva).toMatch(/conferência seguinte/);
  });

  it('"Por etapa" › 2 e "Painel" dizem quando o wait é gravado e limpo (RS1, decisão 5)', () => {
    const fases = between(skill, '2. **Fases**', '3. **Testador.**');
    expect(fases).toContain('espera o coordenador');
    expect(fases).toContain('CI travado');
    expect(fases).toContain(
      'A subida do teto não espera mais o dono (etapa #1802): traga a `main` (`git merge origin/main`), rode o `raise --write` de novo e siga o item 6 da "Para a sessão da fase".',
    );
    expect(fases).toContain('row \'#n\' wait="<motivo curto>"');
    expect(fases).toContain('wait= childAt=now');
    const painel = section(skill, '## Painel');
    expect(painel).toContain('wait="<motivo>"');
  });

  it('"Conferências de reserva": send_later pendente é espera legítima, e o pior caso está escrito (RS1, decisões 6 e 7)', () => {
    expect(reserva).toMatch(/`send_later`[^\n]*ainda por disparar/);
    expect(reserva).toMatch(/há menos de 5 min/);
    expect(reserva).toMatch(/`row '#n' childAt=now`, sem mensagem/);
    expect(reserva).toMatch(/~60 min/);
    expect(reserva).toMatch(/~90 min/);
    expect(reserva).toMatch(
      /espera do CI da própria fase \(4 min, de 2 em 2 min até 20 min, depois de 8 em 8\)/,
    );
    expect(reserva).toMatch(/frequência e o corte não mudam/);
  });

  it('o coordenador não roda o CI de novo; chama o dono (decisão 4)', () => {
    expect(skill).not.toMatch(/roda de novo uma vez se morreu antes de testar/);
    expect(ciVermelho).toMatch(/não roda o CI de novo/);
    expect(ciVermelho).toContain('ci-rerun.yml');
    expect(ciVermelho).toContain('CI travado');
    expect(ciVermelho).toContain('esperando dono');
    expect(ciVermelho).toContain('PushNotification');
  });

  it('"CI vermelho no PR do épico": regra do teto, script e roadmap (decisões 6 a 9)', () => {
    expect(ciVermelho).toContain('Tamanho do dist/index.html');
    expect(ciVermelho).toMatch(/16 KiB/);
    expect(ciVermelho).toContain('até 14 KiB (14.336 bytes)');
    expect(ciVermelho).toContain('excesso acima de 14 KiB');
    expect(ciVermelho).toMatch(/32 KiB/);
    expect(ciVermelho).toMatch(/64 KiB/);
    expect(ciVermelho).toMatch(/worktree descartável/);
    expect(ciVermelho).toContain('npm ci && npm run build');
    expect(ciVermelho).toContain('node scripts/ci/distBudget.mjs raise');
    expect(ciVermelho).toContain('scripts/ci/dist-budget.json');
    expect(ciVermelho).not.toContain('--ci .github/workflows/ci.yml');
    expect(ciVermelho).not.toMatch(/INDEX_HTML_MAX_BYTES[^\n]*do `ci\.yml`/);
    expect(ciVermelho).toMatch(/ficando com o `ci\.yml` da `main`/);
    expect(ciVermelho).toMatch(/`history`/);
    expect(ciVermelho).toContain('changelog/<nome>.md');
    expect(ciVermelho).toContain('Orçamento do dist/index.html');
    expect(ciVermelho).toContain('Teto na última revisão do dono');
    expect(ciVermelho).toMatch(/primeira subida/);
    expect(ciVermelho).toMatch(/inclusive as da fase|subida feita pela fase/);
  });

  it('"CI vermelho no PR do épico": o teto sempre sobe, o `bug` sai pelo subagente da subida (#1802, decisões 2, 3 e 6)', () => {
    const teto = between(
      ciVermelho,
      '- **Teto do `dist/index.html`',
      '\n\n**CI preso na fila',
    );
    expect(teto).toMatch(/sobe sozinho, sem esperar o dono/);
    expect(teto).not.toMatch(/chama o dono/);
    expect(teto).not.toContain('Fora disso, chame o dono');
    expect(teto).toMatch(/outra falha/);
    expect(teto).toMatch(/sempre sobe/);
    expect(teto).toContain('"bug: …"');
    expect(teto).toMatch(/`bug` do teto/);
    expect(teto).toMatch(/subagente da subida/);
    expect(teto).toContain('item 6 da "Para a sessão da fase"');
    // o formato do `bug` fica no FLOW.md e não se copia para o skill
    expect(teto).not.toContain('severity: low');
    expect(teto).not.toContain('in:title');
    expect(teto).toContain('sem `PushNotification`');
    expect(teto).toContain('<código>: teto +<K> KiB acima dos limites, bug #<n>');
    expect(teto).toMatch(/#1493[^\n]*cita o `bug`|cita o `bug`[^\n]*#1493/);
    expect(teto).toContain('Teto do `dist/index.html` subiu');
    expect(teto).toMatch(/segundo commit[^\n]*antes do push/);
    expect(teto).toContain('até 14 KiB (14.336 bytes)');
    expect(teto).toMatch(/32 KiB/);
    expect(teto).toMatch(/64 KiB/);
  });

  it('detalhar-backlog: "1. Candidatas" deixa de fora o `bug` do teto do dist (#1802, decisão 10)', () => {
    const candidatas = section(detalhar, '## 1. Candidatas');
    const passo2 = between(candidatas, '2. ', '\n3. ');
    expect(passo2).toContain('Teto do dist/index.html acima dos limites');
    expect(passo2).toContain('chat do supervisor');
    expect(passo2).toMatch(/título começa por/);
  });

  it('PROCESS.md, "Rótulos": o `bug` admite a subida do teto acima dos limites, severity: low (#1802, decisão 9)', () => {
    const rotulos = between(processDoc, '**Rótulos:**', '\n');
    expect(rotulos).toContain('subida do teto do `dist/index.html` acima dos limites');
    expect(rotulos).toContain('pedido de revisão do dono');
    expect(rotulos).toContain('severity: low');
    expect(rotulos).toContain('`docs/FLOW.md`, item 6');
  });

  it('detalhar-backlog: gatilhos de risco (a) e reclassificação (b) (decisão 11)', () => {
    const esforco = section(detalhar, '## Esforço do detalhamento');
    for (const gatilho of [
      '`implementar-fila`',
      'painel.py',
      '.github/workflows/',
      'scripts/release/',
      'mcp/version.ts',
      'formatVersion',
      'src/store/session.ts',
      'pwa/csp.ts',
      '`/code-review high`',
    ]) {
      expect(esforco).toContain(gatilho);
    }
    expect(esforco).toMatch(/qualquer que seja o tamanho/);
    expect(esforco).toMatch(/gatilho/);
    expect(esforco).toMatch(/reclassifica/);
  });

  it('implementar-fila: /code-review high no diff do épico, no Fechamento (decisão 11, c)', () => {
    const fechamento = between(skill, '5. **Fechamento**', '6. **Merge**');
    expect(fechamento).toContain('/code-review high');
    expect(fechamento).toMatch(/diff inteiro do épico/);
    expect(fechamento).toMatch(/base `main`/);
    expect(fechamento).toMatch(/antes do merge/);
    expect(fechamento).toMatch(/teste primeiro/);
    expect(fechamento).toMatch(/mesmo que as fases tenham sido medium/);
  });

  it('o item "rede de segurança" decide pela saída do riskTriggers, sem lista de caminhos própria (RS1, decisão 3)', () => {
    const fechamento = between(skill, '5. **Fechamento**', '6. **Merge**');
    const item = fechamento.split('\n').find((l) => l.includes('**rede de segurança'));
    expect(item).toBeDefined();
    expect(item).toContain('node scripts/ci/riskTriggers.mjs --base origin/main');
    expect(item).toContain('`log`');
    expect(item).toContain('`gatilho:`');
    expect(item).toContain('`nenhum gatilho`');
    for (const caminho of [
      'src/store/session.ts',
      'pwa/csp.ts',
      'scripts/release/',
      'mcp/version.ts',
      '.github/workflows/',
    ]) {
      expect(item).not.toContain(caminho);
    }
    expect(fechamento).toContain('git diff --name-only origin/main...HEAD'); // a escolha da versão do MCP fica
  });

  it('versão do schema escolhida ao criar o épico, como a do MCP (decisão do dono de 2026-11-10)', () => {
    const regra = between(
      skill,
      '3. **Uma versão do MCP por épico',
      '## Economia de contexto',
    );
    expect(regra).toMatch(/Versão do schema/);
    expect(regra).toMatch(/origin\/main/);
    expect(regra).toMatch(/próxima/);
    expect(regra).toMatch(/comente na issue/);
    expect(regra).toMatch(/mensagem da primeira fase/);
  });

  it('PROCESS.md: a linha do ci-rerun.yml na regra da main (decisão 10)', () => {
    const item = processDoc
      .split('\n')
      .find((l) => l.includes('A `main` só aceita PR de `epic/*`'));
    expect(item).toContain('ci-rerun.yml');
  });
});

// Etapa #1669 (QF1): execução do CI presa em `queued` sem jobs; o texto da fase e da fila.
describe('CI preso na fila (#1669)', () => {
  const skill = readFileSync('.claude/skills/implementar-fila/SKILL.md', 'utf8');
  const flow = readFileSync('docs/FLOW.md', 'utf8');
  const fase = section(flow, '## Para a sessão da fase');
  const item6 = between(fase, '\n6. ', '\n7. ');
  const item7 = between(fase, '\n7. ', '\n8. ');
  const presoSub = () => between(item6, '   - **Execução presa na fila:**', '\n   - **');
  const porEtapa = section(skill, '## 3. Por etapa');
  // O parágrafo é a abertura e os sub-itens, até o fim da seção "3. Por etapa" (o prettier separa a
  // abertura da lista por uma linha em branco).
  const paragrafoCi = () => {
    const marca = '**CI preso na fila (PR de fase ou de épico)';
    const at = porEtapa.indexOf(marca);
    if (at < 0) throw new Error(`âncora inicial não achada: ${marca}`);
    return porEtapa.slice(at);
  };

  it('item 6 da fase: sub-item depois do Runner abandonado, com o script, a lista do commit e o aviso (decisões 1 a 3)', () => {
    const preso = presoSub();
    expect(item6.indexOf('**Runner abandonado:**')).toBeLessThan(
      item6.indexOf('**Execução presa na fila:**'),
    );
    expect(preso).toContain('node scripts/ci/ciRerun.mjs queued');
    expect(preso).toContain('actions/workflows/ci.yml/runs?head_sha=');
    expect(preso).toContain('16 min');
    expect(preso).toContain('CI preso na fila: <link da execução>');
    expect(preso).toMatch(/não fecha, não reabre, não reexecuta e não faz commit vazio/);
    expect(preso).toMatch(/uma vez por `run`/);
    expect(preso).toMatch(/não pergunta nada ao dono/);
  });

  it('item 6 da fase: fechar e reabrir é do coordenador e a fase não trata closed/reopened como fim (decisões 5, 6 e 8)', () => {
    const preso = presoSub();
    expect(preso).toMatch(/recomece a Espera do CI/);
    expect(preso).toContain('`closed`');
    expect(preso).toContain('`reopened`');
    expect(preso).toMatch(/não como fim do PR/);
  });

  it('o item 7 cita "CI preso na fila" entre as mensagens de espera', () => {
    expect(item7).toContain('CI preso na fila');
  });

  it('"CI e preview" proíbe o commit vazio e só admite o fechar e reabrir na execução presa na fila (decisão 9)', () => {
    const ci = between(flow, 'O CI roda só nos PRs', '\n\n');
    expect(ci).toMatch(/nada de commit vazio/);
    expect(ci).toMatch(/execução presa na fila/);
    expect(ci).toMatch(/"sim" do dono/);
    expect(ci).toContain('item 6');
  });

  it('skill: parágrafo CI preso na fila com a pergunta, as opções e os efeitos (decisões 3 a 7)', () => {
    const paragrafo = paragrafoCi();
    expect(paragrafo).toContain(
      'Fecho e reabro o PR #<n> para criar uma execução nova do CI?',
    );
    expect(paragrafo).toContain('Fechar e reabrir (Recomendado)');
    expect(paragrafo).toContain('Esperar');
    expect(paragrafo).toContain('update_pull_request');
    expect(paragrafo).toContain('reaberto=true');
    expect(paragrafo).toContain('instabilidade do GitHub');
    expect(paragrafo).toContain('esperando dono');
    expect(paragrafo).toContain('PushNotification');
    expect(paragrafo).toContain('node scripts/ci/ciRerun.mjs queued');
    expect(paragrafo).toMatch(/16 min/);
    expect(paragrafo).toMatch(/[Ss]ó vale a resposta do dono no chat da fila/);
  });

  it('skill: o parágrafo vem depois do CI vermelho no PR do épico e antes do item que o remete', () => {
    expect(skill.indexOf('**CI vermelho no PR do épico**')).toBeLessThan(
      skill.indexOf('**CI preso na fila (PR de fase ou de épico)'),
    );
  });

  it('skill: "O coordenador não roda o CI de novo" continua e remete ao parágrafo novo', () => {
    const item = between(skill, '- **O coordenador não roda o CI de novo.**', '\n- **');
    expect(item).toContain('CI travado');
    expect(item).toMatch(
      /salvo a execução presa na fila \(parágrafo \*\*CI preso na fila\*\*\)/,
    );
    expect(item).toMatch(/runner abandonado/);
  });

  it('skill: "Filha que espera o coordenador", o PR que espera e a conferência de hora em hora citam o caso', () => {
    const filha = between(skill, '**Filha que espera o coordenador**', '\n\n');
    expect(filha).toContain('CI preso na fila');
    const espera = between(skill, '**PR que espera o coordenador:**', '\n\n');
    expect(espera).toContain('CI preso na fila');
    const reserva = between(skill, '**Conferências de reserva:**', '**CI vermelho');
    expect(reserva).toContain('CI preso na fila');
  });

  it('o skill ficou pequeno: o parágrafo novo e as remissões somam menos de 60 linhas (decisão 11)', () => {
    const paragrafo = paragrafoCi();
    expect(paragrafo.split('\n').length).toBeLessThan(60);
  });
});
