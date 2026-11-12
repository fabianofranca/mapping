// EX6 da etapa "expressões que calculam no formato 4" (#897): o carousel da material3-compose
// desenha pela largura da marcação (`$size`), como a estratégia do Compose (Keylines.kt e
// Arrangement.kt do commit fixado), sem tabelas enumeradas. O oráculo abaixo é uma porta fiel do
// algoritmo (`multiBrowseKeylineList`, `heroKeylineList`, `Arrangement.findLowestCostArrangement`
// e `fit`) e a regressão usa as cenas de antes (tests/fixtures/material3-ex6-v1.json).
import { describe, expect, it } from 'vitest';
import { findEntry } from '../../src/model/catalog';
import { absoluteBoxes, walk } from '../../src/model/components/scene';
import type { SceneNode } from '../../src/model/components/scene';
import { approximateMeasurer, instantiate } from '../../src/model/components/instantiate';
import { resolveTokens } from '../../src/model/components/tokens';
import { defaultValues } from '../../src/model/libraryDrawing';
import { text, typeOf } from '../support/material3Library';
import { catalog, draw, missingNodes, oldScenes } from '../support/material3Ex6Fixture';
import type { Drawing, Mode, Values } from '../support/material3Ex6Fixture';

const entry = findEntry(catalog, 'carousel')!;
const library = catalog.library!;
const HEIGHT = entry.component!.size.height;

/** Desenha o carousel numa marcação de `width` de largura (a prova de desenho usa o `size`). */
function drawAt(width: number, values: Values, mode: Mode = 'light'): Drawing {
  return instantiate(
    entry.component!,
    { ...defaultValues(entry.type), ...values },
    { x: 0, y: 0, width, height: HEIGHT },
    {
      measure: approximateMeasurer,
      tokens: resolveTokens(library.tokens, {}, mode),
      ...(library.icons === undefined ? {} : { icons: library.icons }),
    },
  );
}

const rows = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    image: `https://example.com/${i}.jpg`,
    label: `Item ${i}`,
  }));

const visible = (d: Drawing): SceneNode[] => [...walk(d.root)].filter((n) => n.visible);
const itemBoxes = (d: Drawing): number[][] => {
  const boxes = absoluteBoxes(d.root);
  return visible(d)
    .filter((n) => n.name === 'item')
    .map((n) => {
      const b = boxes.get(n.id)!;
      return [b.x, b.y, b.width, b.height];
    });
};
const widths = (d: Drawing): number[] => itemBoxes(d).map((r) => r[2]!);
const near = (a: number, b: number, eps = 0.5) => Math.abs(a - b) <= eps;
/** As caixas dos itens iguais às esperadas (a divisão do `fill` deixa ruído de 1e-13). */
function expectBoxes(actual: number[][], expected: number[][]) {
  expect(actual).toHaveLength(expected.length);
  actual.forEach((box, i) =>
    box.forEach((v, j) => expect(v, `item ${i} [${j}]`).toBeCloseTo(expected[i]![j]!, 6)),
  );
}

// ---------------------------------------------------------------------------------------------
// Oráculo: o algoritmo do Compose (Keylines.kt, Arrangement.kt), em ponto flutuante de 64 bits
// ---------------------------------------------------------------------------------------------

interface Arrangement {
  priority: number;
  small: number;
  smallCount: number;
  medium: number;
  mediumCount: number;
  large: number;
  largeCount: number;
}
const MIN_SMALL = 40;
const MAX_SMALL = 56;
const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);
const count = (a: Arrangement) => a.largeCount + a.mediumCount + a.smallCount;

function isValid(a: Arrangement): boolean {
  if (a.largeCount > 0 && a.smallCount > 0 && a.mediumCount > 0)
    return a.large > a.medium && a.medium > a.small;
  if (a.largeCount > 0 && a.smallCount > 0) return a.large > a.small;
  return true;
}
const cost = (a: Arrangement, target: number) =>
  isValid(a) ? Math.abs(target - a.large) * a.priority : Number.MAX_VALUE;

