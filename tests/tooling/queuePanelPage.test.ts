// Phase MT1 (stage #1619): the queue panel page reads the list fields of the `meta` (`sessions`,
// `vagasItens`, `requests` and `rules`) as a list or as JSON text, which is how the Dashboard type
// hands the page the nested list of a row. The test loads the page with a fake `dash`.
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const PAGE = '.claude/skills/implementar-fila/painel/index.html';

type Row = Record<string, unknown>;
type CalcSpec = { inputs: string[]; fn: (...datasets: Row[][]) => Row[] };
type DataResult = { status: 'ok'; data: Row[] } | { status: 'failed'; message: string };

interface Panel {
  data: (id: string) => DataResult;
  render: () => void;
  /** Fires the 1 s `tick` that the page registers in `setInterval`. */
  tick: () => void;
  /** Swaps the `meta` in the same page (the track selection lives in it); `render` rereads it. */
  setMeta: (meta: Row) => void;
}

/** Mounts the page in the `document` and runs its `<script>` with a fake `dash`. */
function loadPanel(meta: Row, queue: Row[] = [], opts: { colors?: unknown } = {}): Panel {
  const parsed = new DOMParser().parseFromString(readFileSync(PAGE, 'utf8'), 'text/html');
  const script = parsed.querySelector('script')?.textContent ?? '';
  document.body.replaceChildren(...Array.from(parsed.body.childNodes));

  const datasets: Record<string, Row[]> = { queue, meta: [meta], log: [] };
  const calcs = new Map<string, CalcSpec>();
  let onData: () => void = () => undefined;
  let tickCb: () => void = () => undefined;
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
    ...('colors' in opts ? { colors: opts.colors } : {}),
  };
  new Function('dash', 'setInterval', script)(dash, (cb: () => void) => {
    tickCb = cb;
    return 0;
  });
  return {
    data,
    render: () => onData(),
    tick: () => tickCb(),
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
const SLOTS = ['Vaga 1: livre porque a #10 espera o dono', 'Vaga 2: ocupada'];
const REQUESTS = [
  { id: 'SUP-1', tipo: 'A', pedido: 'switch the page', estado: 'aplicado' },
];
const RULES = [
  { id: 'R1', origem: 'dono', texto: 'do not merge without asking' },
  { id: 'R2', origem: 'SUP-1', texto: 'old rule', endedAt: '2026-11-10T10:00:00Z' },
];

/** The expected output of the cards when the four fields reach the `meta`. */
function expectFilledCards(panel: Panel): void {
  expect(panel.data('custo').status).toBe('ok');
  expect(text('#mp-custo-total')).toBe('US$ 4.25 in 3 sessions');
  expect(rows('#mp-custo')).toEqual([
    ['Type: fase', '2', '3.75', '1.88'],
    ['Type: testador', '1', '0.50', '0.50'],
    ['Stage: #10', '2', '2.00', '1.00'],
    ['Stage: #20', '1', '2.25', '2.25'],
  ]);
  expect(document.querySelector('#mp-vagas')).toBeNull();
  expect(text('#mp-cur')).toContain(`· ${SLOTS[0]}`);
  expect(items('#mp-pedidos')).toEqual(['SUP-1 (type A): switch the page — aplicado']);
  expect(items('#mp-regras')).toEqual(['R1 (dono): do not merge without asking']);
}

beforeEach(() => {
  document.body.replaceChildren();
});
afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
});

