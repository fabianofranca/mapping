// @vitest-environment node
// Fase FM3 (etapa #1532, decisões 5, 6 e 26): o painel guarda o custo, o contexto, o modelo e o
// esforço de cada sessão da fila (`session kind=`, `cost`, `costs`, linha `custo:` do `show`, card
// "Custo da fila"), e as filhas nascem com o esforço da tabela, conferido depois da criação.
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { section } from '../support/textSlice';

const SCRIPT = '.claude/skills/implementar-fila/painel/painel.py';
const BASE = '.claude/skills/implementar-fila';

let dir = '';

function run(...args: string[]): string {
  return execFileSync('python3', [SCRIPT, ...args], { encoding: 'utf8' });
}

function runAt(now: string, ...args: string[]): string {
  return run('--now', now, ...args);
}

function tryRun(...args: string[]) {
  const r = spawnSync('python3', [SCRIPT, ...args], { encoding: 'utf8' });
  return { code: r.status, out: r.stdout, err: r.stderr };
}

type Entry = Record<string, unknown>;

function json(name: string): Array<Record<string, unknown>> {
  return JSON.parse(readFileSync(path.join(dir, `${name}.json`), 'utf8')) as Array<
    Record<string, unknown>
  >;
}

function sessions(): Entry[] {
  return (json('meta')[0]!.sessions ?? []) as Entry[];
}

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'painel-custo-'));
  runAt('2026-11-11T10:00:00Z', 'init', dir);
  runAt('2026-11-11T10:00:00Z', 'row', dir, '#10', 'title=Etapa dez');
  runAt('2026-11-11T10:00:00Z', 'row', dir, '#20', 'title=Etapa vinte');
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('painel.py session com kind= (FM3, decisão 5)', () => {
  it('com kind= e label=, acrescenta a meta.sessions sem repetir, com created', () => {
    runAt(
      '2026-11-11T11:00:00Z',
      'session',
      dir,
      '#10',
      'sess_a',
      'kind=fase',
      'label=FM3',
    );
    runAt(
      '2026-11-11T11:05:00Z',
      'session',
      dir,
      '#10',
      'sess_a',
      'kind=fase',
      'label=FM3',
    );
    expect(sessions()).toEqual([
      {
        id: 'sess_a',
        issue: '#10',
        kind: 'fase',
        label: 'FM3',
        created: '2026-11-11T11:00:00Z',
      },
    ]);
    expect(json('queue')[0]!.sessions).toBe('sess_a');
  });

  it('aceita os sete tipos e recusa outro com código 2', () => {
    for (const kind of [
      'fase',
      'correção',
      'testador',
      'reteste',
      'fechamento',
      'coordenador',
      'supervisor',
    ]) {
      runAt('2026-11-11T11:00:00Z', 'session', dir, '#10', `s_${kind}`, `kind=${kind}`);
    }
    expect(sessions()).toHaveLength(7);
    const bad = tryRun('session', dir, '#10', 'sess_x', 'kind=geral');
    expect(bad.code).toBe(2);
    expect(bad.err).toMatch(/kind inválido/);
    expect(sessions()).toHaveLength(7);
  });

  it('sem kind, continua gravando só o sessions da linha, como hoje', () => {
    run('session', dir, '#10', 'sess_a');
    expect(json('queue')[0]!.sessions).toBe('sess_a');
    expect(json('meta')[0]!.sessions).toBeUndefined();
  });

  it('campo desconhecido sai com código 2', () => {
    expect(tryRun('session', dir, '#10', 'sess_a', 'kind=fase', 'foo=1').code).toBe(2);
  });
});