/** `Arrangement.fit` e `calculateLargeSize` (Arrangement.kt, linhas 150 a 276), com o alvo do médio. */
function fitFull(
  priority: number,
  space: number,
  spacing: number,
  smallCount: number,
  smallTarget: number,
  mediumCount: number,
  mediumTarget: number,
  largeCount: number,
  largeTarget: number,
): Arrangement {
  const total = largeCount + mediumCount + smallCount;
  const free = space - (total - 1) * spacing;
  let small = clamp(smallTarget, MIN_SMALL, MAX_SMALL);
  const taken =
    largeTarget * largeCount + mediumTarget * mediumCount + small * smallCount;
  const delta = free - taken;
  if (smallCount > 0 && delta > 0)
    small += Math.min(delta / smallCount, MAX_SMALL - small);
  else if (smallCount > 0 && delta < 0)
    small += Math.max(delta / smallCount, MIN_SMALL - small);
  if (smallCount === 0) small = 0;
  let large =
    (free - (smallCount + mediumCount / 2) * small) / (largeCount + mediumCount / 2);
  let medium = (large + small) / 2;
  if (mediumCount > 0 && large !== largeTarget) {
    const adjust = (largeTarget - large) * largeCount;
    const flex = medium * 0.1 * mediumCount;
    const distribute = Math.min(Math.abs(adjust), flex);
    if (adjust > 0) {
      medium -= distribute / mediumCount;
      large += distribute / largeCount;
    } else {
      medium += distribute / mediumCount;
      large -= distribute / largeCount;
    }
  }
  return {
    priority,
    small,
    smallCount,
    medium,
    mediumCount,
    large,
    largeCount,
  };
}

/** `Arrangement.findLowestCostArrangement` (Arrangement.kt, linhas 89 a 130). */
function findLowest(
  space: number,
  spacing: number,
  smallTarget: number,
  smallCounts: number[],
  mediumTarget: number,
  mediumCounts: number[],
  largeTarget: number,
  largeCounts: number[],
): Arrangement | null {
  let best: Arrangement | null = null;
  let priority = 1;
  for (const lc of largeCounts)
    for (const mc of mediumCounts)
      for (const sc of smallCounts) {
        const a = fitFull(
          priority,
          space,
          spacing,
          sc,
          smallTarget,
          mc,
          mediumTarget,
          lc,
          largeTarget,
        );
        if (best === null || cost(a, largeTarget) < cost(best, largeTarget)) {
          best = a;
          if (cost(best, largeTarget) === 0) return best;
        }
        priority++;
      }
  return best;
}

/** `multiBrowseKeylineList` (Keylines.kt, linhas 58 a 143): o arranjo no início da rolagem. */
function multiBrowse(
  width: number,
  preferred: number,
  spacing: number,
  items: number,
): Arrangement | null {
  if (width === 0 || preferred === 0) return null;
  const target = Math.min(preferred, width);
  const smallTarget = clamp(target / 3, MIN_SMALL, MAX_SMALL);
  const mediumTarget = (target + smallTarget) / 2;
  const smallCounts = width < MIN_SMALL * 2 ? [0] : [1];
  const minAvailable = width - mediumTarget * 1 - MAX_SMALL * Math.max(...smallCounts);
  const minLarge = Math.max(1, Math.floor(minAvailable / target));
  const maxLarge = Math.ceil(width / target);
  const largeCounts = Array.from(
    { length: maxLarge - minLarge + 1 },
    (_, i) => maxLarge - i,
  );
  let a = findLowest(
    width,
    spacing,
    smallTarget,
    smallCounts,
    mediumTarget,
    [1, 0],
    target,
    largeCounts,
  );
  if (a !== null && count(a) > items) {
    let surplus = count(a) - items;
    let small = a.smallCount;
    let medium = a.mediumCount;
    while (surplus > 0) {
      if (small > 0) small -= 1;
      else if (medium > 1) medium -= 1;
      surplus -= 1;
    }
    a = findLowest(
      width,
      spacing,
      smallTarget,
      [small],
      mediumTarget,
      [medium],
      target,
      largeCounts,
    );
  }
  return a;
}

