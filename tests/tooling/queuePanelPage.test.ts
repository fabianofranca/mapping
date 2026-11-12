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
  /** Troca o `meta` na mesma página (a seleção do grafo vive nela); o `render` o relê. */
  setMeta: (meta: Row) => void;
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
  return {
    data,
    render: () => onData(),
    setMeta: (m) => {
      datasets.meta = [m];
    },
  };
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
  expect(document.querySelector('#mp-vagas')).toBeNull();
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
    expect(document.querySelector('#mp-vagas')).toBeNull();
    expect(text('#mp-cur')).toContain('· Vaga 1: livre');
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
      expect(document.querySelector('#mp-vagas')).toBeNull();
      expect(text('#mp-cur')).toContain('· Vaga 1: livre');
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

// Fase GF2 (etapa #1761): o card "Dependências e ordem de entrada" desenha `meta.grafoNos` e
// `meta.grafoSetas` (lista ou texto JSON); a página só agrupa por onda e decide se a seta é vizinha.
type No = {
  issue: string;
  titulo: string;
  onda: number;
  rank: number | null;
  estado: string;
  motivo: string;
  fase: string;
  feitas: number;
  total: number;
};
const no = (over: Partial<No> & Pick<No, 'issue' | 'onda'>): No => ({
  titulo: `Etapa ${over.issue}`,
  rank: null,
  estado: 'dep',
  motivo: '',
  fase: '',
  feitas: 0,
  total: 0,
  ...over,
});
const NOS: No[] = [
  no({
    issue: '#1',
    onda: 0,
    estado: 'rodando',
    motivo: 'D2 implementando',
    fase: 'D2',
    feitas: 1,
    total: 3,
  }),
  no({ issue: '#2', onda: 0, rank: 1, estado: 'livre', motivo: 'começa' }),
  no({
    issue: '#3',
    onda: 1,
    rank: 2,
    estado: 'arquivo',
    motivo: 'arquivo a.ts com #1',
    total: 2,
  }),
  no({ issue: '#4', onda: 1, rank: 3, motivo: 'dep #1' }),
  no({ issue: '#5', onda: 2, rank: 4, motivo: 'dep #4' }),
  no({
    issue: '#6',
    onda: 3,
    rank: 5,
    estado: 'exclusiva',
    titulo: 'Título bem comprido da etapa exclusiva que espera a #2 e a #5',
    motivo: 'dep #2, #5',
  }),
  no({
    issue: '#7',
    onda: 3,
    rank: 6,
    estado: 'ficha',
    motivo: 'ficha incompleta (toca)',
  }),
  no({ issue: '#8', onda: 3, estado: 'segurada', motivo: 'esperando dono (decisão)' }),
];
const SETAS = [
  { de: '#1', para: '#3', tipo: 'arquivo' },
  { de: '#1', para: '#4', tipo: 'dep' },
  { de: '#4', para: '#5', tipo: 'dep' },
  { de: '#2', para: '#6', tipo: 'dep' },
  { de: '#5', para: '#6', tipo: 'dep' },
];
const GRAFO_VAGAS = ['Vagas 1/2', '#3 arquivo a.ts com #1', 'nenhuma ready elegível'];

const card = (issue: string) =>
  document.querySelector<HTMLButtonElement>(`#mp-grafo button[data-issue="${issue}"]`);
const faixas = () =>
  Array.from(document.querySelectorAll('#mp-grafo .faixa')).map((f) => ({
    rotulo: f.querySelector('.faixa-rot')?.textContent,
    issues: Array.from(f.querySelectorAll('button')).map((b) => b.dataset.issue),
  }));
const setas = () =>
  Array.from(document.querySelectorAll('#mp-grafo-setas path[data-de]')).map((p) => ({
    de: p.getAttribute('data-de'),
    para: p.getAttribute('data-para'),
    tipo: p.getAttribute('data-tipo'),
    longa: p.hasAttribute('data-longa'),
  }));

const FORMAS: Array<[string, (v: unknown) => unknown]> = [
  ['lista', (v) => v],
  ['texto JSON', (v) => JSON.stringify(v)],
];

