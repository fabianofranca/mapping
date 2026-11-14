// M5 of the "faithful Material 3" stage: time-picker against what `TimePicker.kt`, `TimePickerDialog.kt`,
// `TimePickerTokens.kt` and `TimeInputTokens.kt` fix at commit 5113b82a. The expected colors come from the
// specification tokens (light and dark); the geometry, from the Compose constants (dp = component px).
import { describe, expect, it } from 'vitest';
import { buildCatalog, findEntry } from '../../src/model/catalog';
import { absoluteBoxes, walk } from '../../src/model/components/scene';
import type { PathNode, SceneNode, TextNode } from '../../src/model/components/scene';
import { drawIn, files, solid, spec } from '../support/material3Library';

// pt-BR kept: shared library data, the node names of libraries/material3-compose are in Portuguese
const NAMES = {
  header: 'cabeçalho',
  title: 'título',
  hourMinute: 'hora e minuto',
  hour: 'hora',
  minute: 'minuto',
  colon: 'dois pontos',
  amPm: 'AM e PM',
  divider: 'divisor',
  numberUnderHandle: 'número sob a alça',
  number: 'número',
  face: 'relógio',
  handle: 'alça',
  center: 'centro',
  track: 'trilho',
  hourLabel: 'rótulo da hora',
  minuteLabel: 'rótulo do minuto',
} as const;

const catalog = buildCatalog(files);
const entry = findEntry(catalog, 'time-picker')!;
type Values = Parameters<typeof drawIn>[2];
type Mode = 'light' | 'dark';
type Drawing = ReturnType<typeof drawIn>;
const MODES: Mode[] = ['light', 'dark'];
const draw = (values: Values, mode: Mode): Drawing =>
  drawIn(catalog, entry, values, mode);

const tokens = spec.tokens!.values as Record<string, unknown>;
/** Value of the specialization token in the mode (color). */
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
const box = (d: Drawing, name: string) => {
  const node = named(d, name);
  if (node === undefined) throw new Error(`missing node: ${name}`);
  return { node, ...absoluteBoxes(d.root).get(node.id)! };
};
const rect = (d: Drawing, name: string): number[] => {
  const b = box(d, name);
  return [b.x, b.y, b.width, b.height];
};
const fillOf = (d: Drawing, name: string): string | undefined =>
  solid(named(d, name)?.fills ?? []);
const strokeOf = (d: Drawing, name: string): string | undefined =>
  solid(named(d, name)?.stroke?.paints ?? []);
const radiusOf = (d: Drawing, name: string): unknown => {
  const node = named(d, name);
  return node !== undefined && 'cornerRadius' in node ? node.cornerRadius : undefined;
};
const textIn = (d: Drawing, name: string): TextNode | undefined => {
  const holder = named(d, name);
  if (holder === undefined) return undefined;
  return [...walk(holder)].find((n): n is TextNode => n.type === 'text' && n.visible);
};
const textOf = (d: Drawing, name: string): string | undefined => textIn(d, name)?.text;
const colorOf = (d: Drawing, name: string): string | undefined =>
  solid(textIn(d, name)?.fills ?? []);
const fontOf = (node: TextNode | undefined) =>
  node === undefined
    ? undefined
    : [
        node.style.fontSize,
        node.style.lineHeight,
        node.style.fontWeight,
        node.style.letterSpacing,
      ];

const PICKER_24: Values = {
  title: 'Select time',
  mode: 'picker',
  hour: 14,
  minute: 30,
  is24Hour: 'true',
  selection: 'hour',
};
const PICKER_12_MINUTE: Values = {
  title: 'Select time',
  mode: 'picker',
  hour: 9,
  minute: 45,
  is24Hour: 'false',
  selection: 'minute',
};
const INPUT_12: Values = {
  title: 'Enter time',
  mode: 'input',
  hour: 8,
  minute: 5,
  is24Hour: 'false',
};

