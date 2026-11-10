// EX6 da etapa "expressões que calculam no formato 4" (#897), decisões 14, 16 e 18: o slider da
// material3-compose lê `value`, `valueStart` e `valueEnd` como número (0 a 1), leva a alça ao
// passo mais próximo (`steps`, como o `SliderState` do Compose) e desenha as marcas por conta
// (`repeat` por `count`), sem as tabelas de décimos e sem o limite de 9 marcas. A regressão contra
// as cenas de antes (tests/fixtures/material3-ex6-v1.json) e os limites de `$switch` e `$eq` ficam
// aqui também.
import { describe, expect, it } from 'vitest';
import { findEntry } from '../../src/model/catalog';
import { instantiate, approximateMeasurer } from '../../src/model/components/instantiate';
import { resolveTokens } from '../../src/model/components/tokens';
import { absoluteBoxes, hasChildren } from '../../src/model/components/scene';
import type { SceneNode } from '../../src/model/components/scene';
import { defaultValues } from '../../src/model/libraryDrawing';
import { solid, spec, text, typeOf } from '../support/material3Library';
import { catalog, draw, missingNodes, oldScenes } from '../support/material3Ex6Fixture';
import type {
  Drawing,
  Mode,
  OldNode,
  OldScene,
  Values,
} from '../support/material3Ex6Fixture';

const slider = findEntry(catalog, 'slider')!;

/** As cenas gravadas guardam o texto que o enum gravava ("0.3"): o campo agora é número. */
function numeric(values: Values): Values {
  const out: Record<string, unknown> = { ...values };
  for (const key of ['value', 'valueStart', 'valueEnd'])
    if (typeof out[key] === 'string') out[key] = Number(out[key]);
  return out as Values;
}

/** Desenha numa instância de largura qualquer (o `$size.width` do componente). */
function drawAt(values: Values, width: number, mode: Mode = 'light'): Drawing {
  const library = catalog.library!;
  return instantiate(
    slider.component!,
    { ...defaultValues(slider.type), ...values },
    { x: 0, y: 0, width, height: 48 },
    {
      measure: approximateMeasurer,
      tokens: resolveTokens(library.tokens, {}, mode),
      ...(library.icons === undefined ? {} : { icons: library.icons }),
    },
  );
}

interface Found {
  readonly node: SceneNode;
  readonly ancestors: readonly SceneNode[];
}

/** Os nós visíveis que cumprem `pred`, com a lista de ancestrais (do mais externo ao pai). */
function collect(d: Drawing, pred: (n: SceneNode) => boolean): Found[] {
  const out: Found[] = [];
  const visit = (node: SceneNode, ancestors: readonly SceneNode[]) => {
    if (!node.visible) return;
    if (pred(node)) out.push({ node, ancestors });
    if (hasChildren(node))
      for (const child of node.children) visit(child, [...ancestors, node]);
  };
  visit(d.root, []);
  return out;
}

const centerX = (d: Drawing, node: SceneNode): number => {
  const b = absoluteBoxes(d.root).get(node.id)!;
  return b.x + b.width / 2;
};
const boxOf = (d: Drawing, node: SceneNode) => absoluteBoxes(d.root).get(node.id)!;

/** O centro das alças visíveis, na ordem do desenho (no range: início e fim). */
const handles = (d: Drawing): { x: number; width: number }[] =>
  collect(d, (n) => n.type === 'rect' && n.name === 'alça').map(({ node }) => ({
    x: centerX(d, node),
    width: boxOf(d, node).width,
  }));

// ---------------------------------------------------------------------------------------------
// A conta esperada (escrita aqui, não copiada da fixture): `SliderState` do Compose
// ---------------------------------------------------------------------------------------------

const count = (steps: unknown): number =>
  typeof steps === 'number' && steps >= 1 ? Math.floor(steps) : 0;