describe.each(FORMAS)('página do painel da fila: grafo (GF2), %s', (_forma, wrap) => {
  const montar = (over: Row = {}) => {
    const panel = loadPanel({
      vagasItens: wrap(GRAFO_VAGAS),
      grafoNos: wrap(NOS),
      grafoSetas: wrap(SETAS),
      ...over,
    });
    panel.render();
    return panel;
  };

  it('uma faixa por onda, "Agora" e "Onda k", com os cards na ordem da lista', () => {
    montar();
    expect(faixas()).toEqual([
      { rotulo: 'Agora', issues: ['#1', '#2'] },
      { rotulo: 'Onda 1', issues: ['#3', '#4'] },
      { rotulo: 'Onda 2', issues: ['#5'] },
      { rotulo: 'Onda 3', issues: ['#6', '#7', '#8'] },
    ]);
    expect(document.querySelector('#mp-grafo-vagas')).not.toBeNull();
  });

  it('o card traz número, rótulo do estado, fase e progresso, motivo e o selo da ordem', () => {
    montar();
    const c1 = card('#1');
    expect(c1?.querySelector('.num')?.textContent).toBe('#1');
    expect(c1?.querySelector('.est')?.textContent).toBe('rodando');
    expect(c1?.querySelector('.prog')?.textContent).toBe('D2 · 1/3');
    expect(c1?.querySelector('.mot')?.textContent).toBe('D2 implementando');
    expect(c1?.querySelector('.selo')).toBeNull();
    expect(card('#2')?.querySelector('.selo')?.textContent).toBe('1º');
    expect(card('#2')?.querySelector('.est')?.textContent).toBe('livre para entrar');
    expect(card('#2')?.querySelector('.prog')).toBeNull();
    expect(card('#3')?.querySelector('.prog')?.textContent).toBe('0/2');
    expect(card('#3')?.querySelector('.est')?.textContent).toBe('esperando arquivo');
    expect(card('#4')?.querySelector('.est')?.textContent).toBe('esperando dependência');
    expect(card('#6')?.querySelector('.est')?.textContent).toBe('exclusiva');
    expect(card('#7')?.querySelector('.est')?.textContent).toBe('ficha incompleta');
    expect(card('#8')?.querySelector('.est')?.textContent).toBe('segurada');
    expect(card('#1')?.getAttribute('type')).toBe('button');
    expect(card('#1')?.getAttribute('aria-pressed')).toBe('false');
  });

  it('as linhas "Vagas k/N · nenhuma ready elegível" e "Ordem prevista" (cinco primeiros)', () => {
    montar();
    expect(text('#mp-grafo-vagas')).toBe('Vagas 1/2 · nenhuma ready elegível');
    expect(text('#mp-grafo-ordem')).toBe('Ordem prevista: #2, #3, #4, #5, #6');
    expect(text('#mp-cur')).toContain('· Vagas 1/2');
    montar({ vagasItens: wrap(['Vagas 1/2', '#3 arquivo a.ts com #1']) });
    expect(text('#mp-grafo-vagas')).toBe('Vagas 1/2');
  });

  it('a legenda traz os oito estados', () => {
    montar();
    expect(
      Array.from(document.querySelectorAll('#mp-grafo-legenda li')).map(
        (l) => l.textContent,
      ),
    ).toEqual([
      'rodando',
      'esperando o dono',
      'esperando arquivo',
      'esperando dependência',
      'exclusiva',
      'segurada',
      'livre para entrar',
      'ficha incompleta',
    ]);
  });

  it('o svg só desenha as setas entre ondas vizinhas; a longa vira "espera #…" no card', () => {
    montar();
    expect(setas()).toEqual([
      { de: '#1', para: '#3', tipo: 'arquivo', longa: false },
      { de: '#1', para: '#4', tipo: 'dep', longa: false },
      { de: '#4', para: '#5', tipo: 'dep', longa: false },
      { de: '#5', para: '#6', tipo: 'dep', longa: false },
    ]);
    expect(card('#6')?.querySelector('.espera')?.textContent).toBe('espera #2');
    expect(card('#5')?.querySelector('.espera')).toBeNull();
  });

  it('o toque no card o seleciona, desenha as setas dele (a longa inclusive) e mostra o detalhe', () => {
    montar();
    const detalhe = document.querySelector<HTMLElement>('#mp-grafo-detalhe');
    expect(detalhe?.hidden).toBe(true);
    card('#6')?.click();
    expect(card('#6')?.getAttribute('aria-pressed')).toBe('true');
    expect(card('#5')?.getAttribute('aria-pressed')).toBe('false');
    expect(setas()).toContainEqual({ de: '#2', para: '#6', tipo: 'dep', longa: true });
    expect(setas()).toContainEqual({ de: '#5', para: '#6', tipo: 'dep', longa: false });
    expect(setas().filter((s) => s.longa)).toHaveLength(1);
    expect(detalhe?.hidden).toBe(false);
    expect(detalhe?.textContent).toContain(NOS[5]?.titulo);
    expect(detalhe?.textContent).toContain('exclusiva');
    expect(detalhe?.textContent).toContain('dep #2, #5');
    expect(detalhe?.textContent).toContain('Depende de: #2, #5');
    const a = detalhe?.querySelector('a');
    expect(a?.getAttribute('href')).toBe(
      'https://github.com/fabianofranca/mapping/issues/6',
    );
    expect(a?.getAttribute('target')).toBe('_blank');
    expect(a?.getAttribute('rel')).toBe('noopener');
  });

  it('o segundo toque no mesmo card, ou o "Limpar", desfaz a seleção', () => {
    montar();
    card('#6')?.click();
    card('#6')?.click();
    expect(card('#6')?.getAttribute('aria-pressed')).toBe('false');
    expect(setas().some((s) => s.longa)).toBe(false);
    expect(document.querySelector<HTMLElement>('#mp-grafo-detalhe')?.hidden).toBe(true);

    card('#6')?.click();
    card('#1')?.click();
    expect(card('#6')?.getAttribute('aria-pressed')).toBe('false');
    expect(card('#1')?.getAttribute('aria-pressed')).toBe('true');
    const limpar = Array.from(
      document.querySelectorAll<HTMLButtonElement>('#mp-grafo-detalhe button'),
    ).find((b) => b.textContent === 'Limpar');
    expect(limpar?.getAttribute('type')).toBe('button');
    limpar?.click();
    expect(card('#1')?.getAttribute('aria-pressed')).toBe('false');
    expect(document.querySelector<HTMLElement>('#mp-grafo-detalhe')?.hidden).toBe(true);
  });

  it('a seleção sobrevive a uma nova leitura dos dados e some se a etapa sai', () => {
    const panel = montar();
    card('#6')?.click();
    panel.render();
    expect(card('#6')?.getAttribute('aria-pressed')).toBe('true');

    expect(document.querySelector<HTMLElement>('#mp-grafo-detalhe')?.hidden).toBe(false);
    panel.setMeta({
      grafoNos: wrap(NOS.filter((n) => n.issue !== '#6')),
      grafoSetas: wrap(SETAS),
    });
    panel.render();
    expect(card('#6')).toBeNull();
    expect(document.querySelector<HTMLElement>('#mp-grafo-detalhe')?.hidden).toBe(true);
    expect(setas().every((s) => s.para !== '#6')).toBe(true);
  });

  it('a nova leitura devolve o foco ao card que o tinha', () => {
    const panel = montar();
    card('#4')?.focus();
    panel.render();
    expect(document.activeElement).toBe(card('#4'));
  });

  it('id com aspas ou colchete não derruba a página e o resto do painel é preenchido', () => {
    const estranho = '#9"]x';
    const panel = loadPanel({
      sessions: SESSIONS,
      grafoNos: wrap([...NOS, no({ issue: estranho, onda: 4 })]),
      grafoSetas: wrap([...SETAS, { de: '#6', para: estranho, tipo: 'dep' }]),
    });
    expect(() => panel.render()).not.toThrow();
    expect(text('#mp-custo-total')).toBe('US$ 4.25 em 3 sessões');
    expect(setas()).toContainEqual({
      de: '#6',
      para: estranho,
      tipo: 'dep',
      longa: false,
    });
  });

  it('nó sem onda numérica cai em "Agora" e conta como onda 0 também para as setas', () => {
    const nos = [
      no({ issue: '#1', onda: 0, estado: 'rodando' }),
      { ...no({ issue: '#2', onda: 1 }), onda: undefined } as unknown as No,
      no({ issue: '#3', onda: 1 }),
    ];
    const panel = loadPanel({
      grafoNos: wrap(nos),
      grafoSetas: wrap([
        { de: '#1', para: '#3', tipo: 'dep' },
        { de: '#2', para: '#3', tipo: 'dep' },
      ]),
    });
    panel.render();
    expect(faixas()).toEqual([
      { rotulo: 'Agora', issues: ['#1', '#2'] },
      { rotulo: 'Onda 1', issues: ['#3'] },
    ]);
    expect(setas().map((s) => s.de)).toEqual(['#1', '#2']);
    expect(card('#3')?.querySelector('.espera')).toBeNull();
  });
});

describe('página do painel da fila: grafo sem dados (GF2)', () => {
  it.each([[undefined], ['[{'], ['{}'], ['3'], ['[]']])(
    'grafoNos %j: a linha de vagas e "—", sem erro',
    (invalido) => {
      const panel = loadPanel({
        vagasItens: GRAFO_VAGAS,
        grafoNos: invalido,
        grafoSetas: invalido,
      });
      expect(() => panel.render()).not.toThrow();
      expect(text('#mp-grafo-vagas')).toBe('Vagas 1/2 · nenhuma ready elegível');
      expect(text('#mp-grafo')).toBe('—');
      expect(document.querySelectorAll('#mp-grafo .faixa')).toHaveLength(0);
      expect(document.querySelector('#mp-vagas')).toBeNull();
    },
  );

  it('grafoSetas ausente ou inválido com nós válidos: desenha os nós sem setas', () => {
    const panel = loadPanel({ grafoNos: NOS, grafoSetas: '[{' });
    expect(() => panel.render()).not.toThrow();
    expect(faixas()).toHaveLength(4);
    expect(setas()).toEqual([]);
    expect(card('#6')?.querySelector('.espera')).toBeNull();
  });
});
