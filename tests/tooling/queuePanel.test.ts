// @vitest-environment node
// Fase FC1 (etapa #1285): o painel da fila guarda a ficha de cada etapa (`plan`), as filhas que
// devem aviso (`child`, `childAt`) e a conferência de reserva (`reserve`), e o `show` resume tudo
// sem imprimir o JSON inteiro, para o coordenador não encher o contexto.
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

  it('a linha guarda a ficha (plan) e o show de uma linha a imprime', () => {
    run('row', dir, '#10', 'title=Etapa dez', 'plan=dep=nenhuma; fases=AB1:#11');
    const queue = json('queue') as Array<Record<string, unknown>>;
    expect(queue[0]?.plan).toBe('dep=nenhuma; fases=AB1:#11');
    const out = run('show', dir, '#10');
    expect(out).toContain('#10');
    expect(out).toContain('dep=nenhuma; fases=AB1:#11');
  });

  it('child e childAt=now registram a filha; show lista só as atrasadas (mais de 30 min; decisão 5 da #1324)', () => {
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

  it('atrasada é só a filha com mais de 30 min: 30 não conta, 31 conta (decisão 5 da #1324)', () => {
    runAt('2026-11-09T10:00:00Z', 'row', dir, '#10', 'child=session_a', 'childAt=now');
    expect(runAt('2026-11-09T10:30:00Z', 'show', dir)).toMatch(/atrasadas: nenhuma/);
    expect(runAt('2026-11-09T10:31:00Z', 'show', dir)).toMatch(/atrasadas:[^\n]*#10/);
  });

  it('child= vazio limpa childAt e a etapa deixa de estar atrasada', () => {
    runAt('2026-11-09T10:00:00Z', 'row', dir, '#10', 'child=session_a', 'childAt=now');
    run('row', dir, '#10', 'child=');
    const queue = json('queue') as Array<Record<string, unknown>>;
    expect(queue[0]?.childAt).toBe('');
    const out = runAt('2026-11-09T12:00:00Z', 'show', dir);
    expect(out).toMatch(/atrasadas: nenhuma/);
  });

  it('reserve guarda o id da conferência no meta e o show o mostra', () => {
    const changed = run('reserve', dir, 'trig_abc');
    expect(changed).toContain('meta.json');
    const meta = json('meta') as Array<Record<string, unknown>>;
    expect(meta[0]?.reserve).toBe('trig_abc');
    expect(run('show', dir)).toContain('reserva: trig_abc');
  });

  it('filha com wait não é atrasada e aparece em "esperando o coordenador" (RS1, decisão 5)', () => {
    runAt('2026-11-09T10:00:00Z', 'row', dir, '#10', 'child=session_a', 'childAt=now');
    runAt('2026-11-09T10:01:00Z', 'row', dir, '#10', 'wait=pergunta de produto');
    const out = runAt('2026-11-09T12:00:00Z', 'show', dir);
    expect(out).toMatch(/atrasadas: nenhuma/);
    expect(out).toMatch(/esperando o coordenador: #10 \(pergunta de produto\)/);
  });

  it('sem filha esperando, o show diz "esperando o coordenador: nenhuma"', () => {
    expect(run('show', dir)).toMatch(/esperando o coordenador: nenhuma/);
  });

  it('wait= com childAt=now devolve a filha à contagem', () => {
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

  it('trocar a filha (sessão recriada) sem passar wait também limpa o wait', () => {
    runAt(
      '2026-11-09T10:00:00Z',
      'row',
      dir,
      '#10',
      'child=session_a',
      'childAt=now',
      'wait=pergunta',
    );
    runAt('2026-11-09T10:05:00Z', 'row', dir, '#10', 'child=session_b', 'childAt=now');
    const queue = json('queue') as Array<Record<string, unknown>>;
    expect(queue[0]?.wait).toBe('');
    expect(runAt('2026-11-09T10:40:00Z', 'show', dir)).toMatch(/atrasadas:[^\n]*#10/);
  });

  it('child= vazio limpa o wait', () => {
    runAt(
      '2026-11-09T10:00:00Z',
      'row',
      dir,
      '#10',
      'child=session_a',
      'childAt=now',
      'wait=chama o dono',
    );
    run('row', dir, '#10', 'child=');
    const queue = json('queue') as Array<Record<string, unknown>>;
    expect(queue[0]?.wait).toBe('');
    expect(run('show', dir)).toMatch(/esperando o coordenador: nenhuma/);
  });

  it('childAt inválido é recusado', () => {
    expect(() => run('row', dir, '#10', 'childAt=ontem')).toThrow();
  });
});

// Etapa #1298 (FT1) e #1315 (FC2); a decisão 11 da #1322 (FS1) troca só o critério: skill grande troca de sessão.
describe('implementar-fila: skill novo na main e troca de sessão (FT1, FC2)', () => {
  const skill = readFileSync('.claude/skills/implementar-fila/SKILL.md', 'utf8');
  const troca = section(skill, '## Troca de sessão');
  const CHECK =
    'git fetch -q origin main && git diff --quiet HEAD origin/main -- .claude/skills/implementar-fila/SKILL.md';

  it('"Troca de sessão" manda dar pull e reler o SKILL.md inteiro (decisão 5; decisão 11 da #1322)', () => {
    expect(troca).toContain(CHECK);
    expect(troca).toContain('git pull -q --ff-only origin main');
    expect(troca).toMatch(/releia o `SKILL.md` inteiro/);
    expect(troca).not.toContain('mesmo abaixo de 60%');
    expect(troca).not.toContain('skill atualizado na main');
  });

  it('a troca é por contexto acima de 60% ou por skill grande (decisão 6; decisão 11 da #1322)', () => {
    expect(troca).toMatch(/Troca de sessão por contexto ou por skill grande/);
    expect(troca).toMatch(/Acima de 60%/);
  });

  it('antes de criar o sucessor confere lineage.depth + 2 > limit (decisão 7)', () => {
    expect(troca).toContain('lineage.depth');
    expect(troca).toContain('lineage.limit');
    expect(troca).toContain('depth + 2 > limit');
    expect(troca).toMatch(/aguardando o dono abrir a sessão nova da fila/);
  });

  it('a conferência de reserva e o passo "Entre etapas" fazem a mesma conferência', () => {
    const entre = between(skill, '7. **Entre etapas:**', '**Conferências de reserva:**');
    expect(entre).toMatch(/skill mudou na `main`/);
    const conferencia = between(skill, '**Conferências de reserva:**', '**CI vermelho');
    expect(conferencia).toMatch(/skill mudou na `main`/);
  });
});

// Etapa #1315 (FC2): ajustes finos de contexto, arquivamento das sessões e espera por workflow.
describe('implementar-fila: ajustes finos do coordenador (FC2)', () => {
  const skill = readFileSync('.claude/skills/implementar-fila/SKILL.md', 'utf8');
  const flow = readFileSync('docs/FLOW.md', 'utf8');
  const detalhar = readFileSync('.claude/skills/detalhar-backlog/SKILL.md', 'utf8');
  const TITLES = [
    'Para a sessão da fase',
    'Fase de correção',
    'Para o testador',
    'Rodada dirigida em grupos',
    'Reteste junto',
    'Rodada completa em 5 blocos',
  ];

  it('lista os títulos exatos das mensagens do FLOW.md e o comando de leitura (decisão 2)', () => {
    for (const title of TITLES) {
      expect(skill).toContain(`"${title}"`);
      expect(flow).toMatch(new RegExp(`^## ${title}$`, 'm'));
    }
    expect(skill).toContain(
      "awk '/^## <título>$/{f=1;print;next} /^## /{f=0} f' docs/FLOW.md",
    );
    expect(skill).toMatch(/nunca por `grep`/);
  });

  it('o painel é publicado uma vez por turno que gravou, mesmo com o subagente rodando (decisão 3 da #1532)', () => {
    expect(skill).toMatch(/uma vez por turno, no fim/);
    expect(skill).toMatch(/mesmo com o subagente do ciclo ainda rodando/);
    expect(skill).toMatch(/só com os arquivos alterados/);
    expect(skill).toMatch(
      /conferência de hora em hora sem atrasadas e sem arquivo não publicado não publica/i,
    );
    expect(skill).not.toMatch(/Nunca há duas publicações no mesmo ciclo/);
  });

  it('o chat fica quase mudo (decisão 3)', () => {
    expect(skill).toMatch(/O chat fica quase mudo/);
    expect(skill).toMatch(/não escreve resumo/);
  });

  it('um subagente por ciclo para as tarefas de GitHub (decisão 4)', () => {
    expect(skill).toMatch(/Um subagente por ciclo/);
    expect(skill).toMatch(/uma linha por tarefa/);
  });

  it('arquiva cada filha ao terminar, registra as sessões e arquiva a anterior (decisão 8)', () => {
    expect(skill).toContain('archive_session');
    expect(skill).toContain("painel.py session <pasta> '#n' <id>");
    expect(skill).toMatch(/<código> arquivada/);
    expect(skill).toMatch(/não se arquiva/i);
    expect(skill).toMatch(/arquiva a `anterior`/);
    expect(skill).toMatch(/não arquiva a si mesmo/);
  });

  it('a espera por workflow segue a duração medida (decisão 10)', () => {
    expect(skill).toMatch(/no mesmo ciclo do merge/);
    expect(skill).toMatch(/job `release` pulado/);
    expect(skill).toMatch(/5 min depois do merge/);
    expect(skill).toMatch(/a cada 1 min/);
    expect(skill).toMatch(/Não segure o merge de outro épico/);
  });

  it('a troca de rótulo manda a lista completa (decisão 11), no skill e no detalhar-backlog', () => {
    for (const text of [skill, detalhar]) {
      expect(text).toMatch(/substitui todos os rótulos/);
      expect(text).toMatch(/lista completa/);
      expect(text).toMatch(/`severity:`/);
    }
  });

  it('o detalhar-backlog arquiva cada subagente de detalhamento ou agrupamento (decisão 9)', () => {
    expect(detalhar).toContain('archive_session');
    expect(detalhar).toMatch(/arquiva/i);
    expect(detalhar).toMatch(/resumo final/);
  });

  it('o FLOW.md diz como fica a troca e o arquivamento', () => {
    const linha = flow
      .split('\n')
      .find((l) => l.startsWith('Para implementar em sequência'));
    expect(linha).toMatch(/por contexto/);
    expect(linha).toMatch(/limite de linhagem/);
    expect(linha).toMatch(/arquivadas/);
  });
});

describe('painel.py: sessions por etapa (FC2, decisão 8)', () => {
  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'painel-'));
    runAt('2026-11-09T10:00:00Z', 'init', dir);
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('session acrescenta o id em sessions sem repetir, e show da etapa o mostra', () => {
    run('row', dir, '#10', 'title=Etapa dez');
    run('session', dir, '#10', 'session_a');
    run('session', dir, '#10', 'session_b');
    const out = run('session', dir, '#10', 'session_a');
    expect(out).toContain('queue.json');
    const queue = json('queue') as Array<Record<string, unknown>>;
    expect(queue[0]?.sessions).toBe('session_a session_b');
    expect(run('show', dir, '#10')).toContain('sessions: session_a session_b');
  });

  it('session numa etapa fora da fila é recusado', () => {
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
    expect(dono).toMatch(/conferência de hora em hora[^\n]*contexto[^\n]*60%/);
  });

  it('"Para a sessão da fase": margem e teto do dist para a fase (decisões 3, 6, 7 e 8)', () => {
    expect(item6).toMatch(/abaixo de 2 KiB/);
    expect(item6).toMatch(/enxugar/);
    expect(item6).toContain('node scripts/ci/distBudget.mjs raise');
    expect(item6).toMatch(/chama o dono/);
    expect(item6).toMatch(/16 KiB/);
    expect(item6).toMatch(/até 14 KiB/);
    expect(item6).toMatch(/32 KiB/);
    expect(item6).toMatch(/64 KiB/);
    expect(item6).toMatch(/`send_message`/);
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
    expect(fases).toContain('chama o dono');
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
    expect(ciVermelho).toContain(
      'até 14 KiB (14.336 bytes), para sobrar ao menos 2 KiB depois da subida',
    );
    expect(ciVermelho).toContain('excesso acima de 14 KiB');
    expect(ciVermelho).toMatch(/32 KiB/);
    expect(ciVermelho).toMatch(/64 KiB/);
    expect(ciVermelho).toMatch(/worktree descartável/);
    expect(ciVermelho).toContain('npm ci && npm run build');
    expect(ciVermelho).toContain('node scripts/ci/distBudget.mjs raise');
    expect(ciVermelho).toContain('changelog/<nome>.md');
    expect(ciVermelho).toContain('Orçamento do dist/index.html');
    expect(ciVermelho).toContain('Teto na última revisão do dono');
    expect(ciVermelho).toMatch(/primeira subida/);
    expect(ciVermelho).toMatch(/inclusive as da fase|subida feita pela fase/);
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
