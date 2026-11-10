// EX4 da etapa "expressões que calculam no formato 4" (#897): o date-picker e o time-picker da
// material3-compose desenham por conta (aritmética, `repeat` por contagem, `$sin`/`$cos`), sem as
// tabelas de antes, e ganham o campo `interaction`. A regressão contra as cenas de antes da etapa
// (tests/fixtures/material3-ex4-v1.json) e os limites de `$switch` e `$eq` ficam aqui também.
import { describe, expect, it } from 'vitest';
import { buildCatalog, findEntry } from '../../src/model/catalog';
import { absoluteBoxes, walk } from '../../src/model/components/scene';
import type { SceneNode, TextNode } from '../../src/model/components/scene';
import { drawIn, files, solid, spec, text, typeOf } from '../support/material3Library';
import v1 from '../fixtures/material3-ex4-v1.json';

const catalog = buildCatalog(files);
type Values = Parameters<typeof drawIn>[2];
type Mode = 'light' | 'dark';
type Drawing = ReturnType<typeof drawIn>;
const datePicker = findEntry(catalog, 'date-picker')!;
const timePicker = findEntry(catalog, 'time-picker')!;
const drawDate = (v: Values, mode: Mode = 'light'): Drawing =>
  drawIn(catalog, datePicker, v, mode);
const drawTime = (v: Values, mode: Mode = 'light'): Drawing =>
  drawIn(catalog, timePicker, v, mode);

const tokens = spec.tokens!.values as Record<string, unknown>;
const tok = (name: string, mode: Mode): string => {
  const value = tokens[name] as string | Record<Mode, string>;
  return typeof value === 'string' ? value : value[mode];
};
const num = (name: string): number => tokens[name] as number;

const visibleNodes = (d: Drawing): SceneNode[] =>
  [...walk(d.root)].filter((n) => n.visible);
const boxesOf = (d: Drawing) => absoluteBoxes(d.root);
const rectOf = (d: Drawing, n: SceneNode): number[] => {
  const b = boxesOf(d).get(n.id)!;
  return [b.x, b.y, b.width, b.height];
};
const named = (d: Drawing, name: string): SceneNode[] =>
  visibleNodes(d).filter((n) => n.name === name);

// ---------------------------------------------------------------------------------------------
// date-picker: a grade do mês
// ---------------------------------------------------------------------------------------------

/** O dia da semana do dia 1 (domingo = 0) e o número de dias, pelo calendário do JS. */
function calendar(year: number, month: number) {
  return {
    offset: new Date(Date.UTC(year, month - 1, 1)).getUTCDay(),
    days: new Date(Date.UTC(year, month, 0)).getUTCDate(),
  };
}

/** A caixa dos dias (a grade menos os 12 de margem de cada lado) e a janela em que as células aparecem. */
function gridOf(d: Drawing) {
  const grid = named(d, 'grade')[0]!;
  const [x, y, width, height] = rectOf(d, grid);
  return { x: x! + 12, y: y!, width: width! - 24, height: height! };
}

/** Os dias que aparecem de fato: os que caem dentro da janela da grade. */
function shownDays(d: Drawing): Map<number, number[]> {
  const grid = gridOf(d);
  const out = new Map<number, number[]>();
  for (const n of named(d, 'dia')) {
    const r = rectOf(d, n);
    const inside =
      r[0]! >= grid.x - 0.01 &&
      r[0]! + r[2]! <= grid.x + grid.width + 0.01 &&
      r[1]! >= grid.y - 0.01 &&
      r[1]! + r[3]! <= grid.y + grid.height + 0.01;
    if (inside) out.set(Number((n as TextNode).text), r);
  }
  return out;
}

function expectMonth(year: number, month: number, values: Values = {}) {
  const d = drawDate({
    displayedMonth: 'x',
    selection: 'single',
    ...values,
    month,
    year,
  });
  const { offset, days } = calendar(year, month);
  const grid = gridOf(d);
  const rows = Math.ceil((offset + days) / 7);
  expect(grid.height, `${month}/${year} linhas`).toBe(rows * 48);
  const shown = shownDays(d);
  expect([...shown.keys()].sort((a, b) => a - b)).toEqual(
    Array.from({ length: days }, (_, i) => i + 1),
  );
  for (let day = 1; day <= days; day++) {
    const p = offset + day - 1;
    expect(shown.get(day), `${day}/${month}/${year}`).toEqual([
      grid.x + (p % 7) * 48,
      grid.y + Math.floor(p / 7) * 48,
      48,
      48,
    ]);
  }
  return { d, grid, offset, days, rows };
}

