// M5 da etapa "Material 3 fiel": time-picker contra o que `TimePicker.kt`, `TimePickerDialog.kt`,
// `TimePickerTokens.kt` e `TimeInputTokens.kt` fixam no commit 5113b82a. As cores esperadas saem dos
// tokens da especificação (light e dark); a geometria, das constantes do Compose (dp = px do componente).
import { describe, expect, it } from 'vitest';
import { buildCatalog, findEntry } from '../../src/model/catalog';
import { absoluteBoxes, walk } from '../../src/model/components/scene';
import type { PathNode, SceneNode, TextNode } from '../../src/model/components/scene';
import { drawIn, files, solid, spec } from '../support/material3Library';

const catalog = buildCatalog(files);
const entry = findEntry(catalog, 'time-picker')!;
type Values = Parameters<typeof drawIn>[2];
type Mode = 'light' | 'dark';
type Drawing = ReturnType<typeof drawIn>;
const MODES: Mode[] = ['light', 'dark'];
const draw = (values: Values, mode: Mode): Drawing => drawIn(catalog, entry, values, mode);

const tokens = spec.tokens!.values as Record<string, unknown>;
/** Valor do token da especialização no modo (cor). */
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
  if (node === undefined) throw new Error(`nó ausente: ${name}`);
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
  title: 'Selecionar horário',
  mode: 'picker',
  hour: 14,
  minute: 30,
  is24Hour: 'true',
  selection: 'hour',
};
const PICKER_12_MINUTE: Values = {
  title: 'Selecionar horário',
  mode: 'picker',
  hour: 9,
  minute: 45,
  is24Hour: 'false',
  selection: 'minute',
};
const INPUT_12: Values = {
  title: 'Informe o horário',
  mode: 'input',
  hour: 8,
  minute: 5,
  is24Hour: 'false',
};

/** Centro da alça do seletor: ângulo em graus a partir do topo, no sentido horário, a `radius` do centro. */
const handleCenter = (degrees: number, radius: number): [number, number] => {
  const a = (degrees * Math.PI) / 180;
  return [128 + radius * Math.sin(a), 128 - radius * Math.cos(a)];
};
const near = (actual: number, expected: number) =>
  expect(Math.abs(actual - expected)).toBeLessThan(0.05);

describe('M5 — time-picker: contêiner e título', () => {
  it('diálogo em surface-container-high com a forma extra-large (28), padding 24 e título em label-medium', () => {
    for (const mode of MODES) {
      const d = draw(PICKER_24, mode);
      expect(d.root.width).toBe(328);
      expect(fillOf(d, 'time picker')).toBe(tok('surface-container-high', mode));
      expect(radiusOf(d, 'time picker')).toBe(num('corner-extra-large'));
      // TimePickerDialogDefaults.Title: labelMedium com 20 de padding embaixo
      expect(rect(d, 'cabeçalho')).toEqual([24, 24, 280, 36]);
      const title = textIn(d, 'título')!;
      expect(title.text).toBe('Selecionar horário');
      expect(fontOf(title)).toEqual(scale('label-medium'));
      expect(solid(title.fills)).toBe(tok('on-surface-variant', mode));
      expect(d.warnings).toEqual([]);
    }
  });

  it('sem título o cabeçalho some e o conteúdo sobe 36', () => {
    const d = draw({ ...PICKER_24, title: '' }, 'light');
    expect(named(d, 'cabeçalho')).toBeUndefined();
    expect(box(d, 'hora e minuto').y).toBe(24);
  });
});

