// M5 of the "faithful Material 3" stage: the date-picker against what `DatePicker.kt`, `DateRangePicker.kt`,
// `DatePickerDialog.android.kt` and `DatePickerModalTokens.kt` fix at commit 5113b82a. The expected
// colors come from the specialization tokens (light and dark); the geometry, from the Compose constants
// (dp = component px).
import { describe, expect, it } from 'vitest';
import { buildCatalog, findEntry } from '../../src/model/catalog';
import { approximateMeasurer } from '../../src/model/components/instantiate';
import { absoluteBoxes, walk } from '../../src/model/components/scene';
import type { PathNode, SceneNode, TextNode } from '../../src/model/components/scene';
import { drawIn, files, solid, spec, text } from '../support/material3Library';

// pt-BR kept: shared library data, the node names of libraries/material3-compose are in Portuguese
const NAMES = {
  header: 'cabeçalho',
  divider: 'divisor',
  title: 'título',
  headline: 'manchete',
  modeButton: 'botão do modo',
  monthNav: 'navegação do mês',
  yearButton: 'botão do ano',
  displayedMonth: 'mês exibido',
  prevArrow: 'seta anterior',
  nextArrow: 'seta próxima',
  weekdays: 'dias da semana',
  weekday: 'dia da semana',
  grid: 'grade',
  band: 'faixa',
  day: 'dia',
  marked: 'marcado',
  rangeMonth: 'mês do intervalo',
} as const;

const catalog = buildCatalog(files);
const entry = findEntry(catalog, 'date-picker')!;
type Values = Parameters<typeof drawIn>[2];
type Mode = 'light' | 'dark';
type Drawing = ReturnType<typeof drawIn>;
const MODES: Mode[] = ['light', 'dark'];
const draw = (values: Values, mode: Mode = 'light'): Drawing =>
  drawIn(catalog, entry, values, mode);

const SINGLE: Values = {
  headline: 'Wed, Oct 15',
  displayedMonth: 'October 2025',
  selection: 'single',
  selectedDay: 15,
};
const RANGE: Values = {
  headline: 'Oct 9 – Oct 16',
  displayedMonth: 'October 2025',
  selection: 'range',
  rangeStartDay: 9,
  rangeEndDay: 16,
};

const tokens = spec.tokens!.values as Record<string, unknown>;
const tok = (name: string, mode: Mode): string => {
  const value = tokens[name] as string | Record<Mode, string>;
  return typeof value === 'string' ? value : value[mode];
};
const num = (name: string): number => tokens[name] as number;
const scale = (name: string): number[] => [
  num(`${name}-size`),
  num(`${name}-line-height`),
  num(`${name}-weight`),
  num(`${name}-tracking`),
];

const named = (d: Drawing, name: string): SceneNode | undefined => {
  for (const node of walk(d.root)) if (node.name === name && node.visible) return node;
  return undefined;
};
const absOf = (d: Drawing, node: SceneNode) => absoluteBoxes(d.root).get(node.id)!;
const box = (d: Drawing, name: string) => {
  const node = named(d, name);
  if (node === undefined) throw new Error(`missing node: ${name}`);
  const { x, y, width, height } = absOf(d, node);
  return { node, x, y, width, height };
};
const rect = (d: Drawing, name: string) => {
  const { x, y, width, height } = box(d, name);
  return [x, y, width, height];
};
const fillOf = (d: Drawing, name: string): string | undefined =>
  solid(named(d, name)?.fills ?? []);
const textOf = (d: Drawing, name: string): TextNode | undefined => {
  const holder = named(d, name);
  if (holder === undefined) return undefined;
  return [...walk(holder)].find((n): n is TextNode => n.type === 'text' && n.visible);
};
const iconIn = (d: Drawing, name: string) => {
  const holder = named(d, name);
  if (holder === undefined) return undefined;
  const path = [...walk(holder)].find((n): n is PathNode => n.type === 'path');
  if (path === undefined) return undefined;
  const { x, y, width, height } = absOf(d, path);
  return { color: solid(path.fills), rect: [x, y, width, height] };
};
const fontOf = (node: TextNode | undefined) =>
  node === undefined
    ? undefined
    : [
        node.style.fontSize,
        node.style.lineHeight,
        node.style.fontWeight,
        node.style.letterSpacing,
      ];
