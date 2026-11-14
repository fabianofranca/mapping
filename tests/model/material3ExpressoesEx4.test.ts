// EX4 of the "expressions that compute in format 4" stage (#897): the date-picker and the time-picker of
// material3-compose draw by computing (arithmetic, `repeat` by count, `$sin`/`$cos`), without the
// tables of before, and gain the `interaction` field. The regression against the scenes from before the stage
// (tests/fixtures/material3-ex4-v1.json) and the limits on `$switch` and `$eq` live here too.
import { describe, expect, it } from 'vitest';
import { buildCatalog, findEntry } from '../../src/model/catalog';
import { absoluteBoxes, walk } from '../../src/model/components/scene';
import type { SceneNode, TextNode } from '../../src/model/components/scene';
import { drawIn, files, solid, spec, text, typeOf } from '../support/material3Library';
import v1 from '../fixtures/material3-ex4-v1.json';

const catalog = buildCatalog(files);
// pt-BR kept: node names of libraries/material3-compose and of tests/fixtures/material3-ex4-v1.json are Portuguese data
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
// date-picker: the month grid
// ---------------------------------------------------------------------------------------------

/** The weekday of day 1 (Sunday = 0) and the number of days, by the JS calendar. */
function calendar(year: number, month: number) {
  return {
    offset: new Date(Date.UTC(year, month - 1, 1)).getUTCDay(),
    days: new Date(Date.UTC(year, month, 0)).getUTCDate(),
  };
}

/** The box of the days (the grid minus the 12 of margin on each side) and the window where the cells appear. */
function gridOf(d: Drawing) {
  const grid = named(d, 'grade')[0]!;
  const [x, y, width, height] = rectOf(d, grid);
  return { x: x! + 12, y: y!, width: width! - 24, height: height! };
}

/** The days that actually appear: those that fall inside the grid window. */
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
  expect(grid.height, `${month}/${year} rows`).toBe(rows * 48);
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

