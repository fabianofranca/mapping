// @vitest-environment node
// Fase FM7 (etapa #1532, decisões 17 e 25): troca a quente no painel existente (`upgrade`) e migração opcional
// para um painel novo (`import`, `importar=`). A pasta antiga é montada aqui, no formato do painel atual (os três JSON
// sem nenhum campo novo: sem `exclusive` nas linhas e sem `sessions`, `requests`, `rules`, `roles` nem `unpublished`).
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { section } from '../support/textSlice';

const SCRIPT = '.claude/skills/implementar-fila/painel/painel.py';
const SKILL = '.claude/skills/implementar-fila/SKILL.md';
const NOW = '2026-11-11T10:00:00Z';
const TEMPO_SUBPROCESSOS = 30_000;
const HOLD_VAZIA = 'ordem do dono (só com a fila vazia)';

type Linha = Record<string, unknown>;

let raiz = '';
let antiga = '';
let nova = '';

function run(...args: string[]): string {
  return execFileSync('python3', [SCRIPT, '--now', NOW, ...args], { encoding: 'utf8' });
}

function runRaw(...args: string[]) {
  return spawnSync('python3', [SCRIPT, '--now', NOW, ...args], { encoding: 'utf8' });
}

function json(dir: string, name: string): Linha[] {
  return JSON.parse(readFileSync(path.join(dir, `${name}.json`), 'utf8')) as Linha[];
}

function linha(dir: string, issue: string): Linha {
  const r = json(dir, 'queue').find((x) => x.issue === issue);
  if (!r) throw new Error(`${issue} não está na fila de ${dir}`);
  return r;
}

function logTexts(dir: string): string[] {
  return json(dir, 'log').map((e) => String(e.text));
}

/** Linha no formato do painel atual: todos os campos de antes, nenhum dos novos (`exclusive`). */
function velha(over: Linha): Linha {
  return {
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
    ...over,
  };
}

function gravar(dir: string, queue: Linha[], meta: Linha, log: Linha[]) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'queue.json'), JSON.stringify(queue, null, 1));
  writeFileSync(path.join(dir, 'meta.json'), JSON.stringify([meta], null, 1));
  writeFileSync(path.join(dir, 'log.json'), JSON.stringify(log, null, 1));
}

const FICHA = (dep: string, toca: string) =>
  `dep=${dep} | nivel=impact: low | mcp=não | schema=não | epico=epic/x | fases=A1:#9:high | toca=${toca}`;

/** A fila de exemplo do aceite da fase, no formato antigo. */
function filaAntiga(): Linha[] {
  return [
    velha({
      order: 1,
      issue: '#883',
      title: 'Páginas',
      status: 'aguardando',
      hold: HOLD_VAZIA,
      plan: FICHA('nenhuma', 'a.ts'),
    }),
    velha({
      order: 2,
      issue: '#898',
      title: 'Pausada',
      status: 'aguardando',
      hold: 'pausada pelo dono',
      plan: FICHA('nenhuma', 'b.ts'),
    }),
    velha({
      order: 3,
      issue: '#900',
      title: 'Concluída',
      status: 'concluída',
      pr: 'PR #90',
      started: '2026-11-10T09:00:00Z',
      ended: '2026-11-10T11:00:00Z',
      plan: FICHA('nenhuma', 'c.ts'),
    }),
    velha({
      order: 4,
      issue: '#905',
      title: 'Em andamento',
      kind: 'bug',
      status: 'em andamento',
      stage: 'Fases',
      step: 'fase 2',
      pr: 'PR #91',
      started: '2026-11-10T12:00:00Z',
      phases: 'A1:ok|A2:open',
      phasesTotal: 2,
      phasesDone: 1,
      plan: FICHA('nenhuma', 'd.ts'),
      child: 'session_filha',
      childAt: '2026-11-11T09:30:00Z',
      wait: 'pergunta',
      ciWait: 'PR #91',
      ciWaitAt: '2026-11-11T09:40:00Z',
      sessions: 'session_filha session_velha',
      ended: '2026-11-10T13:00:00Z',
    }),
    velha({
      order: 5,
      issue: '#910',
      title: 'Esperando',
      status: 'esperando dono',
      step: 'escolha',
      stage: 'Testador',
      started: '2026-11-10T08:00:00Z',
      hold: 'esperando dono (merge)',
      child: 'session_x',
      sessions: 'session_x',
    }),
    velha({
      order: 6,
      issue: '#911',
      title: 'Falhou',
      status: 'falhou',
      step: 'CI',
      started: '2026-11-10T07:00:00Z',
    }),
    velha({
      order: 7,
      issue: '#920',
      title: 'Última',
      status: 'aguardando',
      hold: 'ordem do dono (aguarda a #905)',
      plan: FICHA('#905:aberta', 'e.ts'),
    }),
  ];
}