/** Center of the selector handle: angle in degrees from the top, clockwise, at `radius` from the center. */
const handleCenter = (degrees: number, radius: number): [number, number] => {
  const a = (degrees * Math.PI) / 180;
  return [128 + radius * Math.sin(a), 128 - radius * Math.cos(a)];
};
const near = (actual: number, expected: number) =>
  expect(Math.abs(actual - expected)).toBeLessThan(0.05);

describe('M5 — time-picker: container and title', () => {
  it('dialog in surface-container-high with the extra-large shape (28), padding 24 and title in label-medium', () => {
    for (const mode of MODES) {
      const d = draw(PICKER_24, mode);
      expect(d.root.width).toBe(328);
      expect(fillOf(d, 'time picker')).toBe(tok('surface-container-high', mode));
      expect(radiusOf(d, 'time picker')).toBe(num('corner-extra-large'));
      // TimePickerDialogDefaults.Title: labelMedium with 20 of padding below
      expect(rect(d, NAMES.header)).toEqual([24, 24, 280, 36]);
      const title = textIn(d, NAMES.title)!;
      expect(title.text).toBe('Select time');
      expect(fontOf(title)).toEqual(scale('label-medium'));
      expect(solid(title.fills)).toBe(tok('on-surface-variant', mode));
      expect(d.warnings).toEqual([]);
    }
  });

  it('without a title the header disappears and the content moves up 36', () => {
    const d = draw({ ...PICKER_24, title: '' }, 'light');
    expect(named(d, NAMES.header)).toBeUndefined();
    expect(box(d, NAMES.hourMinute).y).toBe(24);
  });
});

describe('M5 — time-picker: hour and minute selectors', () => {
  it('hour and minute of 96 × 80 in the small shape (8) and a 24 colon, centered in the 280 content (24 hours: 216)', () => {
    for (const mode of MODES) {
      const d = draw(PICKER_24, mode);
      expect(rect(d, NAMES.hourMinute)).toEqual([24, 60, 280, 80]);
      expect(rect(d, NAMES.hour)).toEqual([56, 60, 96, 80]);
      expect(rect(d, NAMES.colon)).toEqual([152, 60, 24, 80]);
      expect(rect(d, NAMES.minute)).toEqual([176, 60, 96, 80]);
      expect(radiusOf(d, NAMES.hour)).toBe(num('corner-small'));
      expect(radiusOf(d, NAMES.minute)).toBe(num('corner-small'));
      expect(named(d, NAMES.amPm)).toBeUndefined();
    }
  });

  it('selection on the hour: hour in primary-container / on-primary-container, minute in surface-container-highest / on-surface, display-large', () => {
    for (const mode of MODES) {
      const d = draw(PICKER_24, mode);
      expect(fillOf(d, NAMES.hour)).toBe(tok('primary-container', mode));
      expect(colorOf(d, NAMES.hour)).toBe(tok('on-primary-container', mode));
      expect(fillOf(d, NAMES.minute)).toBe(tok('surface-container-highest', mode));
      expect(colorOf(d, NAMES.minute)).toBe(tok('on-surface', mode));
      expect(fontOf(textIn(d, NAMES.hour))).toEqual(scale('display-large'));
      expect(fontOf(textIn(d, NAMES.minute))).toEqual(scale('display-large'));
      expect(textOf(d, NAMES.hour)).toBe('14');
      expect(textOf(d, NAMES.minute)).toBe('30');
      // TimeSelectorSeparatorColor
      expect(textOf(d, NAMES.colon)).toBe(':');
      expect(colorOf(d, NAMES.colon)).toBe(tok('on-surface', mode));
      expect(fontOf(textIn(d, NAMES.colon))).toEqual(scale('display-large'));
    }
  });

  it('selection on the minute swaps the roles; the numbers get a leading zero (minDigits = 2)', () => {
    for (const mode of MODES) {
      const d = draw(PICKER_12_MINUTE, mode);
      expect(fillOf(d, NAMES.minute)).toBe(tok('primary-container', mode));
      expect(colorOf(d, NAMES.minute)).toBe(tok('on-primary-container', mode));
      expect(fillOf(d, NAMES.hour)).toBe(tok('surface-container-highest', mode));
      expect(colorOf(d, NAMES.hour)).toBe(tok('on-surface', mode));
      expect(textOf(d, NAMES.hour)).toBe('09');
      expect(textOf(d, NAMES.minute)).toBe('45');
    }
    expect(textOf(draw({ ...PICKER_24, hour: 0, minute: 5 }, 'light'), NAMES.hour)).toBe(
      '00',
    );
    expect(
      textOf(draw({ ...PICKER_24, hour: 0, minute: 5 }, 'light'), NAMES.minute),
    ).toBe('05');
  });

  it('12 hours: the hour shows 1 to 12 and the 52 × 80 AM/PM selector comes 12 after the minute', () => {
    const hours: [number, string][] = [
      [0, '12'],
      [1, '01'],
      [11, '11'],
      [12, '12'],
      [13, '01'],
      [23, '11'],
    ];
    for (const [hour, label] of hours) {
      expect(textOf(draw({ ...PICKER_12_MINUTE, hour }, 'light'), NAMES.hour)).toBe(
        label,
      );
    }
    const d = draw(PICKER_12_MINUTE, 'light');
    expect(rect(d, NAMES.hour)).toEqual([24, 60, 96, 80]);
    expect(rect(d, NAMES.minute)).toEqual([144, 60, 96, 80]);
    expect(rect(d, NAMES.amPm)).toEqual([252, 60, 52, 80]);
  });
});