/** The range bands (one per range cell), merged into one per week that the range touches. */
const bands = (d: Drawing) => {
  const rows = new Map<number, { x0: number; x1: number; h: number; fill?: string }>();
  for (const n of walk(d.root)) {
    if (n.name !== NAMES.band || !n.visible || n.width <= 0) continue;
    const { x, y, width, height } = absOf(d, n);
    const cur = rows.get(y);
    rows.set(y, {
      x0: Math.min(cur?.x0 ?? x, x),
      x1: Math.max(cur?.x1 ?? x + width, x + width),
      h: height,
      fill: solid(n.fills),
    });
  }
  return [...rows.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([y, r]) => ({ rect: [r.x0, y, r.x1 - r.x0, r.h], fill: r.fill }));
};
/** The cell of a day (the `dia` text) that appears inside the grid window. */
const dayNode = (d: Drawing, day: number): TextNode => {
  const grid = box(d, NAMES.grid);
  const found = [...walk(d.root)].find((n): n is TextNode => {
    if (n.type !== 'text' || n.name !== NAMES.day || !n.visible || n.text !== String(day))
      return false;
    const r = absOf(d, n);
    return r.x >= grid.x + 12 && r.x + r.width <= grid.x + grid.width - 12;
  });
  if (found === undefined) throw new Error(`missing day: ${day}`);
  return found;
};
const dayRect = (d: Drawing, day: number) => {
  const { x, y, width, height } = absOf(d, dayNode(d, day));
  return [x, y, width, height];
};
/** The primary circles of the chosen day and of the range ends (the `marcado` node), with the number they carry. */
const markedAll = (d: Drawing) =>
  [...walk(d.root)]
    .filter((n) => n.name === NAMES.marked && n.visible)
    .map((n) => {
      const { x, y, width, height } = absOf(d, n);
      const label = [...walk(n)].find((c): c is TextNode => c.type === 'text')!;
      return { node: n, rect: [x, y, width, height], label };
    });
const markedOf = (d: Drawing, text: string) =>
  markedAll(d).find((m) => m.label.text === text);
// pt-BR kept: 'não cabe' is the pt-BR text of the warning emitted by src/model
const BAD = /não cabe|text larger than the box|unknown icon|stretched icon|token/i;

describe('M5 date-picker — container and header (single mode)', () => {
  it('container in surface-container-high with corner-extra-large radius (28), no shadow, in light and dark', () => {
    for (const mode of MODES) {
      const d = draw(SINGLE, mode);
      expect(fillOf(d, 'date picker')).toBe(tok('surface-container-high', mode));
      const root = d.root as { cornerRadius?: number };
      expect(root.cornerRadius).toBe(num('corner-extra-large'));
      expect(d.root.effects).toEqual([]);
      expect(d.warnings.filter((w) => BAD.test(w))).toEqual([]);
    }
  });

  it('header height 120 (HeaderContainerHeight) with the 1 divider in outline-variant at its base', () => {
    for (const mode of MODES) {
      const d = draw(SINGLE, mode);
      expect(rect(d, NAMES.header)).toEqual([0, 0, 360, 120]);
      expect(rect(d, NAMES.divider)).toEqual([0, 119, 360, 1]);
      expect(fillOf(d, NAMES.divider)).toBe(tok('outline-variant', mode));
    }
  });

  it('title in label-large (14/20/500/0.1) in on-surface-variant, 24 from the left and 16 from the top', () => {
    for (const mode of MODES) {
      const d = draw({ ...SINGLE, title: 'Select date' }, mode);
      const title = textOf(d, NAMES.title)!;
      expect(fontOf(title)).toEqual(scale('label-large'));
      expect(solid(title.fills)).toBe(tok('on-surface-variant', mode));
      expect([absOf(d, title).x, absOf(d, title).y]).toEqual([24, 16]);
    }
  });

  // pt-BR kept: the library's default title and headline are Portuguese data (libraries/material3-compose)
  it('default M3 title and headline when empty', () => {
    const d = draw({ selection: 'single', displayedMonth: 'October 2025' });
    expect(textOf(d, NAMES.title)!.text).toBe('Selecionar data');
    expect(textOf(d, NAMES.headline)!.text).toBe('Data selecionada');
  });

  it('headline in headline-large (32/40/400/0), on-surface-variant, maxLines 1, 24 from the left', () => {
    for (const mode of MODES) {
      const d = draw(SINGLE, mode);
      const headline = textOf(d, NAMES.headline)!;
      expect(fontOf(headline)).toEqual(scale('headline-large'));
      expect(solid(headline.fills)).toBe(tok('on-surface-variant', mode));
      expect(headline.style.maxLines).toBe(1);
      // 60 row (48 button + 12 below) above the divider; the headline (40 + 12 below) centered in it
      expect([absOf(d, headline).x, absOf(d, headline).y]).toEqual([24, 63]);
    }
  });

  it('toggle mode: 48 button 12 from the right and 12 from the base, with the 24 edit icon in on-surface-variant', () => {
    for (const mode of MODES) {
      const d = draw(SINGLE, mode);
      expect(rect(d, NAMES.modeButton)).toEqual([300, 59, 48, 48]);
      const icon = iconIn(d, NAMES.modeButton)!;
      expect(icon.rect).toEqual([312, 71, 24, 24]);
      expect(icon.color).toBe(tok('on-surface-variant', mode));
    }
  });

  it('showModeToggle false hides the button and the headline moves down (only the 12 below)', () => {
    const d = draw({ ...SINGLE, showModeToggle: 'false' });
    expect(named(d, NAMES.modeButton)).toBeUndefined();
    expect(absOf(d, textOf(d, NAMES.headline)!).y).toBe(67);
  });
});

