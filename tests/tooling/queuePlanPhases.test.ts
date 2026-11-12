// @vitest-environment node
// Fase PF1 (etapa #1705): o painel da fila mostra todas as fases do plano desde que a ficha é gravada.
// O estado `todo` ("por fazer") só vem da ficha (`fases=`), e toda gravação completa as linhas.
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { section } from '../support/textSlice';

const SCRIPT = '.claude/skills/implementar-fila/painel/painel.py';
const SKILL = '.claude/skills/implementar-fila/SKILL.md';
const NOW = '2026-11-12T10:00:00Z';
const TEMPO = 30_000;
const FICHA3 =
  'dep=nenhuma | toca=a.ts | fases=D1:#1103:high,D2:#1104:high,D3:#1105:medium';

type Linha = Record<string, unknown>;

let dir = '';

function run(...args: string[]): string {
  return execFileSync('python3', [SCRIPT, '--now', NOW, ...args], { encoding: 'utf8' });
}

function runRaw(...args: string[]) {
  return spawnSync('python3', [SCRIPT, '--now', NOW, ...args], { encoding: 'utf8' });
}

function json(d: string, name: string): Linha[] {
  return JSON.parse(readFileSync(path.join(d, `${name}.json`), 'utf8')) as Linha[];
}

function linha(d: string, issue: string): Linha {
  const r = json(d, 'queue').find((x) => x.issue === issue);
  if (!r) throw new Error(`${issue} não está na fila`);
  return r;
}

function alterados(out: string): string {
  return /alterados: ([^\n]*)/.exec(out)?.[1] ?? '';
}