const clamp01 = (v: number): number => Math.min(Math.max(v, 0), 1);
/** O valor encaixado: `coerceIn(0f..1f)` e o passo mais próximo (Slider.kt 2751 a 2759 e 2192 a 2194). */
function snapped(v: number, steps: unknown): number {
  const n = count(steps);
  const c = clamp01(v);
  return n > 0 ? Math.round(c * (n + 1)) / (n + 1) : c;
}

interface Expected {
  readonly n: number;
  readonly inset: number;
  readonly track: number;
  /** O centro da alça (single) ou das alças de início e fim (range), em px da instância. */
  readonly centers: number[];
}

function expected(
  values: {
    type?: string;
    value?: number;
    valueStart?: number;
    valueEnd?: number;
    steps?: unknown;
  },
  width: number,
): Expected {
  const n = count(values.steps);
  const range = values.type === 'range';
  const fractions = range
    ? [
        snapped(values.valueStart ?? 0.2, values.steps),
        snapped(values.valueEnd ?? 0.8, values.steps),
      ]
    : [snapped(values.value ?? 0.5, values.steps)];
  // o recuo de 8 nas pontas: com steps, sempre no range e, no single, só com a alça fora das pontas
  const interior = (q: number) => q > 0 && q < 1;
  const inset = n > 0 && (range || interior(fractions[0]!)) ? 8 : 0;
  const track = width - 4 - 2 * inset;
  return { n, inset, track, centers: fractions.map((q) => 2 + inset + q * track) };
}

/** Confere alças e trilhos de um desenho contra a conta. */
function expectGeometry(
  values: Parameters<typeof expected>[0],
  width: number,
  mode: Mode = 'light',
) {
  const d = drawAt(values as Values, width, mode);
  const e = expected(values, width);
  const hs = handles(d);
  expect(hs.length, 'alças').toBe(e.centers.length);
  hs.forEach((h, i) => expect(h.x, `alça ${i}`).toBeCloseTo(e.centers[i]!, 2));
  const active = collect(d, (n) => n.type === 'rect' && n.name === 'trilho ativo');
  const inactive = collect(d, (n) => n.type === 'rect' && n.name === 'trilho inativo');
  // o trecho que não existe sai com largura 0: só os que têm largura contam
  const r = (x: number) => Math.round(x * 1e4) / 1e4;
  const edges = (found: Found[]) =>
    found
      .filter(({ node }) => boxOf(d, node).width > 1e-6)
      .map(({ node }) => [
        r(boxOf(d, node).x),
        r(boxOf(d, node).x + boxOf(d, node).width),
      ]);
  const first = e.centers[0]!;
  const last = e.centers[e.centers.length - 1]!;
  if (e.centers.length === 1) {
    // single: o trecho ativo vai da borda até 8 antes da alça; o inativo, de 8 depois dela à borda
    expect(edges(active), 'trecho ativo').toEqual(
      first - 8 > 2 ? [[2, r(first - 8)]] : [],
    );
    expect(edges(inactive), 'trecho inativo').toEqual(
      first + 8 < width - 2 ? [[r(first + 8), width - 2]] : [],
    );
  } else {
    expect(edges(active), 'trecho ativo').toEqual(
      last - 8 > first + 8 ? [[r(first + 8), r(last - 8)]] : [],
    );
    expect(edges(inactive), 'trechos inativos').toEqual([
      ...(first - 8 > 2 ? [[2, r(first - 8)]] : []),
      ...(last + 8 < width - 2 ? [[r(last + 8), width - 2]] : []),
    ]);
  }
  return { d, e };
}

// ---------------------------------------------------------------------------------------------
// A alça no passo mais próximo
// ---------------------------------------------------------------------------------------------