describe('M5 date-picker — month navigation and weekdays (single)', () => {
  it('month row of 56 (MonthYearHeight) with 12 margin; 40 year button with label-large text', () => {
    for (const mode of MODES) {
      const d = draw(SINGLE, mode);
      expect(rect(d, NAMES.monthNav)).toEqual([0, 120, 360, 56]);
      expect(rect(d, NAMES.yearButton)).toEqual([12, 128, expect.any(Number), 40]);
      const month = textOf(d, NAMES.displayedMonth)!;
      expect(month.text).toBe('October 2025');
      expect(fontOf(month)).toEqual(scale('label-large'));
      expect(solid(month.fills)).toBe(tok('on-surface-variant', mode));
      // 12 padding of the TextButton
      expect(absOf(d, month).x).toBe(24);
    }
  });

  it('month arrows: two 48 IconButtons flush right (12 margin), 24 keyboard_arrow icons in on-surface-variant; the year selector carries a 24 arrow_drop_down', () => {
    for (const mode of MODES) {
      const d = draw(SINGLE, mode);
      expect(rect(d, NAMES.prevArrow)).toEqual([252, 124, 48, 48]);
      expect(rect(d, NAMES.nextArrow)).toEqual([300, 124, 48, 48]);
      for (const [name, x] of [
        [NAMES.prevArrow, 264],
        [NAMES.nextArrow, 312],
      ] as const) {
        const icon = iconIn(d, name)!;
        expect(icon.rect).toEqual([x, 136, 24, 24]);
        expect(icon.color).toBe(tok('on-surface-variant', mode));
      }
      const drop = iconIn(d, NAMES.yearButton)!;
      expect([drop.rect[2], drop.rect[3]]).toEqual([24, 24]);
      expect(drop.color).toBe(tok('on-surface-variant', mode));
    }
  });

  it('weekdays: 7 cells of 48 starting at 12, in body-large (16/24/400/0.5) and on-surface', () => {
    for (const mode of MODES) {
      const d = draw(SINGLE, mode);
      expect(rect(d, NAMES.weekdays)).toEqual([0, 176, 360, 48]);
      for (let i = 1; i <= 7; i++) {
        const letter = named(d, `${NAMES.weekday} ${i}`) as TextNode;
        expect(fontOf(letter)).toEqual(scale('body-large'));
        expect(solid(letter.fills)).toBe(tok('on-surface', mode));
        expect([absOf(d, letter).x, absOf(d, letter).width]).toEqual([
          12 + 48 * (i - 1),
          48,
        ]);
      }
    }
  });
});