describe('EX4 date-picker — o calendário de month e year', () => {
  it('fevereiro de 2028: 29 dias, o dia 1 na terça, em 5 linhas', () => {
    const { d, grid } = expectMonth(2028, 2);
    expect(grid.height).toBe(240);
    expect(shownDays(d).get(1)![0]).toBe(grid.x + 2 * 48);
    expect(shownDays(d).has(30)).toBe(false);
  });

  it('um mês de 30 dias que começa no sábado (novembro de 2025) tem 6 linhas', () => {
    const { grid } = expectMonth(2025, 11);
    expect(grid.height).toBe(288);
  });

  it('um mês de 28 dias que começa no domingo (fevereiro de 2026) tem 4 linhas', () => {
    const { grid } = expectMonth(2026, 2);
    expect(grid.height).toBe(192);
  });

  it('confere a grade de todos os meses de anos que viram a regra do bissexto', () => {
    for (const year of [1900, 1999, 2000, 2023, 2024, 2025, 2100]) {
      for (let month = 1; month <= 12; month++) expectMonth(year, month);
    }
  });

  it('sem month ou sem year fica a grade de hoje: 31 dias a partir da quarta', () => {
    for (const values of [{}, { month: 2 }, { year: 2028 }] as Values[]) {
      const d = drawDate({
        displayedMonth: 'Outubro de 2025',
        selection: 'single',
        ...values,
      });
      const grid = gridOf(d);
      const shown = shownDays(d);
      expect(grid.height).toBe(240);
      expect(shown.size).toBe(31);
      expect(shown.get(1)![0]).toBe(grid.x + 3 * 48);
    }
  });

  it('o dia escolhido e o dia final do intervalo ficam no lugar do mês, e um dia que o mês não tem não aparece', () => {
    const { d, grid } = expectMonth(2028, 2, { selectedDay: 29 });
    const [marked] = named(d, 'marcado');
    // 29 de fevereiro de 2028: terça + 28 dias = terça, na linha 4
    expect(rectOf(d, marked!)).toEqual([
      grid.x + 2 * 48 + 4,
      grid.y + 4 * 48 + 4,
      40,
      40,
    ]);
    const none = drawDate({
      displayedMonth: 'x',
      selection: 'single',
      month: 2,
      year: 2028,
      selectedDay: 30,
    });
    expect(named(none, 'marcado')).toEqual([]);
  });

  it('o intervalo atravessa semanas: a faixa vai do centro do dia inicial ao do final, linha por linha', () => {
    const d = drawDate({
      displayedMonth: 'x',
      selection: 'range',
      month: 2,
      year: 2028,
      rangeStartDay: 3,
      rangeEndDay: 12,
    });
    const { x, y } = gridOf(d);
    const rows = new Map<number, [number, number]>();
    for (const band of named(d, 'faixa')) {
      const [bx, by, bw, bh] = rectOf(d, band);
      if (bw === 0) continue;
      expect(bh).toBe(40);
      const cur = rows.get(by!);
      rows.set(
        by!,
        cur === undefined
          ? [bx!, bx! + bw!]
          : [Math.min(cur[0], bx!), Math.max(cur[1], bx! + bw!)],
      );
    }
    // fevereiro de 2028 começa na terça: o dia 3 é a quinta (coluna 4) da linha 0 e o 12 o sábado (coluna 6) da linha 1
    expect([...rows.entries()].sort((a, b) => a[0] - b[0])).toEqual([
      [y + 4, [x + 4 * 48 + 24, x + 336]],
      [y + 48 + 4, [x, x + 6 * 48 + 24]],
    ]);
  });
});

// ---------------------------------------------------------------------------------------------
// date-picker: interaction
// ---------------------------------------------------------------------------------------------