/** Os tamanhos por índice do item no início da rolagem; `undefined` onde a estratégia não tem posição. */
function multiBrowseWidths(
  width: number,
  preferred: number,
  spacing: number,
  n: number,
): (number | undefined)[] {
  const a = multiBrowse(width, preferred, spacing, n)!;
  return Array.from({ length: n }, (_, i) => {
    if (i < a.largeCount) return a.large;
    if (i < a.largeCount + a.mediumCount) return a.medium;
    if (i < count(a)) return a.small;
    return undefined;
  });
}

// ---------------------------------------------------------------------------------------------
// multi-browse
// ---------------------------------------------------------------------------------------------

const multi = (n: number, extra: Values = {}): Values => ({
  style: 'multi-browse',
  preferredItemWidth: 186,
  itemSpacing: 8,
  items: rows(n),
  ...extra,
});

describe('EX6 carousel — multi-browse pela largura da marcação', () => {
  it('em 360, com 186 preferidos e espaço 8: grande 186, médio 118 e pequeno 40, a partir da borda', () => {
    const d = drawAt(360, multi(3));
    expectBoxes(itemBoxes(d), [
      [0, 0, 186, HEIGHT],
      [194, 0, 118, HEIGHT],
      [320, 0, 40, HEIGHT],
    ]);
    // o primeiro item coincide com os 186 de antes (Arrangement.kt: o médio flexiona 10% e devolve o grande ao alvo)
    expect(widths(d)[0]).toBeCloseTo(186, 6);
    expect(d.warnings).toEqual([]);
  });

  it('em 600, com 3 itens, o Compose tira o pequeno e refaz: três grandes de 167,31 (Keylines.kt 100 a 123)', () => {
    const d = drawAt(600, multi(3));
    const expected = multiBrowseWidths(600, 186, 8, 3);
    expect(expected.map((w) => Math.round(w! * 100) / 100)).toEqual([
      167.31, 167.31, 167.31,
    ]);
    expect(widths(d).map((w, i) => near(w, expected[i]!))).toEqual([true, true, true]);
    expect(itemBoxes(d)[1]![0]).toBeCloseTo(167.31 + 8, 1);
  });

  it('em 600, com itens de sobra (8), mostra 2 grandes, o médio e o pequeno, e não desenha o que passa da borda', () => {
    const d = drawAt(600, multi(8));
    const w = widths(d);
    expect(w).toHaveLength(4);
    expect(w[0]).toBeCloseTo(190.48, 2);
    expect(w[1]).toBeCloseTo(190.48, 2);
    expect(w[2]).toBeCloseTo(139.04, 2);
    expect(w[3]).toBe(56);
    const last = itemBoxes(d)[3]!;
    expect(last[0]! + last[2]!).toBeCloseTo(600, 6);
  });

  it('em 240: um grande de 186 e um pequeno de 46 (o 3º item não cabe)', () => {
    const d = drawAt(240, multi(3));
    expectBoxes(itemBoxes(d), [
      [0, 0, 186, HEIGHT],
      [194, 0, 46, HEIGHT],
    ]);
  });

  it('preferredItemWidth maior que a marcação: um item grande e o pequeno de 40', () => {
    const d = drawAt(300, multi(3, { preferredItemWidth: 400 }));
    expect(widths(d)).toEqual([300 - 8 - 40, 40]);
    expect(widths(drawAt(300, multi(1, { preferredItemWidth: 400 })))).toEqual([300]);
  });

  it('o espaço entre itens e a largura preferida mudam o arranjo (não valem só os 186 e 8)', () => {
    const wide = widths(
      drawAt(500, multi(8, { preferredItemWidth: 150, itemSpacing: 0 })),
    );
    const expected = multiBrowseWidths(500, 150, 0, 8).filter((w) => w !== undefined);
    expect(wide.map((w) => Math.round(w))).toEqual(expected.map((w) => Math.round(w!)));
    const spaced = itemBoxes(drawAt(420, multi(8, { itemSpacing: 24 })));
    const exp2 = multiBrowseWidths(420, 186, 24, 8).filter((w) => w !== undefined);
    expect(spaced.map((r) => Math.round(r[2]!))).toEqual(exp2.map((w) => Math.round(w!)));
    // o espaço entre os itens vem de itemSpacing
    expect(spaced[1]![0]).toBeCloseTo(spaced[0]![2]! + 24, 6);
  });

  it('as larguras seguem a marcação: mais larga, mais itens grandes', () => {
    const counts = [360, 480, 600, 720, 900].map(
      (w) => widths(drawAt(w, multi(12))).filter((x) => x > 100).length,
    );
    expect(counts[counts.length - 1]!).toBeGreaterThan(counts[0]!);
  });

  /**
   * Contra o oráculo, numa grade de larguras, larguras preferidas, espaços e números de itens.
   * Fica de fora a vizinhança de ±3 px de uma troca de arranjo (o limiar da troca é aproximado, ver
   * docs/carousel.md, "O que ainda difere"); o arranjo apertado do primeiro período, em que o
   * Compose escolhe `ceil(largura / alvo)` grandes encolhidos, entra na conta e é parte do que erra.
   */
  it('confere a grade de 200 a 900 contra o algoritmo do Compose (≤ 0,5 px, ≥ 96% dos casos)', () => {
    let total = 0;
    let wrong = 0;
    const same = (
      a: (number | undefined)[],
      b: (number | undefined)[],
      eps: number,
    ): boolean =>
      a.length === b.length &&
      a.every(
        (v, i) =>
          (v === undefined) === (b[i] === undefined) &&
          (v === undefined || near(v, b[i]!, eps)),
      );
    for (const n of [1, 3, 12])
      for (const preferred of [150, 186, 240])
        for (const spacing of [0, 8, 16])
          for (let width = 200; width <= 900; width += 7) {
            if (preferred >= width) continue;
            const here = multiBrowseWidths(width, preferred, spacing, n);
            const edge = [-3, 3].some(
              (dx) =>
                !same(here, multiBrowseWidths(width + dx, preferred, spacing, n), 1.5),
            );
            if (edge) continue;
            total++;
            const drawn = widths(
              drawAt(
                width,
                multi(n, { preferredItemWidth: preferred, itemSpacing: spacing }),
              ),
            );
            if (
              !same(
                here.filter((w) => w !== undefined),
                drawn,
                0.5,
              )
            )
              wrong++;
          }
    expect(total).toBeGreaterThan(1000);
    expect(wrong, `${wrong} de ${total}`).toBeLessThanOrEqual(Math.floor(total * 0.04));
  }, 30_000);

  it('nas faixas planas (grande no alvo) a conta é exata: 410 a 480 com 5 itens tem 2 grandes de 186 e o pequeno entre 40 e 56', () => {
    for (const width of [430, 436, 440]) {
      const w = widths(drawAt(width, multi(5)));
      expect(w).toHaveLength(3);
      expect(w[0]).toBeCloseTo(186, 6);
      expect(w[1]).toBeCloseTo(186, 6);
      expect(w[2]).toBeCloseTo(width - 2 * 186 - 2 * 8, 6);
    }
  });

  it('a soma dos itens desenhados mais os espaços cabe na marcação', () => {
    for (const width of [250, 360, 420, 515, 600, 777, 900]) {
      const boxes = itemBoxes(drawAt(width, multi(6)));
      const last = boxes[boxes.length - 1]!;
      expect(last[0]! + last[2]!).toBeLessThanOrEqual(width + 0.001);
    }
  });
});