describe('M5 date-picker — day grid', () => {
  it('31 days starting on Wednesday, 48 cells (RecommendedSizeForAccessibility), in body-large and on-surface', () => {
    for (const mode of MODES) {
      const d = draw(SINGLE, mode);
      expect(dayRect(d, 1)).toEqual([156, 224, 48, 48]);
      expect(dayRect(d, 4)).toEqual([300, 224, 48, 48]);
      expect(dayRect(d, 5)).toEqual([12, 272, 48, 48]);
      expect(dayRect(d, 31)).toEqual([252, 416, 48, 48]);
      const day = dayNode(d, 14);
      expect(fontOf(day)).toEqual(scale('body-large'));
      expect(solid(day.fills)).toBe(tok('on-surface', mode));
      expect(day.text).toBe('14');
    }
  });

  it('the content measures 360 × 464 (header 120 + month 56 + week 48 + five rows of 48) and the background fills the 469 box', () => {
    const d = draw(SINGLE);
    expect(rect(d, NAMES.grid)).toEqual([0, 224, 360, 240]);
    expect([d.root.width, d.root.height]).toEqual([360, 512]);
    expect(d.warnings.filter((w) => /content larger than the box/.test(w))).toEqual([]);
  });

  it('chosen day: 40 circle (DateContainerWidth/Height) corner-full in primary inside the 48 cell, number in on-primary, in light and dark', () => {
    for (const mode of MODES) {
      const d = draw(SINGLE, mode);
      const marked = markedAll(d);
      expect(marked).toHaveLength(1);
      expect(marked[0]!.rect).toEqual([160, 324, 40, 40]);
      expect(solid(marked[0]!.node.fills)).toBe(tok('primary', mode));
      const node = marked[0]!.node as { cornerRadius?: number };
      expect(node.cornerRadius).toBe(num('corner-full'));
      const label = marked[0]!.label;
      expect(label.text).toBe('15');
      expect(solid(label.fills)).toBe(tok('on-primary', mode));
      expect(fontOf(label)).toEqual(scale('body-large'));
    }
    // the selected color changes from one mode to the other
    expect(tok('primary', 'light')).not.toBe(tok('primary', 'dark'));
    expect(solid(markedAll(draw(SINGLE, 'light'))[0]!.node.fills)).not.toBe(
      solid(markedAll(draw(SINGLE, 'dark'))[0]!.node.fills),
    );
  });

  it('the chosen day follows selectedDay (1 and 31) and disappears without a selection', () => {
    expect(markedOf(draw({ ...SINGLE, selectedDay: 1 }), '1')!.rect).toEqual([
      160, 228, 40, 40,
    ]);
    expect(markedOf(draw({ ...SINGLE, selectedDay: 31 }), '31')!.rect).toEqual([
      256, 420, 40, 40,
    ]);
    const none = draw({ selection: 'single', displayedMonth: 'October 2025' });
    expect(markedAll(none)).toEqual([]);
    expect(bands(none)).toEqual([]);
  });

  it('in the single style no range appears, even with range days filled in', () => {
    const d = draw({ ...SINGLE, rangeStartDay: 9, rangeEndDay: 16 });
    expect(bands(d)).toEqual([]);
    // only the chosen day: the range ends (9 and 16) do not draw
    expect(markedAll(d).map((m) => m.label.text)).toEqual(['15']);
  });
});