describe('EX4 date-picker — interaction (o item escolhido)', () => {
  const STATES: [string, string][] = [
    ['hovered', 'state-hover'],
    ['focused', 'state-focus'],
    ['pressed', 'state-pressed'],
  ];

  it('o campo existe, com none, hovered, focused e pressed, e none por padrão', () => {
    const field = typeOf('date-picker').fields.find((f) => f.key === 'interaction');
    expect(field).toMatchObject({
      type: 'enum',
      options: ['none', 'hovered', 'focused', 'pressed'],
      default: 'none',
    });
  });

  it('sem estado, nenhuma camada de estado desenha', () => {
    expect(
      named(
        drawDate({ displayedMonth: 'x', selection: 'single', selectedDay: 15 }),
        'estado',
      ),
    ).toEqual([]);
    expect(
      named(
        drawDate({
          displayedMonth: 'x',
          selection: 'single',
          selectedDay: 15,
          interaction: 'none',
        }),
        'estado',
      ),
    ).toEqual([]);
  });

  it('single: a camada de 40 em on-primary, com a opacidade do estado, sobre o dia escolhido', () => {
    for (const mode of ['light', 'dark'] as const) {
      for (const [interaction, token] of STATES) {
        const d = drawDate(
          { displayedMonth: 'x', selection: 'single', selectedDay: 15, interaction },
          mode,
        );
        const layers = named(d, 'estado');
        expect(layers).toHaveLength(1);
        const layer = layers[0]!;
        const [marked] = named(d, 'marcado');
        expect(rectOf(d, layer)).toEqual(rectOf(d, marked!));
        expect(solid(layer.fills)).toBe(tok('on-primary', mode));
        expect(layer.opacity).toBe(num(token));
      }
    }
  });

  it('range: vale para o dia inicial', () => {
    const d = drawDate({
      displayedMonth: 'x',
      selection: 'range',
      rangeStartDay: 9,
      rangeEndDay: 16,
      interaction: 'focused',
    });
    const [layer] = named(d, 'estado');
    const start = named(d, 'marcado').find((n) => (rectOf(d, n)[0] ?? 0) > 0)!;
    expect(named(d, 'estado')).toHaveLength(1);
    const startNumber = [...walk(start)].find((n) => n.type === 'text') as TextNode;
    expect(startNumber.text).toBe('9');
    expect(rectOf(d, layer!)).toEqual(rectOf(d, start));
  });

  it('sem escolha, o dia 1, em on-surface', () => {
    const d = drawDate({
      displayedMonth: 'x',
      selection: 'single',
      interaction: 'hovered',
    });
    const layers = named(d, 'estado');
    expect(layers).toHaveLength(1);
    expect(solid(layers[0]!.fills)).toBe(tok('on-surface', 'light'));
    const grid = gridOf(d);
    expect(rectOf(d, layers[0]!)).toEqual([grid.x + 3 * 48 + 4, grid.y + 4, 40, 40]);
  });
});

// ---------------------------------------------------------------------------------------------
// time-picker
// ---------------------------------------------------------------------------------------------

const polar = (radius: number, degrees: number): [number, number] => [
  128 + radius * Math.sin((degrees * Math.PI) / 180),
  128 - radius * Math.cos((degrees * Math.PI) / 180),
];
const near = (a: number[], b: number[], eps = 0.01) =>
  a.every((v, i) => Math.abs(v - b[i]!) <= eps);

function handleCenter(d: Drawing): [number, number] {
  const clock = named(d, 'relógio')[0]!;
  const [cx, cy] = rectOf(d, clock);
  const [x, y, w, h] = rectOf(d, named(d, 'alça')[0]!);
  return [x! + w! / 2 - cx!, y! + h! / 2 - cy!];
}
function trackEnd(d: Drawing): [number, number] {
  const path = named(d, 'trilho')[0]!;
  const m = /^M128 128L(-?[\d.]+) (-?[\d.]+)$/.exec(
    (path as unknown as { d: string }).d,
  )!;
  return [Number(m[1]), Number(m[2])];
}
const textIn = (d: Drawing, parent: string): string | undefined => {
  const holder = named(d, parent)[0];
  const t =
    holder === undefined ? undefined : [...walk(holder)].find((n) => n.type === 'text');
  return (t as TextNode | undefined)?.text;
};