describe('EX6 slider — o valor é número e a alça vai ao passo mais próximo', () => {
  it('value 0,37 com steps 4 desenha a alça em 0,4 (e não em 0,37)', () => {
    const d = draw('slider', { type: 'single', value: 0.37, steps: 4 });
    const [handle] = handles(d);
    // trilho de 308 a partir de 10: 10 + 0,4 × 308 = 133,2
    expect(handle!.x).toBeCloseTo(133.2, 2);
    expect(handle!.x).not.toBeCloseTo(10 + 0.37 * 308, 1);
    // e o resto segue o mesmo valor: o trecho ativo para 8 antes da alça
    const active = collect(d, (n) => n.type === 'rect' && n.name === 'trilho ativo');
    expect(boxOf(d, active[0]!.node).width).toBeCloseTo(133.2 - 8 - 2, 2);
  });

  it('o mesmo valor 0,37 sem steps (contínuo) fica onde está, e steps 0 ou vazio também', () => {
    for (const steps of [null, 0, undefined] as const) {
      const d = draw('slider', { type: 'single', value: 0.37, steps });
      expect(handles(d)[0]!.x).toBeCloseTo(2 + 0.37 * 324, 2);
    }
  });

  it('no range, valueStart e valueEnd vão ao passo mais próximo do mesmo jeito', () => {
    const d = draw('slider', {
      type: 'range',
      valueStart: 0.37,
      valueEnd: 0.83,
      steps: 4,
    });
    const [start, end] = handles(d);
    expect(start!.x).toBeCloseTo(10 + 0.4 * 308, 2);
    expect(end!.x).toBeCloseTo(10 + 0.8 * 308, 2);
  });

  it('o passo mais próximo vale para qualquer steps: 1, 2, 3, 4, 7, 12 e 30', () => {
    for (const steps of [1, 2, 3, 4, 7, 12, 30])
      for (let i = 0; i <= 40; i++) {
        const value = i / 40 + 0.0123;
        expectGeometry({ type: 'single', value, steps }, 328);
      }
  });

  it('valor fora de 0 a 1 prende em 0..1, com ou sem steps', () => {
    for (const steps of [null, 4]) {
      const low = draw('slider', { type: 'single', value: -0.2, steps });
      const zero = draw('slider', { type: 'single', value: 0, steps });
      const high = draw('slider', { type: 'single', value: 1.7, steps });
      const one = draw('slider', { type: 'single', value: 1, steps });
      expect(handles(low)).toEqual(handles(zero));
      expect(handles(high)).toEqual(handles(one));
    }
    const range = draw('slider', { type: 'range', valueStart: -1, valueEnd: 3 });
    const [start, end] = handles(range);
    expect(start!.x).toBeCloseTo(2, 2);
    expect(end!.x).toBeCloseTo(326, 2);
  });

  it('valor vazio usa o padrão do campo (0,5; 0,2 e 0,8)', () => {
    for (const empty of [null, undefined, '']) {
      const single = draw('slider', { type: 'single', value: empty as never });
      expect(handles(single)[0]!.x).toBeCloseTo(2 + 0.5 * 324, 2);
      const range = draw('slider', {
        type: 'range',
        valueStart: empty as never,
        valueEnd: empty as never,
      });
      expect(handles(range).map((h) => h.x)).toEqual([
        expect.closeTo(2 + 0.2 * 324, 2),
        expect.closeTo(2 + 0.8 * 324, 2),
      ]);
    }
  });

  it('steps não inteiro vale o inteiro de baixo (4,7 desenha como 4)', () => {
    const a = draw('slider', { type: 'single', value: 0.37, steps: 4.7 });
    const b = draw('slider', { type: 'single', value: 0.37, steps: 4 });
    expect(handles(a)).toEqual(handles(b));
    expect(marksOf(a)).toEqual(marksOf(b));
  });

  it('o recuo de 8 nas pontas some quando o valor encaixado cai na ponta (0,03 com steps 4 vale 0)', () => {
    const d = draw('slider', { type: 'single', value: 0.03, steps: 4 });
    expect(handles(d)[0]!.x).toBeCloseTo(2, 2);
    const e = draw('slider', { type: 'single', value: 0.98, steps: 4 });
    expect(handles(e)[0]!.x).toBeCloseTo(326, 2);
    // fora da ponta, o recuo volta
    const f = draw('slider', { type: 'single', value: 0.2, steps: 4 });
    expect(handles(f)[0]!.x).toBeCloseTo(10 + 0.2 * 308, 2);
  });

  it('segue a largura da instância ($size): alça, trilhos e marcas em 200 e em 640', () => {
    for (const width of [120, 200, 328, 640]) {
      for (const steps of [null, 4, 12]) {
        for (const type of ['single', 'range']) {
          expectGeometry(
            { type, value: 0.37, valueStart: 0.26, valueEnd: 0.83, steps },
            width,
          );
        }
      }
    }
  });

  it('o estado de interação estreita a alça (2) no valor encaixado, e o desabilitado vence', () => {
    const d = draw('slider', {
      type: 'single',
      value: 0.37,
      steps: 4,
      interaction: 'focused',
    });
    expect(handles(d)).toEqual([{ x: expect.closeTo(133.2, 2), width: 2 }]);
    const off = draw('slider', {
      type: 'single',
      value: 0.37,
      steps: 4,
      interaction: 'pressed',
      enabled: 'false',
    });
    expect(handles(off)).toEqual([{ x: expect.closeTo(133.2, 2), width: 4 }]);
  });
});

