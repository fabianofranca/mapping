// Fase MT1 (etapa #1619): a página do painel da fila lê os campos-lista do `meta` (`sessions`,
// `vagasItens`, `requests` e `rules`) como lista ou como texto JSON, que é como o tipo Dashboard
// entrega à página a lista aninhada de uma linha. O teste carrega a página com um `dash` falso.
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const PAGE = '.claude/skills/implementar-fila/painel/index.html';

type Row = Record<string, unknown>;
type CalcSpec = { inputs: string[]; fn: (...datasets: Row[][]) => Row[] };
type DataResult = { status: 'ok'; data: Row[] } | { status: 'failed'; message: string };

interface Panel {
  data: (id: string) => DataResult;
  render: () => void;
}

/** Monta a página no `document` e roda o `<script>` dela com um `dash` falso. */
function loadPanel(meta: Row, queue: Row[] = []): Panel {
  const parsed = new DOMParser().parseFromString(readFileSync(PAGE, 'utf8'), 'text/html');
  const script = parsed.querySelector('script')?.textContent ?? '';
  document.body.replaceChildren(...Array.from(parsed.body.childNodes));

  const datasets: Record<string, Row[]> = { queue, meta: [meta], log: [] };
  const calcs = new Map<string, CalcSpec>();
  let onData: () => void = () => undefined;
  const data = (id: string): DataResult => {
    const calc = calcs.get(id);
    if (!calc) return { status: 'ok', data: datasets[id] ?? [] };
    try {
      return {
        status: 'ok',
        data: calc.fn(...calc.inputs.map((i) => datasets[i] ?? [])),
      };
    } catch (error) {
      return { status: 'failed', message: String((error as Error).message) };
    }
  };
  const dash = {
    calc: (id: string, spec: CalcSpec) => calcs.set(id, spec),
    data,
    onData: (cb: () => void) => {
      onData = cb;
    },
  };
  new Function('dash', 'setInterval', script)(dash, () => 0);
  return { data, render: () => onData() };
}

const text = (selector: string) => document.querySelector(selector)?.textContent;
const items = (selector: string) =>
  Array.from(document.querySelectorAll(`${selector} li`)).map((li) => li.textContent);
const rows = (selector: string) =>
  Array.from(document.querySelectorAll(`${selector} tbody tr`)).map((tr) =>
    Array.from(tr.children).map((td) => td.textContent),
  );

const SESSIONS = [
  { id: 's1', kind: 'fase', issue: '#10', cost: { usd: 1.5 } },
  { id: 's2', kind: 'fase', issue: '#20', cost: { usd: 2.25 } },
  { id: 's3', kind: 'testador', issue: '#10', cost: { usd: 0.5 } },
  { id: 's4', kind: 'coordenador', issue: '#10' },
];
const VAGAS = ['Vaga 1: livre porque a #10 espera o dono', 'Vaga 2: ocupada'];
const REQUESTS = [
  { id: 'SUP-1', tipo: 'A', pedido: 'trocar a página', estado: 'concluído' },
];
const RULES = [
  { id: 'R1', origem: 'dono', texto: 'não mesclar sem pedir' },
  { id: 'R2', origem: 'SUP-1', texto: 'regra antiga', endedAt: '2026-11-10T10:00:00Z' },
];

/** A saída esperada dos cards quando os quatro campos chegam ao `meta`. */
function expectFilledCards(panel: Panel): void {
  expect(panel.data('custo').status).toBe('ok');
  expect(text('#mp-custo-total')).toBe('US$ 4.25 em 3 sessões');
  expect(rows('#mp-custo')).toEqual([
    ['Tipo: fase', '2', '3.75', '1.88'],
    ['Tipo: testador', '1', '0.50', '0.50'],
    ['Etapa: #10', '2', '2.00', '1.00'],
    ['Etapa: #20', '1', '2.25', '2.25'],
  ]);
  expect(items('#mp-vagas')).toEqual(VAGAS);
  expect(text('#mp-cur')).toContain(`· ${VAGAS[0]}`);
  expect(items('#mp-pedidos')).toEqual(['SUP-1 (tipo A): trocar a página — concluído']);
  expect(items('#mp-regras')).toEqual(['R1 (dono): não mesclar sem pedir']);
}

beforeEach(() => {
  document.body.replaceChildren();
});
afterEach(() => {
  document.body.replaceChildren();
});

describe('página do painel da fila: campos-lista do meta', () => {
  it('(a) lê os quatro campos quando chegam como texto JSON', () => {
    const panel = loadPanel({
      sessions: JSON.stringify(SESSIONS),
      vagasItens: JSON.stringify(VAGAS),
      requests: JSON.stringify(REQUESTS),
      rules: JSON.stringify(RULES),
    });
    panel.render();
    expectFilledCards(panel);
  });

  it('(b) lê os mesmos campos como listas de verdade', () => {
    const panel = loadPanel({
      sessions: SESSIONS,
      vagasItens: VAGAS,
      requests: REQUESTS,
      rules: RULES,
    });
    panel.render();
    expectFilledCards(panel);
  });

  it('(c) sem os quatro campos: "—" nos cards e o split do campo vagas', () => {
    const panel = loadPanel({ vagas: 'Vaga 1: livre · Vaga 2: ocupada' });
    panel.render();
    expect(panel.data('custo').status).toBe('ok');
    expect(text('#mp-custo-total')).toBe('—');
    expect(items('#mp-pedidos')).toEqual(['—']);
    expect(items('#mp-regras')).toEqual(['—']);
    expect(items('#mp-vagas')).toEqual(['Vaga 1: livre', 'Vaga 2: ocupada']);
  });

  it.each(['[{', '{}', '3'])(
    '(d) texto %j não derruba nada e os cards mostram "—"',
    (invalid) => {
      const panel = loadPanel({
        sessions: invalid,
        vagasItens: invalid,
        requests: invalid,
        rules: invalid,
        vagas: 'Vaga 1: livre · Vaga 2: ocupada',
      });
      expect(() => panel.render()).not.toThrow();
      expect(panel.data('custo').status).toBe('ok');
      expect(text('#mp-custo-total')).toBe('—');
      expect(items('#mp-pedidos')).toEqual(['—']);
      expect(items('#mp-regras')).toEqual(['—']);
      expect(items('#mp-vagas')).toEqual(['Vaga 1: livre', 'Vaga 2: ocupada']);
    },
  );
});

