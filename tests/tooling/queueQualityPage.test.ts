// Phase QM4 (stage #1889, decisions 1 and 16): the "Queue cost" card of the queue panel page draws the
// `meta.uso` (table `#mp-uso`) and the `meta.canarios` (list `#mp-canarios`) that painel.py computes. The test
// loads the page with a fake `dash`, like `queuePanelPage.test.ts`. The values come from `painel.py` (session
// kinds, states and verdicts of the canaries), so the file is a guard block.
// portuguese-guard:begin session kinds, canary states and verdicts written by painel.py, frozen vocabulary of decision 16 of #741
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const PAGE = '.claude/skills/implementar-fila/painel/index.html';

type Row = Record<string, unknown>;
type CalcSpec = { inputs: string[]; fn: (...datasets: Row[][]) => Row[] };

interface Panel {
  calc: (id: string, meta?: Row) => Row[];
  render: () => void;
}

/** Mounts the page in the `document` and runs its `<script>` with a fake `dash`. */
function loadPanel(meta: Row): Panel {
  const parsed = new DOMParser().parseFromString(readFileSync(PAGE, 'utf8'), 'text/html');
  const script = parsed.querySelector('script')?.textContent ?? '';
  document.body.replaceChildren(...Array.from(parsed.body.childNodes));

  const datasets: Record<string, Row[]> = { queue: [], meta: [meta], log: [] };
  const calcs = new Map<string, CalcSpec>();
  let onData: () => void = () => undefined;
  const data = (id: string) => {
    const calc = calcs.get(id);
    if (!calc) return { status: 'ok', data: datasets[id] ?? [] };
    return { status: 'ok', data: calc.fn(...calc.inputs.map((i) => datasets[i] ?? [])) };
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
    calc: (id, m) => {
      const spec = calcs.get(id);
      if (!spec) throw new Error(`no calc ${id}`);
      return spec.fn(m ? [m] : [meta]);
    },
    render: () => onData(),
  };
}

const rows = (selector: string) =>
  Array.from(document.querySelectorAll(`${selector} tbody tr`)).map((tr) =>
    Array.from(tr.children).map((td) => td.textContent),
  );
const canaryItems = () =>
  Array.from(document.querySelectorAll('#mp-canarios li .canario')).map((box) =>
    Array.from(box.children).map((c) => c.textContent),
  );

const USO: Row[] = [
  {
    papel: 'testador',
    modelo: 'Sonnet',
    esforco: 'medium',
    sessoes: 42,
    usd: 341.04,
    pct: 24.8,
    medianaSessao: 8.12,
    medianaEtapa: 9.5,
    ctxMediano: 193000,
    acimaTeto: 3,
    intervencoes: 0,
    decididas: 40,
    comRetrabalho: 2,
    sequencia: 11,
    candidato: 'Haiku medium',
  },
  {
    papel: 'fase',
    modelo: 'Sonnet',
    esforco: 'medium',
    sessoes: 27,
    usd: 56.89,
    pct: 4.1,
    medianaSessao: 2.11,
    medianaEtapa: null,
    ctxMediano: 204000,
    acimaTeto: 0,
    intervencoes: 1,
    decididas: 20,
    comRetrabalho: 5,
    sequencia: 2,
    candidato: null,
  },
  {
    papel: 'fase',
    modelo: 'Sonnet',
    esforco: 'high',
    sessoes: 71,
    usd: 427.85,
    pct: 31.1,
    medianaSessao: 6.03,
    medianaEtapa: 12.4,
    ctxMediano: 252000,
    acimaTeto: 9,
    intervencoes: 4,
    decididas: 60,
    comRetrabalho: 12,
    sequencia: 0,
    candidato: null,
  },
  {
    papel: 'supervisor',
    modelo: 'Opus',
    esforco: 'high',
    sessoes: 17,
    usd: 169.18,
    pct: 12.3,
    medianaSessao: 9.95,
    medianaEtapa: null,
    ctxMediano: null,
    acimaTeto: null,
    intervencoes: 0,
    decididas: null,
    comRetrabalho: null,
    sequencia: null,
    candidato: null,
  },
];