describe('EX4 date-picker — the calendar from month and year', () => {
  it('February 2028: 29 days, day 1 on Tuesday, in 5 rows', () => {
    const { d, grid } = expectMonth(2028, 2);
    expect(grid.height).toBe(240);
    expect(shownDays(d).get(1)![0]).toBe(grid.x + 2 * 48);
    expect(shownDays(d).has(30)).toBe(false);
  });

  it('a 30-day month that starts on Saturday (November 2025) has 6 rows', () => {
    const { grid } = expectMonth(2025, 11);
    expect(grid.height).toBe(288);
  });

  it('a 28-day month that starts on Sunday (February 2026) has 4 rows', () => {
    const { grid } = expectMonth(2026, 2);
    expect(grid.height).toBe(192);
  });

  it('checks the grid of every month of the years that exercise the leap-year rule', () => {
    for (const year of [1900, 1999, 2000, 2023, 2024, 2025, 2100]) {
      for (let month = 1; month <= 12; month++) expectMonth(year, month);
    }
    // 84 months with the grid checked day by day: 3 s here, more than 5 s in CI with coverage.
  }, 30_000);

  it('without month or without year the grid of today stays: 31 days starting on Wednesday', () => {
    for (const values of [{}, { month: 2 }, { year: 2028 }] as Values[]) {
      const d = drawDate({
        displayedMonth: 'October 2025',
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

  it('the chosen day and the final day of the range stay in place in the month, and a day the month does not have does not appear', () => {
    const { d, grid } = expectMonth(2028, 2, { selectedDay: 29 });
    const [marked] = named(d, 'marcado');
    // February 29, 2028: Tuesday + 28 days = Tuesday, in row 4
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

  it('the range crosses weeks: the band goes from the center of the start day to that of the end day, row by row', () => {
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
    // February 2028 starts on Tuesday: day 3 is Thursday (column 4) of row 0 and day 12 is Saturday (column 6) of row 1
    expect([...rows.entries()].sort((a, b) => a[0] - b[0])).toEqual([
      [y + 4, [x + 4 * 48 + 24, x + 336]],
      [y + 48 + 4, [x, x + 6 * 48 + 24]],
    ]);
  });
});

// ---------------------------------------------------------------------------------------------
// date-picker: interaction
// ---------------------------------------------------------------------------------------------

describe('EX4 date-picker — interaction (the chosen item)', () => {
  const STATES: [string, string][] = [
    ['hovered', 'state-hover'],
    ['focused', 'state-focus'],
    ['pressed', 'state-pressed'],
  ];

  it('the field exists, with none, hovered, focused and pressed, and none by default', () => {
    const field = typeOf('date-picker').fields.find((f) => f.key === 'interaction');
    expect(field).toMatchObject({
      type: 'enum',
      options: ['none', 'hovered', 'focused', 'pressed'],
      default: 'none',
    });
  });

  it('without a state, no state layer draws', () => {
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

  it('single: the layer of 40 in on-primary, with the state opacity, over the chosen day', () => {
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

  it('range: applies to the start day', () => {
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

  it('without a choice, day 1, in on-surface', () => {
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
 * The number under the handle (MF4): the copy of the numbers in on-primary, inside the `alça` (which clips), whose center
 * falls on the center of the handle. With no number at the position (minute off the 5 grid), none.
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

describe('EX4 time-picker — pointer, dial and PM without tables', () => {
  it('at 10:37 in 24 hours, choosing the minute, the handle sits at minute 37 (222°), on the outer radius', () => {
    const d = drawTime({
      mode: 'picker',
      hour: 10,
      minute: 37,
      is24Hour: 'true',
      selection: 'minute',
    });
    expect(near(handleCenter(d), polar(101, 222))).toBe(true);
    expect(near(trackEnd(d), polar(101, 222))).toBe(true);
    // 37 is not on the 5 grid: Compose does not write the number inside the handle (the copy of the numbers only half-covers 35 and 40)
    expect(underHandle(d)).toBeUndefined();
    expect(textIn(d, 'minuto')).toBe('37');
    expect(textIn(d, 'hora')).toBe('10');
  });

  it('at 10:37, choosing the hour, the handle sits at hour 10 (300°)', () => {
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

  it('at 22:05 in 24 hours, the hour handle goes to the inner ring (radius 69, 20 h = 300°)', () => {
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

  it('at 22:05 in 12 hours: PM, hour 10, minute with a leading zero, handle at minute 5', () => {
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
    // in 12 hours, hour 22 is 10 h on the outer radius
    expect(near(handleCenter(hour), polar(101, 300))).toBe(true);
  });

  it('at 10:37 in 12 hours: AM', () => {
    const d = drawTime({ mode: 'picker', hour: 10, minute: 37, is24Hour: 'false' });
    expect(solid(named(d, 'AM')[0]!.fills)).toBe(tok('tertiary-container', 'light'));
    expect(solid(named(d, 'PM')[0]!.fills)).toBeUndefined();
  });

  it('the dial has 12 numbers (0 to 11, or 12 and 1 to 11 in 12 hours), every 5 for minutes, and the inner ring only in 24 hours', () => {
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

describe('EX4 time-picker — interaction (the chosen selector)', () => {
  const STATES: [string, string][] = [
    ['hovered', 'state-hover'],
    ['focused', 'state-focus'],
    ['pressed', 'state-pressed'],
  ];
  const base: Values = { mode: 'picker', hour: 14, minute: 30, is24Hour: 'true' };

  it('the field exists, with none, hovered, focused and pressed, and none by default', () => {
    const field = typeOf('time-picker').fields.find((f) => f.key === 'interaction');
    expect(field).toMatchObject({
      type: 'enum',
      options: ['none', 'hovered', 'focused', 'pressed'],
      default: 'none',
    });
    expect(named(drawTime(base), 'estado')).toEqual([]);
  });

  it('the layer covers the hour field (selection hour) or the minute one, in the field text color', () => {
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

  it('also applies in input mode', () => {
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
// Regression: the scene from before (tests/fixtures/material3-ex4-v1.json) within ≤ 0.5 px per node
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

/** The names from before that the new construction splits into other nodes (the proof is by text, by boxes and by the union of the bands). */
const RENAMED: Record<string, string> = {
  'dia escolhido': 'marcado',
  'início do intervalo': 'marcado',
  'fim do intervalo': 'marcado',
};

/**
 * MF4 exception (number under the handle): the `valor selecionado` node from before is gone; the chosen number is now the
 * copy of the numbers in on-primary inside the `alça` (`número sob a alça`). The scene from before no longer requires it,
 * but the chosen number is still there: with the same text and the center on that of the `valor selecionado` from before.
 */
const MOVED = 'valor selecionado';
const movedIntoHandle = (
  old: Entry,
  nodes: { name: string; text?: string; rect: number[] }[],
): boolean =>
  // without text (minute off the 5 grid) there was no number to move (the pointer test asserts that no copy is centered)
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
    // bands of width 0 (rows outside the range) do not draw; the others go by the union of the rows
    if (old.n === 'faixa') continue;
    if (old.n === MOVED) {
      if (!movedIntoHandle(old, now))
        missing.push(`${scene.id} ${old.n} ${old.x ?? ''} is not under the handle`);
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

describe('EX4 regression — the scenes from before the tables, within ≤ 0.5 px per node', () => {
  it('date-picker: the old examples (light and dark), the chosen days and the ranges', () => {
    let seen = 0;
    for (const [key, value] of Object.entries(scenes)) {
      if (!key.startsWith('date-')) continue;
      const scene = value as Scene;
      const d = compareScene(scene, drawDate);
      const rows = bandRows(d);
      expect(Object.keys(rows).sort(), `${key} bands`).toEqual(
        Object.keys(scene.bands).sort(),
      );
      for (const [y, [x0, x1]] of Object.entries(scene.bands))
        expect(closeRect(rows[y]!, [x0!, x1!]), `${key} band ${y}`).toBe(true);
      seen++;
    }
    expect(seen).toBe(21);
  });

  it('time-picker: the old examples (light and dark)', () => {
    let seen = 0;
    for (const [key, value] of Object.entries(scenes)) {
      if (!key.startsWith('time-ex')) continue;
      const scene = value as Scene;
      const d = compareScene(scene, drawTime);
      // the track from before ends at the same point
      for (const old of scene.nodes.filter((n) => n.t === 'path')) {
        const m = /L(-?[\d.]+) (-?[\d.]+)$/.exec(old.d ?? '')!;
        expect(closeRect(trackEnd(d), [Number(m[1]), Number(m[2])]), key).toBe(true);
      }
      seen++;
    }
    expect(seen).toBe(8);
  });

  it('time-picker: every hour (24 and 12 hours) and all 60 minutes, the handle, the track, the number and the period', () => {
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
            `${key} ${old.n} ${old.x ?? ''} is not under the handle`,
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
// Without tables
// ---------------------------------------------------------------------------------------------

/** Each `$switch` with more than 12 cases and each `$eq` over a `number` field of the type. */
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
      if (count > 12) found.push(`${path}: $switch of ${count} cases`);
    }
    const eq = obj['$eq'];
    if (Array.isArray(eq) && typeof eq[0] === 'string' && numberFields.has(eq[0]))
      found.push(`${path}: $eq over the number field ${eq[0]}`);
    for (const [k, v] of Object.entries(obj)) visit(v, `${path}.${k}`);
  };
  visit(JSON.parse(text(`components/${id}.json`)), id);
  return found;
}

describe('EX4 — without enumerated tables', () => {
  it('the date-picker and the time-picker have no $switch with more than 12 cases nor $eq over a number field', () => {
    expect(offenders('date-picker')).toEqual([]);
    expect(offenders('time-picker')).toEqual([]);
  });

  it('the files stay much smaller than the 78 kB and 53 kB from before', () => {
    expect(text('components/date-picker.json').length).toBeLessThan(52_000);
    // The time-picker went past 36 kB with the copy of the numbers inside the `alça` (MF4, number under the handle; grows from 31 kB to ~40 kB):
    // ceiling of 41 kB (39,718). L2 (#1078) positions the numbers by the `right` and `bottom` anchors and the copy under the handle by
    // `max(…, -24)`, so no child goes past the box of the `posição` frame (warning `content larger than the box`): ceiling of 45 kB (now 43,643).
    expect(text('components/time-picker.json').length).toBeLessThan(45_000);
  });
});