/** Uma linha da fila com os campos que a tabela lê. */
function fila(over: Row): Row {
  return {
    order: 1,
    issue: '#1085',
    title: 'Etapa',
    kind: 'etapa',
    status: 'em andamento',
    step: '',
    pr: '',
    phases: '',
    phasesTotal: 0,
    phasesDone: 0,
    ...over,
  };
}

/** As células `td` da primeira linha da tabela "Passo a passo". */
const cells = () =>
  Array.from(document.querySelectorAll('#mp-table tbody tr:first-child td'));

const chips = (td: Element | undefined) =>
  Array.from(td?.querySelectorAll('.chip') ?? []).map((c) => ({
    text: c.textContent,
    classes: Array.from(c.classList).filter((k) => k !== 'chip'),
    title: c.getAttribute('title'),
  }));

describe('página do painel da fila: célula "Fases" (PF1, decisão 8)', () => {
  it('em andamento D1:ok|D2:open|D3:todo: "1 / 3", com ok, now e todo e os title', () => {
    const panel = loadPanel({}, [
      fila({ phases: 'D1:ok|D2:open|D3:todo', phasesTotal: 3, phasesDone: 1 }),
    ]);
    panel.render();
    const td = cells()[4];
    expect(td?.firstElementChild?.firstElementChild?.textContent).toBe('1 / 3');
    expect(chips(td)).toEqual([
      { text: 'D1', classes: ['ok'], title: 'D1: concluída' },
      { text: 'D2', classes: ['now'], title: 'D2: aberta' },
      { text: 'D3', classes: ['todo'], title: 'D3: por fazer' },
    ]);
  });

  it('aguardando D1:todo|D2:todo: "0 / 2", sem now', () => {
    const panel = loadPanel({}, [
      fila({
        status: 'aguardando',
        phases: 'D1:todo|D2:todo',
        phasesTotal: 2,
        phasesDone: 0,
      }),
    ]);
    panel.render();
    const td = cells()[4];
    expect(td?.firstElementChild?.firstElementChild?.textContent).toBe('0 / 2');
    expect(td?.querySelector('.now')).toBeNull();
    expect(chips(td).map((c) => c.classes)).toEqual([['todo'], ['todo']]);
  });

  it('a linha antiga em andamento A1:ok|A2:open|A3:open: só a A2 com now', () => {
    const panel = loadPanel({}, [
      fila({ phases: 'A1:ok|A2:open|A3:open', phasesTotal: 3, phasesDone: 1 }),
    ]);
    panel.render();
    const td = cells()[4];
    expect(chips(td).map((c) => c.classes)).toEqual([['ok'], ['now'], []]);
  });
});

describe('página do painel da fila: links da issue e do PR (PF1, decisão 14)', () => {
  const BASE = 'https://github.com/fabianofranca/mapping';

  it('a célula da issue vira link exato para a issue, com o mesmo texto', () => {
    loadPanel({}, [fila({ issue: '#1085', pr: '1234' })]).render();
    const a = cells()[1]?.querySelector('a');
    expect(a?.getAttribute('href')).toBe(`${BASE}/issues/1085`);
    expect(cells()[1]?.textContent).toBe('#1085');
  });

  it('a célula do PR vira link exato para o PR, com o mesmo texto', () => {
    loadPanel({}, [fila({ issue: '#1085', pr: '1234' })]).render();
    const a = cells()[8]?.querySelector('a');
    expect(a?.getAttribute('href')).toBe(`${BASE}/pull/1234`);
    expect(cells()[8]?.textContent).toBe('1234');
  });

  it('o PR numérico em número (não texto) também vira link', () => {
    loadPanel({}, [fila({ pr: 77 })]).render();
    expect(cells()[8]?.querySelector('a')?.getAttribute('href')).toBe(`${BASE}/pull/77`);
    expect(cells()[8]?.textContent).toBe('77');
  });

  it('o PR vazio fica sem a e sem texto; o valor que não casa fica como texto, sem a', () => {
    loadPanel({}, [fila({ pr: '' })]).render();
    expect(cells()[8]?.querySelector('a')).toBeNull();
    expect(cells()[8]?.textContent).toBe('');

    loadPanel({}, [fila({ issue: 'abc', pr: 'x' })]).render();
    expect(cells()[1]?.querySelector('a')).toBeNull();
    expect(cells()[1]?.textContent).toBe('abc');
    expect(cells()[8]?.querySelector('a')).toBeNull();
    expect(cells()[8]?.textContent).toBe('x');

    loadPanel({}, [fila({ pr: 'PR #7' })]).render();
    expect(cells()[8]?.querySelector('a')).toBeNull();
    expect(cells()[8]?.textContent).toBe('PR #7');
  });

  it('os dois a levam target="_blank" e rel="noopener"', () => {
    loadPanel({}, [fila({ issue: '#1085', pr: '1234' })]).render();
    for (const i of [1, 8]) {
      const a = cells()[i]?.querySelector('a');
      expect(a?.getAttribute('target')).toBe('_blank');
      expect(a?.getAttribute('rel')).toBe('noopener');
    }
  });
});