/**
 * O número sob a alça (MF4): a cópia dos números em on-primary, dentro da `alça` (que recorta), cujo centro
 * cai no centro da alça. Sem número na posição (minuto fora da grade de 5), nenhum.
 */
function underHandle(d: Drawing): string | undefined {
  const handle = named(d, 'alça')[0]!;
  const boxes = boxesOf(d);
  const at = boxes.get(handle.id)!;
  const found = [...walk(handle)].find((n) => {
    if (n.type !== 'text' || n.name !== 'número sob a alça') return false;
    const b = boxes.get(n.id)!;
    return (
      Math.abs(b.x + b.width / 2 - (at.x + at.width / 2)) <= 1 &&
      Math.abs(b.y + b.height / 2 - (at.y + at.height / 2)) <= 1
    );
  });
  return (found as TextNode | undefined)?.text;
}

describe('EX4 time-picker — ponteiro, mostrador e PM sem tabelas', () => {
  it('às 10:37 em 24 horas, escolhendo o minuto, a alça fica no minuto 37 (222°), no raio externo', () => {
    const d = drawTime({
      mode: 'picker',
      hour: 10,
      minute: 37,
      is24Hour: 'true',
      selection: 'minute',
    });
    expect(near(handleCenter(d), polar(101, 222))).toBe(true);
    expect(near(trackEnd(d), polar(101, 222))).toBe(true);
    // 37 não está na grade de 5: o Compose não escreve o número dentro da alça (a cópia dos números só cobre 35 e 40 pela metade)
    expect(underHandle(d)).toBeUndefined();
    expect(textIn(d, 'minuto')).toBe('37');
    expect(textIn(d, 'hora')).toBe('10');
  });

  it('às 10:37, escolhendo a hora, a alça fica na hora 10 (300°)', () => {
    const d = drawTime({
      mode: 'picker',
      hour: 10,
      minute: 37,
      is24Hour: 'true',
      selection: 'hour',
    });
    expect(near(handleCenter(d), polar(101, 300))).toBe(true);
    expect(underHandle(d)).toBe('10');
  });

  it('às 22:05 em 24 horas, a alça da hora vai para o anel interno (raio 69, 20 h = 300°)', () => {
    const d = drawTime({
      mode: 'picker',
      hour: 22,
      minute: 5,
      is24Hour: 'true',
      selection: 'hour',
    });
    expect(near(handleCenter(d), polar(69, 300))).toBe(true);
    expect(near(trackEnd(d), polar(69, 300))).toBe(true);
  });

  it('às 22:05 em 12 horas: PM, hora 10, minuto com zero à esquerda, alça no minuto 5', () => {
    const base: Values = { mode: 'picker', hour: 22, minute: 5, is24Hour: 'false' };
    const minute = drawTime({ ...base, selection: 'minute' });
    expect(textIn(minute, 'hora')).toBe('10');
    expect(textIn(minute, 'minuto')).toBe('05');
    expect(near(handleCenter(minute), polar(101, 30))).toBe(true);
    expect(underHandle(minute)).toBe('5');
    const pm = named(minute, 'PM')[0]!;
    const am = named(minute, 'AM')[0]!;
    expect(solid(pm.fills)).toBe(tok('tertiary-container', 'light'));
    expect(solid(am.fills)).toBeUndefined();
    const hour = drawTime({ ...base, selection: 'hour' });
    // em 12 horas a hora 22 é 10 h no raio externo
    expect(near(handleCenter(hour), polar(101, 300))).toBe(true);
  });

  it('às 10:37 em 12 horas: AM', () => {
    const d = drawTime({ mode: 'picker', hour: 10, minute: 37, is24Hour: 'false' });
    expect(solid(named(d, 'AM')[0]!.fills)).toBe(tok('tertiary-container', 'light'));
    expect(solid(named(d, 'PM')[0]!.fills)).toBeUndefined();
  });

  it('o mostrador tem 12 números (0 a 11 ou 12 e 1 a 11 em 12 horas), 5 em 5 nos minutos, e o anel interno só em 24 horas', () => {
    const labels = (v: Values) =>
      visibleNodes(drawTime(v))
        .filter((n): n is TextNode => n.type === 'text' && n.name === 'número')
        .map((n) => n.text);
    const base: Values = { mode: 'picker', hour: 3, minute: 20 };
    expect(labels({ ...base, is24Hour: 'false', selection: 'hour' })).toEqual([
      '12',
      '1',
      '2',
      '3',
      '4',
      '5',
      '6',
      '7',
      '8',
      '9',
      '10',
      '11',
    ]);
    expect(labels({ ...base, is24Hour: 'true', selection: 'hour' })).toEqual([
      '0',
      '1',
      '2',
      '3',
      '4',
      '5',
      '6',
      '7',
      '8',
      '9',
      '10',
      '11',
      '12',
      '13',
      '14',
      '15',
      '16',
      '17',
      '18',
      '19',
      '20',
      '21',
      '22',
      '23',
    ]);
    expect(labels({ ...base, is24Hour: 'true', selection: 'minute' })).toEqual([
      '0',
      '5',
      '10',
      '15',
      '20',
      '25',
      '30',
      '35',
      '40',
      '45',
      '50',
      '55',
    ]);
  });
});