/** Escreve à mão uma fila como a de antes desta etapa: sem nenhum `todo` nas fases. */
function filaAntiga(rows: Linha[]): void {
  const base: Linha = {
    order: 0,
    issue: '',
    title: '',
    kind: 'etapa',
    step: '',
    status: 'aguardando',
    pr: '',
    started: '',
    ended: '',
    phases: '',
    phasesTotal: 0,
    phasesDone: 0,
    stage: '',
    plan: '',
    child: '',
    childAt: '',
    ciWait: '',
    ciWaitAt: '',
    wait: '',
    sessions: '',
    hold: '',
    exclusive: '',
  };
  const queue = rows.map((r, i) => ({ ...base, order: i + 1, ...r }));
  writeFileSync(path.join(dir, 'queue.json'), JSON.stringify(queue, null, 1));
}

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'queue-plan-phases-'));
  run('init', dir);
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('painel.py — as fases do plano entram como todo (PF1)', () => {
  it(
    '(a) row … plan= com fases=D1,D2,D3 grava D1:todo|D2:todo|D3:todo, com 0 / 3',
    () => {
      run(
        'row',
        dir,
        '#1',
        'plan=dep=nenhuma | fases=D1:#1:high,D2:#2:high,D3:#3:medium',
      );
      const r = linha(dir, '#1');
      expect(r.phases).toBe('D1:todo|D2:todo|D3:todo');
      expect(r.phasesTotal).toBe(3);
      expect(r.phasesDone).toBe(0);
    },
    TEMPO,
  );

  it(
    '(b) o exemplo da #1085: D1=ok e D2=open dão D1:ok|D2:open|D3:todo, com 1 / 3',
    () => {
      run('row', dir, '#1085', `plan=${FICHA3}`, 'status=em andamento');
      run('phase', dir, '#1085', 'D1=ok', 'D2=open');
      const r = linha(dir, '#1085');
      expect(r.phases).toBe('D1:ok|D2:open|D3:todo');
      expect(r.phasesTotal).toBe(3);
      expect(r.phasesDone).toBe(1);
      const show = run('show', dir, '#1085');
      expect(show).toContain('phases: D1:ok|D2:open|D3:todo');
    },
    TEMPO,
  );

  it(
    '(c) CL1=open entra no fim e o total sobe: D1:ok|D2:open|D3:todo|CL1:open, com 1 / 4',
    () => {
      run('row', dir, '#1085', `plan=${FICHA3}`, 'status=em andamento');
      run('phase', dir, '#1085', 'D1=ok', 'D2=open');
      run('phase', dir, '#1085', 'CL1=open');
      const show = run('show', dir, '#1085');
      expect(show).toContain('phases: D1:ok|D2:open|D3:todo|CL1:open');
      expect(show).toContain('phasesTotal: 4');
      expect(show).toContain('phasesDone: 1');
    },
    TEMPO,
  );

  it(
    '(d) a ficha com fases=? ou sem fases não muda o phases',
    () => {
      run('row', dir, '#1', 'plan=dep=nenhuma | fases=?', 'phases=A1:open');
      run('row', dir, '#2', 'plan=dep=nenhuma | toca=a.ts', 'phases=B1:ok|B2:open');
      run('row', dir, '#3', 'plan=dep=nenhuma | fases=', 'phases=C1:open');
      run('log', dir, 'qualquer gravação');
      expect(linha(dir, '#1').phases).toBe('A1:open');
      expect(linha(dir, '#2').phases).toBe('B1:ok|B2:open');
      expect(linha(dir, '#3').phases).toBe('C1:open');
      expect(linha(dir, '#2').phasesTotal).toBe(2);
    },
    TEMPO,
  );

  it(
    '(e) numa fila escrita à mão, um log completa a linha e põe o queue.json em alterados e em unpublished; um segundo log não o regrava',
    () => {
      filaAntiga([
        {
          issue: '#10',
          status: 'em andamento',
          plan: FICHA3,
          phases: 'D1:ok|D2:open',
          phasesTotal: 2,
          phasesDone: 1,
        },
      ]);
      const first = run('log', dir, 'primeiro');
      expect(alterados(first)).toContain('queue.json');
      expect(linha(dir, '#10').phases).toBe('D1:ok|D2:open|D3:todo');
      expect(linha(dir, '#10').phasesTotal).toBe(3);
      const meta = json(dir, 'meta')[0] as { unpublished?: { files: string[] } };
      expect(meta.unpublished?.files).toContain('queue.json');
      expect(run('show', dir)).toMatch(/não publicado desde [^\n]*queue\.json/);

      const second = run('log', dir, 'segundo');
      expect(alterados(second)).not.toContain('queue.json');
    },
    TEMPO,
  );

  it(
    '(e) um context sozinho também completa a linha e conta como não publicado',
    () => {
      filaAntiga([{ issue: '#10', status: 'aguardando', plan: FICHA3 }]);
      const out = run('context', dir, '20');
      expect(alterados(out)).toContain('queue.json');
      expect(linha(dir, '#10').phases).toBe('D1:todo|D2:todo|D3:todo');
      const meta = json(dir, 'meta')[0] as { unpublished?: { files: string[] } };
      expect(meta.unpublished?.files).toContain('queue.json');
      // Já completa: o context seguinte volta a ser quieto e não regrava a fila.
      const again = run('context', dir, '21');
      expect(alterados(again)).not.toContain('queue.json');
    },
    TEMPO,
  );

  it(
    '(f) a linha concluída não muda',
    () => {
      filaAntiga([
        {
          issue: '#10',
          status: 'concluída',
          plan: FICHA3,
          phases: 'D1:ok',
          phasesTotal: 1,
          phasesDone: 1,
        },
      ]);
      const out = run('log', dir, 'algo');
      expect(alterados(out)).not.toContain('queue.json');
      expect(linha(dir, '#10').phases).toBe('D1:ok');
      expect(linha(dir, '#10').phasesTotal).toBe(1);
    },
    TEMPO,
  );

  it(
    '(g) a ficha refeita sem a D3 tira o D3:todo e mantém o open e o ok que ela não traz',
    () => {
      run('row', dir, '#10', `plan=${FICHA3}`, 'status=em andamento');
      run('phase', dir, '#10', 'D1=ok', 'D2=open', 'CL1=open');
      expect(linha(dir, '#10').phases).toBe('D1:ok|D2:open|D3:todo|CL1:open');
      run('row', dir, '#10', 'plan=dep=nenhuma | fases=D1:#1103:high,D2:#1104:high');
      expect(linha(dir, '#10').phases).toBe('D1:ok|D2:open|CL1:open');

      run('row', dir, '#11', 'plan=dep=nenhuma | fases=D1:#1:high,D4:#4:high');
      run('phase', dir, '#11', 'D1=ok', 'D2=open', 'D3=ok');
      expect(linha(dir, '#11').phases).toBe('D1:ok|D4:todo|D2:open|D3:ok');
      run('row', dir, '#11', 'plan=dep=nenhuma | fases=D1:#1:high');
      expect(linha(dir, '#11').phases).toBe('D1:ok|D2:open|D3:ok');
      expect(linha(dir, '#11').phasesTotal).toBe(3);
      expect(linha(dir, '#11').phasesDone).toBe(2);
    },
    TEMPO,
  );

  it(
    '(g2) um item de phases sem ":" (fila editada à mão) vira open, não um estado vazio',
    () => {
      filaAntiga([
        {
          issue: '#12',
          status: 'em andamento',
          plan: 'dep=nenhuma | fases=D1:#1:high,D2:#2:high',
          phases: 'D1|D2:ok',
        },
      ]);
      run('row', dir, '#12', 'plan=dep=nenhuma | fases=D1:#1:high,D2:#2:high');
      expect(linha(dir, '#12').phases).toBe('D1:open|D2:ok');
      expect(linha(dir, '#12').phasesTotal).toBe(2);
      expect(linha(dir, '#12').phasesDone).toBe(1);
    },
    TEMPO,
  );

  it(
    '(h) phase … D3=todo sai com código 2 e a mensagem lista ok e open',
    () => {
      run('row', dir, '#10', `plan=${FICHA3}`);
      const r = runRaw('phase', dir, '#10', 'D3=todo');
      expect(r.status).toBe(2);
      expect(r.stderr).toContain("'ok', 'open'");
    },
    TEMPO,
  );

  it(
    '(i) o import completa as linhas importadas pela ficha',
    () => {
      const antiga = path.join(dir, 'antiga');
      mkdirSync(antiga);
      const rowAguardando: Linha = {
        order: 1,
        issue: '#20',
        title: 'Aguardando',
        kind: 'etapa',
        status: 'aguardando',
        plan: FICHA3,
        phases: '',
        phasesTotal: 0,
        phasesDone: 0,
        hold: '',
      };
      const rowAndamento: Linha = {
        ...rowAguardando,
        order: 2,
        issue: '#21',
        title: 'Em andamento',
        status: 'em andamento',
        phases: 'D1:ok|D2:open',
        phasesTotal: 2,
        phasesDone: 1,
      };
      writeFileSync(
        path.join(antiga, 'queue.json'),
        JSON.stringify([rowAguardando, rowAndamento]),
      );
      writeFileSync(
        path.join(antiga, 'meta.json'),
        JSON.stringify([{ runStart: '', updatedAt: NOW, current: '' }]),
      );
      writeFileSync(path.join(antiga, 'log.json'), '[]');
      const nova = path.join(dir, 'nova');
      run('init', nova);
      run('import', nova, antiga);
      expect(linha(nova, '#20').phases).toBe('D1:todo|D2:todo|D3:todo');
      expect(linha(nova, '#20').phasesTotal).toBe(3);
      expect(linha(nova, '#21').phases).toBe('D1:ok|D2:open|D3:todo');
      expect(linha(nova, '#21').phasesDone).toBe(1);
    },
    TEMPO,
  );
});

describe('SKILL.md — o estado todo (PF1, decisão 9)', () => {
  const skill = readFileSync(SKILL, 'utf8');

  it('(j) o Painel cita o todo e o =open; a Ficha da etapa e a Fila não mandam mais gravar as fases em open', () => {
    const painel = section(skill, '## Painel');
    expect(painel).toContain('todo');
    expect(painel).toContain('=open');
    expect(painel).toContain('=ok');
    const ficha = section(skill, '### Ficha da etapa');
    expect(ficha).toContain('todo');
    expect(ficha).not.toContain('com as fases em `open`');
    const fila = section(skill, '## 2. Fila');
    expect(fila).not.toContain('as fases `open`');
    expect(fila).toContain('todo');
  });
});