describe('M5 — time-picker: AM/PM selector', () => {
  it('small shape (8), 1 outline; morning selected in tertiary-container / on-tertiary-container', () => {
    for (const mode of MODES) {
      const d = draw(PICKER_12_MINUTE, mode);
      const toggle = box(d, NAMES.amPm);
      expect(radiusOf(d, NAMES.amPm)).toBe(num('corner-small'));
      expect(toggle.node.stroke?.width).toBe(1);
      expect(strokeOf(d, NAMES.amPm)).toBe(tok('outline', mode));
      expect(fillOf(d, 'AM')).toBe(tok('tertiary-container', mode));
      expect(colorOf(d, 'AM')).toBe(tok('on-tertiary-container', mode));
      expect(fillOf(d, 'PM')).toBeUndefined();
      expect(colorOf(d, 'PM')).toBe(tok('on-surface-variant', mode));
      expect(fillOf(d, NAMES.divider)).toBe(tok('outline', mode));
      expect(box(d, NAMES.divider).height).toBe(1);
      // PeriodSelectorLabelTextFont = TitleMedium
      expect(fontOf(textIn(d, 'AM'))).toEqual(scale('title-medium'));
      expect(textOf(d, 'AM')).toBe('AM');
      expect(textOf(d, 'PM')).toBe('PM');
    }
  });

  it('afternoon (12 to 23) selects PM', () => {
    for (const hour of [12, 13, 17, 23]) {
      const d = draw({ ...PICKER_12_MINUTE, hour }, 'dark');
      expect(fillOf(d, 'PM'), String(hour)).toBe(tok('tertiary-container', 'dark'));
      expect(colorOf(d, 'PM')).toBe(tok('on-tertiary-container', 'dark'));
      expect(fillOf(d, 'AM')).toBeUndefined();
      expect(colorOf(d, 'AM')).toBe(tok('on-surface-variant', 'dark'));
    }
    for (const hour of [0, 1, 11]) {
      const d = draw({ ...PICKER_12_MINUTE, hour }, 'dark');
      expect(fillOf(d, 'AM'), String(hour)).toBe(tok('tertiary-container', 'dark'));
      expect(fillOf(d, 'PM')).toBeUndefined();
    }
  });
});

/**
 * The number the handle covers: the on-primary copy (`números sob a alça`, inside the `alça`, which clips) whose
 * center falls on the center of the handle (within ±1 px). Without a number at the position (minute off the 5 grid), none.
 */