function metaAntiga(): Linha {
  return {
    runStart: '2026-11-10T08:00:00Z',
    waitingSince: '2026-11-10T08:00:00Z',
    updatedAt: '2026-11-11T09:50:00Z',
    current: 'rodando a #905',
    reserve: 'trig_antigo',
    context: 40,
    contextAt: '2026-11-11T09:00:00Z',
    paralelo: 3,
    merged: ['#500', '#900'],
    vagas: '1/3',
    vagasItens: [],
    publishedAt: '2026-11-11T09:00:00Z',
  };
}

function montarAntiga() {
  gravar(antiga, filaAntiga(), metaAntiga(), [
    { at: '2026-11-10T08:00:00Z', text: 'Execução iniciada' },
    { at: '2026-11-10T21:06:00Z', text: 'regra do dono: orçamento revisado' },
  ]);
}

beforeEach(() => {
  raiz = mkdtempSync(path.join(tmpdir(), 'queue-import-'));
  antiga = path.join(raiz, 'antiga');
  nova = path.join(raiz, 'nova');
  montarAntiga();
});

afterEach(() => {
  rmSync(raiz, { recursive: true, force: true });
});

describe('painel.py — troca a quente num painel sem os campos novos (FM7, decisão 25)', () => {
  it(
    'show, row, apply, cost, role, sup, rule e costs funcionam, e o show mostra "—" ou "nenhum" onde falta dado',
    () => {
      const show = run('show', antiga);
      expect(show).toContain('custo: ');
      expect(show).toContain('pedidos do supervisor: ');
      expect(show).toMatch(/regras em vigor:/);
      expect(show).toContain('não publicado: nenhum');
      expect(run('roles', antiga)).toContain('—');
      expect(run('costs', antiga)).toBeTruthy();
      expect(run('requests', antiga)).toBeTruthy();

      run('row', antiga, '#883', 'step=ok');
      run(
        'cost',
        antiga,
        'session_nova',
        'usd=1.5',
        'ctx=100',
        'model=claude-sonnet-5-5',
        'effort=high',
        'issue=#905',
        'kind=fase',
      );
      run(
        'role',
        antiga,
        'coordenador',
        'session_c1',
        'link=https://claude.ai/code/session_c1',
      );
      run('sup', antiga, 'SUP-1', 'tipo=A', 'pedido=segurar a #920', 'estado=enviado');
      run('rule', antiga, 'add', 'não começar nada às 3h', 'origem=dono');
      const lote = path.join(raiz, 'lote.txt');
      writeFileSync(lote, "row '#883' 'step=de novo'\nlog 'dentro do lote'\n");
      run('apply', antiga, lote);
      const meta = json(antiga, 'meta')[0]!;
      expect(meta.roles).toBeTruthy();
      expect(meta.rules).toHaveLength(1);
      expect(meta.requests).toHaveLength(1);
      expect(linha(antiga, '#883').step).toBe('de novo');
    },
    TEMPO_SUBPROCESSOS,
  );
});

