// @vitest-environment node
// Fase FM3 (etapa #1532, decisões 5, 6 e 26): o painel guarda o custo, o contexto, o modelo e o
// esforço de cada sessão da fila (`session kind=`, `cost`, `costs`, linha `custo:` do `show`, card
// "Custo da fila"), e as filhas nascem com o esforço da tabela, conferido depois da criação.
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { between, section } from '../support/textSlice';

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

describe('achados da revisão (FM3)', () => {
  it('ctx infinito ou enorme sai com código 2, sem traceback', () => {
    for (const ctx of ['inf', 'nan', '1e999']) {
      const r = tryRun('cost', dir, 'sess_i', 'usd=1', `ctx=${ctx}`, 'kind=fase');
      expect(r.code).toBe(2);
      expect(r.err).not.toMatch(/Traceback/);
    }
  });

  it('um cost novo não apaga model, effort e served já gravados', () => {
    runAt(
      '2026-11-11T12:00:00Z',
      'cost',
      dir,
      'sess_m',
      'usd=1',
      'ctx=10',
      'model=claude-sonnet-5-5',
      'effort=high',
      'served=claude-opus-5-5',
      'kind=coordenador',
    );
    runAt('2026-11-11T13:00:00Z', 'cost', dir, 'sess_m', 'usd=2', 'ctx=20');
    expect(sessions()[0]!.cost).toEqual({
      usd: 2,
      ctx: 20,
      model: 'claude-sonnet-5-5',
      effort: 'high',
      served: 'claude-opus-5-5',
      at: '2026-11-11T13:00:00Z',
    });
  });

  it('registrar de novo a sessão sem label não apaga o label', () => {
    run('session', dir, '#10', 'sess_l', 'kind=testador', 'label=bloco2');
    run('session', dir, '#10', 'sess_l', 'kind=testador');
    expect(sessions()[0]!.label).toBe('bloco2');
  });

  it('entrada com cost sem usd não derruba o show nem o costs', () => {
    run('session', dir, '#10', 'sess_p', 'kind=fase');
    const file = path.join(dir, 'meta.json');
    const m = json('meta');
    (m[0]!.sessions as Entry[])[0]!.cost = { ctx: 1 };
    writeFileSync(file, JSON.stringify(m));
    expect(run('show', dir)).toMatch(/^custo: US\$ 0\.00 em 1 sessões$/m);
    expect(run('costs', dir)).toMatch(/^custo total: US\$ 0\.00 em 1 sessões$/m);
  });

  it('o costs ordena as etapas pelo número e os tipos pela ordem do fluxo', () => {
    for (const [issue, id] of [
      ['#1000', 'a'],
      ['#999', 'b'],
    ] as const) {
      runAt('2026-11-11T10:00:00Z', 'row', dir, issue, 'title=X');
      runAt('2026-11-11T11:00:00Z', 'session', dir, issue, id, 'kind=testador');
      runAt('2026-11-11T11:00:00Z', 'cost', dir, id, 'usd=1', 'ctx=1');
    }
    runAt('2026-11-11T11:00:00Z', 'session', dir, '#10', 'c', 'kind=fase');
    runAt('2026-11-11T11:00:00Z', 'cost', dir, 'c', 'usd=1', 'ctx=1');
    const out = run('costs', dir);
    expect(out.indexOf('#10:')).toBeLessThan(out.indexOf('#999:'));
    expect(out.indexOf('#999:')).toBeLessThan(out.indexOf('#1000:'));
    expect(out.indexOf('  fase:')).toBeLessThan(out.indexOf('  testador:'));
  });

  it('a página ordena como o costs (tipos do fluxo, etapas pelo número)', () => {
    const page = readFileSync(`${BASE}/painel/index.html`, 'utf8');
    expect(page).toMatch(/KINDS\s*=\s*\[\s*'fase',\s*'correção',\s*'testador'/);
    expect(page).toMatch(/localeCompare\([^)]*numeric/);
  });

  it('o SKILL manda gravar o custo em todo caminho que arquiva', () => {
    const skill = readFileSync(`${BASE}/SKILL.md`, 'utf8');
    const porEtapa = section(skill, '## 3. Por etapa');
    const fim = section(skill, '## Fim');
    expect(porEtapa.split('\n').find((l) => l.includes('arquive o que sobrou'))).toMatch(
      /painel\.py cost/,
    );
    expect(fim.split('\n').find((l) => l.startsWith('4. '))).toMatch(/painel\.py cost/);
    expect(
      porEtapa.split('\n').find((l) => l.includes('Quando um testador avisar')),
    ).toMatch(/painel\.py cost/);
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

describe('painel.py cost e upgrade (achados da revisão do fechamento)', () => {
  it('cost de sessão nova (sem created) entra em costs --desde pela hora do custo', () => {
    runAt('2026-11-11T10:00:00Z', 'cost', dir, 's1', 'usd=1', 'ctx=10', 'kind=fase');
    const out = run('costs', dir, '--desde', '2026-11-11T00:00:00Z');
    expect(out).toMatch(/1[,.]00/);
  });

  it('cost guarda a issue normalizada (sem espaços)', () => {
    runAt(
      '2026-11-11T10:00:00Z',
      'cost',
      dir,
      's1',
      'usd=1',
      'ctx=10',
      'kind=fase',
      'issue= #10 ',
    );
    expect(sessions()[0]!.issue).toBe('#10');
  });

  it('upgrade sem mudança dentro do apply não imprime alterados: duas vezes', () => {
    const r = spawnSync('python3', [SCRIPT, 'apply', dir, '-'], {
      encoding: 'utf8',
      input: 'upgrade\nlog "x"\n',
    });
    expect(r.stdout.match(/alterados:/g)).toHaveLength(1);
  });
});

describe('painel.py: o teto de 300 mil do testador (TC2, decisão 9 da #1639)', () => {
  const at = '2026-11-11T12:00:00Z';

  function custo(id: string, kind: string, ctx: number, issue = '#20', label = '') {
    runAt(
      at,
      'session',
      dir,
      issue,
      id,
      `kind=${kind}`,
      ...(label ? [`label=${label}`] : []),
    );
    return runAt(at, 'cost', dir, id, 'usd=3', `ctx=${ctx}`);
  }

  it.each(['testador', 'reteste'])(
    'cost de %s com ctx=300001 grava, sai com 0 e avisa o excesso',
    (kind) => {
      runAt(at, 'session', dir, '#20', 'sess_t', `kind=${kind}`, 'label=grupo1-R25');
      const r = tryRun('--now', at, 'cost', dir, 'sess_t', 'usd=3', 'ctx=300001');
      expect(r.code).toBe(0);
      expect(r.out).toMatch(/^acima do teto do testador \(300 mil\): sess_t 300001$/m);
      expect((sessions()[0]!.cost as Entry).ctx).toBe(300001);
    },
  );

  it('cost de sessão nova com kind=testador na própria chamada também avisa', () => {
    const out = runAt(at, 'cost', dir, 'sess_n', 'usd=1', 'ctx=400000', 'kind=testador');
    expect(out).toMatch(/acima do teto do testador \(300 mil\): sess_n 400000/);
  });

  it('com ctx=300000, ou com kind=fase acima do teto, não avisa', () => {
    expect(custo('sess_a', 'testador', 300000)).not.toMatch(/acima do teto/);
    expect(custo('sess_b', 'fase', 450000)).not.toMatch(/acima do teto/);
    expect(custo('sess_c', 'coordenador', 450000)).not.toMatch(/acima do teto/);
  });

  it('o aviso sai dentro de um apply, sem impedir a gravação', () => {
    const r = spawnSync('python3', [SCRIPT, 'apply', dir, '-'], {
      encoding: 'utf8',
      input: 'cost sess_e usd=1 ctx=350000 kind=testador\n',
    });
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/acima do teto do testador \(300 mil\): sess_e 350000/);
    expect((sessions()[0]!.cost as Entry).ctx).toBe(350000);
  });

  it('o show lista testador acima do teto: etapa, rótulo e ctx em mil', () => {
    custo('sess_a', 'testador', 339000, '#20', 'grupo2-R3-R13');
    custo('sess_b', 'reteste', 523000, '#10', 'reteste1');
    custo('sess_c', 'testador', 271000, '#10', 'grupo3-R17');
    custo('sess_d', 'fase', 600000, '#10', 'TC2');
    const linha = run('show', dir).match(/^testador acima do teto: (.*)$/m);
    expect(linha).not.toBeNull();
    expect(linha![1]).toContain('#20 grupo2-R3-R13 339k');
    expect(linha![1]).toContain('#10 reteste1 523k');
    expect(linha![1]).not.toContain('grupo3-R17');
    expect(linha![1]).not.toContain('TC2');
  });

  it('o show não lista etapa concluída nem a que está em meta.merged', () => {
    custo('sess_a', 'testador', 339000, '#20', 'grupo2');
    custo('sess_b', 'testador', 523000, '#10', 'grupo1');
    expect(run('show', dir)).toMatch(/^testador acima do teto: .*#20 grupo2 339k/m);
    runAt(at, 'row', dir, '#20', 'status=concluída');
    const depois = run('show', dir);
    expect(depois).not.toMatch(/#20 grupo2/);
    expect(depois).toMatch(/#10 grupo1 523k/);
    runAt(at, 'merged', dir, '#10');
    expect(run('show', dir)).toMatch(/^testador acima do teto: nenhum$/m);
  });

  it('o show diz nenhum sem excesso e com o custo sem rótulo usa o id', () => {
    expect(run('show', dir)).toMatch(/^testador acima do teto: nenhum$/m);
    custo('sess_a', 'testador', 300000);
    expect(run('show', dir)).toMatch(/^testador acima do teto: nenhum$/m);
    custo('sess_semrotulo', 'testador', 310000);
    expect(run('show', dir)).toMatch(
      /^testador acima do teto: #20 sess_semrotulo 310k$/m,
    );
  });

  it('o show arredonda o contexto para cima: acima do teto nunca aparece como 300k', () => {
    custo('sess_a', 'testador', 300001, '#20', 'grupo2');
    expect(run('show', dir)).toMatch(/^testador acima do teto: #20 grupo2 301k$/m);
  });

  it('o show não grava nada e a página index.html não muda', () => {
    custo('sess_a', 'testador', 339000, '#20', 'grupo2');
    const antes = JSON.stringify(json('meta'));
    run('show', dir);
    expect(JSON.stringify(json('meta'))).toBe(antes);
    const pagina = readFileSync(`${BASE}/painel/index.html`, 'utf8');
    expect(pagina).not.toMatch(/acima do teto/);
  });
});

describe('docs e skill: o teto do testador conferido pela fila (TC2, decisões 8 a 10)', () => {
  const skill = readFileSync(`${BASE}/SKILL.md`, 'utf8');
  const nuvem = readFileSync('docs/TESTING-NUVEM.md', 'utf8');
  const flow = readFileSync('docs/FLOW.md', 'utf8');

  it('o item Testador e o "Arquivar as sessões" gravam o excesso no log, no mesmo apply do custo', () => {
    const porEtapa = section(skill, '## 3. Por etapa');
    const testador = porEtapa.slice(
      porEtapa.indexOf('3. **Testador.**'),
      porEtapa.indexOf('4. **Correção**'),
    );
    expect(testador).toMatch(/contexto <ctx>k acima do teto do testador/);
    expect(testador).toMatch(/mesmo `apply`/);
    const arquivar = skill.slice(skill.indexOf('**Arquivar as sessões**'));
    const custoItem = arquivar.slice(0, arquivar.indexOf('**Conferências de reserva:**'));
    expect(custoItem).toMatch(/<label>: contexto <ctx>k acima do teto do testador/);
    expect(custoItem).toMatch(/acima do teto do testador \(300 mil\)/);
    expect(custoItem).toMatch(/arredondado para cima/);
    expect(custoItem).toMatch(/sem rótulo, o id/);
  });

  it('o fechamento comenta cada excesso na roadmap fixa "Teto de contexto do testador"', () => {
    const porEtapa = section(skill, '## 3. Por etapa');
    const fechamento = porEtapa.slice(
      porEtapa.indexOf('5. **Fechamento**'),
      porEtapa.indexOf('6. **Merge**'),
    );
    expect(fechamento).toMatch(/"Teto de contexto do testador"/);
    expect(fechamento).toMatch(/no primeiro excesso/);
    expect(fechamento).toMatch(/Impacto: medium — menos custo recorrente do testador/);
    expect(fechamento).toMatch(/fica aberta/);
    expect(fechamento).toMatch(/antes de comentar ou criar, procure/);
  });

  it('o "Painel" documenta a linha nova do show e a saída do cost', () => {
    const painel = section(skill, '## Painel');
    expect(painel).toMatch(/`testador acima do teto:`/);
    expect(painel).toMatch(/acima do teto do testador \(300 mil\): <id> <ctx>/);
  });

  it('o "Contexto até 300 mil" não manda mais mover roteiros nem chamar o dono', () => {
    const i = nuvem.indexOf('**Contexto até 300 mil.**');
    const trecho = nuvem.slice(i, nuvem.indexOf('\n\n', i));
    expect(trecho).not.toMatch(/move roteiros entre os 5 blocos/);
    expect(trecho).not.toMatch(/chama o dono/);
    expect(trecho).toMatch(/toda sessão do testador/);
    expect(trecho).toMatch(/sessão principal/);
    expect(trecho).toMatch(/subagentes? por lote/);
    expect(trecho).toMatch(/sem segurar a etapa/);
    expect(trecho).toMatch(/Teto de contexto do testador/);
  });

  it('o modelo do resumo ganha a coluna Contexto e a linha Contexto:', () => {
    const resumo = between(flow, '## Resumo da rodada em blocos', '## Notificação final');
    expect(resumo).toMatch(
      /\| Bloco \| ✅ +\| ❌ +\| não executado \| Tempo +\| Contexto +\|/,
    );
    expect(resumo).toMatch(/\*\*Contexto:\*\* acima do teto \(300 mil\): .* ou nenhum/);
    expect(resumo).toMatch(/grupos/);
  });
});