describe('M5 — time-picker: seletores de hora e minuto', () => {
  it('hora e minuto de 96 × 80 na forma small (8) e dois pontos de 24, centrados no conteúdo de 280 (24 horas: 216)', () => {
    for (const mode of MODES) {
      const d = draw(PICKER_24, mode);
      expect(rect(d, 'hora e minuto')).toEqual([24, 60, 280, 80]);
      expect(rect(d, 'hora')).toEqual([56, 60, 96, 80]);
      expect(rect(d, 'dois pontos')).toEqual([152, 60, 24, 80]);
      expect(rect(d, 'minuto')).toEqual([176, 60, 96, 80]);
      expect(radiusOf(d, 'hora')).toBe(num('corner-small'));
      expect(radiusOf(d, 'minuto')).toBe(num('corner-small'));
      expect(named(d, 'AM e PM')).toBeUndefined();
    }
  });

  it('seleção na hora: hora em primary-container / on-primary-container, minuto em surface-container-highest / on-surface, display-large', () => {
    for (const mode of MODES) {
      const d = draw(PICKER_24, mode);
      expect(fillOf(d, 'hora')).toBe(tok('primary-container', mode));
      expect(colorOf(d, 'hora')).toBe(tok('on-primary-container', mode));
      expect(fillOf(d, 'minuto')).toBe(tok('surface-container-highest', mode));
      expect(colorOf(d, 'minuto')).toBe(tok('on-surface', mode));
      expect(fontOf(textIn(d, 'hora'))).toEqual(scale('display-large'));
      expect(fontOf(textIn(d, 'minuto'))).toEqual(scale('display-large'));
      expect(textOf(d, 'hora')).toBe('14');
      expect(textOf(d, 'minuto')).toBe('30');
      // TimeSelectorSeparatorColor
      expect(textOf(d, 'dois pontos')).toBe(':');
      expect(colorOf(d, 'dois pontos')).toBe(tok('on-surface', mode));
      expect(fontOf(textIn(d, 'dois pontos'))).toEqual(scale('display-large'));
    }
  });

  it('seleção no minuto troca os papéis; os números levam zero à esquerda (minDigits = 2)', () => {
    for (const mode of MODES) {
      const d = draw(PICKER_12_MINUTE, mode);
      expect(fillOf(d, 'minuto')).toBe(tok('primary-container', mode));
      expect(colorOf(d, 'minuto')).toBe(tok('on-primary-container', mode));
      expect(fillOf(d, 'hora')).toBe(tok('surface-container-highest', mode));
      expect(colorOf(d, 'hora')).toBe(tok('on-surface', mode));
      expect(textOf(d, 'hora')).toBe('09');
      expect(textOf(d, 'minuto')).toBe('45');
    }
    expect(textOf(draw({ ...PICKER_24, hour: 0, minute: 5 }, 'light'), 'hora')).toBe('00');
    expect(textOf(draw({ ...PICKER_24, hour: 0, minute: 5 }, 'light'), 'minuto')).toBe('05');
  });

  it('12 horas: a hora mostra 1 a 12 e o seletor AM/PM de 52 × 80 vem 12 depois do minuto', () => {
    const hours: [number, string][] = [
      [0, '12'],
      [1, '01'],
      [11, '11'],
      [12, '12'],
      [13, '01'],
      [23, '11'],
    ];
    for (const [hour, label] of hours) {
      expect(textOf(draw({ ...PICKER_12_MINUTE, hour }, 'light'), 'hora')).toBe(label);
    }
    const d = draw(PICKER_12_MINUTE, 'light');
    expect(rect(d, 'hora')).toEqual([24, 60, 96, 80]);
    expect(rect(d, 'minuto')).toEqual([144, 60, 96, 80]);
    expect(rect(d, 'AM e PM')).toEqual([252, 60, 52, 80]);
  });
});