describe('queue panel page: list fields of the meta', () => {
  it('(a) reads the four fields when they arrive as JSON text', () => {
    const panel = loadPanel({
      sessions: JSON.stringify(SESSIONS),
      vagasItens: JSON.stringify(SLOTS),
      requests: JSON.stringify(REQUESTS),
      rules: JSON.stringify(RULES),
    });
    panel.render();
    expectFilledCards(panel);
  });

  it('(b) reads the same fields as real lists', () => {
    const panel = loadPanel({
      sessions: SESSIONS,
      vagasItens: SLOTS,
      requests: REQUESTS,
      rules: RULES,
    });
    panel.render();
    expectFilledCards(panel);
  });

  it('(c) without the four fields: "—" in the cards and the split of the vagas field', () => {
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
    '(d) text %j breaks nothing and the cards show "—"',
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

// Phase PA1 (stage #1840): the "Progress" card draws the track per wave from `meta.grafoNos` and
// `meta.grafoSetas` (list or JSON text), joins the `queue` row by `issue` and shows the phases
// as chips; the "Completed" card lists the `concluída` rows of the `queue` per Brasilia day.
const BASE = 'https://github.com/fabianofranca/mapping';

/** A queue row with the fields the card reads. */
function queueRow(over: Row): Row {
  return {
    order: 1,
    issue: '#1',
    title: 'Stage',
    kind: 'etapa',
    status: 'em andamento',
    stage: '',
    step: '',
    pr: '',
    ciWait: '',
    started: '',
    ended: '',
    phases: '',
    phasesTotal: 0,
    phasesDone: 0,
    ...over,
  };
}

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
  cedo?: string;
};
const graphNode = (over: Partial<No> & Pick<No, 'issue' | 'onda'>): No => ({
  titulo: `Stage ${over.issue}`,
  rank: null,
  estado: 'dep',
  motivo: '',
  fase: '',
  feitas: 0,
  total: 0,
  ...over,
});
const NODES: No[] = [
  graphNode({
    issue: '#1',
    onda: 0,
    estado: 'rodando',
    motivo: 'D2 implementando',
    fase: 'D2',
    feitas: 1,
    total: 3,
  }),
  graphNode({ issue: '#2', onda: 0, rank: 1, estado: 'livre', motivo: 'começa' }),
  graphNode({
    issue: '#3',
    onda: 1,
    rank: 2,
    estado: 'arquivo',
    motivo: 'arquivo a.ts com #1',
    total: 2,
  }),
  graphNode({ issue: '#4', onda: 1, rank: 3, motivo: 'dep #1' }),
  graphNode({ issue: '#5', onda: 2, rank: 4, motivo: 'dep #4' }),
  graphNode({
    issue: '#6',
    onda: 3,
    rank: 5,
    estado: 'exclusiva',
    titulo: 'Very long title of the exclusive stage that waits for #2 and #5',
    motivo: 'dep #2, #5',
  }),
  graphNode({
    issue: '#7',
    onda: 3,
    rank: 6,
    estado: 'ficha',
    motivo: 'ficha incompleta (toca)',
  }),
  graphNode({
    issue: '#8',
    onda: 3,
    estado: 'segurada',
    motivo: 'owner decision pending',
  }),
];
const ARROWS = [
  { de: '#1', para: '#3', tipo: 'arquivo' },
  { de: '#1', para: '#4', tipo: 'dep' },
  { de: '#4', para: '#5', tipo: 'dep' },
  { de: '#2', para: '#6', tipo: 'dep' },
  { de: '#5', para: '#6', tipo: 'dep' },
];
/** The sessions with a cost of #1 (US$ 2.00 in total); the other stages of the track have no cost. */
const SESSIONS_TRACK = [
  { id: 'a1', kind: 'fase', issue: '#1', cost: { usd: 1.5 } },
  { id: 'a2', kind: 'testador', issue: '#1', cost: { usd: 0.5 } },
];
const GRAPH_SLOTS = ['Vagas 1/2', '#3 arquivo a.ts com #1', 'nenhuma ready elegível'];
/** The `queue` rows of the track stages (#4, #5 and the others have no row). */
const QUEUE_TRACK: Row[] = [
  queueRow({
    issue: '#1',
    kind: 'etapa',
    stage: 'Fases',
    pr: '77',
    ciWait: 'PR #77',
    started: '2026-11-13T10:00:00Z',
    phases: 'D1:ok|D2:open|D3:todo',
    phasesTotal: 3,
    phasesDone: 1,
  }),
  queueRow({
    issue: '#3',
    kind: 'bug',
    status: 'aguardando',
    phases: 'E1:todo|E2:todo',
    phasesTotal: 2,
    phasesDone: 0,
  }),
];

const card = (issue: string) =>
  Array.from(document.querySelectorAll<HTMLElement>('#mp-grafo article')).find(
    (a) => a.dataset.issue === issue,
  ) ?? null;
const cardButton = (issue: string) =>
  card(issue)?.querySelector<HTMLButtonElement>('button');
const bands = () =>
  Array.from(document.querySelectorAll('#mp-grafo .onda')).map((f) => ({
    label: f.querySelector('.parada .rot')?.textContent,
    count: f.querySelector('.parada .qtd')?.textContent,
    issues: Array.from(f.querySelectorAll<HTMLElement>('article')).map(
      (a) => a.dataset.issue,
    ),
  }));
const tags = (issue: string, sel: string) =>
  Array.from(card(issue)?.querySelectorAll(`.tags ${sel}`) ?? []).map(
    (e) => e.textContent,
  );
const chips = (issue: string) =>
  Array.from(card(issue)?.querySelectorAll('.fases .fase') ?? []).map((c) => ({
    code: c.querySelector('.cod')?.textContent,
    sr: c.querySelector('.sr')?.textContent,
    classes: Array.from(c.classList).filter((k) => k !== 'fase'),
    title: c.getAttribute('title'),
  }));
const waits = (issue: string) =>
  Array.from(card(issue)?.querySelectorAll('.espera .w') ?? []).map((w) => ({
    n: w.querySelector('.n')?.textContent,
    sr: w.querySelector('.sr')?.textContent,
    classes: Array.from(w.classList).filter((k) => k !== 'w'),
    title: w.getAttribute('title'),
  }));
const focus = () =>
  Object.fromEntries(
    ['foco-sel', 'foco-espera', 'foco-segura', 'dim'].map((k) => [
      k,
      Array.from(document.querySelectorAll<HTMLElement>('#mp-grafo article'))
        .filter((a) => a.classList.contains(k))
        .map((a) => a.dataset.issue),
    ]),
  );

const FORMS: Array<[string, (v: unknown) => unknown]> = [
  ['list', (v) => v],
  ['JSON text', (v) => JSON.stringify(v)],
];

describe.each(FORMS)('queue panel page: "Progress" card (PA1), %s', (_forma, wrap) => {
  const mount = (over: Row = {}, queue: Row[] = QUEUE_TRACK) => {
    const panel = loadPanel(
      {
        sessions: wrap(SESSIONS_TRACK),
        vagasItens: wrap(GRAPH_SLOTS),
        grafoNos: wrap(NODES),
        grafoSetas: wrap(ARROWS),
        ...over,
      },
      queue,
    );
    panel.render();
    return panel;
  };

  it('the "Progress" card exists and the "Step by step" table, the old graph and the detail are gone', () => {
    mount();
    expect(document.querySelector('#mp-andamento h2')?.textContent).toBe('Progress');
    expect(document.querySelector('#mp-table')).toBeNull();
    expect(document.querySelector('#mp-grafo-detalhe')).toBeNull();
    expect(document.querySelector('#mp-grafo-setas')).toBeNull();
    expect(document.querySelector('#mp svg')).toBeNull();
    expect(document.body.textContent).not.toContain('Step by step');
    expect(document.body.textContent).not.toContain('Dependencies and entry order');
  });

  it('one band per wave, "Now" and "Wave k", with "k stages" and the cards in list order', () => {
    mount();
    expect(bands()).toEqual([
      { label: 'Now', count: '2 stages', issues: ['#1', '#2'] },
      { label: 'Wave 1', count: '2 stages', issues: ['#3', '#4'] },
      { label: 'Wave 2', count: '1 stage', issues: ['#5'] },
      { label: 'Wave 3', count: '3 stages', issues: ['#6', '#7', '#8'] },
    ]);
    expect(document.querySelector('.onda[data-onda="0"] .parada')?.classList).toContain(
      'agora',
    );
    expect(document.querySelectorAll('#mp-grafo .onda .parada.agora')).toHaveLength(1);
  });

  it('the "Vagas k/N · nenhuma ready elegível" and "Expected order" lines and the legend', () => {
    mount();
    expect(text('#mp-grafo-vagas')).toBe('Vagas 1/2 · nenhuma ready elegível');
    expect(text('#mp-grafo-ordem')).toBe('Expected order: #2, #3, #4, #5, #6');
    expect(text('#mp-cur')).toContain('· Vagas 1/2');
    mount({ vagasItens: wrap(['Vagas 1/2', '#3 arquivo a.ts com #1']) });
    expect(text('#mp-grafo-vagas')).toBe('Vagas 1/2');
    const leg = Array.from(document.querySelectorAll('#mp-grafo-legenda li')).map(
      (l) => l.textContent,
    );
    for (const label of [
      'rodando',
      'esperando o dono',
      'waiting for file',
      'waiting for dependency',
      'exclusiva',
      'segurada',
      'free to enter',
      'ficha incompleta',
      'merged',
      'open',
      'not opened yet',
      'dependency',
      'shared file',
      'waiting for a merge to test',
      'delivery',
    ]) {
      expect(leg.some((l) => l?.includes(label))).toBe(true);
    }
  });

  it('the card is an article with number (link), badge, state, title in the button and the state class', () => {
    mount();
    const c1 = card('#1');
    expect(c1?.tagName).toBe('ARTICLE');
    expect(c1?.className).toContain('e-rodando');
    expect(c1?.querySelector('.est')?.textContent).toBe('rodando');
    expect(c1?.querySelector('.selo')).toBeNull();
    expect(card('#2')?.querySelector('.selo')?.textContent).toBe('1º');
    expect(card('#2')?.querySelector('.est')?.textContent).toBe('free to enter');
    expect(card('#3')?.querySelector('.est')?.textContent).toBe('waiting for file');
    expect(card('#4')?.querySelector('.est')?.textContent).toBe('waiting for dependency');
    expect(card('#6')?.querySelector('.est')?.textContent).toBe('exclusiva');
    expect(card('#7')?.querySelector('.est')?.textContent).toBe('ficha incompleta');
    expect(card('#8')?.querySelector('.est')?.textContent).toBe('segurada');
    const b = cardButton('#1');
    expect(b?.getAttribute('type')).toBe('button');
    expect(b?.getAttribute('aria-pressed')).toBe('false');
    expect(b?.textContent).toContain('Stage #1');
    expect(b?.querySelector('a, button')).toBeNull();
    expect(card('#6')?.querySelector('.tit')?.textContent).toBe(NODES[5]?.titulo);
    const num = c1?.querySelector<HTMLAnchorElement>('a.num');
    expect(num?.textContent).toBe('#1');
    expect(num?.getAttribute('href')).toBe(`${BASE}/issues/1`);
    expect(num?.getAttribute('target')).toBe('_blank');
    expect(num?.getAttribute('rel')).toBe('noopener');
    expect(b?.contains(num ?? null)).toBe(false);
  });

  it('tags: kind, flow, PR as a link outside the button and the CI that waits for the coordinator', () => {
    mount();
    expect(tags('#1', '.tipo')).toEqual(['etapa']);
    expect(tags('#1', '.fluxo')).toEqual(['Fases · CI: PR #77']);
    const pr = card('#1')?.querySelector<HTMLAnchorElement>('a.pr');
    expect(pr?.textContent).toBe('PR #77');
    expect(pr?.getAttribute('href')).toBe(`${BASE}/pull/77`);
    expect(pr?.getAttribute('target')).toBe('_blank');
    expect(pr?.getAttribute('rel')).toBe('noopener');
    expect(cardButton('#1')?.contains(pr ?? null)).toBe(false);
    expect(tags('#3', '.tipo')).toEqual(['bug']);
    expect(tags('#3', '.fluxo')).toEqual([]);
    expect(card('#3')?.querySelector('a.pr')).toBeNull();
  });

  it('flow without CI shows only the flow; CI without flow shows "CI: …"; a non-numeric PR does not become a link', () => {
    mount({}, [
      queueRow({ issue: '#1', stage: 'Testador', pr: 'PR #7' }),
      queueRow({ issue: '#2', ciWait: 'PR #9' }),
      queueRow({ issue: '#3', pr: 12 }),
    ]);
    expect(tags('#1', '.fluxo')).toEqual(['Testador']);
    expect(card('#1')?.querySelector('a.pr')).toBeNull();
    expect(tags('#2', '.fluxo')).toEqual(['CI: PR #9']);
    expect(card('#3')?.querySelector('a.pr')?.getAttribute('href')).toBe(
      `${BASE}/pull/12`,
    );
  });

  it('one chip per phase, in order, with the state as a class, title and screen reader text', () => {
    mount();
    expect(chips('#1')).toEqual([
      { code: 'D1', sr: 'merged', classes: ['ok'], title: 'D1: merged' },
      {
        code: 'D2',
        sr: 'open (now)',
        classes: ['open', 'now'],
        title: 'D2: open (now)',
      },
      {
        code: 'D3',
        sr: 'not opened yet',
        classes: ['todo'],
        title: 'D3: not opened yet',
      },
    ]);
    expect(chips('#3').map((c) => c.classes)).toEqual([['todo'], ['todo']]);
  });

  it('the bar and the "k of n phases": from the queue row; without it, from the node; without phases, nothing', () => {
    mount();
    const width = (i: string) =>
      card(i)?.querySelector<HTMLElement>('.barra i')?.style.width ?? null;
    expect(parseFloat(width('#1') ?? '')).toBeCloseTo(33.33, 1);
    expect(text('#mp-grafo article[data-issue="#1"] .fases-n')).toBe('1 of 3 phases');
    expect(width('#3')).toBe('0%');
    expect(card('#3')?.querySelector('.fases-n')?.textContent).toBe('0 of 2 phases');
    expect(card('#2')?.querySelector('.barra')).toBeNull();
    expect(card('#2')?.querySelector('.fases-n')).toBeNull();

    mount(
      { grafoNos: wrap([graphNode({ issue: '#9', onda: 1, feitas: 1, total: 4 })]) },
      [],
    );
    expect(width('#9')).toBe('25%');
    expect(card('#9')?.querySelector('.fases-n')?.textContent).toBe('1 of 4 phases');
  });

  it('"waits for" with one tag per incoming arrow: solid for the dependency, dashed for the file', () => {
    mount();
    expect(waits('#3')).toEqual([
      {
        n: '#1',
        sr: 'shared file',
        classes: ['arquivo'],
        title: 'shared file',
      },
    ]);
    expect(waits('#4')).toEqual([
      { n: '#1', sr: 'dependency', classes: ['dep'], title: 'dependency' },
    ]);
    expect(waits('#6').map((w) => w.n)).toEqual(['#2', '#5']);
    expect(card('#6')?.querySelector('.espera')?.firstChild?.textContent).toBe(
      'waits for',
    );
    expect(card('#6')?.querySelector('.mot')).toBeNull();
  });

  it('only the first open phase of the row in progress gets the "now" highlight', () => {
    mount({}, [
      queueRow({ issue: '#1', phases: 'D1:ok|D2:open|D3:open|D4:todo' }),
      queueRow({ issue: '#2', status: 'aguardando', phases: 'E1:open|E2:open' }),
    ]);
    expect(chips('#1').map((c) => c.classes)).toEqual([
      ['ok'],
      ['open', 'now'],
      ['open'],
      ['todo'],
    ]);
    expect(chips('#1')[1]?.title).toBe('D2: open (now)');
    expect(chips('#1')[1]?.sr).toBe('open (now)');
    expect(chips('#2').map((c) => c.classes)).toEqual([['open'], ['open']]);
  });

  it('with an incoming arrow and a reason that is not "dep …", shows the "waits for" and also the reason', () => {
    mount(
      {
        grafoNos: wrap([
          graphNode({ issue: '#1', onda: 0 }),
          graphNode({ issue: '#2', onda: 1, motivo: 'dep #1' }),
          graphNode({ issue: '#3', onda: 1, motivo: 'segurada para a exclusiva #9' }),
        ]),
        grafoSetas: wrap([
          { de: '#1', para: '#2', tipo: 'dep' },
          { de: '#1', para: '#3', tipo: 'dep' },
        ]),
      },
      [],
    );
    expect(waits('#3').map((w) => w.n)).toEqual(['#1']);
    expect(card('#3')?.querySelector('.mot')?.textContent).toBe(
      'segurada para a exclusiva #9',
    );
    expect(card('#2')?.querySelector('.mot')).toBeNull();
  });

  it('a combined reason (`dep #A; arquivo x com #B`) shows next to "waits for" with both tags; a pure `dep` stays hidden', () => {
    mount(
      {
        grafoNos: wrap([
          graphNode({ issue: '#1', onda: 0 }),
          graphNode({ issue: '#2', onda: 0 }),
          graphNode({ issue: '#3', onda: 1, motivo: 'dep #1; arquivo x com #2' }),
          graphNode({ issue: '#4', onda: 1, motivo: 'dep #1, #2' }),
        ]),
        grafoSetas: wrap([
          { de: '#1', para: '#3', tipo: 'dep' },
          { de: '#2', para: '#3', tipo: 'arquivo' },
          { de: '#1', para: '#4', tipo: 'dep' },
          { de: '#2', para: '#4', tipo: 'dep' },
        ]),
      },
      [],
    );
    expect(waits('#3').map((w) => w.n)).toEqual(['#1', '#2']);
    expect(card('#3')?.querySelector('.mot')?.textContent).toBe(
      'dep #1; arquivo x com #2',
    );
    expect(waits('#4').map((w) => w.n)).toEqual(['#1', '#2']);
    expect(card('#4')?.querySelector('.mot')).toBeNull();
  });

  it('without an arrow (or in wave 0) the why is the reason of the node', () => {
    mount();
    expect(card('#1')?.querySelector('.mot')?.textContent).toBe('D2 implementando');
    expect(card('#1')?.querySelector('.espera')).toBeNull();
    expect(card('#7')?.querySelector('.mot')?.textContent).toBe(
      'ficha incompleta (toca)',
    );
    expect(card('#7')?.querySelector('.espera')).toBeNull();
    expect(card('#8')?.querySelector('.mot')?.textContent).toBe('owner decision pending');
  });

  it('the footer: live duration on the started ones and the stage cost in US$ with a comma', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-13T11:05:07Z'));
    const panel = mount();
    expect(card('#1')?.querySelector('.dur')?.textContent).toBe('01:05:07');
    expect(card('#1')?.querySelector('.custo')?.textContent).toBe('US$ 2,00');
    expect(card('#3')?.querySelector('.dur')).toBeNull();
    expect(card('#3')?.querySelector('.custo')).toBeNull();
    expect(card('#2')?.querySelector('.custo')).toBeNull();
    vi.setSystemTime(new Date('2026-11-13T11:05:09Z'));
    panel.render();
    expect(card('#1')?.querySelector('.dur')?.textContent).toBe('01:05:09');
  });

  it('the 1 s tick updates the duration without rebuilding the card', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-13T10:00:30Z'));
    const panel = mount();
    const dur = card('#1')?.querySelector('.dur');
    expect(dur?.textContent).toBe('00:00:30');
    vi.setSystemTime(new Date('2026-11-13T10:00:45Z'));
    panel.tick();
    expect(card('#1')?.querySelector('.dur')).toBe(dur);
    expect(dur?.textContent).toBe('00:00:45');
  });

  it('tapping the button selects the card and highlights what it waits for (going up, the indirect included) and what it holds', () => {
    mount();
    expect(text('#mp-grafo-ajuda')).toBe(
      'Tap a card to see what it waits for and who waits for it.',
    );
    cardButton('#5')?.click();
    expect(cardButton('#5')?.getAttribute('aria-pressed')).toBe('true');
    expect(cardButton('#4')?.getAttribute('aria-pressed')).toBe('false');
    expect(document.querySelector('#mp-grafo')?.classList).toContain('foco');
    expect(focus()).toEqual({
      'foco-sel': ['#5'],
      'foco-espera': ['#1', '#4'],
      'foco-segura': ['#6'],
      dim: ['#2', '#3', '#7', '#8'],
    });
    expect(text('#mp-grafo-ajuda')).toBe('#5: waits for #1, #4 · holds #6');
  });

  it('the chain going down from the root and up from the leaf; "nothing" when there is none', () => {
    mount();
    cardButton('#1')?.click();
    expect(focus()['foco-segura']).toEqual(['#3', '#4', '#5', '#6']);
    expect(focus()['foco-espera']).toEqual([]);
    expect(text('#mp-grafo-ajuda')).toBe('#1: waits for nothing · holds #3, #4, #5, #6');
    cardButton('#6')?.click();
    expect(focus()['foco-espera']).toEqual(['#1', '#2', '#4', '#5']);
    expect(text('#mp-grafo-ajuda')).toBe('#6: waits for #1, #2, #4, #5 · holds nothing');
    cardButton('#7')?.click();
    expect(text('#mp-grafo-ajuda')).toBe('#7: waits for nothing · holds nothing');
  });

  it('the second tap undoes it, and tapping another card switches the selection', () => {
    mount();
    cardButton('#6')?.click();
    cardButton('#6')?.click();
    expect(cardButton('#6')?.getAttribute('aria-pressed')).toBe('false');
    expect(document.querySelector('#mp-grafo')?.classList).not.toContain('foco');
    expect(focus()).toEqual({
      'foco-sel': [],
      'foco-espera': [],
      'foco-segura': [],
      dim: [],
    });
    expect(text('#mp-grafo-ajuda')).toContain('Tap a card');
    cardButton('#6')?.click();
    cardButton('#1')?.click();
    expect(cardButton('#6')?.getAttribute('aria-pressed')).toBe('false');
    expect(cardButton('#1')?.getAttribute('aria-pressed')).toBe('true');
  });

  it('the issue and PR links do not select the card', () => {
    mount();
    card('#1')?.querySelector<HTMLElement>('a.num')?.click();
    card('#1')?.querySelector<HTMLElement>('a.pr')?.click();
    expect(cardButton('#1')?.getAttribute('aria-pressed')).toBe('false');
    expect(text('#mp-grafo-ajuda')).toContain('Tap a card');
  });

  it('the selection survives a new read of the data and disappears if the stage leaves', () => {
    const panel = mount();
    cardButton('#6')?.click();
    panel.render();
    expect(cardButton('#6')?.getAttribute('aria-pressed')).toBe('true');
    expect(text('#mp-grafo-ajuda')).toContain('#6: waits for');
    panel.setMeta({
      grafoNos: wrap(NODES.filter((n) => n.issue !== '#6')),
      grafoSetas: wrap(ARROWS),
    });
    panel.render();
    expect(card('#6')).toBeNull();
    expect(document.querySelector('#mp-grafo')?.classList).not.toContain('foco');
    expect(text('#mp-grafo-ajuda')).toContain('Tap a card');
  });

  it('the new read gives the focus back to the button that had it', () => {
    const panel = mount();
    cardButton('#4')?.focus();
    expect(document.activeElement).toBe(cardButton('#4'));
    panel.render();
    expect(document.activeElement).toBe(cardButton('#4'));
    expect(cardButton('#4')?.isConnected).toBe(true);
  });

  it('node without a queue row: card without tags, chips and cost, no error', () => {
    mount();
    expect(card('#4')).not.toBeNull();
    expect(card('#4')?.querySelector('.tags')?.children.length ?? 0).toBe(0);
    expect(chips('#4')).toEqual([]);
    expect(card('#4')?.querySelector('.custo')).toBeNull();
    expect(card('#4')?.querySelector('.dur')).toBeNull();
    expect(card('#4')?.querySelector('a.num')?.textContent).toBe('#4');
  });

  it('an id with quotes or a bracket does not break the page and the rest of the panel is filled', () => {
    const odd = '#9"]x';
    const panel = loadPanel({
      sessions: wrap(SESSIONS),
      grafoNos: wrap([...NODES, graphNode({ issue: odd, onda: 4 })]),
      grafoSetas: wrap([...ARROWS, { de: '#6', para: odd, tipo: 'dep' }]),
    });
    expect(() => panel.render()).not.toThrow();
    expect(text('#mp-custo-total')).toBe('US$ 4.25 in 3 sessions');
    expect(card(odd)).not.toBeNull();
    expect(waits(odd).map((w) => w.n)).toEqual(['#6']);
    cardButton(odd)?.click();
    expect(cardButton(odd)?.getAttribute('aria-pressed')).toBe('true');
  });

  it('a node without a numeric wave falls into "Now" and counts as wave 0 also for "waits for"', () => {
    const nos = [
      graphNode({ issue: '#1', onda: 0, estado: 'rodando' }),
      { ...graphNode({ issue: '#2', onda: 1 }), onda: undefined } as unknown as No,
      graphNode({ issue: '#3', onda: 1 }),
    ];
    const panel = loadPanel({
      grafoNos: wrap(nos),
      grafoSetas: wrap([
        { de: '#1', para: '#3', tipo: 'dep' },
        { de: '#2', para: '#3', tipo: 'dep' },
      ]),
    });
    panel.render();
    expect(bands().map((f) => [f.label, f.issues])).toEqual([
      ['Now', ['#1', '#2']],
      ['Wave 1', ['#3']],
    ]);
    expect(card('#2')?.querySelector('.espera')).toBeNull();
    expect(waits('#3').map((w) => w.n)).toEqual(['#1', '#2']);
  });
});

describe('queue panel page: "Progress" card without data (PA1)', () => {
  it.each([[undefined], ['[{'], ['{}'], ['3'], ['[]']])(
    'grafoNos %j: the vagas line and "—", no error',
    (invalid) => {
      const panel = loadPanel({
        vagasItens: GRAPH_SLOTS,
        grafoNos: invalid,
        grafoSetas: invalid,
      });
      expect(() => panel.render()).not.toThrow();
      expect(text('#mp-grafo-vagas')).toBe('Vagas 1/2 · nenhuma ready elegível');
      expect(text('#mp-grafo')).toBe('—');
      expect(document.querySelectorAll('#mp-grafo .onda')).toHaveLength(0);
      expect(document.querySelector('#mp-vagas')).toBeNull();
      expect(text('#mp-concluidas-lista')).toBe('—');
    },
  );

  it('grafoSetas missing or invalid with valid nodes: draws the nodes without "waits for"', () => {
    const panel = loadPanel({ grafoNos: NODES, grafoSetas: '[{' });
    expect(() => panel.render()).not.toThrow();
    expect(bands()).toHaveLength(4);
    expect(card('#6')?.querySelector('.espera')).toBeNull();
    expect(card('#6')?.querySelector('.mot')?.textContent).toBe('dep #2, #5');
  });

  it('fields of the wrong type in the node and in the queue row do not break the page', () => {
    const panel = loadPanel(
      {
        grafoNos: [
          { issue: '#1', onda: 0, titulo: 5, estado: 'x', rank: 'a', total: 'b' },
          null,
          7,
        ],
        grafoSetas: [null, { de: '#1' }, { de: '#1', para: '#1', tipo: 'dep' }],
      },
      [queueRow({ issue: '#1', phases: 5, phasesTotal: 'x', started: 'junk', pr: null })],
    );
    expect(() => panel.render()).not.toThrow();
    expect(card('#1')).not.toBeNull();
  });
});

describe('queue panel page: "Completed" card (PA1)', () => {
  const dia = (ended: string, started = '') => ({ ended, started });
  const COMPLETED: Row[] = [
    queueRow({
      issue: '#10',
      title: 'First',
      status: 'concluída',
      kind: 'etapa',
      pr: '100',
      order: 1,
      ...dia('2026-11-13T11:00:00Z', '2026-11-13T10:13:00Z'),
    }),
    queueRow({
      issue: '#50',
      title: 'No date',
      status: 'concluída',
      order: 9,
    }),
    queueRow({
      issue: '#40',
      title: 'Yesterday',
      status: 'concluída',
      order: 4,
      ...dia('2026-11-12T20:00:00Z'),
    }),
    queueRow({
      issue: '#30',
      title: 'Past midnight in UTC, but still Friday in Brasilia '.repeat(3),
      status: 'concluída',
      kind: 'bug',
      order: 3,
      ...dia('2026-11-14T01:30:00Z', '2026-11-14T00:30:00Z'),
    }),
    queueRow({
      issue: '#20',
      title: 'Second',
      status: 'concluída',
      kind: 'bug',
      pr: '#200',
      order: 2,
      ...dia('2026-11-13T15:30:00Z', '2026-11-13T13:25:00Z'),
    }),
    queueRow({ issue: '#60', title: 'In progress', status: 'em andamento' }),
    queueRow({ issue: '#70', title: 'Waiting', status: 'aguardando' }),
  ];
  const SESS = [
    { id: 's1', kind: 'fase', issue: '#10', cost: { usd: 1.5 } },
    { id: 's2', kind: 'testador', issue: '#10', cost: { usd: 0.5 } },
    { id: 's3', kind: 'fase', issue: '#20', cost: { usd: 2.25 } },
    { id: 's4', kind: 'fase', issue: '#60', cost: { usd: 9 } },
  ];
  const mount = (queue = COMPLETED, meta: Row = { sessions: SESS }) => {
    const panel = loadPanel(meta, queue);
    panel.render();
    return panel;
  };
  const days = () =>
    Array.from(document.querySelectorAll<HTMLElement>('#mp-concluidas .dia')).map(
      (d) => ({
        label: d.querySelector('.dia-rot')?.textContent,
        issues: Array.from(d.querySelectorAll('.cl a.num')).map((a) => a.textContent),
        inside: d.closest('details') !== null,
      }),
    );
  const line = (issue: string) =>
    Array.from(document.querySelectorAll<HTMLElement>('#mp-concluidas .cl')).find(
      (l) => l.querySelector('a.num')?.textContent === issue,
    );

  it('only the completed rows of the queue, from the most recent to the oldest by ended; without ended last', () => {
    mount();
    expect(
      Array.from(document.querySelectorAll('#mp-concluidas .cl a.num')).map(
        (a) => a.textContent,
      ),
    ).toEqual(['#30', '#20', '#10', '#40', '#50']);
  });

  it('groups by Brasilia day: 01:30Z falls on the previous day; the most recent open, the others in details', () => {
    mount();
    expect(days()).toEqual([
      { label: 'Fri 13/11 · 3', issues: ['#30', '#20', '#10'], inside: false },
      { label: 'Thu 12/11 · 1', issues: ['#40'], inside: true },
      { label: 'no date · 1', issues: ['#50'], inside: true },
    ]);
    const det = document.querySelectorAll('#mp-concluidas details');
    expect(det).toHaveLength(1);
    expect(det[0]?.querySelector('summary')?.textContent).toBe('Show earlier days');
    expect((det[0] as HTMLDetailsElement).open).toBe(false);
  });

  it('a single day: no details', () => {
    mount([COMPLETED[0] as Row]);
    expect(document.querySelector('#mp-concluidas details')).toBeNull();
    expect(days()).toHaveLength(1);
  });

  it('the row: number and PR as links, title with an ellipsis and whole in the title attribute, kind, time, duration and cost', () => {
    mount();
    const l10 = line('#10');
    expect(l10?.querySelector('a.num')?.getAttribute('href')).toBe(`${BASE}/issues/10`);
    expect(l10?.querySelector('a.num')?.getAttribute('target')).toBe('_blank');
    expect(l10?.querySelector('a.num')?.getAttribute('rel')).toBe('noopener');
    expect(l10?.querySelector('.tit')?.textContent).toBe('First');
    expect(l10?.querySelector('.tipo')?.textContent).toBe('etapa');
    expect(l10?.querySelector('a.pr')?.textContent).toBe('PR #100');
    expect(l10?.querySelector('a.pr')?.getAttribute('href')).toBe(`${BASE}/pull/100`);
    expect(l10?.querySelector('.hora')?.textContent).toBe('08:00');
    expect(l10?.querySelector('.dur')?.textContent).toBe('47 min');
    expect(l10?.querySelector('.custo')?.textContent).toBe('US$ 2,00');
    const l20 = line('#20');
    expect(l20?.querySelector('.tipo')?.textContent).toBe('bug');
    expect(l20?.querySelector('.hora')?.textContent).toBe('12:30');
    expect(l20?.querySelector('.dur')?.textContent).toBe('2 h 05');
    expect(l20?.querySelector('.custo')?.textContent).toBe('US$ 2,25');
    expect(l20?.querySelector('a.pr')).toBeNull();
    const l30 = line('#30');
    expect(l30?.querySelector('.hora')?.textContent).toBe('22:30');
    expect(l30?.querySelector('.dur')?.textContent).toBe('1 h 00');
    expect(l30?.querySelector('.tit')?.getAttribute('title')).toContain('Past midnight');
    expect(line('#40')?.querySelector('.dur')).toBeNull();
    expect(line('#40')?.querySelector('.custo')).toBeNull();
    expect(line('#50')?.querySelector('.hora')).toBeNull();
  });

  it('the header shows "k stages · US$ x" (the sum of their cost, without those in progress)', () => {
    mount();
    expect(text('#mp-concluidas-resumo')).toBe('5 stages · US$ 4,25');
    mount([COMPLETED[0] as Row], {});
    expect(text('#mp-concluidas-resumo')).toBe('1 stage');
  });

  it('the completed ones of meta.merged without a queue row do not count; with none the card shows "—"', () => {
    mount([queueRow({ issue: '#60', status: 'em andamento' })], {
      merged: '#99',
      sessions: SESS,
    });
    expect(text('#mp-concluidas-lista')).toBe('—');
    expect(text('#mp-concluidas-resumo')).toBe('—');
    expect(document.querySelector('#mp-concluidas .cl')).toBeNull();
  });

  it('the list does not duplicate the queue: the completed row does not become a track card and the page has no step table', () => {
    mount();
    expect(document.querySelector('#mp-table')).toBeNull();
    expect(document.querySelectorAll('#mp-andamento article')).toHaveLength(0);
  });
});

// Phase PA2 (stage #1840, decisions 10 to 13): the "Queue cost" card gets the sums (total, per
// completed stage, per queue hour), the column per Brasilia day stacked by kind, the bars per kind and
// of the 8 most expensive stages, and today's table collapsed into a `<details>`.
describe('queue panel page: "Queue cost" card (PA2)', () => {
  const KINDS = [
    'fase',
    'correção',
    'testador',
    'reteste',
    'fechamento',
    'coordenador',
    'supervisor',
  ];
  const sess = (
    id: string,
    kind: string,
    issue: string | null,
    usd: number,
    extra: Row = {},
  ) => ({
    id,
    kind,
    issue,
    cost: { usd },
    ...extra,
  });
  const SESS: Row[] = [
    sess('s1', 'fase', '#10', 1.5, { created: '2026-11-13T01:30:00Z' }),
    sess('s2', 'testador', '#10', 2.5, { created: '2026-11-13T15:00:00Z' }),
    sess('s3', 'fase', '#20', 1, { cost: { usd: 1, at: '2026-11-13T12:00:00Z' } }),
  ];
  const done = (issue: string, ended: string) =>
    queueRow({ issue, status: 'concluída', ended, started: '2026-11-13T10:00:00Z' });
  const QUEUE: Row[] = [
    done('#10', '2026-11-13T11:00:00Z'),
    done('#20', '2026-11-13T12:00:00Z'),
    queueRow({ issue: '#30', status: 'em andamento' }),
  ];
  const NOW = '2026-11-13T14:00:00Z';
  const mount = (meta: Row, queue: Row[] = QUEUE, opts: { colors?: unknown } = {}) => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(NOW));
    const panel = loadPanel(meta, queue, opts);
    panel.render();
    return panel;
  };
  const cardText = (selector: string) => text(selector);

  describe('sums', () => {
    it('total and sessions, per completed stage and per queue hour (runStart until now)', () => {
      mount({ sessions: SESS, runStart: '2026-11-13T10:00:00Z' });
      expect(cardText('#mp-custo-total')).toBe('US$ 5.00 in 3 sessions');
      expect(cardText('#mp-custo-etapa')).toBe('US$ 2,50');
      expect(cardText('#mp-custo-hora')).toBe('US$ 1,25');
    });

    it('custoResumo is a calc with the meta and queue inputs', () => {
      const panel = mount({ sessions: SESS, runStart: '2026-11-13T10:00:00Z' });
      const r = panel.data('custoResumo');
      expect(r.status).toBe('ok');
      expect(r.status === 'ok' && r.data[0]).toMatchObject({
        usd: 5,
        sessoes: 3,
        concluidas: 2,
        porEtapa: 2.5,
      });
    });

    it('without completed rows, the cost per stage is "—" and the per hour one stays', () => {
      mount({ sessions: SESS, runStart: '2026-11-13T10:00:00Z' }, [
        queueRow({ issue: '#30', status: 'em andamento' }),
      ]);
      expect(cardText('#mp-custo-etapa')).toBe('—');
      expect(cardText('#mp-custo-hora')).toBe('US$ 1,25');
    });

    it('without runStart or with less than 1 min of queue, the cost per hour is "—"', () => {
      mount({ sessions: SESS });
      expect(cardText('#mp-custo-hora')).toBe('—');
      expect(cardText('#mp-custo-etapa')).toBe('US$ 2,50');
      mount({ sessions: SESS, runStart: '2026-11-13T13:59:30Z' });
      expect(cardText('#mp-custo-hora')).toBe('—');
    });

    it('with all completed, the hours go from runStart to the last ended, like the "Total duration"', () => {
      mount({ sessions: SESS, runStart: '2026-11-13T10:00:00Z' }, [
        done('#10', '2026-11-13T11:00:00Z'),
        done('#20', '2026-11-13T12:00:00Z'),
      ]);
      expect(cardText('#mp-custo-hora')).toBe('US$ 2,50');
    });

    it('the 1 s tick updates the cost per hour', () => {
      const panel = mount({ sessions: SESS, runStart: '2026-11-13T10:00:00Z' });
      vi.setSystemTime(new Date('2026-11-13T15:00:00Z'));
      panel.tick();
      expect(cardText('#mp-custo-hora')).toBe('US$ 1,00');
    });

    it('without meta.sessions, each sum shows "—", no error', () => {
      const panel = mount({ runStart: '2026-11-13T10:00:00Z' });
      expect(panel.data('custoResumo').status).toBe('ok');
      expect(cardText('#mp-custo-total')).toBe('—');
      expect(cardText('#mp-custo-etapa')).toBe('—');
      expect(cardText('#mp-custo-hora')).toBe('—');
    });
  });

  describe('per Brasilia day, stacked by kind', () => {
    const SESS_DAY: Row[] = [
      sess('a', 'fase', '#10', 1.5, { created: '2026-11-13T01:30:00Z' }),
      sess('b', 'testador', '#10', 2.5, { created: '2026-11-13T15:00:00Z' }),
      sess('c', 'fase', '#20', 1, { cost: { usd: 1, at: '2026-11-13T12:00:00Z' } }),
      sess('d', 'coordenador', null, 0.5, { cost: { usd: 0.5 } }),
      { id: 'e', kind: 'fase', issue: '#30', created: '2026-11-13T12:00:00Z' },
    ];
    const cols = () =>
      Array.from(document.querySelectorAll<HTMLElement>('#mp-custo-dias .col')).map(
        (c) => ({
          dia: c.dataset.dia,
          rot: c.querySelector('.rot')?.textContent,
          total: c.querySelector('.v')?.textContent,
          kinds: Array.from(c.querySelectorAll<HTMLElement>('.pilha i')).map(
            (i) => i.dataset.tipo,
          ),
        }),
      );

    it('custoDia gives one row per (Brasilia) day and kind; without created it uses cost.at', () => {
      const panel = mount({ sessions: SESS_DAY });
      const r = panel.data('custoDia');
      expect(r.status).toBe('ok');
      const rows = (r.status === 'ok' ? r.data : []).filter((x) => x.dia != null);
      expect(rows.map(({ dia, tipo, usd }) => ({ dia, tipo, usd }))).toEqual([
        { dia: '2026-11-12', tipo: 'fase', usd: 1.5 },
        { dia: '2026-11-13', tipo: 'fase', usd: 1 },
        { dia: '2026-11-13', tipo: 'testador', usd: 2.5 },
      ]);
    });

    it('one column per day, with the total printed and the date below; the session without a date is left out', () => {
      mount({ sessions: SESS_DAY });
      expect(cols()).toEqual([
        { dia: '2026-11-12', rot: '12/11', total: 'US$ 1,50', kinds: ['fase'] },
        {
          dia: '2026-11-13',
          rot: '13/11',
          total: 'US$ 3,50',
          kinds: ['fase', 'testador'],
        },
      ]);
      expect(cardText('#mp-custo-semdata')).toBe(
        '1 session without a date, outside the chart',
      );
    });

    it('the note in the plural, and hidden when all have a date', () => {
      mount({
        sessions: [
          sess('d', 'coordenador', null, 0.5),
          sess('e', 'supervisor', null, 0.5),
          sess('f', 'fase', '#10', 1, { created: '2026-11-13T12:00:00Z' }),
        ],
      });
      expect(cardText('#mp-custo-semdata')).toBe(
        '2 sessions without a date, outside the chart',
      );
      mount({ sessions: SESS });
      expect(document.querySelector<HTMLElement>('#mp-custo-semdata')?.hidden).toBe(true);
    });

    it('the stack follows the KINDS order and each segment carries the value in the title', () => {
      mount({ sessions: SESS_DAY });
      const col = document.querySelector('#mp-custo-dias .col[data-dia="2026-11-13"]');
      const seg = Array.from(col?.querySelectorAll('.pilha i') ?? []);
      expect(seg.map((i) => i.getAttribute('title'))).toEqual([
        'fase: US$ 1,00',
        'testador: US$ 2,50',
      ]);
    });

    it('the container carries data-source and the legend lists only the kinds in the chart', () => {
      mount({ sessions: SESS_DAY });
      expect(document.querySelector('#mp-custo-dias')?.getAttribute('data-source')).toBe(
        'custoDia',
      );
      expect(items('#mp-custo-chaves')).toEqual(['fase', 'testador']);
    });

    it('tapping a column shows the value in the card hint', () => {
      mount({ sessions: SESS_DAY });
      const btn = document.querySelector<HTMLElement>(
        '#mp-custo-dias .col[data-dia="2026-11-13"]',
      );
      expect(btn?.tagName).toBe('BUTTON');
      btn?.click();
      expect(cardText('#mp-custo-dica')).toBe(
        '13/11 · fase: US$ 1,00 · testador: US$ 2,50 · total US$ 3,50',
      );
    });

    it('without sessions the chart shows "—" and without dated sessions the column note goes away', () => {
      mount({});
      expect(cardText('#mp-custo-dias')).toBe('—');
      expect(document.querySelector('#mp-custo-dias .col')).toBeNull();
    });
  });

  describe('bars per kind and most expensive stages', () => {
    const NAMES = (sel: string) =>
      Array.from(document.querySelectorAll(`${sel} .hb`)).map((b) => ({
        name: b.querySelector('.n')?.textContent,
        value: b.querySelector('.v')?.textContent,
      }));

    it('one bar per kind, in KINDS order, with "US$ x · k sessions" printed', () => {
      mount({
        sessions: [
          sess('1', 'testador', '#10', 0.5),
          sess('2', 'supervisor', null, 4),
          sess('3', 'fase', '#10', 1.5),
          sess('4', 'fase', '#20', 2.25),
        ],
      });
      expect(NAMES('#mp-custo-tipo')).toEqual([
        { name: 'fase', value: 'US$ 3,75 · 2 sessions' },
        { name: 'testador', value: 'US$ 0,50 · 1 session' },
        { name: 'supervisor', value: 'US$ 4,00 · 1 session' },
      ]);
      expect(KINDS.indexOf('fase')).toBeLessThan(KINDS.indexOf('testador'));
      const w = (n: number) =>
        document.querySelectorAll<HTMLElement>('#mp-custo-tipo .hb i')[n]?.style.width;
      expect(w(2)).toBe('100%');
      expect(w(1)).toBe('12.5%');
      expect(document.querySelector('#mp-custo-tipo')?.getAttribute('data-source')).toBe(
        'custo',
      );
    });

    it('the 8 most expensive stages, from the largest to the smallest, with the value printed and in the title', () => {
      const sessions = Array.from({ length: 10 }, (_, i) =>
        sess(`s${i}`, 'fase', `#${100 + i}`, i + 1),
      );
      mount({ sessions });
      const n = NAMES('#mp-custo-etapas');
      expect(n).toHaveLength(8);
      expect(n[0]).toEqual({ name: '#109', value: 'US$ 10,00' });
      expect(n[7]).toEqual({ name: '#102', value: 'US$ 3,00' });
      const first = document.querySelector('#mp-custo-etapas .hb');
      expect(first?.getAttribute('title')).toBe('#109: US$ 10,00');
      expect(
        document.querySelector('#mp-custo-etapas')?.getAttribute('data-source'),
      ).toBe('custo');
    });

    it('tapping a bar shows the value in the card hint', () => {
      mount({
        sessions: [sess('1', 'fase', '#10', 1.5), sess('2', 'fase', '#10', 0.5)],
      });
      const bar = document.querySelector<HTMLElement>('#mp-custo-tipo .hb');
      expect(bar?.tagName).toBe('BUTTON');
      bar?.click();
      expect(cardText('#mp-custo-dica')).toBe('fase: US$ 2,00 · 2 sessions');
    });

    it('without meta.sessions the two lists show "—"', () => {
      mount({});
      expect(cardText('#mp-custo-tipo')).toBe('—');
      expect(cardText('#mp-custo-etapas')).toBe('—');
    });
  });

  describe('collapsed table', () => {
    it('today\'s table sits inside the details "Show the table of all stages and kinds", closed', () => {
      mount({ sessions: SESS });
      const det = document.querySelector('#mp-custo')?.closest('details');
      expect(det).not.toBeNull();
      expect(det?.open).toBe(false);
      expect(det?.querySelector('summary')?.textContent).toBe(
        'Show the table of all stages and kinds',
      );
      expect(rows('#mp-custo')).toEqual([
        ['Type: fase', '2', '2.50', '1.25'],
        ['Type: testador', '1', '2.50', '2.50'],
        ['Stage: #10', '2', '4.00', '2.00'],
        ['Stage: #20', '1', '1.00', '1.00'],
      ]);
    });

    it('the opening of the details survives a new read', () => {
      const panel = mount({ sessions: SESS });
      const det = document.querySelector('#mp-custo')?.closest('details');
      if (det) det.open = true;
      panel.render();
      expect(document.querySelector('#mp-custo')?.closest('details')?.open).toBe(true);
    });
  });

  describe('kind colors', () => {
    const color = (kind: string) =>
      document.querySelector<HTMLElement>(`#mp-custo-tipo .hb i[data-tipo="${kind}"]`);

    it('with dash.colors, each kind gets the color of its position in KINDS', () => {
      mount({ sessions: SESS }, QUEUE, {
        colors: ['#010101', '#020202', '#030303', '#040404'],
      });
      expect(color('fase')?.style.getPropertyValue('--cor')).toBe('#010101');
      expect(color('testador')?.style.getPropertyValue('--cor')).toBe('#030303');
      const seg = document.querySelector<HTMLElement>(
        '#mp-custo-dias .pilha i[data-tipo="testador"]',
      );
      expect(seg?.style.getPropertyValue('--cor')).toBe('#030303');
      const sw = document.querySelector<HTMLElement>('#mp-custo-chaves li .amostra');
      expect(sw?.style.getPropertyValue('--cor')).toBe('#010101');
    });

    it('without dash.colors, the page state colors in rotation (classes cor-0 to cor-3)', () => {
      mount({ sessions: SESS });
      expect(color('fase')?.className).toContain('cor-0');
      expect(color('testador')?.className).toContain('cor-2');
      expect(color('fase')?.style.getPropertyValue('--cor')).toBe('');
    });

    it('without dash.colors, the 7 session kinds have distinct classes, without reusing ok/warn/bad', () => {
      mount({
        sessions: [
          'fase',
          'correção',
          'testador',
          'reteste',
          'fechamento',
          'coordenador',
          'supervisor',
        ].map((k, n) => sess('k' + n, k, '#10', 1, { created: '2026-11-13T01:30:00Z' })),
      });
      const kinds = [
        'fase',
        'correção',
        'testador',
        'reteste',
        'fechamento',
        'coordenador',
        'supervisor',
      ];
      const cls = kinds.map((t) => {
        const c = color(t);
        return Array.from(c?.classList ?? []).find((k) => k.startsWith('cor-'));
      });
      expect(new Set(cls).size).toBe(7);
      expect(cls.every(Boolean)).toBe(true);
      const css = readFileSync(PAGE, 'utf8');
      for (const k of cls) {
        const block = new RegExp(`#mp \\.${k}\\s*\\{[^}]*\\}`).exec(css)?.[0] ?? '';
        expect(block).not.toMatch(/--color-(ok|warn|bad)/);
      }
    });

    it('the skill describes the CI in the card as "<stage> · CI: PR #p", without the "Current step" column', () => {
      const skill = readFileSync('.claude/skills/implementar-fila/SKILL.md', 'utf8');
      expect(skill).not.toContain('"Current step" column, as');
      expect(skill).toContain('`<stage> · CI: PR #p`');
    });

    it('dash.colors that is not a list of strings does not break the page', () => {
      for (const colors of [undefined, null, 3, {}, [], [1, 2]]) {
        expect(() => mount({ sessions: SESS }, QUEUE, { colors })).not.toThrow();
        expect(color('fase')?.className).toContain('cor-0');
      }
    });
  });

  it('without meta.sessions no part of the card breaks and the rest of the panel continues', () => {
    const panel = mount({ sessions: 'invalid text' });
    expect(() => panel.render()).not.toThrow();
    expect(cardText('#mp-custo-total')).toBe('—');
    expect(cardText('#mp-custo-dias')).toBe('—');
    expect(cardText('#mp-custo-tipo')).toBe('—');
    expect(cardText('#mp-custo-etapas')).toBe('—');
    expect(document.querySelector('#mp-custo tbody')?.children).toHaveLength(0);
  });
});