describe('painel.py cost (FM3, decisão 5)', () => {
  it('atualiza a entrada pelo id e grava at', () => {
    runAt(
      '2026-11-11T11:00:00Z',
      'session',
      dir,
      '#10',
      'sess_a',
      'kind=fase',
      'label=FM3',
    );
    runAt(
      '2026-11-11T12:00:00Z',
      'cost',
      dir,
      'sess_a',
      'usd=2.5',
      'ctx=180000',
      'model=claude-sonnet-5-5',
      'effort=high',
    );
    const e = sessions()[0]!;
    expect(e.kind).toBe('fase');
    expect(e.created).toBe('2026-11-11T11:00:00Z');
    expect(e.cost).toEqual({
      usd: 2.5,
      ctx: 180000,
      model: 'claude-sonnet-5-5',
      effort: 'high',
      at: '2026-11-11T12:00:00Z',
    });
    runAt('2026-11-11T13:00:00Z', 'cost', dir, 'sess_a', 'usd=3', 'ctx=200000');
    expect(sessions()).toHaveLength(1);
    expect((sessions()[0]!.cost as Entry).usd).toBe(3);
    expect((sessions()[0]!.cost as Entry).at).toBe('2026-11-11T13:00:00Z');
  });

  it('cria a entrada com issue= e kind=, e guarda served= quando vem', () => {
    runAt(
      '2026-11-11T12:00:00Z',
      'cost',
      dir,
      'sess_b',
      'usd=1',
      'ctx=1000',
      'model=claude-sonnet-5-5',
      'effort=medium',
      'served=claude-opus-5-5',
      'issue=#20',
      'kind=testador',
    );
    const e = sessions()[0]!;
    expect(e).toMatchObject({ id: 'sess_b', issue: '#20', kind: 'testador' });
    expect(e.created).toBeUndefined();
    expect((e.cost as Entry).served).toBe('claude-opus-5-5');
  });

  it('o kind é obrigatório quando o id é novo', () => {
    const r = tryRun('cost', dir, 'sess_c', 'usd=1', 'ctx=10');
    expect(r.code).toBe(2);
    expect(r.err).toMatch(/kind/);
    expect(sessions()).toHaveLength(0);
  });

  it.each([
    ['usd', ['usd=caro', 'ctx=10']],
    ['ctx', ['usd=1', 'ctx=muito']],
    ['usd ausente', ['ctx=10']],
  ])('%s não numérico ou ausente sai com código 2 e não grava', (_n, args) => {
    const r = tryRun('cost', dir, 'sess_d', ...args, 'kind=fase');
    expect(r.code).toBe(2);
    expect(sessions()).toHaveLength(0);
  });

  it('entra num apply, e costs não entra', () => {
    const ok = spawnSync('python3', [SCRIPT, 'apply', dir, '-'], {
      encoding: 'utf8',
      input: 'cost sess_e usd=1 ctx=5 kind=coordenador\n',
    });
    expect(ok.status).toBe(0);
    const bad = spawnSync('python3', [SCRIPT, 'apply', dir, '-'], {
      encoding: 'utf8',
      input: 'costs\n',
    });
    expect(bad.status).toBe(2);
  });
});

function seed(): void {
  const t = '2026-11-11T11:00:00Z';
  runAt(t, 'session', dir, '#10', 'f1', 'kind=fase', 'label=FM1');
  runAt(t, 'session', dir, '#10', 'f2', 'kind=fase', 'label=FM2');
  runAt(t, 'session', dir, '#20', 't1', 'kind=testador');
  const c = (id: string, usd: string) =>
    runAt('2026-11-11T12:00:00Z', 'cost', dir, id, `usd=${usd}`, 'ctx=1000');
  c('f1', '2');
  c('f2', '4');
  c('t1', '5');
}