// ---------------------------------------------------------------------------------------------
// As marcas: exatamente as de steps, em qualquer steps
// ---------------------------------------------------------------------------------------------

type Kind = 'secondary' | 'primary';
interface Mark {
  readonly x: number;
  readonly kind: Kind;
}

const tokens = spec.tokens!.values as Record<string, unknown>;
const tok = (name: string, mode: Mode): string => {
  const value = tokens[name] as string | Record<Mode, string>;
  return typeof value === 'string' ? value : value[mode];
};

/** O tipo de uma marca desenhada: `secondary-container` sobre o trecho ativo, `primary` fora dele. */
function kindOf(d: Drawing, node: SceneNode, mode: Mode, enabled: boolean): Kind {
  if (!enabled) return Math.abs(node.opacity - 0.12) < 0.01 ? 'secondary' : 'primary';
  return solid(node.fills) === tok('secondary-container', mode) ? 'secondary' : 'primary';
}

/** As marcas visíveis (as de `repeat`, dentro da fileira), por posição. */
function marksOf(d: Drawing, mode: Mode = 'light', enabled = true): Mark[] {
  return collect(d, (n) => n.type === 'ellipse' && n.name === 'marca')
    .map(({ node }) => ({ x: boxOf(d, node).x, kind: kindOf(d, node, mode, enabled) }))
    .sort((a, b) => a.x - b.x);
}

/**
 * As marcas que a conta pede: a marca k fica em `8 + (largura - 20) × k / (steps + 1)`. Com steps,
 * entre as alças (ou antes da alça do single) é `secondary-container`, fora delas é `primary`, e a
 * que cairia sob uma alça não é desenhada. Sem steps só há as duas pontas e só as de `primary`
 * (antes da alça do início e depois da alça do fim, comparando a posição da marca com a da alça
 * em px); a primeira do single não existe e a última só aparece com trecho inativo depois dela.
 */
function expectedMarks(
  values: {
    type?: string;
    value?: number;
    valueStart?: number;
    valueEnd?: number;
    steps?: unknown;
  },
  width: number,
): Mark[] {
  const n = count(values.steps);
  const parts = n + 1;
  const range = values.type === 'range';
  // a alça em unidades de passo: inteira com steps; sem, a própria fração (as duas pontas são 0 e 1)
  const place = (v: number) => (n > 0 ? Math.round(clamp01(v) * parts) : clamp01(v));
  const first = range ? place(values.valueStart ?? 0.2) : -1;
  const last = place(range ? (values.valueEnd ?? 0.8) : (values.value ?? 0.5));
  const out: Mark[] = [];
  for (let k = 0; k <= parts; k++) {
    const s = Math.min(k - first, last - k);
    if (Math.abs(s) < 1e-6) continue;
    if (s > 0 && n === 0) continue; // sem steps não há marca sobre o trecho ativo
    if (s < 0 && n === 0 && !range && k === 0) continue;
    out.push({
      x: 8 + ((width - 20) * k) / parts,
      kind: s > 0 ? 'secondary' : 'primary',
    });
  }
  return out;
}