describe('EX4 time-picker — interaction (o seletor escolhido)', () => {
  const STATES: [string, string][] = [
    ['hovered', 'state-hover'],
    ['focused', 'state-focus'],
    ['pressed', 'state-pressed'],
  ];
  const base: Values = { mode: 'picker', hour: 14, minute: 30, is24Hour: 'true' };

  it('o campo existe, com none, hovered, focused e pressed, e none por padrão', () => {
    const field = typeOf('time-picker').fields.find((f) => f.key === 'interaction');
    expect(field).toMatchObject({
      type: 'enum',
      options: ['none', 'hovered', 'focused', 'pressed'],
      default: 'none',
    });
    expect(named(drawTime(base), 'estado')).toEqual([]);
  });

  it('a camada cobre o campo da hora (selection hour) ou o do minuto, na cor do texto do campo', () => {
    for (const mode of ['light', 'dark'] as const) {
      for (const [interaction, token] of STATES) {
        for (const [selection, field] of [
          ['hour', 'hora'],
          ['minute', 'minuto'],
        ] as const) {
          const d = drawTime({ ...base, selection, interaction }, mode);
          const layers = named(d, 'estado');
          expect(layers).toHaveLength(1);
          expect(rectOf(d, layers[0]!)).toEqual(rectOf(d, named(d, field)[0]!));
          expect(solid(layers[0]!.fills)).toBe(tok('on-primary-container', mode));
          expect(layers[0]!.opacity).toBe(num(token));
        }
      }
    }
  });

  it('vale também no modo input', () => {
    const d = drawTime({
      ...base,
      mode: 'input',
      selection: 'minute',
      interaction: 'pressed',
    });
    expect(named(d, 'estado')).toHaveLength(1);
    expect(rectOf(d, named(d, 'estado')[0]!)).toEqual(rectOf(d, named(d, 'minuto')[0]!));
  });
});

// ---------------------------------------------------------------------------------------------
// Regressão: a cena de antes (tests/fixtures/material3-ex4-v1.json) a ≤ 0,5 px por nó
// ---------------------------------------------------------------------------------------------

type Entry = { t: string; n: string; r: number[]; x?: string; d?: string; f?: string };
type Scene = {
  id: string;
  values: Values;
  mode: Mode;
  nodes: Entry[];
  bands: Record<string, number[]>;
};
const scenes = (
  v1 as unknown as { scenes: Record<string, Scene | Record<string, Entry[]>> }
).scenes;
const TOL = 0.5;
const closeRect = (a: number[], b: number[]) =>
  a.every((v, i) => Math.abs(v - b[i]!) <= TOL);

/** Os nomes de antes que a nova construção reparte em outros nós (a prova é pelo texto, pelas caixas e pela união das faixas). */
const RENAMED: Record<string, string> = {
  'dia escolhido': 'marcado',
  'início do intervalo': 'marcado',
  'fim do intervalo': 'marcado',
};