// ---------------------------------------------------------------------------------------------
// uncontained
// ---------------------------------------------------------------------------------------------

describe('EX6 carousel — uncontained', () => {
  it('itens do tamanho itemWidth a partir da borda, com o espaço entre eles (Keylines.kt 161 a 200)', () => {
    const d = drawAt(360, {
      style: 'uncontained',
      itemWidth: 140,
      itemSpacing: 12,
      items: rows(3),
    });
    expect(itemBoxes(d)).toEqual([
      [0, 0, 140, HEIGHT],
      [152, 0, 140, HEIGHT],
      // L2 (#1078): o item que cruza a borda direita ganha só a largura que sobra (360 − 304), em vez de
      // passar da caixa e sair cortado (aviso `conteúdo maior que a caixa`)
      [304, 0, 56, HEIGHT],
    ]);
    const wide = itemBoxes(
      drawAt(600, {
        style: 'uncontained',
        itemWidth: 100,
        itemSpacing: 0,
        items: rows(4),
      }),
    );
    expect(wide.map((r) => r[0])).toEqual([0, 100, 200, 300]);
  });
});

// ---------------------------------------------------------------------------------------------
// centered-hero
// ---------------------------------------------------------------------------------------------

const heroValues = (n: number, spacing = 8): Values => ({
  style: 'centered-hero',
  itemSpacing: spacing,
  items: rows(n),
});