function expectMarks(
  values: Parameters<typeof expectedMarks>[0] & { enabled?: string },
  width: number,
  mode: Mode = 'light',
) {
  const d = drawAt(values as Values, width, mode);
  const got = marksOf(d, mode, values.enabled !== 'false');
  const want = expectedMarks(values, width);
  expect(got.length, JSON.stringify(values)).toBe(want.length);
  got.forEach((m, i) => {
    expect(m.x, `x da marca ${i}`).toBeCloseTo(want[i]!.x, 3);
    expect(m.kind, `tipo da marca ${i}`).toBe(want[i]!.kind);
  });
  return got;
}

describe('EX6 slider — as marcas de steps', () => {
  it('desenha steps marcas entre as pontas (mais as duas pontas) para qualquer steps, e não 9 de 10 em diante', () => {
    for (const steps of [1, 2, 4, 9, 10, 12, 20, 30]) {
      for (const width of [328, 200]) {
        // o valor no meio e fora de qualquer passo: nenhuma marca cai sob a alça sem querer
        const values = { type: 'single', value: 0.5, steps };
        const marks = expectMarks(values, width);
        const at = (k: number) => 8 + ((width - 20) * k) / (steps + 1);
        // as marcas k = 0 e k = steps + 1 são as pontas; entre elas, exatamente steps menos a da alça
        const underHandle = Math.round(0.5 * (steps + 1));
        const between = marks.filter(
          (m) => m.x > at(0) + 0.01 && m.x < at(steps + 1) - 0.01,
        );
        expect(between.length, `steps ${steps}`).toBe(steps - 1);
        expect(marks.map((m) => m.x)).not.toContainEqual(
          expect.closeTo(at(underHandle), 3),
        );
        // com a alça num passo, os outros steps - 1 intermediários e as duas pontas aparecem
        expect(marks.length).toBe(steps + 1);
      }
    }
  });

  it('steps 12 desenha as 12 marcas (antes: 9) e a alça cai no passo de 13 partes', () => {
    const d = draw('slider', { type: 'single', value: 0.5, steps: 12 });
    const marks = marksOf(d);
    // 0,5 × 13 = 6,5 arredonda para 7: a marca 7 fica sob a alça e não é desenhada
    expect(handles(d)[0]!.x).toBeCloseTo(10 + (7 / 13) * 308, 2);
    expect(marks.length).toBe(13); // 12 intermediárias + 2 pontas - 1 sob a alça
    expect(marks.filter((m) => m.kind === 'secondary').length).toBe(7); // k = 0..6
    expect(marks.filter((m) => m.kind === 'primary').length).toBe(6); // k = 8..13
  });

  it('sem steps (vazio, 0 ou menor que 1) só há a marca do fim, e só com trecho inativo depois da alça', () => {
    for (const steps of [null, undefined, 0, 0.5]) {
      const d = draw('slider', { type: 'single', value: 0.4, steps });
      expect(marksOf(d)).toEqual([{ x: expect.closeTo(316, 3), kind: 'primary' }]);
      expect(marksOf(draw('slider', { type: 'single', value: 1, steps }))).toEqual([]);
    }
    // o range tem também a marca do início, antes da alça do início
    const range = draw('slider', { type: 'range', valueStart: 0.3, valueEnd: 0.6 });
    expect(marksOf(range).map((m) => m.x)).toEqual([8, expect.closeTo(316, 3)]);
  });

  it('o range pinta as marcas entre as alças e fora delas com cores diferentes, e a contagem é a de steps', () => {
    const d = draw('slider', {
      type: 'range',
      valueStart: 0.3,
      valueEnd: 0.7,
      steps: 12,
    });
    const marks = marksOf(d);
    // 0,3 × 13 = 3,9 → 4 e 0,7 × 13 = 9,1 → 9: as marcas 4 e 9 ficam sob as alças
    expect(marks.length).toBe(14 - 2);
    expect(marks.filter((m) => m.kind === 'secondary').length).toBe(4); // k = 5..8
    expect(marks.filter((m) => m.kind === 'primary').length).toBe(8);
  });

  it('segue a conta em todos os tipos, larguras, passos e valores (incluindo as pontas)', () => {
    for (const width of [200, 328]) {
      for (const steps of [null, 1, 4, 12, 25]) {
        for (const value of [0, 0.03, 0.37, 0.5, 0.98, 1]) {
          expectMarks({ type: 'single', value, steps }, width);
          expectMarks(
            { type: 'range', valueStart: value, valueEnd: 1 - value / 2, steps },
            width,
          );
        }
      }
    }
  });

  it('40 passos desenham 40 marcas entre as pontas', () => {
    const d = draw('slider', { type: 'single', value: 0.5, steps: 40 });
    expect(marksOf(d).length).toBe(41); // 40 + 2 pontas - 1 sob a alça
  });

  it('desabilitado (enabled false): as marcas seguem as opacidades do estado', () => {
    for (const mode of ['light', 'dark'] as const)
      expectMarks({ type: 'single', value: 0.37, steps: 4, enabled: 'false' }, 328, mode);
  });
});