describe('M5 — time-picker: seletor AM/PM', () => {
  it('forma small (8), contorno de 1 em outline; manhã selecionada em tertiary-container / on-tertiary-container', () => {
    for (const mode of MODES) {
      const d = draw(PICKER_12_MINUTE, mode);
      const toggle = box(d, 'AM e PM');
      expect(radiusOf(d, 'AM e PM')).toBe(num('corner-small'));
      expect(toggle.node.stroke?.width).toBe(1);
      expect(strokeOf(d, 'AM e PM')).toBe(tok('outline', mode));
      expect(fillOf(d, 'AM')).toBe(tok('tertiary-container', mode));
      expect(colorOf(d, 'AM')).toBe(tok('on-tertiary-container', mode));
      expect(fillOf(d, 'PM')).toBeUndefined();
      expect(colorOf(d, 'PM')).toBe(tok('on-surface-variant', mode));
      expect(fillOf(d, 'divisor')).toBe(tok('outline', mode));
      expect(box(d, 'divisor').height).toBe(1);
      // PeriodSelectorLabelTextFont = TitleMedium
      expect(fontOf(textIn(d, 'AM'))).toEqual(scale('title-medium'));
      expect(textOf(d, 'AM')).toBe('AM');
      expect(textOf(d, 'PM')).toBe('PM');
    }
  });

  it('tarde (12 a 23) seleciona o PM', () => {
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

describe('M5 — time-picker: mostrador (relógio)', () => {
  it('relógio de 256 (ClockDialContainerSize) em surface-container-highest, forma full, a 36 dos seletores', () => {
    for (const mode of MODES) {
      const d = draw(PICKER_24, mode);
      // (280 - 256) / 2 de folga, depois de 24 + 36 + 80 + 36
      expect(rect(d, 'relógio')).toEqual([36, 176, 256, 256]);
      expect(fillOf(d, 'relógio')).toBe(tok('surface-container-highest', mode));
      expect(Number(radiusOf(d, 'relógio'))).toBeGreaterThanOrEqual(128);
      expect(radiusOf(d, 'relógio')).toBe(num('corner-full'));
    }
  });

  it('alça de 48 em primary, trilho de 2 em primary e centro de 8 no meio do relógio', () => {
    for (const mode of MODES) {
      const d = draw(PICKER_24, mode);
      const face = box(d, 'relógio');
      const handle = box(d, 'alça');
      expect([handle.width, handle.height]).toEqual([48, 48]);
      expect(fillOf(d, 'alça')).toBe(tok('primary', mode));
      expect(radiusOf(d, 'alça')).toBe(num('corner-full'));
      const dot = box(d, 'centro');
      expect([dot.width, dot.height]).toEqual([8, 8]);
      expect([dot.x - face.x, dot.y - face.y]).toEqual([124, 124]);
      expect(fillOf(d, 'centro')).toBe(tok('primary', mode));
      const track = named(d, 'trilho')!;
      expect(track.type).toBe('path');
      expect(track.stroke?.width).toBe(2);
      expect(solid(track.stroke?.paints ?? [])).toBe(tok('primary', mode));
    }
  });

  it('hora 14 em 24 horas: alça no anel interno (raio 69), a 60° do topo, com "14" em on-primary', () => {
    for (const mode of MODES) {
      const d = draw(PICKER_24, mode);
      const face = box(d, 'relógio');
      const handle = box(d, 'alça');
      const [cx, cy] = handleCenter(60, 69);
      near(handle.x - face.x + 24, cx);
      near(handle.y - face.y + 24, cy);
      expect(textOf(d, 'alça')).toBe('14');
      expect(colorOf(d, 'alça')).toBe(tok('on-primary', mode));
      expect(fontOf(textIn(d, 'alça'))).toEqual(scale('body-large'));
      const track = named(d, 'trilho') as PathNode;
      const end = /L\s*([-\d.]+)[ ,]([-\d.]+)/.exec(track.d)!;
      near(Number(end[1]), cx);
      near(Number(end[2]), cy);
    }
  });

  it('minuto 45 em 12 horas: alça no anel externo (raio 101), a 270°, com "45"; minuto fora da grade não leva número', () => {
    const d = draw(PICKER_12_MINUTE, 'light');
    const face = box(d, 'relógio');
    const handle = box(d, 'alça');
    const [cx, cy] = handleCenter(270, 101);
    near(handle.x - face.x + 24, cx);
    near(handle.y - face.y + 24, cy);
    expect(textOf(d, 'alça')).toBe('45');
    for (const minute of [7, 59]) {
      const off = draw({ ...PICKER_12_MINUTE, minute }, 'light');
      const [ox, oy] = handleCenter(minute * 6, 101);
      const h = box(off, 'alça');
      near(h.x - box(off, 'relógio').x + 24, ox);
      near(h.y - box(off, 'relógio').y + 24, oy);
      expect(textOf(off, 'alça') ?? '').toBe('');
    }
  });

  it('12 horas: hora 14 cai no anel externo, a 60°, com "2"; 24 horas: hora 3 no externo a 90°, com "3"', () => {
    const twelve = draw({ ...PICKER_24, is24Hour: 'false' }, 'light');
    const [cx, cy] = handleCenter(60, 101);
    const h = box(twelve, 'alça');
    near(h.x - box(twelve, 'relógio').x + 24, cx);
    near(h.y - box(twelve, 'relógio').y + 24, cy);
    expect(textOf(twelve, 'alça')).toBe('2');
    const day = draw({ ...PICKER_24, hour: 3 }, 'light');
    const [dx, dy] = handleCenter(90, 101);
    const g = box(day, 'alça');
    near(g.x - box(day, 'relógio').x + 24, dx);
    near(g.y - box(day, 'relógio').y + 24, dy);
    expect(textOf(day, 'alça')).toBe('3');
  });

  it('números em body-large, on-surface, 12 no anel externo (raio 101) e 12 no interno (raio 69, só 24 horas)', () => {
    for (const mode of MODES) {
      const d = draw(PICKER_24, mode);
      const face = box(d, 'relógio');
      for (let k = 0; k < 12; k += 1) {
        const outer = box(d, `número ${k}`);
        const [ox, oy] = handleCenter(k * 30, 101);
        near(outer.x - face.x + outer.width / 2, ox);
        near(outer.y - face.y + outer.height / 2, oy);
        const inner = box(d, `número interno ${k}`);
        const [ix, iy] = handleCenter(k * 30, 69);
        near(inner.x - face.x + inner.width / 2, ix);
        near(inner.y - face.y + inner.height / 2, iy);
        expect(textOf(d, `número ${k}`)).toBe(String(k));
        expect(textOf(d, `número interno ${k}`)).toBe(String(12 + k));
      }
      const label = textIn(d, 'número 3')!;
      expect(fontOf(label)).toEqual(scale('body-large'));
      expect(solid(label.fills)).toBe(tok('on-surface', mode));
      expect(label.style.align).toBe('center');
    }
  });

  it('12 horas mostra 12, 1 a 11 no anel externo e nenhum interno; minutos mostram 0, 5 a 55', () => {
    const hours = draw({ ...PICKER_24, is24Hour: 'false' }, 'light');
    expect(
      Array.from({ length: 12 }, (_, k) => textOf(hours, `número ${k}`)),
    ).toEqual(['12', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11']);
    expect(named(hours, 'número interno 0')).toBeUndefined();
    const minutes = draw(PICKER_12_MINUTE, 'light');
    expect(
      Array.from({ length: 12 }, (_, k) => textOf(minutes, `número ${k}`)),
    ).toEqual(['0', '5', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55']);
    expect(named(minutes, 'número interno 0')).toBeUndefined();
    const day = draw({ ...PICKER_24, selection: 'minute' }, 'light');
    expect(named(day, 'número interno 0')).toBeUndefined();
  });
});

describe('M5 — time-picker: modo input (campos)', () => {
  it('campos de 96 × 72 (TimeFieldContainer) na forma small, rótulo de apoio em body-small a 7 de baixo', () => {
    for (const mode of MODES) {
      const d = draw(INPUT_12, mode);
      expect(named(d, 'relógio')).toBeUndefined();
      expect(rect(d, 'hora')).toEqual([24, 60, 96, 72]);
      expect(radiusOf(d, 'hora')).toBe(num('corner-small'));
      expect(rect(d, 'minuto')).toEqual([144, 60, 96, 72]);
      expect(rect(d, 'dois pontos')).toEqual([120, 60, 24, 72]);
      expect(textOf(d, 'hora')).toBe('08');
      expect(textOf(d, 'minuto')).toBe('05');
      // TimeFieldLabelTextFont = DisplayMedium
      expect(fontOf(textIn(d, 'hora'))).toEqual(scale('display-medium'));
      const label = textIn(d, 'rótulo da hora')!;
      expect(label.text).toBe('Hora');
      expect(fontOf(label)).toEqual(scale('body-small'));
      expect(solid(label.fills)).toBe(tok('on-surface-variant', mode));
      // 72 do campo + 7 (SupportLabelTop)
      expect(box(d, 'rótulo da hora').y).toBe(60 + 72 + 7);
      expect(textOf(d, 'rótulo do minuto')).toBe('Minuto');
    }
  });

  it('campo em foco: primary-container, contorno de 2 em primary e on-primary-container; o outro em surface-container-highest sem contorno', () => {
    for (const mode of MODES) {
      const hourFocus = draw(INPUT_12, mode);
      expect(fillOf(hourFocus, 'hora')).toBe(tok('primary-container', mode));
      expect(box(hourFocus, 'hora').node.stroke?.width).toBe(2);
      expect(strokeOf(hourFocus, 'hora')).toBe(tok('primary', mode));
      expect(colorOf(hourFocus, 'hora')).toBe(tok('on-primary-container', mode));
      expect(fillOf(hourFocus, 'minuto')).toBe(
        tok('surface-container-highest', mode),
      );
      expect(strokeOf(hourFocus, 'minuto')).toBeUndefined();
      expect(colorOf(hourFocus, 'minuto')).toBe(tok('on-surface', mode));
      const minuteFocus = draw({ ...INPUT_12, selection: 'minute' }, mode);
      expect(fillOf(minuteFocus, 'minuto')).toBe(tok('primary-container', mode));
      expect(strokeOf(minuteFocus, 'minuto')).toBe(tok('primary', mode));
      expect(strokeOf(minuteFocus, 'hora')).toBeUndefined();
    }
  });

  it('12 horas: seletor AM/PM de 52 × 72 (TimeInputTokens) 12 depois do campo do minuto; 24 horas não o mostra', () => {
    const d = draw(INPUT_12, 'light');
    expect(rect(d, 'AM e PM')).toEqual([252, 60, 52, 72]);
    expect(strokeOf(d, 'AM e PM')).toBe(tok('outline', 'light'));
    expect(fillOf(d, 'AM')).toBe(tok('tertiary-container', 'light'));
    expect(colorOf(d, 'AM')).toBe(tok('on-tertiary-container', 'light'));
    expect(colorOf(d, 'PM')).toBe(tok('on-surface-variant', 'light'));
    const pm = draw({ ...INPUT_12, hour: 20 }, 'dark');
    expect(fillOf(pm, 'PM')).toBe(tok('tertiary-container', 'dark'));
    expect(fillOf(pm, 'AM')).toBeUndefined();
    const day = draw({ ...INPUT_12, is24Hour: 'true', hour: 20 }, 'light');
    expect(named(day, 'AM e PM')).toBeUndefined();
    expect(textOf(day, 'hora')).toBe('20');
  });
});

describe('M5 — time-picker: modos e avisos', () => {
  it('os exemplos desenham sem aviso nos dois modos e o modo escuro muda a cor do relógio', () => {
    const light = draw(PICKER_24, 'light');
    const dark = draw(PICKER_24, 'dark');
    expect(fillOf(light, 'relógio')).not.toBe(fillOf(dark, 'relógio'));
    expect(fillOf(light, 'alça')).toBe('#6750A4');
    expect(fillOf(dark, 'alça')).toBe('#D0BCFF');
    for (const mode of MODES) {
      for (const values of [PICKER_24, PICKER_12_MINUTE, INPUT_12]) {
        expect(draw(values, mode).warnings).toEqual([]);
      }
    }
  });
});