describe('M5 date-picker — range (DateRangePicker)', () => {
  it('range header: title 64 from the left, headline in title-large (22/28/400/0) in on-surface-variant', () => {
    for (const mode of MODES) {
      const d = draw(RANGE, mode);
      const title = textOf(d, NAMES.title)!;
      // pt-BR kept: the library's default range title is Portuguese data
      expect(title.text).toBe('Selecionar datas');
      expect(fontOf(title)).toEqual(scale('label-large'));
      expect(absOf(d, title).x).toBe(64);
      const headline = textOf(d, NAMES.headline)!;
      expect(headline.text).toBe('Oct 9 – Oct 16');
      expect(fontOf(headline)).toEqual(scale('title-large'));
      expect(solid(headline.fills)).toBe(tok('on-surface-variant', mode));
      expect(absOf(d, headline).x).toBe(64);
      // title 20 + row of 60 + divider of 1
      expect(rect(d, NAMES.header)).toEqual([0, 0, 360, 81]);
    }
  });

  it('without the navigation row; the month becomes the subtitle (title-small, on-surface-variant) at 24, with 20 above and 8 below', () => {
    for (const mode of MODES) {
      const d = draw(RANGE, mode);
      expect(named(d, NAMES.monthNav)).toBeUndefined();
      expect(rect(d, NAMES.weekdays)).toEqual([0, 81, 360, 48]);
      const month = textOf(d, NAMES.rangeMonth)!;
      expect(month.text).toBe('October 2025');
      expect(fontOf(month)).toEqual(scale('title-small'));
      expect(solid(month.fills)).toBe(tok('on-surface-variant', mode));
      expect([absOf(d, month).x, absOf(d, month).y]).toEqual([24, 149]);
      expect(dayRect(d, 1)).toEqual([156, 177, 48, 48]);
      // 81 + 48 + 48 + 240
      expect(rect(d, NAMES.grid)).toEqual([0, 177, 360, 240]);
    }
  });

  it('range ends: 40 circles in primary with the number in on-primary, in light and dark', () => {
    for (const mode of MODES) {
      const d = draw(RANGE, mode);
      expect(markedAll(d)).toHaveLength(2);
      expect(markedOf(d, '9')!.rect).toEqual([208, 229, 40, 40]);
      expect(markedOf(d, '16')!.rect).toEqual([208, 277, 40, 40]);
      for (const label of ['9', '16']) {
        const m = markedOf(d, label)!;
        expect(solid(m.node.fills)).toBe(tok('primary', mode));
        expect(solid(m.label.fills)).toBe(tok('on-primary', mode));
      }
    }
  });

  it('range band: 40 high in secondary-container, from the center of the start day to the center of the end day, crossing the weeks', () => {
    for (const mode of MODES) {
      const d = draw(RANGE, mode);
      expect(bands(d)).toEqual([
        // week of 5 to 11: from the center of day 9 to the right edge of the grid (348)
        { rect: [228, 229, 120, 40], fill: tok('secondary-container', mode) },
        // week of 12 to 18: from the left edge of the grid (12) to the center of day 16
        { rect: [12, 277, 216, 40], fill: tok('secondary-container', mode) },
      ]);
    }
  });

  it('range within one week: the band goes from center to center', () => {
    const d = draw({ ...RANGE, rangeStartDay: 13, rangeEndDay: 16 });
    // 13 (column 1) to 16 (column 4): 12 + 48 + 24 = 84 to 12 + 192 + 24 = 228
    expect(bands(d).map((b) => b.rect)).toEqual([[84, 277, 144, 40]]);
  });

  it('five-week range: full bands in the middle weeks (width 336)', () => {
    const d = draw({ ...RANGE, rangeStartDay: 2, rangeEndDay: 30 });
    expect(bands(d).map((b) => [b.rect[0], b.rect[2]])).toEqual([
      // day 2 is column 4 of the first week: from its center (228) to the right edge (348)
      [228, 120],
      [12, 336],
      [12, 336],
      [12, 336],
      [12, 216],
    ]);
  });

  it('day outside the month: a start after the month draws no band and an end after the month takes the band to the last day', () => {
    expect(bands(draw({ ...RANGE, rangeStartDay: 45, rangeEndDay: 50 }))).toEqual([]);
    const d = draw({ ...RANGE, rangeStartDay: 3, rangeEndDay: 50 });
    const rows = bands(d);
    // day 3 is column 5 of the first week (center at 276); the 31 closes the week of 26 to 31 at column 5 (edge at 300)
    expect(rows[0]!.rect[0]).toBe(276);
    const last = rows[rows.length - 1]!.rect;
    expect(last[0]! + last[2]!).toBe(300);
    expect(markedAll(d).map((m) => m.label.text)).toEqual(['3']);
  });

  it('range without the end day: only the start day circle, no band', () => {
    const d = draw({ ...RANGE, rangeEndDay: undefined });
    expect(bands(d)).toEqual([]);
    expect(markedAll(d).map((m) => m.label.text)).toEqual(['9']);
    expect(markedOf(d, '9')!.rect).toEqual([208, 229, 40, 40]);
  });
});

describe('M5 date-picker — sources and limits', () => {
  it('no literal color, no family and no SVG path; icons from the set (edit, arrow_drop_down, keyboard_arrow_*)', () => {
    const raw = text('components/date-picker.json');
    expect(raw).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(raw).not.toMatch(/rgba?\(/);
    expect(raw).not.toMatch(/"family"/);
    expect(raw).not.toMatch(/"type":\s*"path"/);
    for (const name of [
      'edit',
      'arrow_drop_down',
      'keyboard_arrow_left',
      'keyboard_arrow_right',
    ]) {
      expect(raw).toContain(`"${name}"`);
    }
  });

  it('the file shrinks from 120 kB to under 80 kB (the grid uses tokens and one layer per selection)', () => {
    expect(text('components/date-picker.json').length).toBeLessThan(80_000);
  });

  it('a headline text that does not fit is cut on the line (maxLines 1), without a warning', () => {
    const d = draw({
      ...SINGLE,
      headline: 'Wednesday, October 15, 2025 and even more long text',
    });
    const headline = textOf(d, NAMES.headline)!;
    expect(headline.style.maxLines).toBe(1);
    const metrics = approximateMeasurer(
      headline.text,
      {
        family: headline.style.fontFamily,
        size: headline.style.fontSize,
        weight: headline.style.fontWeight,
        italic: headline.style.italic,
        lineHeight: headline.style.lineHeight ?? 40,
        letterSpacing: headline.style.letterSpacing ?? 0,
        maxLines: 1,
      },
      headline.width,
    );
    expect(metrics.lines).toHaveLength(1);
    expect(d.warnings.filter((w) => BAD.test(w))).toEqual([]);
  });
});