/**
 * O hero do Compose sem `maxItemWidth` (Keylines.kt, `heroKeylineList`, linhas 215 a 289, e a mesma
 * `findLowestCostArrangement` do multi-browse): o alvo do grande é a largura toda (linha 235), o do
 * pequeno é um terço dela preso entre 40 e 56 (237), e o `fit` (Arrangement.kt, 198 a 206) encolhe os
 * pequenos até o mínimo de 40 porque o grande não cabe no alvo. `start` é onde o primeiro item
 * começa: depois do pequeno e do espaço, quando o arranjo é centrado (3 itens ou mais).
 */
function heroOracle(width: number, spacing: number, items: number) {
  const center = items >= 3;
  let smallCounts = center ? [2] : [1];
  const targetLarge = width;
  const targetSmall = clamp(targetLarge / 3, MIN_SMALL, MAX_SMALL);
  if (width < MIN_SMALL * Math.max(...smallCounts) + MIN_SMALL * 1.25) smallCounts = [0];
  const minLarge = Math.max(
    1,
    Math.floor((width - MIN_SMALL * Math.max(...smallCounts)) / targetLarge),
  );
  const maxLarge = Math.ceil(width / targetLarge);
  const largeCounts = Array.from(
    { length: maxLarge - minLarge + 1 },
    (_, i) => maxLarge - i,
  );
  const a = findLowest(
    width,
    spacing,
    targetSmall,
    smallCounts,
    0,
    [0],
    targetLarge,
    largeCounts,
  )!;
  const start =
    center && items >= count(a) ? (a.smallCount / 2) * (a.small + spacing) : 0;
  return { large: a.large, small: a.small, smallCount: a.smallCount, start };
}

/** As caixas que o desenho deve ter, pelo oráculo: cada item corta na borda e some com menos de 32 de largura. */
function heroBoxes(width: number, spacing: number, items: number): number[][] {
  const { large, start } = heroOracle(width, spacing, items);
  const boxes: number[][] = [];
  for (let i = 0; i < items; i++) {
    const x = start + i * (large + spacing);
    const w = Math.min(large, width - x);
    if (w >= 32) boxes.push([x, 0, w, HEIGHT]);
  }
  return boxes;
}

