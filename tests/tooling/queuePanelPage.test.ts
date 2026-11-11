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
function loadPanel(meta: Row): Panel {
  const parsed = new DOMParser().parseFromString(readFileSync(PAGE, 'utf8'), 'text/html');
  const script = parsed.querySelector('script')?.textContent ?? '';
  document.body.replaceChildren(...Array.from(parsed.body.childNodes));

  const datasets: Record<string, Row[]> = { queue: [], meta: [meta], log: [] };
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