// ---------------------------------------------------------------------------------------------
// Regressão: as cenas de antes (decisão 16, ≤ 0,5 px por nó)
// ---------------------------------------------------------------------------------------------

const grid = (v: number, steps: number): boolean =>
  Math.abs(v * (steps + 1) - Math.round(v * (steps + 1))) < 1e-9;

/** O desenho de antes vale (os valores já estão na grade do passo, e o steps é o de antes). */
function unchanged(scene: OldScene): boolean {
  const v = scene.values as Record<string, unknown>;
  const steps = v['steps'];
  if (steps === undefined || steps === null || steps === 0) return true;
  if (typeof steps !== 'number' || steps > 9) return false;
  const nums = ['value', 'valueStart', 'valueEnd']
    .filter((k) => v[k] !== undefined)
    .map((k) => Number(v[k]));
  return nums.every((x) => grid(x, steps));
}

// Os nós de antes que a nova construção não tem, de propósito (nenhum deles desenha pixel; os que
// desenham, `trilho ativo`, `trilho inativo`, `alça` e `marca`, batem com nome, caixa, cor e
// opacidade):
// - os quadros de arrumação (`trilhas`, `recuo`, `pista`, `antes do início`, `trecho ativo`,
//   `depois do fim`, `marcas e alças`, `meio`, `recorte`, `base`, `régua`, `marcas sobre o trecho
//   ativo`, `marcas sobre o trecho inativo`, `fim`): o recuo de 8 deixou de ser um quadro e passou
//   à conta da largura dos trechos (os trechos agora começam na borda da faixa, e a faixa é a
//   `trilhas` de antes), e o truque da régua e do recorte (as marcas de `primary` só aparecem fora
//   do trecho ativo) virou uma conta por marca. A `faixa` fica, com a caixa da `trilhas`;
// - as marcas que ficavam por baixo de outra (a de `secondary-container` no trecho inativo, a de
//   `primary` no ativo), as que ficavam sob a alça e as de preenchimento `none` (as pontas
//   invisíveis): a marca que aparece é a mesma, e `expectMarks` confere posição e cor de todas.
const KEPT_FRAMES = new Set(['slider', 'faixa']);