/**
 * Exceção da MF4 (número sob a alça): o nó `valor selecionado` de antes sumiu; o número escolhido é agora a
 * cópia dos números em on-primary dentro da `alça` (`número sob a alça`). A cena de antes não o exige mais,
 * mas o número escolhido continua lá: com o mesmo texto e o centro no do `valor selecionado` de antes.
 */
const MOVED = 'valor selecionado';
const movedIntoHandle = (
  old: Entry,
  nodes: { name: string; text?: string; rect: number[] }[],
): boolean =>
  // sem texto (minuto fora da grade de 5) não havia número a mover (o teste do ponteiro afirma que nenhuma cópia fica centrada)
  old.x === '' ||
  nodes.some(
    (n) =>
      n.name === 'número sob a alça' &&
      n.text === old.x &&
      Math.abs(n.rect[0]! + n.rect[2]! / 2 - (old.r[0]! + old.r[2]! / 2)) <= TOL &&
      Math.abs(n.rect[1]! + n.rect[3]! / 2 - (old.r[1]! + old.r[3]! / 2)) <= TOL,
  );

function compareScene(scene: Scene, draw: (v: Values, m: Mode) => Drawing) {
  const d = draw(scene.values, scene.mode);
  const boxes = boxesOf(d);
  const now = visibleNodes(d).map((n) => {
    const b = boxes.get(n.id)!;
    return {
      type: n.type,
      name: n.name,
      text: n.type === 'text' ? n.text : undefined,
      rect: [b.x, b.y, b.width, b.height],
      fill: solid(n.fills),
    };
  });
  const missing: string[] = [];
  for (const old of scene.nodes) {
    // as faixas de largura 0 (linhas fora do intervalo) não desenham; as demais vão pela união das linhas
    if (old.n === 'faixa') continue;
    if (old.n === MOVED) {
      if (!movedIntoHandle(old, now))
        missing.push(`${scene.id} ${old.n} ${old.x ?? ''} não está sob a alça`);
      continue;
    }
    const name = RENAMED[old.n] ?? old.n;
    const found = now.some(
      (n) =>
        n.type === old.t &&
        (old.t === 'text' ? n.text === old.x : n.name === name) &&
        closeRect(n.rect, old.r) &&
        (old.f === undefined || n.fill === old.f),
    );
    if (!found)
      missing.push(`${scene.id} ${old.t} ${old.n} ${old.x ?? ''} ${old.r.join(',')}`);
  }
  expect(missing, scene.id).toEqual([]);
  return d;
}

function bandRows(d: Drawing): Record<string, number[]> {
  const rows: Record<string, number[]> = {};
  for (const band of named(d, 'faixa')) {
    const [x, y, w] = rectOf(d, band);
    if (w! < 0.01) continue;
    const key = String(Math.round(y! * 100) / 100);
    const cur = rows[key];
    rows[key] =
      cur === undefined
        ? [x!, x! + w!]
        : [Math.min(cur[0]!, x!), Math.max(cur[1]!, x! + w!)];
  }
  return rows;
}