const CANARIOS: Row[] = [
  {
    id: 'A',
    papel: 'reteste',
    de: 'Sonnet medium',
    modelo: 'Haiku',
    esforco: 'medium',
    n: 5,
    volta: 2,
    estado: 'em avaliação',
    contadas: 3,
    retrabalhos: ['s7'],
    resumo: {
      antes: {
        sessoes: 16,
        medianaSessao: 3.55,
        medianaEtapa: 4,
        decididas: 16,
        comRetrabalho: 2,
      },
      canario: {
        sessoes: 3,
        medianaSessao: 1.2,
        medianaEtapa: null,
        decididas: 1,
        comRetrabalho: 1,
      },
      veredito: 'não promover',
    },
  },
  {
    id: 'B',
    papel: 'fase',
    de: 'Sonnet high',
    modelo: 'Sonnet',
    esforco: 'medium',
    filtro: 'processo',
    n: 5,
    volta: 2,
    estado: 'encerrado',
    contadas: 5,
    retrabalhos: [],
    resumo: {
      antes: {
        sessoes: 20,
        medianaSessao: 6.03,
        medianaEtapa: 8,
        decididas: 20,
        comRetrabalho: 4,
      },
      canario: {
        sessoes: 5,
        medianaSessao: 2.11,
        medianaEtapa: 2.5,
        decididas: 5,
        comRetrabalho: 0,
      },
      veredito: 'pode promover',
    },
  },
  {
    id: 'C',
    papel: 'reteste',
    de: 'Sonnet medium',
    modelo: 'Haiku',
    esforco: 'medium',
    n: 5,
    volta: 2,
    estado: 'revertido',
    contadas: 2,
    retrabalhos: ['s1', 's2'],
    resumo: {
      antes: {
        sessoes: 16,
        medianaSessao: 3.55,
        medianaEtapa: 4,
        decididas: 16,
        comRetrabalho: 2,
      },
      canario: {
        sessoes: 2,
        medianaSessao: null,
        medianaEtapa: null,
        decididas: 0,
        comRetrabalho: 0,
      },
      veredito: 'revertido',
    },
  },
];

beforeEach(() => {
  document.body.replaceChildren();
});
afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
});

describe('queue panel page: the usage per role, model and effort', () => {
  it('(a) `uso` hands the meta.uso over as it came, list or JSON text; invalid or missing is empty', () => {
    const panel = loadPanel({});
    expect(panel.calc('uso', { uso: USO })).toEqual(USO);
    expect(panel.calc('uso', { uso: JSON.stringify(USO) })).toEqual(USO);
    expect(panel.calc('uso', { uso: '{not json' })).toEqual([]);
    expect(panel.calc('uso', { uso: 'null' })).toEqual([]);
    expect(panel.calc('uso', {})).toEqual([]);
  });

  it('(b) the table has the 12 columns, in a .scroll with data-source="uso"', () => {
    loadPanel({ uso: USO });
    const table = document.querySelector('#mp-uso');
    expect(table).not.toBeNull();
    expect(table?.closest('.scroll')?.getAttribute('data-source')).toBe('uso');
    expect(
      Array.from(document.querySelectorAll('#mp-uso thead th')).map(
        (th) => th.textContent,
      ),
    ).toEqual([
      'Role',
      'Model',
      'Effort',
      'Sessions',
      'US$ (%)',
      'Median per session',
      'Median per stage',
      'Median context',
      'Above ceiling',
      'Rework',
      'Streak',
      'Candidate',
    ]);
  });

  it('(c) one row per item: roles in the page order, then the larger US$ first; null is "—"', () => {
    const panel = loadPanel({ uso: USO });
    panel.render();
    expect(rows('#mp-uso')).toEqual([
      [
        'fase',
        'Sonnet',
        'high',
        '71',
        'US$ 427,85 (31,1%)',
        'US$ 6,03',
        'US$ 12,40',
        '252k',
        '9',
        '12 of 60',
        '0',
        '—',
      ],
      [
        'fase',
        'Sonnet',
        'medium',
        '27',
        'US$ 56,89 (4,1%)',
        'US$ 2,11',
        '—',
        '204k',
        '0',
        '5 of 20',
        '2',
        '—',
      ],
      [
        'testador',
        'Sonnet',
        'medium',
        '42',
        'US$ 341,04 (24,8%)',
        'US$ 8,12',
        'US$ 9,50',
        '193k',
        '3',
        '2 of 40',
        '11',
        '→ Haiku medium',
      ],
      [
        'supervisor',
        'Opus',
        'high',
        '17',
        'US$ 169,18 (12,3%)',
        'US$ 9,95',
        '—',
        '—',
        '—',
        '—',
        '—',
        '—',
      ],
    ]);
  });

  it('(d) the meta.uso as JSON text draws the same table', () => {
    const panel = loadPanel({ uso: JSON.stringify(USO) });
    panel.render();
    expect(rows('#mp-uso')).toHaveLength(4);
  });

  it('(e) without meta.uso the table shows a single "—"', () => {
    const panel = loadPanel({});
    panel.render();
    expect(rows('#mp-uso')).toEqual([['—']]);
    const bad = loadPanel({ uso: '{not json' });
    bad.render();
    expect(rows('#mp-uso')).toEqual([['—']]);
  });

  it('(f) redrawing replaces the rows instead of piling them up', () => {
    const panel = loadPanel({ uso: USO });
    panel.render();
    panel.render();
    expect(rows('#mp-uso')).toHaveLength(4);
  });
});