describe('painel.py upgrade (FM7, decisões 17 e 25)', () => {
  it(
    'troca o hold da fila vazia por exclusive=sim, deixa os outros holds e registra no log',
    () => {
      const out = run('upgrade', antiga);
      expect(out).toContain('alterados: ');
      const a = linha(antiga, '#883');
      expect(a.exclusive).toBe('sim');
      expect(a.hold).toBe('');
      expect(linha(antiga, '#898').hold).toBe('pausada pelo dono');
      expect(linha(antiga, '#898').exclusive ?? '').toBe('');
      expect(linha(antiga, '#910').hold).toBe('esperando dono (merge)');
      expect(linha(antiga, '#920').hold).toBe('ordem do dono (aguarda a #905)');
      const log = logTexts(antiga);
      expect(log).toHaveLength(3);
      expect(log[2]).toMatch(/upgrade/);
      expect(log[2]).toContain('#883');
      expect(log[2]).toContain('exclusive=sim');
      const meta = json(antiga, 'meta')[0]!;
      expect((meta.unpublished as { files: string[] }).files).toContain('queue.json');
    },
    TEMPO_SUBPROCESSOS,
  );

  it(
    'é idempotente: rodado de novo não muda nada nem escreve no log',
    () => {
      run('upgrade', antiga);
      const antes = ['queue', 'meta', 'log'].map((n) =>
        readFileSync(path.join(antiga, `${n}.json`), 'utf8'),
      );
      const out = run('upgrade', antiga);
      expect(out).toContain('alterados: nenhum');
      const depois = ['queue', 'meta', 'log'].map((n) =>
        readFileSync(path.join(antiga, `${n}.json`), 'utf8'),
      );
      expect(depois).toEqual(antes);
    },
    TEMPO_SUBPROCESSOS,
  );

  it(
    'sem nenhum hold da fila vazia, não muda nada',
    () => {
      run('row', antiga, '#883', 'hold=');
      const antes = readFileSync(path.join(antiga, 'queue.json'), 'utf8');
      expect(run('upgrade', antiga)).toContain('alterados: nenhum');
      expect(readFileSync(path.join(antiga, 'queue.json'), 'utf8')).toBe(antes);
      expect(logTexts(antiga).filter((t) => /upgrade/.test(t))).toEqual([]);
    },
    TEMPO_SUBPROCESSOS,
  );

  it(
    'a etapa exclusiva convertida só começa com a fila vazia (o show já a trata)',
    () => {
      run('upgrade', antiga);
      expect(run('show', antiga)).toContain('exclusiva');
    },
    TEMPO_SUBPROCESSOS,
  );

  it(
    'entra no lote do apply',
    () => {
      const lote = path.join(raiz, 'lote.txt');
      writeFileSync(lote, 'upgrade\nlog "depois do upgrade"\n');
      run('apply', antiga, lote);
      expect(linha(antiga, '#883').exclusive).toBe('sim');
      expect(logTexts(antiga).at(-1)).toBe('depois do upgrade');
    },
    TEMPO_SUBPROCESSOS,
  );
});