// Phase FQ2 (stage #1791, decisions 6 and 8): the total time stops at `meta.runEnd` (or at the latest
// valid `ended` once every row is final), the fast track has its own tag and tone, and the `recusada`
// rows show in "Completed".
describe('queue panel page: fast track in the queue (FQ2)', () => {
  const NOW = '2026-11-13T14:00:00Z';
  const START = '2026-11-13T10:00:00Z';
  const mount = (meta: Row, queue: Row[] = [], opts: { colors?: unknown } = {}) => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(NOW));
    const panel = loadPanel(meta, queue, opts);
    panel.render();
    return panel;
  };
  const total = () => ({ big: text('#mp-total'), lab: text('#mp-totlab') });
  const fin = (issue: string, status: string, ended: string) =>
    queueRow({ issue, status, ended, started: START });

  describe('total time', () => {
    it('stops at meta.runEnd even with a row still waiting for the owner', () => {
      mount({ runStart: START, runEnd: '2026-11-13T12:30:00Z' }, [
        fin('#1', 'concluída', '2026-11-13T11:00:00Z'),
        queueRow({ issue: '#2', status: 'esperando dono' }),
      ]);
      expect(total()).toEqual({ big: '02:30:00', lab: 'finished' });
    });

    it('stops at runEnd when a stage failed and the others are not final', () => {
      const panel = mount({ runStart: START, runEnd: '2026-11-13T11:00:00Z' }, [
        fin('#1', 'falhou', '2026-11-13T10:30:00Z'),
        queueRow({ issue: '#2', status: 'aguardando' }),
      ]);
      vi.setSystemTime(new Date('2026-11-14T10:00:00Z'));
      panel.tick();
      expect(total()).toEqual({ big: '01:00:00', lab: 'finished' });
    });

    it('without runEnd, stops at the latest valid ended once every row is concluída, falhou or recusada', () => {
      mount({ runStart: START }, [
        fin('#1', 'concluída', '2026-11-13T11:00:00Z'),
        fin('#2', 'falhou', '2026-11-13T13:00:00Z'),
        fin('#3', 'recusada', '2026-11-13T12:00:00Z'),
      ]);
      expect(total()).toEqual({ big: '03:00:00', lab: 'finished' });
    });

    it('without runEnd and with a row not final, runs in real time', () => {
      mount({ runStart: START }, [
        fin('#1', 'concluída', '2026-11-13T11:00:00Z'),
        queueRow({ issue: '#2', status: 'em andamento' }),
      ]);
      expect(total()).toEqual({ big: '04:00:00', lab: 'real time' });
    });

    it('an empty or invalid runEnd does not stop the total', () => {
      mount({ runStart: START, runEnd: '' }, [
        queueRow({ issue: '#2', status: 'em andamento' }),
      ]);
      expect(total().lab).toBe('real time');
      mount({ runStart: START, runEnd: 'not a date' }, [
        queueRow({ issue: '#2', status: 'em andamento' }),
      ]);
      expect(total()).toEqual({ big: '04:00:00', lab: 'real time' });
    });

    it('a final row with a missing or invalid ended never gives NaN', () => {
      mount({ runStart: START }, [
        fin('#1', 'concluída', '2026-11-13T11:00:00Z'),
        fin('#2', 'falhou', ''),
        fin('#3', 'recusada', 'garbage'),
      ]);
      expect(total()).toEqual({ big: '01:00:00', lab: 'finished' });
    });

    it('every row final and no valid ended: "—", never NaN', () => {
      mount({ runStart: START }, [
        fin('#1', 'concluída', ''),
        fin('#2', 'recusada', 'garbage'),
      ]);
      expect(total().big).toBe('—');
      expect(text('#mp-total')).not.toContain('NaN');
      expect(text('#mp-custo-hora')).not.toContain('NaN');
    });

    it('the cost per hour follows the same end: runEnd, then every row final', () => {
      const sessions = [{ id: 's', kind: 'fase', issue: '#1', cost: { usd: 4 } }];
      mount({ sessions, runStart: START, runEnd: '2026-11-13T12:00:00Z' }, [
        fin('#1', 'concluída', '2026-11-13T11:00:00Z'),
        queueRow({ issue: '#2', status: 'esperando dono' }),
      ]);
      expect(text('#mp-custo-hora')).toBe('US$ 2,00');
      mount({ sessions, runStart: START }, [
        fin('#1', 'concluída', '2026-11-13T11:00:00Z'),
        fin('#2', 'falhou', '2026-11-13T12:00:00Z'),
      ]);
      expect(text('#mp-custo-hora')).toBe('US$ 2,00');
    });

    it('a panel without runEnd still renders as before (waiting time and "—")', () => {
      mount({ waitingSince: '2026-11-13T13:00:00Z' });
      expect(total()).toEqual({
        big: '01:00:00',
        lab: "waiting for the owner's command (waiting time)",
      });
    });
  });

  describe('via-rapida kind', () => {
    const VR_NODES = [
      {
        issue: '#9',
        titulo: 'Fast',
        onda: 0,
        rank: 1,
        estado: 'rodando',
        motivo: '',
        fase: '',
        feitas: 0,
        total: 0,
      },
    ];
    it('the tag of a via-rapida row has its own class, in the track and in Completed', () => {
      mount({ grafoNos: VR_NODES, grafoSetas: [] }, [
        queueRow({ issue: '#9', status: 'em andamento', kind: 'via-rapida' }),
        queueRow({
          issue: '#8',
          status: 'concluída',
          kind: 'via-rapida',
          ended: '2026-11-13T11:00:00Z',
        }),
        queueRow({
          issue: '#7',
          status: 'concluída',
          kind: 'etapa',
          ended: '2026-11-13T11:00:00Z',
        }),
      ]);
      const track = document.querySelector(
        '#mp-andamento article[data-issue="#9"] .tags .tipo',
      );
      expect(track?.textContent).toBe('via-rapida');
      expect(track?.classList.contains('tipo-via-rapida')).toBe(true);
      const lines = Array.from(document.querySelectorAll('#mp-concluidas .cl'));
      const tagOf = (n: string) =>
        lines
          .find((l) => l.querySelector('a.num')?.textContent === n)
          ?.querySelector('.tipo');
      expect(tagOf('#8')?.classList.contains('tipo-via-rapida')).toBe(true);
      expect(tagOf('#7')?.classList.contains('tipo-via-rapida')).toBe(false);
    });

    it('a meta.sessions entry of kind via-rapida gets the eighth tone and the last position', () => {
      mount(
        {
          sessions: [
            {
              id: 'a',
              kind: 'via-rapida',
              issue: '#9',
              cost: { usd: 1 },
              created: START,
            },
            {
              id: 'b',
              kind: 'supervisor',
              issue: null,
              cost: { usd: 2 },
              created: START,
            },
            { id: 'c', kind: 'fase', issue: '#9', cost: { usd: 3 }, created: START },
          ],
        },
        [],
      );
      const segs = Array.from(
        document.querySelectorAll<HTMLElement>('#mp-custo-dias [data-tipo]'),
      );
      expect(segs.map((s) => s.dataset.tipo)).toEqual([
        'fase',
        'supervisor',
        'via-rapida',
      ]);
      expect(segs[2]?.classList.contains('cor-7')).toBe(true);
      expect(segs[1]?.classList.contains('cor-6')).toBe(true);
      const bars = Array.from(
        document.querySelectorAll<HTMLElement>('#mp-custo-tipo [data-tipo]'),
      );
      expect(bars.map((b) => b.dataset.tipo)).toEqual([
        'fase',
        'supervisor',
        'via-rapida',
      ]);
      expect(bars[2]?.classList.contains('cor-7')).toBe(true);
    });

    it('the page comment says eight tones and the CSS has cor-7', () => {
      const page = readFileSync(PAGE, 'utf8');
      expect(page).toContain('Eight neutral tones');
      expect(page).toMatch(/#mp \.cor-7 \{/);
    });
  });

  describe('recusada in Completed', () => {
    const ROWS = [
      queueRow({
        issue: '#10',
        title: 'Merged',
        status: 'concluída',
        kind: 'etapa',
        ended: '2026-11-13T11:00:00Z',
        started: '2026-11-13T10:13:00Z',
      }),
      queueRow({
        issue: '#11',
        title: 'Refused',
        status: 'recusada',
        kind: 'via-rapida',
        ended: '2026-11-13T09:00:00Z',
        started: '2026-11-13T08:00:00Z',
      }),
    ];
    const line = (issue: string) =>
      Array.from(document.querySelectorAll<HTMLElement>('#mp-concluidas .cl')).find(
        (l) => l.querySelector('a.num')?.textContent === issue,
      );

    it('a recusada row appears with the recusada tag, on the day of ended, and no merge time or duration', () => {
      mount({}, ROWS);
      const l = line('#11');
      expect(l).toBeDefined();
      expect(l?.querySelector('.tit')?.textContent).toBe('Refused');
      expect(l?.querySelector('.recusada')?.textContent).toBe('recusada');
      expect(l?.querySelector('.hora')).toBeNull();
      expect(l?.querySelector('.dur')).toBeNull();
      expect(line('#10')?.querySelector('.recusada')).toBeNull();
      expect(line('#10')?.querySelector('.hora')).not.toBeNull();
      expect(document.querySelectorAll('#mp-concluidas .dia')).toHaveLength(1);
    });

    it('the summary counts the merged stages and the refused ones apart', () => {
      mount({}, ROWS);
      expect(text('#mp-concluidas-resumo')).toBe('1 stage · 1 refused');
      mount({}, [ROWS[1] as Row]);
      expect(text('#mp-concluidas-resumo')).toBe('1 refused');
    });

    it('a recusada row is outside the "Completed" tile total, so a finished queue reaches 100%', () => {
      const panel = mount({}, [...ROWS, queueRow({ issue: '#12', status: 'concluída' })]);
      const s = panel.data('summary');
      expect(s.status === 'ok' && s.data[0]).toMatchObject({ total: 2, done: 2 });
      expect(document.querySelector<HTMLElement>('#mp-bar')?.style.width).toBe('100%');
      mount({}, [ROWS[0] as Row]);
      expect(text('#mp-concluidas-resumo')).toBe('1 stage');
    });
  });
});

