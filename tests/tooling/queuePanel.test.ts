// @vitest-environment node
// Fase FC1 (etapa #1285): o painel da fila guarda a ficha de cada etapa (`plan`), as filhas que
// devem aviso (`child`, `childAt`) e a conferência de reserva (`reserve`), e o `show` resume tudo
// sem imprimir o JSON inteiro, para o coordenador não encher o contexto.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

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

  it('child e childAt=now registram a filha; show lista só as atrasadas (mais de 60 min)', () => {
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

  it('childAt inválido é recusado', () => {
    expect(() => run('row', dir, '#10', 'childAt=ontem')).toThrow();
  });
});

// Etapa #1298 (FT1) e #1315 (FC2); a decisão 11 da #1322 (FS1) troca só o critério: skill grande troca de sessão.
describe('implementar-fila: skill novo na main e troca de sessão (FT1, FC2)', () => {
  const skill = readFileSync('.claude/skills/implementar-fila/SKILL.md', 'utf8');
  const troca = skill.slice(skill.indexOf('## Troca de sessão'));
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
    const entre = skill.slice(
      skill.indexOf('7. **Entre etapas:**'),
      skill.indexOf('**Conferências de reserva:**'),
    );
    expect(entre).toMatch(/skill mudou na `main`/);
    const conferencia = skill.slice(
      skill.indexOf('**Conferências de reserva:**'),
      skill.indexOf('**CI vermelho'),
    );
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

  it('o painel é publicado uma vez por ciclo, a cada avanço (decisão 1)', () => {
    expect(skill).toMatch(/Nunca há duas publicações no mesmo ciclo/);
    expect(skill).toMatch(/só com os arquivos alterados/);
    expect(skill).toMatch(/conferência de hora em hora sem atrasadas não publica/i);
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