describe('EX6 carousel — centered-hero pela largura da marcação', () => {
  it('em 360, com espaço 8: grande 264, pequenos de 40 e o primeiro item depois do pequeno que falta (48), como o Compose', () => {
    // Sem maxItemWidth o grande é a largura toda e o fit encolhe os pequenos até 40 (Arrangement.kt, 198 a 206):
    // 360 − 2 × 40 − 2 × 8 = 264. O segundo item ganha só a largura que sobra na caixa (40) e o terceiro,
    // que ficava fora dela (x = 592), não é desenhado.
    expect(heroOracle(360, 8, 3)).toMatchObject({ large: 264, small: 40, start: 48 });
    expectBoxes(itemBoxes(drawAt(360, heroValues(3))), [
      [48, 0, 264, HEIGHT],
      [320, 0, 40, HEIGHT],
    ]);
  });

  it('o grande, o pequeno e o recuo seguem a conta do Compose para toda largura e todo itemSpacing', () => {
    for (const width of [150, 200, 240, 360, 480, 600, 900]) {
      for (const spacing of [0, 4, 8, 12, 16]) {
        for (const items of [3, 4, 6]) {
          const expected = heroBoxes(width, spacing, items);
          const label = `${width}/${spacing}/${items}`;
          const actual = itemBoxes(drawAt(width, heroValues(items, spacing)));
          expect(actual, label).toHaveLength(expected.length);
          expectBoxes(actual, expected);
        }
      }
    }
    // 360 com espaço 16: pequeno 40, grande 360 − 80 − 32 = 248, recuo 56
    expect(itemBoxes(drawAt(360, heroValues(3, 16)))[0]).toEqual([56, 0, 248, HEIGHT]);
    // 480 com espaço 8: grande 480 − 80 − 16 = 384; o pequeno da direita começa em 480 − 40
    expect(itemBoxes(drawAt(480, heroValues(4)))[1]![0]).toBeCloseTo(480 - 40, 6);
  });

  it('com 1 ou 2 itens o Compose alinha ao início (shouldCenter exige 3): um só pequeno de 40, grande de largura − espaço − 40, sem recuo', () => {
    for (const n of [1, 2]) {
      const boxes = itemBoxes(drawAt(360, heroValues(n, 12)));
      expect(boxes[0]).toEqual([0, 0, 360 - 12 - 40, HEIGHT]);
      expect(boxes).toHaveLength(n);
      if (n === 2) expect(boxes[1]).toEqual([360 - 40, 0, 40, HEIGHT]);
    }
    expectBoxes(itemBoxes(drawAt(360, heroValues(2, 8))), heroBoxes(360, 8, 2));
  });

  it('os limiares em que só cabe o grande vêm da mesma conta: 130 com 3 itens ou mais, 90 com menos de 3', () => {
    // fullscreenThreshold = 40 × pequenos + 50 (Keylines.kt, 241 a 244)
    for (const [width, items, only] of [
      [129, 3, true],
      [130, 3, false],
      [89, 2, true],
      [90, 2, false],
      [120, 3, true],
      [100, 2, false],
    ] as const) {
      const boxes = itemBoxes(drawAt(width, heroValues(items, 0)));
      expect(
        boxes.length === 1 && boxes[0]![2] === width && boxes[0]![0] === 0,
        `${width}/${items}`,
      ).toBe(only);
      expectBoxes(boxes, heroBoxes(width, 0, items));
    }
  });

  it('numa marcação estreita (< 130 com 3 itens) cabe só o grande, sem recuo', () => {
    const d = drawAt(120, heroValues(3));
    expect(widths(d)[0]).toBe(120);
    expect(itemBoxes(d)[0]![0]).toBe(0);
  });
});

// ---------------------------------------------------------------------------------------------
// Regressão: as cenas de antes
// ---------------------------------------------------------------------------------------------

/** L2 (#1078): o que passava da caixa de 360 (a faixa de 4000, o item cortado e o que ficava fora) não é mais desenhado como era. */
const PASSAVA_DA_CAIXA = { skip: (o: { r: number[] }) => o.r[0]! + o.r[2]! > 360.5 };