describe('queue panel page: the canaries', () => {
  it('(a) one item per canary: id, role, from → to, k/n, state, rework, the ruler and the verdict', () => {
    const panel = loadPanel({ canarios: CANARIOS });
    panel.render();
    expect(canaryItems()).toEqual([
      [
        'A · reteste · Sonnet medium → Haiku medium · 3/5 · em avaliação · rework 1/2',
        'before: median US$ 3,55 per session, rework 2 of 16 · canary: median US$ 1,20 per session, rework 1 of 1',
        'não promover',
      ],
      [
        'B · fase · Sonnet high → Sonnet medium · 5/5 · encerrado · rework 0/2',
        'before: median US$ 6,03 per session, rework 4 of 20 · canary: median US$ 2,11 per session, rework 0 of 5',
        'pode promover',
      ],
      [
        'C · reteste · Sonnet medium → Haiku medium · 2/5 · revertido · rework 2/2',
        'before: median US$ 3,55 per session, rework 2 of 16 · canary: median — per session, rework 0 of 0',
        'revertido',
      ],
    ]);
  });

  it('(b) the meta.canarios as JSON text draws the same list', () => {
    const panel = loadPanel({ canarios: JSON.stringify(CANARIOS) });
    panel.render();
    expect(canaryItems()).toHaveLength(3);
  });

  it('(c) without meta.canarios the list shows a single "—"', () => {
    for (const meta of [{}, { canarios: '{not json' }, { canarios: [] }]) {
      const panel = loadPanel(meta);
      panel.render();
      const items = Array.from(document.querySelectorAll('#mp-canarios li')).map(
        (li) => li.textContent,
      );
      expect(items).toEqual(['—']);
    }
  });

  it('(d) a canary without resumo still shows its head, with "—" in the ruler', () => {
    const [first] = CANARIOS as [Row];
    const bare: Row = { ...first };
    delete bare.resumo;
    const panel = loadPanel({ canarios: [bare] });
    panel.render();
    expect(canaryItems()).toEqual([
      [
        'A · reteste · Sonnet medium → Haiku medium · 3/5 · em avaliação · rework 1/2',
        'before: — · canary: —',
        '—',
      ],
    ]);
  });
});

describe('queue panel page: the new blocks of the "Queue cost" card', () => {
  it('(a) the headings sit after "Most expensive stages" and before the folded table', () => {
    loadPanel({});
    const card = document.querySelector('#mp-custo-card');
    const order = Array.from(
      card?.querySelectorAll(
        'h3, #mp-uso, #mp-canarios, #mp-custo-tabela, #mp-custo-etapas',
      ) ?? [],
    ).map((n) => (n.tagName === 'H3' ? n.textContent : n.id));
    expect(order).toEqual([
      'Per day (Brasilia time)',
      'Per session kind',
      'Most expensive stages',
      'mp-custo-etapas',
      'By role, model and effort',
      'mp-uso',
      'Canaries',
      'mp-canarios',
      'mp-custo-tabela',
    ]);
  });

  it('(b) builds the DOM with createElement and textContent: no innerHTML, style="" or setAttribute("style")', () => {
    const html = readFileSync(PAGE, 'utf8');
    expect(html).not.toMatch(/innerHTML|outerHTML|insertAdjacentHTML/);
    expect(html).not.toMatch(/\sstyle="/);
    expect(html).not.toMatch(/setAttribute\(\s*['"]style['"]/);
  });

  it('(c) no fixed design value: the new rules only use the tokens the page already has', () => {
    const html = readFileSync(PAGE, 'utf8');
    const css = html.slice(html.indexOf('<style>'), html.indexOf('</style>'));
    const uso = css.slice(css.indexOf('/* qm4:begin */'), css.indexOf('/* qm4:end */'));
    expect(uso.length).toBeGreaterThan(0);
    expect(uso).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(/);
  });
});
// portuguese-guard:end