function skipOld(scene: OldScene, mode: Mode) {
  const enabled = (scene.values as Record<string, unknown>)['enabled'] !== 'false';
  // os centros das alças na cena de antes (nós `alça`: o do início e o do fim, na ordem do desenho)
  const centers = scene.nodes
    .filter((o) => o.t === 'rect' && o.n === 'alça')
    .map((o) => o.r[0]! + o.r[2]! / 2);
  const range = (scene.values as Record<string, unknown>)['type'] === 'range';
  const steps = (scene.values as Record<string, unknown>)['steps'];
  const hasSteps = typeof steps === 'number' && steps >= 1;
  const secondaryFill = tok('secondary-container', mode);
  return (o: OldNode): boolean => {
    if (o.t === 'frame') return !KEPT_FRAMES.has(o.n);
    if (o.t !== 'ellipse') return false;
    if (o.f === undefined) return true; // a ponta invisível (`none`)
    // range sem steps com as duas alças no fim: a marca do fim ficava sobre o fim do trilho
    if (range && !hasSteps && centers.every((c) => c > 318)) return true;
    const centre = o.r[0]! + 2;
    if (centers.some((c) => Math.abs(c - centre) < 1)) return true; // sob a alça
    const active = range
      ? centers.length === 2 && centre > centers[0]! && centre < centers[1]!
      : centre < centers[0]!;
    const old: Kind = enabled
      ? o.f === secondaryFill
        ? 'secondary'
        : 'primary'
      : o.o !== undefined && Math.abs(o.o - 0.12) < 0.01
        ? 'secondary'
        : 'primary';
    return old !== (active ? 'secondary' : 'primary');
  };
}

describe('EX6 slider — regressão contra as cenas de antes', () => {
  const all = oldScenes('slider-');

  it('a fixture traz as cenas esperadas', () => {
    expect(all.length).toBe(167);
  });

  it('as cenas em que o valor já está na grade do passo desenham igual a antes (≤ 0,5 px)', () => {
    const same = all.filter(unchanged);
    expect(same.length).toBeGreaterThan(100);
    for (const scene of same) {
      const d = draw(scene.id, numeric(scene.values), scene.mode);
      expect(
        missingNodes(d, scene.nodes, { skip: skipOld(scene, scene.mode) }),
        scene.key,
      ).toEqual([]);
    }
  });

  it('os 6 exemplos de antes, em claro e escuro, batem com a cena gravada', () => {
    const examples = all.filter((s) => /^slider-ex\d-(light|dark)$/.test(s.key));
    expect(examples.length).toBe(12);
    for (const scene of examples)
      expect(
        missingNodes(draw(scene.id, numeric(scene.values), scene.mode), scene.nodes, {
          skip: skipOld(scene, scene.mode),
        }),
        scene.key,
      ).toEqual([]);
  });

  it('desabilitado (enabled false) e escuro batem com a cena gravada', () => {
    const scenes = all.filter(
      (s) =>
        ((s.values as Record<string, unknown>)['enabled'] === 'false' ||
          s.mode === 'dark') &&
        unchanged(s),
    );
    expect(scenes.length).toBeGreaterThan(20);
    for (const scene of scenes)
      expect(
        missingNodes(draw(scene.id, numeric(scene.values), scene.mode), scene.nodes, {
          skip: skipOld(scene, scene.mode),
        }),
        scene.key,
      ).toEqual([]);
  });

  it('onde o valor não está na grade (steps 1 e 4), a alça vai ao passo e o resto é o desenho do valor arredondado', () => {
    const off = all.filter((s) => {
      const steps = (s.values as Record<string, unknown>)['steps'];
      return (steps === 1 || steps === 4) && !unchanged(s);
    });
    expect(off.length).toBeGreaterThan(20);
    for (const scene of off) {
      const values = numeric(scene.values) as Record<string, unknown> & { steps: number };
      const d = draw(scene.id, values as Values, scene.mode);
      // a alça no passo arredondado (conta do teste), não no valor de antes
      expectGeometry(values as Parameters<typeof expected>[0], 328, scene.mode);
      expectMarks(values as Parameters<typeof expectedMarks>[0], 328, scene.mode);
      // o resto: a cena gravada do valor já arredondado
      const rounded = { ...values } as Record<string, unknown>;
      for (const key of ['value', 'valueStart', 'valueEnd'])
        if (typeof values[key] === 'number')
          rounded[key] = snapped(values[key] as number, values.steps);
      const reference = all.find((s) => {
        const o = numeric(s.values) as Record<string, unknown>;
        return (
          s.mode === scene.mode &&
          s.id === scene.id &&
          ['type', 'value', 'valueStart', 'valueEnd', 'steps', 'enabled'].every(
            (k) => o[k] === rounded[k],
          )
        );
      });
      expect(reference, `${scene.key} arredondada`).toBeDefined();
      expect(
        missingNodes(d, reference!.nodes, { skip: skipOld(reference!, scene.mode) }),
        scene.key,
      ).toEqual([]);
    }
  });

  it('steps 12 (antes: 9 marcas) segue a conta nova: 12 marcas e a alça no passo de 13 partes', () => {
    const scenes = all.filter(
      (s) => (s.values as Record<string, unknown>)['steps'] === 12,
    );
    expect(scenes.length).toBeGreaterThan(10);
    for (const scene of scenes) {
      const values = numeric(scene.values) as Parameters<typeof expected>[0];
      expectGeometry(values, 328, scene.mode);
      expectMarks(values as Parameters<typeof expectedMarks>[0], 328, scene.mode);
    }
  });
});