const underHandle = (d: Drawing): TextNode | undefined => {
  const handle = box(d, NAMES.handle);
  const boxes = absoluteBoxes(d.root);
  return [...walk(handle.node)].find((n): n is TextNode => {
    if (n.type !== 'text' || n.name !== NAMES.numberUnderHandle) return false;
    const b = boxes.get(n.id)!;
    return (
      Math.abs(b.x + b.width / 2 - (handle.x + handle.width / 2)) <= 1 &&
      Math.abs(b.y + b.height / 2 - (handle.y + handle.height / 2)) <= 1
    );
  });
};

/** The dial numbers, in the order the `repeat` draws them (the outer ring and, in 24 hours, the inner one). */
const clockNumbers = (d: Drawing) =>
  [...walk(d.root)]
    .filter(
      (n): n is TextNode => n.type === 'text' && n.name === NAMES.number && n.visible,
    )
    .map((node) => {
      const { x, y, width, height } = absoluteBoxes(d.root).get(node.id)!;
      return { node, rect: [x, y, width, height] };
    });

describe('M5 — time-picker: dial (clock)', () => {
  it('256 clock (ClockDialContainerSize) in surface-container-highest, full shape, 36 from the selectors', () => {
    for (const mode of MODES) {
      const d = draw(PICKER_24, mode);
      // (280 - 256) / 2 of slack, after 24 + 36 + 80 + 36
      expect(rect(d, NAMES.face)).toEqual([36, 176, 256, 256]);
      expect(fillOf(d, NAMES.face)).toBe(tok('surface-container-highest', mode));
      expect(Number(radiusOf(d, NAMES.face))).toBeGreaterThanOrEqual(128);
      expect(radiusOf(d, NAMES.face)).toBe(num('corner-full'));
    }
  });

  it('48 handle in primary, 2 track in primary and 8 center in the middle of the clock', () => {
    for (const mode of MODES) {
      const d = draw(PICKER_24, mode);
      const face = box(d, NAMES.face);
      const handle = box(d, NAMES.handle);
      expect([handle.width, handle.height]).toEqual([48, 48]);
      expect(fillOf(d, NAMES.handle)).toBe(tok('primary', mode));
      expect(radiusOf(d, NAMES.handle)).toBe(num('corner-full'));
      const dot = box(d, NAMES.center);
      expect([dot.width, dot.height]).toEqual([8, 8]);
      expect([dot.x - face.x, dot.y - face.y]).toEqual([124, 124]);
      expect(fillOf(d, NAMES.center)).toBe(tok('primary', mode));
      const track = named(d, NAMES.track)!;
      expect(track.type).toBe('path');
      expect(track.stroke?.width).toBe(2);
      expect(solid(track.stroke?.paints ?? [])).toBe(tok('primary', mode));
    }
  });

  it('hour 14 in 24 hours: handle on the inner ring (radius 69), 60° from the top, with "14" in on-primary', () => {
    for (const mode of MODES) {
      const d = draw(PICKER_24, mode);
      const face = box(d, NAMES.face);
      const handle = box(d, NAMES.handle);
      const [cx, cy] = handleCenter(60, 69);
      near(handle.x - face.x + 24, cx);
      near(handle.y - face.y + 24, cy);
      // the chosen number is the on-primary copy of the numbers that appears inside the handle
      expect(underHandle(d)?.text).toBe('14');
      expect(solid(underHandle(d)?.fills ?? [])).toBe(tok('on-primary', mode));
      expect(fontOf(underHandle(d))).toEqual(scale('body-large'));
      const track = named(d, NAMES.track) as PathNode;
      const end = /L\s*([-\d.]+)[ ,]([-\d.]+)/.exec(track.d)!;
      near(Number(end[1]), cx);
      near(Number(end[2]), cy);
    }
  });

  it('minute 45 in 12 hours: handle on the outer ring (radius 101), at 270°, with "45"; a minute off the grid carries no number', () => {
    const d = draw(PICKER_12_MINUTE, 'light');
    const face = box(d, NAMES.face);
    const handle = box(d, NAMES.handle);
    const [cx, cy] = handleCenter(270, 101);
    near(handle.x - face.x + 24, cx);
    near(handle.y - face.y + 24, cy);
    expect(underHandle(d)?.text).toBe('45');
    for (const minute of [7, 59]) {
      const off = draw({ ...PICKER_12_MINUTE, minute }, 'light');
      const [ox, oy] = handleCenter(minute * 6, 101);
      const h = box(off, NAMES.handle);
      near(h.x - box(off, NAMES.face).x + 24, ox);
      near(h.y - box(off, NAMES.face).y + 24, oy);
      expect(underHandle(off)).toBeUndefined();
    }
  });

  it('12 hours: hour 14 falls on the outer ring, at 60°, with "2"; 24 hours: hour 3 on the outer ring at 90°, with "3"', () => {
    const twelve = draw({ ...PICKER_24, is24Hour: 'false' }, 'light');
    const [cx, cy] = handleCenter(60, 101);
    const h = box(twelve, NAMES.handle);
    near(h.x - box(twelve, NAMES.face).x + 24, cx);
    near(h.y - box(twelve, NAMES.face).y + 24, cy);
    expect(underHandle(twelve)?.text).toBe('2');
    const day = draw({ ...PICKER_24, hour: 3 }, 'light');
    const [dx, dy] = handleCenter(90, 101);
    const g = box(day, NAMES.handle);
    near(g.x - box(day, NAMES.face).x + 24, dx);
    near(g.y - box(day, NAMES.face).y + 24, dy);
    expect(underHandle(day)?.text).toBe('3');
  });

  it('numbers in body-large, on-surface, 12 on the outer ring (radius 101) and 12 on the inner one (radius 69, 24 hours only)', () => {
    for (const mode of MODES) {
      const d = draw(PICKER_24, mode);
      const face = box(d, NAMES.face);
      const numbers = clockNumbers(d);
      expect(numbers).toHaveLength(24);
      for (let k = 0; k < 12; k += 1) {
        const outer = numbers[k]!;
        const [ox, oy] = handleCenter(k * 30, 101);
        near(outer.rect[0]! - face.x + outer.rect[2]! / 2, ox);
        near(outer.rect[1]! - face.y + outer.rect[3]! / 2, oy);
        const inner = numbers[12 + k]!;
        const [ix, iy] = handleCenter(k * 30, 69);
        near(inner.rect[0]! - face.x + inner.rect[2]! / 2, ix);
        near(inner.rect[1]! - face.y + inner.rect[3]! / 2, iy);
        expect(outer.node.text).toBe(String(k));
        expect(inner.node.text).toBe(String(12 + k));
      }
      const label = numbers[3]!.node;
      expect(fontOf(label)).toEqual(scale('body-large'));
      expect(solid(label.fills)).toBe(tok('on-surface', mode));
      expect(label.style.align).toBe('center');
    }
  });

  it('12 hours shows 12, 1 to 11 on the outer ring and no inner one; minutes show 0, 5 to 55', () => {
    const hours = clockNumbers(draw({ ...PICKER_24, is24Hour: 'false' }, 'light'));
    expect(hours.map((n) => n.node.text)).toEqual([
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
    const minutes = clockNumbers(draw(PICKER_12_MINUTE, 'light'));
    expect(minutes.map((n) => n.node.text)).toEqual([
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
    // in 24 hours, choosing the minute, also only the outer ring
    expect(
      clockNumbers(draw({ ...PICKER_24, selection: 'minute' }, 'light')),
    ).toHaveLength(12);
  });
});

describe('M5 — time-picker: input mode (fields)', () => {
  it('96 × 72 fields (TimeFieldContainer) in the small shape, supporting label in body-small 7 below', () => {
    for (const mode of MODES) {
      const d = draw(INPUT_12, mode);
      expect(named(d, NAMES.face)).toBeUndefined();
      expect(rect(d, NAMES.hour)).toEqual([24, 60, 96, 72]);
      expect(radiusOf(d, NAMES.hour)).toBe(num('corner-small'));
      expect(rect(d, NAMES.minute)).toEqual([144, 60, 96, 72]);
      expect(rect(d, NAMES.colon)).toEqual([120, 60, 24, 72]);
      expect(textOf(d, NAMES.hour)).toBe('08');
      expect(textOf(d, NAMES.minute)).toBe('05');
      // TimeFieldLabelTextFont = DisplayMedium
      expect(fontOf(textIn(d, NAMES.hour))).toEqual(scale('display-medium'));
      const label = textIn(d, NAMES.hourLabel)!;
      // pt-BR kept: the library's default support label is Portuguese data
      expect(label.text).toBe('Hora');
      expect(fontOf(label)).toEqual(scale('body-small'));
      expect(solid(label.fills)).toBe(tok('on-surface-variant', mode));
      // 72 of the field + 7 (SupportLabelTop)
      expect(box(d, NAMES.hourLabel).y).toBe(60 + 72 + 7);
      // pt-BR kept: the library's default support label is Portuguese data
      expect(textOf(d, NAMES.minuteLabel)).toBe('Minuto');
    }
  });

  it('focused field: primary-container, 2 outline in primary and on-primary-container; the other in surface-container-highest without an outline', () => {
    for (const mode of MODES) {
      const hourFocus = draw(INPUT_12, mode);
      expect(fillOf(hourFocus, NAMES.hour)).toBe(tok('primary-container', mode));
      expect(box(hourFocus, NAMES.hour).node.stroke?.width).toBe(2);
      expect(strokeOf(hourFocus, NAMES.hour)).toBe(tok('primary', mode));
      expect(colorOf(hourFocus, NAMES.hour)).toBe(tok('on-primary-container', mode));
      expect(fillOf(hourFocus, NAMES.minute)).toBe(
        tok('surface-container-highest', mode),
      );
      expect(strokeOf(hourFocus, NAMES.minute)).toBeUndefined();
      expect(colorOf(hourFocus, NAMES.minute)).toBe(tok('on-surface', mode));
      const minuteFocus = draw({ ...INPUT_12, selection: 'minute' }, mode);
      expect(fillOf(minuteFocus, NAMES.minute)).toBe(tok('primary-container', mode));
      expect(strokeOf(minuteFocus, NAMES.minute)).toBe(tok('primary', mode));
      expect(strokeOf(minuteFocus, NAMES.hour)).toBeUndefined();
    }
  });

  it('12 hours: 52 × 72 AM/PM selector (TimeInputTokens) 12 after the minute field; 24 hours does not show it', () => {
    const d = draw(INPUT_12, 'light');
    expect(rect(d, NAMES.amPm)).toEqual([252, 60, 52, 72]);
    expect(strokeOf(d, NAMES.amPm)).toBe(tok('outline', 'light'));
    expect(fillOf(d, 'AM')).toBe(tok('tertiary-container', 'light'));
    expect(colorOf(d, 'AM')).toBe(tok('on-tertiary-container', 'light'));
    expect(colorOf(d, 'PM')).toBe(tok('on-surface-variant', 'light'));
    const pm = draw({ ...INPUT_12, hour: 20 }, 'dark');
    expect(fillOf(pm, 'PM')).toBe(tok('tertiary-container', 'dark'));
    expect(fillOf(pm, 'AM')).toBeUndefined();
    const day = draw({ ...INPUT_12, is24Hour: 'true', hour: 20 }, 'light');
    expect(named(day, NAMES.amPm)).toBeUndefined();
    expect(textOf(day, NAMES.hour)).toBe('20');
  });
});

describe('M5 — time-picker: modes and warnings', () => {
  it('the examples draw without a warning in both modes and the dark mode changes the clock color', () => {
    const light = draw(PICKER_24, 'light');
    const dark = draw(PICKER_24, 'dark');
    expect(fillOf(light, NAMES.face)).not.toBe(fillOf(dark, NAMES.face));
    expect(fillOf(light, NAMES.handle)).toBe('#6750A4');
    expect(fillOf(dark, NAMES.handle)).toBe('#D0BCFF');
    for (const mode of MODES) {
      for (const values of [PICKER_24, PICKER_12_MINUTE, INPUT_12]) {
        expect(draw(values, mode).warnings).toEqual([]);
      }
    }
  });
});
