// M5 da etapa "Material 3 fiel": o date-picker contra o que `DatePicker.kt`, `DateRangePicker.kt`,
// `DatePickerDialog.android.kt` e `DatePickerModalTokens.kt` fixam no commit 5113b82a. As cores
// esperadas saem dos tokens da especialização (light e dark); a geometria, das constantes do Compose
// (dp = px do componente).
import { describe, expect, it } from 'vitest';
import { buildCatalog, findEntry } from '../../src/model/catalog';
import { approximateMeasurer } from '../../src/model/components/instantiate';
import { absoluteBoxes, walk } from '../../src/model/components/scene';
import type { PathNode, SceneNode, TextNode } from '../../src/model/components/scene';
import { drawIn, files, solid, spec, text } from '../support/material3Library';

const catalog = buildCatalog(files);
const entry = findEntry(catalog, 'date-picker')!;
type Values = Parameters<typeof drawIn>[2];
type Mode = 'light' | 'dark';
type Drawing = ReturnType<typeof drawIn>;
const MODES: Mode[] = ['light', 'dark'];
const draw = (values: Values, mode: Mode = 'light'): Drawing =>
  drawIn(catalog, entry, values, mode);

const SINGLE: Values = {
  headline: 'qua., 15 de out.',
  displayedMonth: 'Outubro de 2025',
  selection: 'single',
  selectedDay: 15,
};
const RANGE: Values = {
  headline: '9 out – 16 out',
  displayedMonth: 'Outubro de 2025',
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
  if (node === undefined) throw new Error(`nó ausente: ${name}`);
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
/** As faixas do intervalo (uma por célula do intervalo), unidas numa por semana que o intervalo toca. */
const bands = (d: Drawing) => {
  const rows = new Map<number, { x0: number; x1: number; h: number; fill?: string }>();
  for (const n of walk(d.root)) {
    if (n.name !== 'faixa' || !n.visible || n.width <= 0) continue;
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
/** A célula de um dia (o texto `dia`) que aparece dentro da janela da grade. */
const dayNode = (d: Drawing, day: number): TextNode => {
  const grid = box(d, 'grade');
  const found = [...walk(d.root)].find((n): n is TextNode => {
    if (n.type !== 'text' || n.name !== 'dia' || !n.visible || n.text !== String(day))
      return false;
    const r = absOf(d, n);
    return r.x >= grid.x + 12 && r.x + r.width <= grid.x + grid.width - 12;
  });
  if (found === undefined) throw new Error(`dia ausente: ${day}`);
  return found;
};
const dayRect = (d: Drawing, day: number) => {
  const { x, y, width, height } = absOf(d, dayNode(d, day));
  return [x, y, width, height];
};
/** Os círculos primary do dia escolhido e das pontas do intervalo (o nó `marcado`), com o número que levam. */
const markedAll = (d: Drawing) =>
  [...walk(d.root)]
    .filter((n) => n.name === 'marcado' && n.visible)
    .map((n) => {
      const { x, y, width, height } = absOf(d, n);
      const label = [...walk(n)].find((c): c is TextNode => c.type === 'text')!;
      return { node: n, rect: [x, y, width, height], label };
    });
const markedOf = (d: Drawing, text: string) =>
  markedAll(d).find((m) => m.label.text === text);
const BAD = /não cabe|texto maior que a caixa|unknown icon|ícone esticado|token/i;

describe('M5 date-picker — contêiner e cabeçalho (modo single)', () => {
  it('contêiner em surface-container-high com raio corner-extra-large (28), sem sombra, em light e dark', () => {
    for (const mode of MODES) {
      const d = draw(SINGLE, mode);
      expect(fillOf(d, 'date picker')).toBe(tok('surface-container-high', mode));
      const root = d.root as { cornerRadius?: number };
      expect(root.cornerRadius).toBe(num('corner-extra-large'));
      expect(d.root.effects).toEqual([]);
      expect(d.warnings.filter((w) => BAD.test(w))).toEqual([]);
    }
  });

  it('altura 120 do cabeçalho (HeaderContainerHeight) com o divisor de 1 em outline-variant na base dele', () => {
    for (const mode of MODES) {
      const d = draw(SINGLE, mode);
      expect(rect(d, 'cabeçalho')).toEqual([0, 0, 360, 120]);
      expect(rect(d, 'divisor')).toEqual([0, 119, 360, 1]);
      expect(fillOf(d, 'divisor')).toBe(tok('outline-variant', mode));
    }
  });

  it('título em label-large (14/20/500/0,1) em on-surface-variant, a 24 da esquerda e 16 do topo', () => {
    for (const mode of MODES) {
      const d = draw({ ...SINGLE, title: 'Selecionar data' }, mode);
      const title = textOf(d, 'título')!;
      expect(fontOf(title)).toEqual(scale('label-large'));
      expect(solid(title.fills)).toBe(tok('on-surface-variant', mode));
      expect([absOf(d, title).x, absOf(d, title).y]).toEqual([24, 16]);
    }
  });

  it('título e manchete padrão do M3 quando vazios (Selecionar data / Data selecionada)', () => {
    const d = draw({ selection: 'single', displayedMonth: 'Outubro de 2025' });
    expect(textOf(d, 'título')!.text).toBe('Selecionar data');
    expect(textOf(d, 'manchete')!.text).toBe('Data selecionada');
  });

  it('manchete em headline-large (32/40/400/0), on-surface-variant, maxLines 1, a 24 da esquerda', () => {
    for (const mode of MODES) {
      const d = draw(SINGLE, mode);
      const headline = textOf(d, 'manchete')!;
      expect(fontOf(headline)).toEqual(scale('headline-large'));
      expect(solid(headline.fills)).toBe(tok('on-surface-variant', mode));
      expect(headline.style.maxLines).toBe(1);
      // linha de 60 (botão 48 + 12 de baixo) acima do divisor; a manchete (40 + 12 de baixo) centrada nela
      expect([absOf(d, headline).x, absOf(d, headline).y]).toEqual([24, 63]);
    }
  });

  it('alternar modo: botão de 48 a 12 da direita e 12 da base, com o ícone edit de 24 em on-surface-variant', () => {
    for (const mode of MODES) {
      const d = draw(SINGLE, mode);
      expect(rect(d, 'botão do modo')).toEqual([300, 59, 48, 48]);
      const icon = iconIn(d, 'botão do modo')!;
      expect(icon.rect).toEqual([312, 71, 24, 24]);
      expect(icon.color).toBe(tok('on-surface-variant', mode));
    }
  });

  it('showModeToggle false esconde o botão e a manchete desce (só os 12 de baixo)', () => {
    const d = draw({ ...SINGLE, showModeToggle: 'false' });
    expect(named(d, 'botão do modo')).toBeUndefined();
    expect(absOf(d, textOf(d, 'manchete')!).y).toBe(67);
  });
});

describe('M5 date-picker — navegação do mês e dias da semana (single)', () => {
  it('linha do mês de 56 (MonthYearHeight) com 12 de margem; botão do ano de 40 com texto label-large', () => {
    for (const mode of MODES) {
      const d = draw(SINGLE, mode);
      expect(rect(d, 'navegação do mês')).toEqual([0, 120, 360, 56]);
      expect(rect(d, 'botão do ano')).toEqual([12, 128, expect.any(Number), 40]);
      const month = textOf(d, 'mês exibido')!;
      expect(month.text).toBe('Outubro de 2025');
      expect(fontOf(month)).toEqual(scale('label-large'));
      expect(solid(month.fills)).toBe(tok('on-surface-variant', mode));
      // padding de 12 do TextButton
      expect(absOf(d, month).x).toBe(24);
    }
  });

  it('setas de mês: dois IconButtons de 48 colados à direita (12 de margem), ícones keyboard_arrow de 24 em on-surface-variant; o seletor de ano leva arrow_drop_down de 24', () => {
    for (const mode of MODES) {
      const d = draw(SINGLE, mode);
      expect(rect(d, 'seta anterior')).toEqual([252, 124, 48, 48]);
      expect(rect(d, 'seta próxima')).toEqual([300, 124, 48, 48]);
      for (const [name, x] of [
        ['seta anterior', 264],
        ['seta próxima', 312],
      ] as const) {
        const icon = iconIn(d, name)!;
        expect(icon.rect).toEqual([x, 136, 24, 24]);
        expect(icon.color).toBe(tok('on-surface-variant', mode));
      }
      const drop = iconIn(d, 'botão do ano')!;
      expect([drop.rect[2], drop.rect[3]]).toEqual([24, 24]);
      expect(drop.color).toBe(tok('on-surface-variant', mode));
    }
  });

  it('dias da semana: 7 células de 48 a partir de 12, em body-large (16/24/400/0,5) e on-surface', () => {
    for (const mode of MODES) {
      const d = draw(SINGLE, mode);
      expect(rect(d, 'dias da semana')).toEqual([0, 176, 360, 48]);
      for (let i = 1; i <= 7; i++) {
        const letter = named(d, `dia da semana ${i}`) as TextNode;
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

describe('M5 date-picker — grade de dias', () => {
  it('31 dias começando na quarta, células de 48 (RecommendedSizeForAccessibility), em body-large e on-surface', () => {
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

  it('o conteúdo mede 360 × 464 (cabeçalho 120 + mês 56 + semana 48 + cinco linhas de 48) e o fundo ocupa a caixa de 469', () => {
    const d = draw(SINGLE);
    expect(rect(d, 'grade')).toEqual([0, 224, 360, 240]);
    expect([d.root.width, d.root.height]).toEqual([360, 512]);
    expect(d.warnings.filter((w) => /conteúdo maior que a caixa/.test(w))).toEqual([]);
  });

  it('dia escolhido: círculo de 40 (DateContainerWidth/Height) corner-full em primary dentro da célula de 48, número em on-primary, em light e dark', () => {
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
    // a cor do selecionado muda de um modo para o outro
    expect(tok('primary', 'light')).not.toBe(tok('primary', 'dark'));
    expect(solid(markedAll(draw(SINGLE, 'light'))[0]!.node.fills)).not.toBe(
      solid(markedAll(draw(SINGLE, 'dark'))[0]!.node.fills),
    );
  });

  it('o dia escolhido acompanha selectedDay (1 e 31) e some sem seleção', () => {
    expect(markedOf(draw({ ...SINGLE, selectedDay: 1 }), '1')!.rect).toEqual([
      160, 228, 40, 40,
    ]);
    expect(markedOf(draw({ ...SINGLE, selectedDay: 31 }), '31')!.rect).toEqual([
      256, 420, 40, 40,
    ]);
    const none = draw({ selection: 'single', displayedMonth: 'Outubro de 2025' });
    expect(markedAll(none)).toEqual([]);
    expect(bands(none)).toEqual([]);
  });

  it('no estilo single não aparece intervalo, mesmo com dias de intervalo preenchidos', () => {
    const d = draw({ ...SINGLE, rangeStartDay: 9, rangeEndDay: 16 });
    expect(bands(d)).toEqual([]);
    // só o dia escolhido: as pontas do intervalo (9 e 16) não desenham
    expect(markedAll(d).map((m) => m.label.text)).toEqual(['15']);
  });
});

describe('M5 date-picker — intervalo (DateRangePicker)', () => {
  it('cabeçalho do intervalo: título a 64 da esquerda, manchete em title-large (22/28/400/0) em on-surface-variant', () => {
    for (const mode of MODES) {
      const d = draw(RANGE, mode);
      const title = textOf(d, 'título')!;
      expect(title.text).toBe('Selecionar datas');
      expect(fontOf(title)).toEqual(scale('label-large'));
      expect(absOf(d, title).x).toBe(64);
      const headline = textOf(d, 'manchete')!;
      expect(headline.text).toBe('9 out – 16 out');
      expect(fontOf(headline)).toEqual(scale('title-large'));
      expect(solid(headline.fills)).toBe(tok('on-surface-variant', mode));
      expect(absOf(d, headline).x).toBe(64);
      // título 20 + linha de 60 + divisor de 1
      expect(rect(d, 'cabeçalho')).toEqual([0, 0, 360, 81]);
    }
  });

  it('sem a linha de navegação; o mês vira o subtítulo (title-small, on-surface-variant) a 24, com 20 em cima e 8 embaixo', () => {
    for (const mode of MODES) {
      const d = draw(RANGE, mode);
      expect(named(d, 'navegação do mês')).toBeUndefined();
      expect(rect(d, 'dias da semana')).toEqual([0, 81, 360, 48]);
      const month = textOf(d, 'mês do intervalo')!;
      expect(month.text).toBe('Outubro de 2025');
      expect(fontOf(month)).toEqual(scale('title-small'));
      expect(solid(month.fills)).toBe(tok('on-surface-variant', mode));
      expect([absOf(d, month).x, absOf(d, month).y]).toEqual([24, 149]);
      expect(dayRect(d, 1)).toEqual([156, 177, 48, 48]);
      // 81 + 48 + 48 + 240
      expect(rect(d, 'grade')).toEqual([0, 177, 360, 240]);
    }
  });

  it('extremos do intervalo: círculos de 40 em primary com número em on-primary, em light e dark', () => {
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

  it('faixa do intervalo: 40 de altura em secondary-container, do centro do dia inicial ao centro do final, atravessando as semanas', () => {
    for (const mode of MODES) {
      const d = draw(RANGE, mode);
      expect(bands(d)).toEqual([
        // semana de 5 a 11: do centro do dia 9 até a borda direita da grade (348)
        { rect: [228, 229, 120, 40], fill: tok('secondary-container', mode) },
        // semana de 12 a 18: da borda esquerda da grade (12) até o centro do dia 16
        { rect: [12, 277, 216, 40], fill: tok('secondary-container', mode) },
      ]);
    }
  });

  it('intervalo dentro de uma semana: a faixa vai de centro a centro', () => {
    const d = draw({ ...RANGE, rangeStartDay: 13, rangeEndDay: 16 });
    // 13 (coluna 1) a 16 (coluna 4): 12 + 48 + 24 = 84 até 12 + 192 + 24 = 228
    expect(bands(d).map((b) => b.rect)).toEqual([[84, 277, 144, 40]]);
  });

  it('intervalo de cinco semanas: faixas cheias nas semanas do meio (largura 336)', () => {
    const d = draw({ ...RANGE, rangeStartDay: 2, rangeEndDay: 30 });
    expect(bands(d).map((b) => [b.rect[0], b.rect[2]])).toEqual([
      // dia 2 é a coluna 4 da primeira semana: do centro dele (228) até a borda direita (348)
      [228, 120],
      [12, 336],
      [12, 336],
      [12, 336],
      [12, 216],
    ]);
  });

  it('dia fora do mês: o início depois do mês não desenha faixa e o fim depois do mês leva a faixa até o último dia', () => {
    expect(bands(draw({ ...RANGE, rangeStartDay: 45, rangeEndDay: 50 }))).toEqual([]);
    const d = draw({ ...RANGE, rangeStartDay: 3, rangeEndDay: 50 });
    const rows = bands(d);
    // o dia 3 é a coluna 5 da primeira semana (centro em 276); o 31 fecha a semana de 26 a 31 na coluna 5 (borda em 300)
    expect(rows[0]!.rect[0]).toBe(276);
    const last = rows[rows.length - 1]!.rect;
    expect(last[0]! + last[2]!).toBe(300);
    expect(markedAll(d).map((m) => m.label.text)).toEqual(['3']);
  });

  it('intervalo sem o dia final: só o círculo do dia inicial, sem faixa', () => {
    const d = draw({ ...RANGE, rangeEndDay: undefined });
    expect(bands(d)).toEqual([]);
    expect(markedAll(d).map((m) => m.label.text)).toEqual(['9']);
    expect(markedOf(d, '9')!.rect).toEqual([208, 229, 40, 40]);
  });
});

describe('M5 date-picker — fontes e limites', () => {
  it('sem cor literal, sem family e sem caminho SVG; ícones pelo conjunto (edit, arrow_drop_down, keyboard_arrow_*)', () => {
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

  it('o arquivo encolhe de 120 kB para menos de 80 kB (a grade usa tokens e uma camada por seleção)', () => {
    expect(text('components/date-picker.json').length).toBeLessThan(80_000);
  });

  it('o texto da manchete que não cabe é cortado na linha (maxLines 1), sem aviso', () => {
    const d = draw({
      ...SINGLE,
      headline: 'quarta-feira, 15 de outubro de 2025 e ainda mais texto comprido',
    });
    const headline = textOf(d, 'manchete')!;
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