describe('painel.py import (FM7, decisão 17)', () => {
  beforeEach(() => {
    run('init', nova);
  });

  it(
    'traz aguardando, em andamento, esperando dono e falhou, na ordem e renumeradas de 1 a n, com a ficha',
    () => {
      run('import', nova, antiga);
      const q = json(nova, 'queue');
      expect(q.map((r) => r.issue)).toEqual([
        '#883',
        '#898',
        '#905',
        '#910',
        '#911',
        '#920',
      ]);
      expect(q.map((r) => r.order)).toEqual([1, 2, 3, 4, 5, 6]);
      const r = linha(nova, '#905');
      expect(r).toMatchObject({
        issue: '#905',
        title: 'Em andamento',
        kind: 'bug',
        plan: FICHA('nenhuma', 'd.ts'),
        phases: 'A1:ok|A2:open',
        phasesTotal: 2,
        phasesDone: 1,
        stage: 'Fases',
        step: 'fase 2',
        pr: 'PR #91',
        started: '2026-11-10T12:00:00Z',
        hold: '',
        status: 'em andamento',
      });
      expect(linha(nova, '#911').status).toBe('falhou');
      expect(linha(nova, '#910').status).toBe('esperando dono');
      expect(linha(nova, '#920').status).toBe('aguardando');
    },
    TEMPO_SUBPROCESSOS,
  );

  it(
    'as em andamento levam child, childAt, wait, ciWait, ciWaitAt e sessions; o ended não vem',
    () => {
      run('import', nova, antiga);
      const r = linha(nova, '#905');
      expect(r).toMatchObject({
        child: 'session_filha',
        childAt: '2026-11-11T09:30:00Z',
        wait: 'pergunta',
        ciWait: 'PR #91',
        ciWaitAt: '2026-11-11T09:40:00Z',
        sessions: 'session_filha session_velha',
      });
      expect(r.ended).toBe('');
      // as que não estão em andamento não levam os campos de acompanhamento
      expect(linha(nova, '#910').child).toBe('');
      expect(linha(nova, '#910').sessions).toBe('');
    },
    TEMPO_SUBPROCESSOS,
  );

  it(
    'não traz do meta: sessions, requests, current, paralelo, reserve, context, roles e unpublished anteriores; nem o log',
    () => {
      const meta = json(antiga, 'meta')[0]!;
      meta.sessions = [{ id: 'session_a', issue: '#1', kind: 'fase' }];
      meta.requests = [{ id: 'SUP-1', estado: 'enviado' }];
      meta.roles = { coordenador: { id: 'session_c', n: 2 } };
      meta.unpublished = { since: '2026-11-11T09:00:00Z', files: ['log.json'] };
      writeFileSync(path.join(antiga, 'meta.json'), JSON.stringify([meta]));
      run('import', nova, antiga);
      const m = json(nova, 'meta')[0]!;
      for (const k of [
        'sessions',
        'requests',
        'roles',
        'reserve',
        'context',
        'contextAt',
        'paralelo',
      ]) {
        expect(m[k], k).toBeUndefined();
      }
      expect(m.current).toBe('');
      expect(m.runStart).toBe('');
      expect((m.unpublished as { files: string[] }).files).toEqual([
        'queue.json',
        'meta.json',
        'log.json',
      ]);
      const log = logTexts(nova);
      expect(log).toHaveLength(1);
      expect(log[0]).not.toContain('Execução iniciada');
    },
    TEMPO_SUBPROCESSOS,
  );

  it(
    'apaga o "pausada pelo dono", converte o da fila vazia em exclusive=sim e mantém os outros holds',
    () => {
      run('import', nova, antiga);
      expect(linha(nova, '#898').hold).toBe('');
      expect(linha(nova, '#883').hold).toBe('');
      expect(linha(nova, '#883').exclusive).toBe('sim');
      expect(linha(nova, '#920').hold).toBe('ordem do dono (aguarda a #905)');
      expect(linha(nova, '#910').hold).toBe('esperando dono (merge)');
    },
    TEMPO_SUBPROCESSOS,
  );

  it(
    'as concluídas vão para meta.merged junto com o merged antigo, sem repetir; a #900 não vira linha',
    () => {
      run('import', nova, antiga);
      const m = json(nova, 'meta')[0]!;
      expect(m.merged).toEqual(['#500', '#900']);
      expect(json(nova, 'queue').some((r) => r.issue === '#900')).toBe(false);
      const meta = json(antiga, 'meta')[0]!;
      meta.merged = ['#500'];
      writeFileSync(path.join(antiga, 'meta.json'), JSON.stringify([meta]));
      run('init', '--force', nova);
      run('import', nova, antiga);
      expect(json(nova, 'meta')[0]!.merged).toEqual(['#500', '#900']);
    },
    TEMPO_SUBPROCESSOS,
  );

  it(
    'traz as regras em vigor de meta.rules, com a origem, e deixa as encerradas',
    () => {
      const meta = json(antiga, 'meta')[0]!;
      meta.rules = [
        { id: 'R1', texto: 'regra viva', origem: 'dono', at: '2026-11-10T10:00:00Z' },
        {
          id: 'R2',
          texto: 'regra morta',
          origem: 'SUP-3',
          at: '2026-11-10T11:00:00Z',
          endedAt: '2026-11-10T12:00:00Z',
        },
      ];
      writeFileSync(path.join(antiga, 'meta.json'), JSON.stringify([meta]));
      run('import', nova, antiga);
      const rules = json(nova, 'meta')[0]!.rules as Linha[];
      expect(rules).toHaveLength(1);
      expect(rules[0]).toMatchObject({ texto: 'regra viva', origem: 'dono' });
      expect(run('show', nova)).toContain('regra viva');
    },
    TEMPO_SUBPROCESSOS,
  );

  it(
    'com a pasta nova não vazia, sai com código 2 e não grava',
    () => {
      run('row', nova, '#1', 'title=Já tem');
      const antes = readFileSync(path.join(nova, 'queue.json'), 'utf8');
      const r = runRaw('import', nova, antiga);
      expect(r.status).toBe(2);
      expect(r.stderr).toMatch(/erro:/);
      expect(readFileSync(path.join(nova, 'queue.json'), 'utf8')).toBe(antes);
    },
    TEMPO_SUBPROCESSOS,
  );

  it(
    'pasta antiga ou nova sem os arquivos: código 2',
    () => {
      expect(runRaw('import', nova, path.join(raiz, 'nao-existe')).status).toBe(2);
      expect(runRaw('import', path.join(raiz, 'sem-init'), antiga).status).toBe(2);
    },
    TEMPO_SUBPROCESSOS,
  );

  it(
    'não altera a pasta antiga',
    () => {
      const antes = ['queue', 'meta', 'log'].map((n) =>
        readFileSync(path.join(antiga, `${n}.json`), 'utf8'),
      );
      run('import', nova, antiga);
      const depois = ['queue', 'meta', 'log'].map((n) =>
        readFileSync(path.join(antiga, `${n}.json`), 'utf8'),
      );
      expect(depois).toEqual(antes);
    },
    TEMPO_SUBPROCESSOS,
  );

  it(
    'registra no log "importado de <pasta antiga>: <n> linhas (<k> em andamento); exclusivas …; holds …; merged <m>"',
    () => {
      run('import', nova, antiga);
      const log = logTexts(nova);
      expect(log).toHaveLength(1);
      expect(log[0]).toBe(
        `importado de ${antiga}: 6 linhas (1 em andamento); exclusivas #883; holds #898 apagado, #910 mantido, ` +
          '#920 mantido; merged 2',
      );
    },
    TEMPO_SUBPROCESSOS,
  );

  it(
    'a fila importada marca o que falta publicar e as vagas são recalculadas',
    () => {
      run('import', nova, antiga);
      const m = json(nova, 'meta')[0]!;
      expect((m.unpublished as { files: string[] }).files).toEqual([
        'queue.json',
        'meta.json',
        'log.json',
      ]);
      expect(typeof m.vagas).toBe('string');
      const show = run('show', nova);
      expect(show).toContain('fila: 6 linhas');
      // as linhas sem ficha no painel antigo (#910 e #911) entram nas fichas a refazer
      expect(show).toContain('fichas a refazer: #910 #911');
    },
    TEMPO_SUBPROCESSOS,
  );

  it(
    'o import não entra no lote do apply',
    () => {
      const lote = path.join(raiz, 'lote.txt');
      writeFileSync(lote, `import ${antiga}\n`);
      const r = runRaw('apply', nova, lote);
      expect(r.status).toBe(2);
      expect(r.stderr).toContain('linha 1');
    },
    TEMPO_SUBPROCESSOS,
  );
});