// Phase EA2 (stage #2373): an early stage that finished its phases waits in the state `entrega`; the card of a node with `cedo`
// carries the tag, the arrow kind `entrega` reads "delivery", the tile counts the wait; an old panel draws as before.
describe.each(FORMS)('queue panel page: early start (EA2), %s', (_forma, wrap) => {
  const EARLY_NODES = [
    graphNode({ issue: '#1', onda: 0, estado: 'rodando', motivo: 'T1 testando' }),
    graphNode({
      issue: '#2',
      onda: 0,
      estado: 'rodando',
      motivo: 'D1 implementando',
      cedo: '#1',
    }),
    graphNode({
      issue: '#3',
      onda: 0,
      estado: 'entrega',
      motivo: 'espera merge de #1, #9 para testar',
      cedo: '#1, #9',
    }),
  ];
  const EARLY_ARROWS = [
    { de: '#1', para: '#2', tipo: 'entrega' },
    { de: '#1', para: '#3', tipo: 'entrega' },
  ];
  const mount = (over: Row = {}, queue: Row[] = []) => {
    const panel = loadPanel(
      {
        sessions: wrap([]),
        vagasItens: wrap(['Vagas 2/4']),
        grafoNos: wrap(EARLY_NODES),
        grafoSetas: wrap(EARLY_ARROWS),
        ...over,
      },
      queue,
    );
    panel.render();
    return panel;
  };

  it('the state `entrega` reads "waiting for a merge to test" and has its own card class', () => {
    mount();
    expect(card('#3')?.querySelector('.est')?.textContent).toBe(
      'waiting for a merge to test',
    );
    expect(card('#3')?.className).toContain('e-entrega');
    expect(card('#3')?.querySelector('.mot')?.textContent).toBe(
      'espera merge de #1, #9 para testar',
    );
  });

  it('the card of a node with `cedo` carries the tag with the holders, and only that card', () => {
    mount({}, [
      queueRow({ issue: '#2', kind: 'etapa', stage: 'Fases' }),
      queueRow({ issue: '#3', kind: 'etapa', stage: 'Fases' }),
    ]);
    expect(card('#2')?.querySelector('.cedo')?.textContent).toBe(
      'cedo · espera #1 para testar',
    );
    expect(card('#3')?.querySelector('.cedo')?.textContent).toBe(
      'cedo · espera #1, #9 para testar',
    );
    expect(card('#1')?.querySelector('.cedo')).toBeNull();
    expect(document.querySelectorAll('#mp-grafo .cedo')).toHaveLength(2);
  });

  it('the tag is drawn even without a queue row, and an empty or missing `cedo` draws none', () => {
    mount({
      grafoNos: wrap([
        graphNode({ issue: '#4', onda: 0, estado: 'rodando', cedo: '' }),
        graphNode({ issue: '#5', onda: 0, estado: 'rodando' }),
      ]),
      grafoSetas: wrap([]),
    });
    expect(document.querySelectorAll('#mp-grafo .cedo')).toHaveLength(0);
    mount({ grafoNos: wrap([EARLY_NODES[1]]), grafoSetas: wrap([]) });
    expect(card('#2')?.querySelector('.cedo')).not.toBeNull();
  });

  it('the `entrega` arrow reads "delivery" in the "waits for" of a node in a later wave and in the legend', () => {
    mount({
      grafoNos: wrap([
        graphNode({ issue: '#1', onda: 0, estado: 'rodando' }),
        graphNode({ issue: '#2', onda: 1, motivo: 'dep #1' }),
      ]),
      grafoSetas: wrap([{ de: '#1', para: '#2', tipo: 'entrega' }]),
    });
    const w = card('#2')?.querySelector('.espera .w');
    expect(w?.className).toContain('entrega');
    expect(w?.getAttribute('title')).toBe('delivery');
    expect(w?.querySelector('.sr')?.textContent).toBe('delivery');
    expect(
      Array.from(document.querySelectorAll('#mp-grafo-legenda li')).some(
        (l) => l.textContent === 'delivery',
      ),
    ).toBe(true);
    expect(
      Array.from(document.querySelectorAll('#mp-grafo-legenda li')).some(
        (l) => l.textContent === 'waiting for a merge to test',
      ),
    ).toBe(true);
  });

  it('the waiting tile counts `esperando entrega` with `esperando dono`', () => {
    const panel = mount({}, [
      queueRow({ issue: '#1', status: 'em andamento' }),
      queueRow({ issue: '#2', status: 'esperando dono' }),
      queueRow({ issue: '#3', status: 'esperando entrega' }),
      queueRow({ issue: '#4', status: 'aguardando' }),
    ]);
    const s = panel.data('summary');
    expect(s.status === 'ok' && s.data[0]).toMatchObject({
      total: 4,
      running: 1,
      waiting: 2,
    });
    expect(text('[data-field="waiting"]')).toBe('2');
  });

  it('an old panel (no `cedo`, no `entrega`) draws the same cards and no tag', () => {
    mount({ grafoNos: wrap(NODES), grafoSetas: wrap(ARROWS) }, QUEUE_TRACK);
    expect(document.querySelectorAll('#mp-grafo .cedo')).toHaveLength(0);
    expect(document.querySelectorAll('#mp-grafo article')).toHaveLength(NODES.length);
    expect(card('#3')?.querySelector('.est')?.textContent).toBe('waiting for file');
    expect(card('#3')?.querySelector('.w.arquivo')).not.toBeNull();
  });
});