// ---------------------------------------------------------------------------------------------
// Sem tabelas enumeradas e o tamanho do arquivo
// ---------------------------------------------------------------------------------------------

/** Cada `$switch` com mais de 12 casos e cada `$eq` sobre um campo `number` do tipo. */
function offenders(id: 'slider') {
  const numberFields = new Set(
    typeOf(id)
      .fields.filter((f) => f.type === 'number')
      .map((f) => f.key),
  );
  const found: string[] = [];
  const visit = (value: unknown, path: string): void => {
    if (Array.isArray(value)) return value.forEach((v, i) => visit(v, `${path}[${i}]`));
    if (typeof value !== 'object' || value === null) return;
    const obj = value as Record<string, unknown>;
    const cases = obj['cases'];
    if ('$switch' in obj && typeof cases === 'object' && cases !== null) {
      const total = Object.keys(cases).length;
      if (total > 12) found.push(`${path}: $switch de ${total} casos`);
    }
    const eq = obj['$eq'];
    if (Array.isArray(eq) && typeof eq[0] === 'string' && numberFields.has(eq[0]))
      found.push(`${path}: $eq sobre o campo number ${eq[0]}`);
    for (const [k, v] of Object.entries(obj)) visit(v, `${path}.${k}`);
  };
  visit(JSON.parse(text(`components/${id}.json`)), id);
  return found;
}

describe('EX6 slider — sem tabelas enumeradas', () => {
  it('o slider não tem $switch com mais de 12 casos nem $eq sobre campo number', () => {
    expect(offenders('slider')).toEqual([]);
  });

  it('o slider não tem nenhum $switch de décimos e os campos de valor são number', () => {
    expect(text('components/slider.json')).not.toContain('$switch');
    const fields = typeOf('slider').fields;
    for (const key of ['value', 'valueStart', 'valueEnd'])
      expect(fields.find((f) => f.key === key)?.type, key).toBe('number');
  });

  it('o arquivo fica bem menor que os 93 kB de antes', () => {
    // O alvo era 20 kB; o piso desta construção é o formato do prettier (as contas ficam em
    // dezenas de linhas indentadas, e a largura dos trechos e as marcas dependem do valor
    // encaixado, que não se guarda em variável): ~25 kB, um quarto do de antes.
    expect(text('components/slider.json').length).toBeLessThan(28_000);
  });

  it('o preview e a descrição falam em número, não em décimos nem em 9 passos', () => {
    const component = JSON.parse(text('components/slider.json')) as {
      description: string;
      preview: Record<string, unknown>;
    };
    expect(component.preview['value']).toBe(0.5);
    expect(component.preview['valueStart']).toBe(0.2);
    expect(component.preview['valueEnd']).toBe(0.8);
    expect(component.description).not.toMatch(/décimos|1 a 9/);
    // a tabela de campos do doc é gerada da especialização; o resto (Fidelidade) é escrito à mão
    const written = text('docs/slider.md').split('## Fidelidade')[1] ?? '';
    expect(written.length).toBeGreaterThan(1000);
    expect(/em décimos|desenha como 9|marcas de 1 a 9/.test(written)).toBe(false);
  });
});