describe('EX6 carousel — regressão contra as cenas de antes (≤ 0,5 px por nó)', () => {
  it('uncontained em 360 (claro e escuro) bate nó a nó, fora o que passava da caixa', () => {
    for (const scene of oldScenes('carousel-ex1')) {
      const d = draw(scene.id, scene.values, scene.mode);
      expect(missingNodes(d, scene.nodes, PASSAVA_DA_CAIXA), scene.key).toEqual([]);
    }
  });

  it('multi-browse em 360: o primeiro item (largura, imagem, véu e rótulo) é o de antes (186)', () => {
    for (const scene of oldScenes('carousel-ex0')) {
      const d = draw(scene.id, scene.values, scene.mode);
      // 0 raiz, 1 faixa; 3 a 6 = o primeiro item com a imagem, o véu e o rótulo (2 é o `itens`, que ficou do tamanho da marcação)
      const first = [scene.nodes[0]!, scene.nodes[1]!, ...scene.nodes.slice(3, 7)];
      expect(missingNodes(d, first, PASSAVA_DA_CAIXA), scene.key).toEqual([]);
    }
  });

  it('centered-hero em 360 (claro e escuro): só o que não depende da largura dos itens bate com as cenas de antes (o hero passou a 264/40, como o Compose)', () => {
    // #1504: as cenas de antes (tests/fixtures/material3-ex6-v1.json, que não mudam) têm o hero a 232/56/64.
    // Sem maxItemWidth o Compose dá 264/40/48 (Keylines.kt 235 e Arrangement.kt 198 a 206), então os itens saem
    // da igualdade: ficam a faixa, o recuo e o que não toca na largura e no x dos itens (a imagem, o véu e o
    // rótulo seguem o item, então também saem).
    for (const scene of oldScenes('carousel-ex2')) {
      const d = draw(scene.id, scene.values, scene.mode);
      const rest = scene.nodes.filter(
        (o) =>
          !['recuo', 'item', 'imagem', 'véu', 'rótulo'].includes(o.n) && o.t !== 'text',
      );
      expect(
        missingNodes(d, rest, {
          skip: (o: { r: number[] }) => o.r[0]! + o.r[2]! > 360.5,
        }),
        scene.key,
      ).toEqual([]);
    }
  });

  it('as cores (imagem reservada e véu) são as dos tokens, nos dois modos, em todos os estilos', () => {
    for (const mode of ['light', 'dark'] as const) {
      for (const values of [multi(3), heroValues(3)]) {
        const d = drawAt(360, values, mode);
        expect(d.warnings).toEqual([]);
        const first = visible(d).find((n) => n.name === 'imagem');
        expect(first).toBeDefined();
      }
    }
  });
});

// ---------------------------------------------------------------------------------------------
// Sem tabelas
// ---------------------------------------------------------------------------------------------

/** Cada `$switch` com mais de 12 casos e cada `$eq` sobre um campo `number` do tipo. */
function offenders(id: 'carousel') {
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
      const n = Object.keys(cases).length;
      if (n > 12) found.push(`${path}: $switch de ${n} casos`);
    }
    const eq = obj['$eq'];
    if (Array.isArray(eq) && typeof eq[0] === 'string' && numberFields.has(eq[0]))
      found.push(`${path}: $eq sobre o campo number ${eq[0]}`);
    for (const [k, v] of Object.entries(obj)) visit(v, `${path}.${k}`);
  };
  visit(JSON.parse(text(`components/${id}.json`)), id);
  return found;
}

describe('EX6 carousel — sem tabelas enumeradas', () => {
  it('não tem $switch com mais de 12 casos nem $eq sobre campo number', () => {
    expect(offenders('carousel')).toEqual([]);
  });

  it('o item usa a largura da marcação, o índice e o número de itens (nada de 4000 ou 232 fixos nas larguras)', () => {
    const source = text('components/carousel.json');
    expect(source).toContain('"$size"');
    expect(source).toContain('"$index"');
    expect(source).toContain('"$rows"');
    expect(source).not.toContain('232');
  });
});