describe('SKILL.md — troca a quente e importar= (FM7)', () => {
  const skill = readFileSync(SKILL, 'utf8');

  it('"Na sessão nova" cita upgrade, a troca da página e o role', () => {
    const s = section(skill, '## Troca de sessão');
    const nova1 = s.slice(s.indexOf('**Na sessão nova**'));
    expect(nova1).toContain('painel.py upgrade');
    expect(nova1).toMatch(/files\/index\.html/);
    expect(nova1).toMatch(/página/);
    expect(nova1).toContain('role <pasta> coordenador');
  });

  it('"Argumentos" cita importar= como opcional', () => {
    const s = section(skill, '## Argumentos');
    expect(s).toContain('importar=<url do painel antigo>');
    expect(s).toMatch(/importar=[^\n]*opcional/);
  });

  it('"Painel" descreve o caminho do importar', () => {
    const s = section(skill, '## Painel');
    expect(s).toContain('importar=');
    expect(s).toContain('painel.py import');
    expect(s).toMatch(/datasets/);
    expect(s).toContain('init');
  });

  it('o passo 3 de "Fila" pede a ficha de todas as linhas importadas', () => {
    const s = section(skill, '## 2. Fila');
    const passo3 = s.slice(s.indexOf('3. Peça a ficha'), s.indexOf('4. **Ordem:**'));
    expect(passo3).toMatch(/importar=/);
    expect(passo3).toMatch(/todas as linhas importadas/);
  });

  it('quem importa com etapa em andamento é o coordenador que as tem e avisa as filhas', () => {
    const s = section(skill, '## Painel');
    expect(s).toMatch(/em andamento/);
    expect(s).toContain('O coordenador mudou');
  });
});