describe('painel.py costs e a linha custo: do show (FM3, decisões 5 e 26)', () => {
  it('imprime o total, uma linha por tipo (sessões, US$ e mediana) e uma por etapa', () => {
    seed();
    const out = run('costs', dir);
    expect(out).toMatch(/^custo total: US\$ 11\.00 em 3 sessões$/m);
    expect(out).toMatch(/^ {2}fase: 2 sessões, US\$ 6\.00, mediana US\$ 3\.00$/m);
    expect(out).toMatch(/^ {2}testador: 1 sessões, US\$ 5\.00, mediana US\$ 5\.00$/m);
    expect(out).toMatch(/^ {2}#10: 2 sessões, US\$ 6\.00$/m);
    expect(out).toMatch(/^ {2}#20: 1 sessões, US\$ 5\.00$/m);
    expect(out).not.toMatch(/correção:/);
  });

  it('com --desde, conta só as com created a partir da data; cost sem session fica fora', () => {
    seed();
    runAt(
      '2026-11-11T09:00:00Z',
      'cost',
      dir,
      'velha',
      'usd=50',
      'ctx=1',
      'kind=fase',
      'issue=#10',
    );
    runAt('2026-11-11T14:00:00Z', 'session', dir, '#20', 'f3', 'kind=fase');
    runAt('2026-11-11T14:30:00Z', 'cost', dir, 'f3', 'usd=1', 'ctx=1');
    const todas = run('costs', dir);
    expect(todas).toMatch(/US\$ 62\.00 em 5 sessões/);
    const desde = run('costs', '--desde', '2026-11-11T11:00:00Z', dir);
    expect(desde).toMatch(/^custo total: US\$ 12\.00 em 4 sessões$/m);
    expect(desde).not.toMatch(/50\.00/);
    const depois = run('costs', '--desde', '2026-11-11T13:00:00Z', dir);
    expect(depois).toMatch(/^custo total: US\$ 1\.00 em 1 sessões$/m);
  });

  it('sem custo gravado, costs e show dizem "—"', () => {
    expect(run('costs', dir)).toMatch(/^custo total: —$/m);
    expect(run('show', dir)).toMatch(/^custo: —$/m);
  });

  it('o show imprime custo: US$ <total> em <k> sessões', () => {
    seed();
    expect(run('show', dir)).toMatch(/^custo: US\$ 11\.00 em 3 sessões$/m);
  });

  it('costs não grava nada', () => {
    seed();
    const antes = readFileSync(path.join(dir, 'meta.json'), 'utf8');
    run('costs', dir);
    expect(readFileSync(path.join(dir, 'meta.json'), 'utf8')).toBe(antes);
  });

  it('--desde inválido sai com código 2', () => {
    expect(tryRun('costs', '--desde', 'ontem', dir).code).toBe(2);
  });
});

describe('página: o card "Custo da fila" (FM3, decisão 5)', () => {
  const page = readFileSync(`${BASE}/painel/index.html`, 'utf8');

  it('lê meta.sessions num dash.calc e mostra "—" sem ele', () => {
    expect(page).toContain('Custo da fila');
    expect(page).toMatch(/dash\.calc\('custo'/);
    expect(page).toMatch(/\.sessions/);
    expect(page).toMatch(/'—'/);
  });

  it('o texto do card vai por textContent, sem innerHTML', () => {
    const script = page.slice(page.indexOf('<script>'));
    expect(script).toMatch(/mp-custo/);
    expect(script).toMatch(/textContent/);
    expect(script).not.toMatch(/innerHTML|insertAdjacentHTML/);
  });
});

describe('implementar-fila/SKILL.md: esforço e custo (FM3, decisões 5 e 6)', () => {
  const skill = readFileSync(`${BASE}/SKILL.md`, 'utf8');
  const porEtapa = section(skill, '## 3. Por etapa');

  it('o passo 2 manda o effort da linha do coordenador no create_session', () => {
    expect(porEtapa).toMatch(/`effort`/);
    expect(porEtapa).toMatch(/`fases=` da ficha/);
    expect(porEtapa).toMatch(/com ou sem `modelo=tabela`/);
  });

  it('o testador e o reteste levam o esforço da coluna Testador, e a correção, medium', () => {
    expect(porEtapa).toMatch(/coluna Testador/);
    expect(porEtapa).toMatch(/correção[^\n]*`medium`/);
  });

  it('o subagente do ciclo confere o effort_level; se diferir, log, e a fila segue', () => {
    expect(porEtapa).toMatch(/`effort_level`/);
    expect(porEtapa).toMatch(/diferir[^\n]*`log`/);
  });

  it('recusa por causa do effort: cria a sessão sem ele e põe o caso no log', () => {
    expect(porEtapa).toMatch(/recusad[ao][^\n]*`effort`[^\n]*sem ele[^\n]*`log`/);
  });

  it('o "Arquivar as sessões" grava o custo da filha no mesmo apply', () => {
    const arquivar = skill.slice(skill.indexOf('**Arquivar as sessões**'));
    const bloco = arquivar.slice(0, arquivar.indexOf('**Conferências de reserva:**'));
    expect(bloco).toMatch(/painel\.py cost/);
    expect(bloco).toMatch(/mesmo subagente/);
    expect(bloco).toMatch(/mesmo `apply`/);
  });

  it('a "Troca de sessão" grava o custo do coordenador antes do sucessor', () => {
    const troca = section(skill, '## Troca de sessão');
    expect(troca).toMatch(/painel\.py cost[^\n]*kind=coordenador/);
    expect(troca).toMatch(/antes de criar o sucessor/);
  });

  it('o "Fim" ganha a coluna US$ e o total', () => {
    const fim = section(skill, '## Fim');
    expect(fim).toMatch(/coluna US\$/);
    expect(fim).toMatch(/painel\.py costs/);
  });

  it('o "Painel" lista session com kind=, cost e costs, e a linha custo: do show', () => {
    const painel = section(skill, '## Painel');
    expect(painel).toMatch(/painel\.py session <pasta> '#n' <id> kind=/);
    expect(painel).toMatch(/painel\.py cost <pasta> <id> usd=/);
    expect(painel).toMatch(/painel\.py costs \[--desde <ISO>\] <pasta>/);
    expect(painel).toMatch(/`custo:`/);
    expect(painel).toMatch(/costs --desde <hora da troca a quente>/);
  });

  it('a comparação com a linha de base é costs --desde da hora da troca a quente', () => {
    expect(skill).toMatch(/costs --desde <hora da troca a quente>/);
  });
});

describe('docs: o effort do create_session (FM3, decisão 6)', () => {
  it('docs/PROCESS.md não diz mais "escolhe o modelo e não o esforço"', () => {
    const process = readFileSync('docs/PROCESS.md', 'utf8');
    expect(process).not.toMatch(/escolhe o modelo e não o esforço/);
    expect(process).toMatch(/`effort` do `create_session`/);
  });

  it('docs/FLOW.md manda o effort da tabela no create_session', () => {
    const flow = readFileSync('docs/FLOW.md', 'utf8');
    const passo = section(flow, '## Orquestrador — passo a passo');
    expect(passo).toMatch(/`effort`[^\n]*tabela/);
  });

  it('detalhar-backlog não diz mais "só aceitaria o modelo"', () => {
    const skill = readFileSync('.claude/skills/detalhar-backlog/SKILL.md', 'utf8');
    expect(skill).not.toMatch(/só aceitaria o modelo/);
  });
});
