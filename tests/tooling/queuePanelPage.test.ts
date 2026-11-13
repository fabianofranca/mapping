// Fase MT1 (etapa #1619): a página do painel da fila lê os campos-lista do `meta` (`sessions`,
// `vagasItens`, `requests` e `rules`) como lista ou como texto JSON, que é como o tipo Dashboard
// entrega à página a lista aninhada de uma linha. O teste carrega a página com um `dash` falso.
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const PAGE = '.claude/skills/implementar-fila/painel/index.html';

type Row = Record<string, unknown>;
type CalcSpec = { inputs: string[]; fn: (...datasets: Row[][]) => Row[] };
type DataResult = { status: 'ok'; data: Row[] } | { status: 'failed'; message: string };

interface Panel {
  data: (id: string) => DataResult;
  render: () => void;
  /** Dispara o `tick` de 1 s que a página registra no `setInterval`. */
  tick: () => void;
  /** Troca o `meta` na mesma página (a seleção do trilho vive nela); o `render` o relê. */
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
  vi.useRealTimers();
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

// Fase PA1 (etapa #1840): o card "Andamento" desenha o trilho por onda a partir de `meta.grafoNos` e
// `meta.grafoSetas` (lista ou texto JSON), junta a linha do `queue` pelo `issue` e mostra as fases
// em chips; o card "Concluídas" lista as `concluída` do `queue` por dia de Brasília.
const BASE = 'https://github.com/fabianofranca/mapping';

/** Uma linha da fila com os campos que o card lê. */
function fila(over: Row): Row {
  return {
    order: 1,
    issue: '#1',
    title: 'Etapa',
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
/** As linhas do `queue` das etapas do trilho (a #4, a #5 e as outras ficam sem linha). */
const QUEUE_TRILHO: Row[] = [
  fila({
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
  fila({
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
const botao = (issue: string) => card(issue)?.querySelector<HTMLButtonElement>('button');
const faixas = () =>
  Array.from(document.querySelectorAll('#mp-grafo .onda')).map((f) => ({
    rotulo: f.querySelector('.parada .rot')?.textContent,
    qtd: f.querySelector('.parada .qtd')?.textContent,
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
    cod: c.querySelector('.cod')?.textContent,
    sr: c.querySelector('.sr')?.textContent,
    classes: Array.from(c.classList).filter((k) => k !== 'fase'),
    title: c.getAttribute('title'),
  }));
const esperas = (issue: string) =>
  Array.from(card(issue)?.querySelectorAll('.espera .w') ?? []).map((w) => ({
    n: w.querySelector('.n')?.textContent,
    sr: w.querySelector('.sr')?.textContent,
    classes: Array.from(w.classList).filter((k) => k !== 'w'),
    title: w.getAttribute('title'),
  }));
const foco = () =>
  Object.fromEntries(
    ['foco-sel', 'foco-espera', 'foco-segura', 'dim'].map((k) => [
      k,
      Array.from(document.querySelectorAll<HTMLElement>('#mp-grafo article'))
        .filter((a) => a.classList.contains(k))
        .map((a) => a.dataset.issue),
    ]),
  );

const FORMAS: Array<[string, (v: unknown) => unknown]> = [
  ['lista', (v) => v],
  ['texto JSON', (v) => JSON.stringify(v)],
];

describe.each(FORMAS)(
  'página do painel da fila: card "Andamento" (PA1), %s',
  (_forma, wrap) => {
    const montar = (over: Row = {}, queue: Row[] = QUEUE_TRILHO) => {
      const panel = loadPanel(
        {
          sessions: wrap(SESSIONS),
          vagasItens: wrap(GRAFO_VAGAS),
          grafoNos: wrap(NOS),
          grafoSetas: wrap(SETAS),
          ...over,
        },
        queue,
      );
      panel.render();
      return panel;
    };

    it('o card "Andamento" existe e a tabela "Passo a passo", o grafo antigo e o detalhe saíram', () => {
      montar();
      expect(document.querySelector('#mp-andamento h2')?.textContent).toBe('Andamento');
      expect(document.querySelector('#mp-table')).toBeNull();
      expect(document.querySelector('#mp-grafo-detalhe')).toBeNull();
      expect(document.querySelector('#mp-grafo-setas')).toBeNull();
      expect(document.querySelector('#mp svg')).toBeNull();
      expect(document.body.textContent).not.toContain('Passo a passo');
      expect(document.body.textContent).not.toContain('Dependências e ordem de entrada');
    });

    it('uma faixa por onda, "Agora" e "Onda k", com "k etapas" e os cards na ordem da lista', () => {
      montar();
      expect(faixas()).toEqual([
        { rotulo: 'Agora', qtd: '2 etapas', issues: ['#1', '#2'] },
        { rotulo: 'Onda 1', qtd: '2 etapas', issues: ['#3', '#4'] },
        { rotulo: 'Onda 2', qtd: '1 etapa', issues: ['#5'] },
        { rotulo: 'Onda 3', qtd: '3 etapas', issues: ['#6', '#7', '#8'] },
      ]);
      expect(document.querySelector('.onda[data-onda="0"] .parada')?.classList).toContain(
        'agora',
      );
      expect(document.querySelectorAll('#mp-grafo .onda .parada.agora')).toHaveLength(1);
    });

    it('as linhas "Vagas k/N · nenhuma ready elegível", "Ordem prevista" e a legenda', () => {
      montar();
      expect(text('#mp-grafo-vagas')).toBe('Vagas 1/2 · nenhuma ready elegível');
      expect(text('#mp-grafo-ordem')).toBe('Ordem prevista: #2, #3, #4, #5, #6');
      expect(text('#mp-cur')).toContain('· Vagas 1/2');
      montar({ vagasItens: wrap(['Vagas 1/2', '#3 arquivo a.ts com #1']) });
      expect(text('#mp-grafo-vagas')).toBe('Vagas 1/2');
      const leg = Array.from(document.querySelectorAll('#mp-grafo-legenda li')).map(
        (l) => l.textContent,
      );
      for (const rotulo of [
        'rodando',
        'esperando o dono',
        'esperando arquivo',
        'esperando dependência',
        'exclusiva',
        'segurada',
        'livre para entrar',
        'ficha incompleta',
        'mesclada',
        'aberta',
        'ainda não aberta',
        'dependência',
        'arquivo em comum',
      ]) {
        expect(leg.some((l) => l?.includes(rotulo))).toBe(true);
      }
    });

    it('o card é um article com número (link), selo, estado, título no botão e a classe do estado', () => {
      montar();
      const c1 = card('#1');
      expect(c1?.tagName).toBe('ARTICLE');
      expect(c1?.className).toContain('e-rodando');
      expect(c1?.querySelector('.est')?.textContent).toBe('rodando');
      expect(c1?.querySelector('.selo')).toBeNull();
      expect(card('#2')?.querySelector('.selo')?.textContent).toBe('1º');
      expect(card('#2')?.querySelector('.est')?.textContent).toBe('livre para entrar');
      expect(card('#3')?.querySelector('.est')?.textContent).toBe('esperando arquivo');
      expect(card('#4')?.querySelector('.est')?.textContent).toBe(
        'esperando dependência',
      );
      expect(card('#6')?.querySelector('.est')?.textContent).toBe('exclusiva');
      expect(card('#7')?.querySelector('.est')?.textContent).toBe('ficha incompleta');
      expect(card('#8')?.querySelector('.est')?.textContent).toBe('segurada');
      const b = botao('#1');
      expect(b?.getAttribute('type')).toBe('button');
      expect(b?.getAttribute('aria-pressed')).toBe('false');
      expect(b?.textContent).toContain('Etapa #1');
      expect(b?.querySelector('a, button')).toBeNull();
      expect(card('#6')?.querySelector('.tit')?.textContent).toBe(NOS[5]?.titulo);
      const num = c1?.querySelector<HTMLAnchorElement>('a.num');
      expect(num?.textContent).toBe('#1');
      expect(num?.getAttribute('href')).toBe(`${BASE}/issues/1`);
      expect(num?.getAttribute('target')).toBe('_blank');
      expect(num?.getAttribute('rel')).toBe('noopener');
      expect(b?.contains(num ?? null)).toBe(false);
    });

    it('etiquetas: tipo, fluxo, PR em link fora do botão e o CI que espera o coordenador', () => {
      montar();
      expect(tags('#1', '.tipo')).toEqual(['etapa']);
      expect(tags('#1', '.fluxo')).toEqual(['Fases · CI: PR #77']);
      const pr = card('#1')?.querySelector<HTMLAnchorElement>('a.pr');
      expect(pr?.textContent).toBe('PR #77');
      expect(pr?.getAttribute('href')).toBe(`${BASE}/pull/77`);
      expect(pr?.getAttribute('target')).toBe('_blank');
      expect(pr?.getAttribute('rel')).toBe('noopener');
      expect(botao('#1')?.contains(pr ?? null)).toBe(false);
      expect(tags('#3', '.tipo')).toEqual(['bug']);
      expect(tags('#3', '.fluxo')).toEqual([]);
      expect(card('#3')?.querySelector('a.pr')).toBeNull();
    });

    it('fluxo sem CI mostra só o fluxo; CI sem fluxo mostra "CI: …"; PR não numérico não vira link', () => {
      montar({}, [
        fila({ issue: '#1', stage: 'Testador', pr: 'PR #7' }),
        fila({ issue: '#2', ciWait: 'PR #9' }),
        fila({ issue: '#3', pr: 12 }),
      ]);
      expect(tags('#1', '.fluxo')).toEqual(['Testador']);
      expect(card('#1')?.querySelector('a.pr')).toBeNull();
      expect(tags('#2', '.fluxo')).toEqual(['CI: PR #9']);
      expect(card('#3')?.querySelector('a.pr')?.getAttribute('href')).toBe(
        `${BASE}/pull/12`,
      );
    });

    it('um chip por fase, na ordem, com o estado em classe, title e texto para leitor de tela', () => {
      montar();
      expect(chips('#1')).toEqual([
        { cod: 'D1', sr: 'mesclada', classes: ['ok'], title: 'D1: mesclada' },
        { cod: 'D2', sr: 'aberta', classes: ['open'], title: 'D2: aberta' },
        {
          cod: 'D3',
          sr: 'ainda não aberta',
          classes: ['todo'],
          title: 'D3: ainda não aberta',
        },
      ]);
      expect(chips('#3').map((c) => c.classes)).toEqual([['todo'], ['todo']]);
    });

    it('a barra e o "k de n fases": da linha do queue; sem ela, do nó; sem fases, nada', () => {
      montar();
      const larg = (i: string) =>
        card(i)?.querySelector<HTMLElement>('.barra i')?.style.width ?? null;
      expect(parseFloat(larg('#1') ?? '')).toBeCloseTo(33.33, 1);
      expect(text('#mp-grafo article[data-issue="#1"] .fases-n')).toBe('1 de 3 fases');
      expect(larg('#3')).toBe('0%');
      expect(card('#3')?.querySelector('.fases-n')?.textContent).toBe('0 de 2 fases');
      expect(card('#2')?.querySelector('.barra')).toBeNull();
      expect(card('#2')?.querySelector('.fases-n')).toBeNull();

      montar({ grafoNos: wrap([no({ issue: '#9', onda: 1, feitas: 1, total: 4 })]) }, []);
      expect(larg('#9')).toBe('25%');
      expect(card('#9')?.querySelector('.fases-n')?.textContent).toBe('1 de 4 fases');
    });

    it('"espera" com uma etiqueta por seta que chega: cheia na dependência, tracejada no arquivo', () => {
      montar();
      expect(esperas('#3')).toEqual([
        {
          n: '#1',
          sr: 'arquivo em comum',
          classes: ['arquivo'],
          title: 'arquivo em comum',
        },
      ]);
      expect(esperas('#4')).toEqual([
        { n: '#1', sr: 'dependência', classes: ['dep'], title: 'dependência' },
      ]);
      expect(esperas('#6').map((w) => w.n)).toEqual(['#2', '#5']);
      expect(card('#6')?.querySelector('.espera')?.firstChild?.textContent).toBe(
        'espera',
      );
      expect(card('#6')?.querySelector('.mot')).toBeNull();
    });

    it('sem seta (ou na onda 0) o porquê é o motivo do nó', () => {
      montar();
      expect(card('#1')?.querySelector('.mot')?.textContent).toBe('D2 implementando');
      expect(card('#1')?.querySelector('.espera')).toBeNull();
      expect(card('#7')?.querySelector('.mot')?.textContent).toBe(
        'ficha incompleta (toca)',
      );
      expect(card('#7')?.querySelector('.espera')).toBeNull();
      expect(card('#8')?.querySelector('.mot')?.textContent).toBe(
        'esperando dono (decisão)',
      );
    });

    it('o rodapé: duração ao vivo nas começadas e o custo da etapa em US$ com vírgula', () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date('2026-11-13T11:05:07Z'));
      const panel = montar();
      expect(card('#1')?.querySelector('.dur')?.textContent).toBe('01:05:07');
      expect(card('#1')?.querySelector('.custo')?.textContent).toBe('US$ 2,00');
      expect(card('#3')?.querySelector('.dur')).toBeNull();
      expect(card('#3')?.querySelector('.custo')).toBeNull();
      expect(card('#2')?.querySelector('.custo')).toBeNull();
      vi.setSystemTime(new Date('2026-11-13T11:05:09Z'));
      panel.render();
      expect(card('#1')?.querySelector('.dur')?.textContent).toBe('01:05:09');
    });

    it('o tick de 1 s atualiza a duração sem refazer o card', () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date('2026-11-13T10:00:30Z'));
      const panel = montar();
      const dur = card('#1')?.querySelector('.dur');
      expect(dur?.textContent).toBe('00:00:30');
      vi.setSystemTime(new Date('2026-11-13T10:00:45Z'));
      panel.tick();
      expect(card('#1')?.querySelector('.dur')).toBe(dur);
      expect(dur?.textContent).toBe('00:00:45');
    });

    it('o toque no botão seleciona o card e destaca o que ele espera (subindo, a indireta inclusive) e o que o segura', () => {
      montar();
      expect(text('#mp-grafo-ajuda')).toBe(
        'Toque num card para ver o que ele espera e quem espera por ele.',
      );
      botao('#5')?.click();
      expect(botao('#5')?.getAttribute('aria-pressed')).toBe('true');
      expect(botao('#4')?.getAttribute('aria-pressed')).toBe('false');
      expect(document.querySelector('#mp-grafo')?.classList).toContain('foco');
      expect(foco()).toEqual({
        'foco-sel': ['#5'],
        'foco-espera': ['#1', '#4'],
        'foco-segura': ['#6'],
        dim: ['#2', '#3', '#7', '#8'],
      });
      expect(text('#mp-grafo-ajuda')).toBe('#5: espera #1, #4 · segura #6');
    });

    it('a cadeia descendo da raiz e subindo da folha; "nada" quando não há', () => {
      montar();
      botao('#1')?.click();
      expect(foco()['foco-segura']).toEqual(['#3', '#4', '#5', '#6']);
      expect(foco()['foco-espera']).toEqual([]);
      expect(text('#mp-grafo-ajuda')).toBe('#1: espera nada · segura #3, #4, #5, #6');
      botao('#6')?.click();
      expect(foco()['foco-espera']).toEqual(['#1', '#2', '#4', '#5']);
      expect(text('#mp-grafo-ajuda')).toBe('#6: espera #1, #2, #4, #5 · segura nada');
      botao('#7')?.click();
      expect(text('#mp-grafo-ajuda')).toBe('#7: espera nada · segura nada');
    });

    it('o segundo toque desfaz, e tocar noutro card troca a seleção', () => {
      montar();
      botao('#6')?.click();
      botao('#6')?.click();
      expect(botao('#6')?.getAttribute('aria-pressed')).toBe('false');
      expect(document.querySelector('#mp-grafo')?.classList).not.toContain('foco');
      expect(foco()).toEqual({
        'foco-sel': [],
        'foco-espera': [],
        'foco-segura': [],
        dim: [],
      });
      expect(text('#mp-grafo-ajuda')).toContain('Toque num card');
      botao('#6')?.click();
      botao('#1')?.click();
      expect(botao('#6')?.getAttribute('aria-pressed')).toBe('false');
      expect(botao('#1')?.getAttribute('aria-pressed')).toBe('true');
    });

    it('os links da issue e do PR não selecionam o card', () => {
      montar();
      card('#1')?.querySelector<HTMLElement>('a.num')?.click();
      card('#1')?.querySelector<HTMLElement>('a.pr')?.click();
      expect(botao('#1')?.getAttribute('aria-pressed')).toBe('false');
      expect(text('#mp-grafo-ajuda')).toContain('Toque num card');
    });

    it('a seleção sobrevive a uma nova leitura dos dados e some se a etapa sai', () => {
      const panel = montar();
      botao('#6')?.click();
      panel.render();
      expect(botao('#6')?.getAttribute('aria-pressed')).toBe('true');
      expect(text('#mp-grafo-ajuda')).toContain('#6: espera');
      panel.setMeta({
        grafoNos: wrap(NOS.filter((n) => n.issue !== '#6')),
        grafoSetas: wrap(SETAS),
      });
      panel.render();
      expect(card('#6')).toBeNull();
      expect(document.querySelector('#mp-grafo')?.classList).not.toContain('foco');
      expect(text('#mp-grafo-ajuda')).toContain('Toque num card');
    });

    it('a nova leitura devolve o foco ao botão que o tinha', () => {
      const panel = montar();
      botao('#4')?.focus();
      expect(document.activeElement).toBe(botao('#4'));
      panel.render();
      expect(document.activeElement).toBe(botao('#4'));
      expect(botao('#4')?.isConnected).toBe(true);
    });

    it('nó sem linha no queue: card sem etiquetas, chips e custo, sem erro', () => {
      montar();
      expect(card('#4')).not.toBeNull();
      expect(card('#4')?.querySelector('.tags')?.children.length ?? 0).toBe(0);
      expect(chips('#4')).toEqual([]);
      expect(card('#4')?.querySelector('.custo')).toBeNull();
      expect(card('#4')?.querySelector('.dur')).toBeNull();
      expect(card('#4')?.querySelector('a.num')?.textContent).toBe('#4');
    });

    it('id com aspas ou colchete não derruba a página e o resto do painel é preenchido', () => {
      const estranho = '#9"]x';
      const panel = loadPanel({
        sessions: wrap(SESSIONS),
        grafoNos: wrap([...NOS, no({ issue: estranho, onda: 4 })]),
        grafoSetas: wrap([...SETAS, { de: '#6', para: estranho, tipo: 'dep' }]),
      });
      expect(() => panel.render()).not.toThrow();
      expect(text('#mp-custo-total')).toBe('US$ 4.25 em 3 sessões');
      expect(card(estranho)).not.toBeNull();
      expect(esperas(estranho).map((w) => w.n)).toEqual(['#6']);
      botao(estranho)?.click();
      expect(botao(estranho)?.getAttribute('aria-pressed')).toBe('true');
    });

    it('nó sem onda numérica cai em "Agora" e conta como onda 0 também para o "espera"', () => {
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
      expect(faixas().map((f) => [f.rotulo, f.issues])).toEqual([
        ['Agora', ['#1', '#2']],
        ['Onda 1', ['#3']],
      ]);
      expect(card('#2')?.querySelector('.espera')).toBeNull();
      expect(esperas('#3').map((w) => w.n)).toEqual(['#1', '#2']);
    });
  },
);

describe('página do painel da fila: card "Andamento" sem dados (PA1)', () => {
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
      expect(document.querySelectorAll('#mp-grafo .onda')).toHaveLength(0);
      expect(document.querySelector('#mp-vagas')).toBeNull();
      expect(text('#mp-concluidas-lista')).toBe('—');
    },
  );

  it('grafoSetas ausente ou inválido com nós válidos: desenha os nós sem "espera"', () => {
    const panel = loadPanel({ grafoNos: NOS, grafoSetas: '[{' });
    expect(() => panel.render()).not.toThrow();
    expect(faixas()).toHaveLength(4);
    expect(card('#6')?.querySelector('.espera')).toBeNull();
    expect(card('#6')?.querySelector('.mot')?.textContent).toBe('dep #2, #5');
  });

  it('campos fora do tipo no nó e na linha do queue não derrubam a página', () => {
    const panel = loadPanel(
      {
        grafoNos: [
          { issue: '#1', onda: 0, titulo: 5, estado: 'x', rank: 'a', total: 'b' },
          null,
          7,
        ],
        grafoSetas: [null, { de: '#1' }, { de: '#1', para: '#1', tipo: 'dep' }],
      },
      [fila({ issue: '#1', phases: 5, phasesTotal: 'x', started: 'lixo', pr: null })],
    );
    expect(() => panel.render()).not.toThrow();
    expect(card('#1')).not.toBeNull();
  });
});

describe('página do painel da fila: card "Concluídas" (PA1)', () => {
  const dia = (ended: string, started = '') => ({ ended, started });
  const CONCLUIDAS: Row[] = [
    fila({
      issue: '#10',
      title: 'Primeira',
      status: 'concluída',
      kind: 'etapa',
      pr: '100',
      order: 1,
      ...dia('2026-11-13T11:00:00Z', '2026-11-13T10:13:00Z'),
    }),
    fila({
      issue: '#50',
      title: 'Sem data',
      status: 'concluída',
      order: 9,
    }),
    fila({
      issue: '#40',
      title: 'Ontem',
      status: 'concluída',
      order: 4,
      ...dia('2026-11-12T20:00:00Z'),
    }),
    fila({
      issue: '#30',
      title: 'Passou da meia-noite em UTC, mas ainda é sexta em Brasília '.repeat(3),
      status: 'concluída',
      kind: 'bug',
      order: 3,
      ...dia('2026-11-14T01:30:00Z', '2026-11-14T00:30:00Z'),
    }),
    fila({
      issue: '#20',
      title: 'Segunda',
      status: 'concluída',
      kind: 'bug',
      pr: '#200',
      order: 2,
      ...dia('2026-11-13T15:30:00Z', '2026-11-13T13:25:00Z'),
    }),
    fila({ issue: '#60', title: 'Em andamento', status: 'em andamento' }),
    fila({ issue: '#70', title: 'Aguardando', status: 'aguardando' }),
  ];
  const SESS = [
    { id: 's1', kind: 'fase', issue: '#10', cost: { usd: 1.5 } },
    { id: 's2', kind: 'testador', issue: '#10', cost: { usd: 0.5 } },
    { id: 's3', kind: 'fase', issue: '#20', cost: { usd: 2.25 } },
    { id: 's4', kind: 'fase', issue: '#60', cost: { usd: 9 } },
  ];
  const montar = (queue = CONCLUIDAS, meta: Row = { sessions: SESS }) => {
    const panel = loadPanel(meta, queue);
    panel.render();
    return panel;
  };
  const dias = () =>
    Array.from(document.querySelectorAll<HTMLElement>('#mp-concluidas .dia')).map(
      (d) => ({
        rotulo: d.querySelector('.dia-rot')?.textContent,
        issues: Array.from(d.querySelectorAll('.cl a.num')).map((a) => a.textContent),
        dentro: d.closest('details') !== null,
      }),
    );
  const linha = (issue: string) =>
    Array.from(document.querySelectorAll<HTMLElement>('#mp-concluidas .cl')).find(
      (l) => l.querySelector('a.num')?.textContent === issue,
    );

  it('só as concluídas do queue, das mais recentes para as mais antigas pelo ended; sem ended no fim', () => {
    montar();
    expect(
      Array.from(document.querySelectorAll('#mp-concluidas .cl a.num')).map(
        (a) => a.textContent,
      ),
    ).toEqual(['#30', '#20', '#10', '#40', '#50']);
  });

  it('agrupa por dia de Brasília: 01:30Z cai no dia anterior; o mais recente aberto, os outros em details', () => {
    montar();
    expect(dias()).toEqual([
      { rotulo: 'sex., 13/11 · 3', issues: ['#30', '#20', '#10'], dentro: false },
      { rotulo: 'qui., 12/11 · 1', issues: ['#40'], dentro: true },
      { rotulo: 'sem data · 1', issues: ['#50'], dentro: true },
    ]);
    const det = document.querySelectorAll('#mp-concluidas details');
    expect(det).toHaveLength(1);
    expect(det[0]?.querySelector('summary')?.textContent).toBe('Ver os dias anteriores');
    expect((det[0] as HTMLDetailsElement).open).toBe(false);
  });

  it('um dia só: sem details', () => {
    montar([CONCLUIDAS[0] as Row]);
    expect(document.querySelector('#mp-concluidas details')).toBeNull();
    expect(dias()).toHaveLength(1);
  });

  it('a linha: número e PR em link, título com reticências e inteiro no title, tipo, hora, duração e custo', () => {
    montar();
    const l10 = linha('#10');
    expect(l10?.querySelector('a.num')?.getAttribute('href')).toBe(`${BASE}/issues/10`);
    expect(l10?.querySelector('a.num')?.getAttribute('target')).toBe('_blank');
    expect(l10?.querySelector('a.num')?.getAttribute('rel')).toBe('noopener');
    expect(l10?.querySelector('.tit')?.textContent).toBe('Primeira');
    expect(l10?.querySelector('.tipo')?.textContent).toBe('etapa');
    expect(l10?.querySelector('a.pr')?.textContent).toBe('PR #100');
    expect(l10?.querySelector('a.pr')?.getAttribute('href')).toBe(`${BASE}/pull/100`);
    expect(l10?.querySelector('.hora')?.textContent).toBe('08:00');
    expect(l10?.querySelector('.dur')?.textContent).toBe('47 min');
    expect(l10?.querySelector('.custo')?.textContent).toBe('US$ 2,00');
    const l20 = linha('#20');
    expect(l20?.querySelector('.tipo')?.textContent).toBe('bug');
    expect(l20?.querySelector('.hora')?.textContent).toBe('12:30');
    expect(l20?.querySelector('.dur')?.textContent).toBe('2 h 05');
    expect(l20?.querySelector('.custo')?.textContent).toBe('US$ 2,25');
    expect(l20?.querySelector('a.pr')).toBeNull();
    const l30 = linha('#30');
    expect(l30?.querySelector('.hora')?.textContent).toBe('22:30');
    expect(l30?.querySelector('.dur')?.textContent).toBe('1 h 00');
    expect(l30?.querySelector('.tit')?.getAttribute('title')).toContain(
      'Passou da meia-noite',
    );
    expect(linha('#40')?.querySelector('.dur')).toBeNull();
    expect(linha('#40')?.querySelector('.custo')).toBeNull();
    expect(linha('#50')?.querySelector('.hora')).toBeNull();
  });

  it('o cabeçalho traz "k etapas · US$ x" (a soma do custo delas, sem as em andamento)', () => {
    montar();
    expect(text('#mp-concluidas-resumo')).toBe('5 etapas · US$ 4,25');
    montar([CONCLUIDAS[0] as Row], {});
    expect(text('#mp-concluidas-resumo')).toBe('1 etapa');
  });

  it('as concluídas de meta.merged sem linha na fila não entram; sem nenhuma o card mostra "—"', () => {
    montar([fila({ issue: '#60', status: 'em andamento' })], {
      merged: '#99',
      sessions: SESS,
    });
    expect(text('#mp-concluidas-lista')).toBe('—');
    expect(text('#mp-concluidas-resumo')).toBe('—');
    expect(document.querySelector('#mp-concluidas .cl')).toBeNull();
  });

  it('a lista não duplica a fila: a concluída não vira card do trilho e a página não tem tabela de passos', () => {
    montar();
    expect(document.querySelector('#mp-table')).toBeNull();
    expect(document.querySelectorAll('#mp-andamento article')).toHaveLength(0);
  });
});