describe('EX4 regressão — as cenas de antes das tabelas, a ≤ 0,5 px por nó', () => {
  it('date-picker: os exemplos antigos (claro e escuro), os dias escolhidos e os intervalos', () => {
    let seen = 0;
    for (const [key, value] of Object.entries(scenes)) {
      if (!key.startsWith('date-')) continue;
      const scene = value as Scene;
      const d = compareScene(scene, drawDate);
      const rows = bandRows(d);
      expect(Object.keys(rows).sort(), `${key} faixas`).toEqual(
        Object.keys(scene.bands).sort(),
      );
      for (const [y, [x0, x1]] of Object.entries(scene.bands))
        expect(closeRect(rows[y]!, [x0!, x1!]), `${key} faixa ${y}`).toBe(true);
      seen++;
    }
    expect(seen).toBe(21);
  });

  it('time-picker: os exemplos antigos (claro e escuro)', () => {
    let seen = 0;
    for (const [key, value] of Object.entries(scenes)) {
      if (!key.startsWith('time-ex')) continue;
      const scene = value as Scene;
      const d = compareScene(scene, drawTime);
      // o trilho de antes termina no mesmo ponto
      for (const old of scene.nodes.filter((n) => n.t === 'path')) {
        const m = /L(-?[\d.]+) (-?[\d.]+)$/.exec(old.d ?? '')!;
        expect(closeRect(trackEnd(d), [Number(m[1]), Number(m[2])]), key).toBe(true);
      }
      seen++;
    }
    expect(seen).toBe(8);
  });

  it('time-picker: todas as horas (24 e 12 horas) e todos os 60 minutos, a alça, o trilho, o número e o período', () => {
    const sweep = scenes['time-sweep'] as Record<string, Entry[]>;
    let seen = 0;
    for (const [key, entries] of Object.entries(sweep)) {
      const [kind, is24, value] = key.split('-') as [string, string, string];
      const d = drawTime({
        title: 'x',
        mode: 'picker',
        hour: kind === 'h' ? Number(value) : 3,
        minute: kind === 'm' ? Number(value) : 7,
        is24Hour: is24,
        selection: kind === 'h' ? 'hour' : 'minute',
      });
      const boxes = boxesOf(d);
      const now = visibleNodes(d);
      const nowBoxes = now.map((n) => {
        const b = boxes.get(n.id)!;
        return {
          name: n.name,
          text: n.type === 'text' ? n.text : undefined,
          rect: [b.x, b.y, b.width, b.height],
        };
      });
      for (const old of entries) {
        if (old.n === MOVED) {
          expect(
            movedIntoHandle(old, nowBoxes),
            `${key} ${old.n} ${old.x ?? ''} não está sob a alça`,
          ).toBe(true);
          continue;
        }
        if (old.t === 'path') {
          const m = /L(-?[\d.]+) (-?[\d.]+)$/.exec(old.d ?? '')!;
          expect(closeRect(trackEnd(d), [Number(m[1]), Number(m[2])]), key).toBe(true);
          continue;
        }
        const candidates = now.filter(
          (n) =>
            n.type === old.t &&
            n.name === old.n &&
            (old.t !== 'text' || (n as TextNode).text === old.x),
        );
        const ok = candidates.some((n) => {
          const b = boxes.get(n.id)!;
          return (
            closeRect([b.x, b.y, b.width, b.height], old.r) &&
            (old.f === undefined || solid(n.fills) === old.f)
          );
        });
        expect(ok, `${key} ${old.t} ${old.n} ${old.x ?? ''} ${old.r.join(',')}`).toBe(
          true,
        );
      }
      seen++;
    }
    expect(seen).toBe(168);
  });
});

// ---------------------------------------------------------------------------------------------
// Sem tabelas
// ---------------------------------------------------------------------------------------------

/** Cada `$switch` com mais de 12 casos e cada `$eq` sobre um campo `number` do tipo. */
function offenders(id: 'date-picker' | 'time-picker') {
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
      const count = Object.keys(cases).length;
      if (count > 12) found.push(`${path}: $switch de ${count} casos`);
    }
    const eq = obj['$eq'];
    if (Array.isArray(eq) && typeof eq[0] === 'string' && numberFields.has(eq[0]))
      found.push(`${path}: $eq sobre o campo number ${eq[0]}`);
    for (const [k, v] of Object.entries(obj)) visit(v, `${path}.${k}`);
  };
  visit(JSON.parse(text(`components/${id}.json`)), id);
  return found;
}

describe('EX4 — sem tabelas enumeradas', () => {
  it('o date-picker e o time-picker não têm $switch com mais de 12 casos nem $eq sobre campo number', () => {
    expect(offenders('date-picker')).toEqual([]);
    expect(offenders('time-picker')).toEqual([]);
  });

  it('os arquivos ficam bem menores que os 78 kB e 53 kB de antes', () => {
    expect(text('components/date-picker.json').length).toBeLessThan(52_000);
    // O time-picker passou de 36 kB com a cópia dos números dentro da `alça` (MF4, número sob a alça; cresce de 31 kB a ~40 kB): teto de 41 kB (hoje 39.718).
    expect(text('components/time-picker.json').length).toBeLessThan(41_000);
  });
});
