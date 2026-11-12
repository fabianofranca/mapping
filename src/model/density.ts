import { fail } from './errors';
import { updateById } from './project';
import { projectIndex } from './projectIndex';
import type { Spec, SpecContainer } from './spec';
import type { Project, Rect } from './types';

// Densidade do container (schema v19): quantos pixels da imagem vale uma unidade do componente
// (dp, pt, px lógico a 1x). Os números do componente são unidades; as marcações seguem em pixels
// da imagem. Funções puras, sem DOM.

export const MIN_DENSITY = 0.5;
export const MAX_DENSITY = 8;

/** Número finito de `MIN_DENSITY` a `MAX_DENSITY`. */
export function isValidDensity(value: number): boolean {
  return Number.isFinite(value) && value >= MIN_DENSITY && value <= MAX_DENSITY;
}

/**
 * Densidade de um espaço: a do container (1 se ausente) ou 1 no canvas (`containerId` nulo, as
 * flutuantes) e num id desconhecido.
 */
export function effectiveDensity(
  p: Pick<Project, 'containers'>,
  containerId: string | null,
): number {
  if (containerId === null) return 1;
  return projectIndex(p as Project).containers.get(containerId)?.density ?? 1;
}

/**
 * Define a densidade do container; `null` volta a 1 (remove a chave). Fora de 0,5 a 8 falha com
 * `container-density`. Não mexe nos pixels: só o desenho dos componentes, o `minSize` e o ajuste
 * passam a multiplicar.
 */
export function setContainerDensity(
  p: Project,
  containerId: string,
  density: number | null,
): Project {
  const container = projectIndex(p).containers.get(containerId);
  if (container === undefined) return fail('not-found', containerId);
  if (density !== null && !isValidDensity(density)) {
    return fail('container-density', String(density), { density });
  }
  if ((container.density ?? null) === density) return p;
  return {
    ...p,
    containers: updateById(p.containers, containerId, (c) => {
      if (density === null) {
        return Object.fromEntries(
          Object.entries(c).filter(([key]) => key !== 'density'),
        ) as unknown as typeof c;
      }
      return { ...c, density };
    }),
  };
}

/**
 * O espaço em que um componente é instanciado numa marcação: a caixa **em unidades** (`box`), a
 * densidade e a conversão de uma caixa da cena (em unidades, relativa à marcação) para pixels da
 * imagem. Com densidade 1 a cena já está em pixels, na própria caixa da marcação (`box = rect`), e
 * nada se converte; com outra, a caixa é `{ 0, 0, largura ÷ d, altura ÷ d }` e a raiz da cena leva
 * `translate(rect.x, rect.y) · scale(d)`.
 */
export interface UnitSpace {
  readonly density: number;
  readonly box: Rect;
  readonly toPixels: (box: Rect) => Rect;
}

export function unitSpaceOf(rect: Rect, density: number): UnitSpace {
  if (density === 1) return { density, box: rect, toPixels: (box) => box };
  return {
    density,
    box: { x: 0, y: 0, width: rect.width / density, height: rect.height / density },
    toPixels: (b) => ({
      x: rect.x + b.x * density,
      y: rect.y + b.y * density,
      width: b.width * density,
      height: b.height * density,
    }),
  };
}

/** Unidades do componente → pixels da imagem, para cima (o `minSize` e o tamanho inicial). */
export function unitsToPixels(units: number, density: number): number {
  return density === 1 ? units : Math.ceil(units * density - 1e-9);
}

/** Um retângulo em pixels da imagem → em unidades do componente (÷ densidade). */
export function rectToUnits(rect: Rect, density: number): Rect {
  if (density === 1) return rect;
  return {
    x: rect.x / density,
    y: rect.y / density,
    width: rect.width / density,
    height: rect.height / density,
  };
}

/** Quanto dois números em unidades podem diferir e ainda valer o mesmo (resto de ponto flutuante). */
const UNIT_EPS = 1e-6;

/**
 * Um retângulo em unidades → em pixels inteiros da imagem (× densidade): a posição arredonda, o
 * tamanho sobe (o conteúdo não pode ser cortado). `original` é o retângulo em pixels de onde
 * `unit` saiu: se `unit` ainda é o mesmo (sem diferença além do resto de ponto flutuante), volta
 * o `original` exato.
 */
export function rectFromUnits(unit: Rect, original: Rect, density: number): Rect {
  if (density === 1) return unit;
  const back = rectToUnits(original, density);
  const same =
    Math.abs(unit.x - back.x) < UNIT_EPS &&
    Math.abs(unit.y - back.y) < UNIT_EPS &&
    Math.abs(unit.width - back.width) < UNIT_EPS &&
    Math.abs(unit.height - back.height) < UNIT_EPS;
  if (same) return original;
  return {
    x: Math.round(unit.x * density),
    y: Math.round(unit.y * density),
    width: Math.max(1, unitsToPixels(unit.width, density)),
    height: Math.max(1, unitsToPixels(unit.height, density)),
  };
}

/** Os fatores que a app sugere (a lista pronta do campo traz também 1). */
export const SUGGESTED_DENSITIES = [1.5, 2, 3, 4] as const;

/** Quantos pixels a largura do container pode diferir de `fator × largura do tamanho pronto`. */
const SUGGEST_TOLERANCE = 2;

/** O que a app sugere: o fator e o tamanho pronto (de uma especialização aplicada) que o explica. */
export interface DensitySuggestion {
  readonly density: number;
  readonly specId: string;
  readonly preset: SpecContainer;
}

/**
 * Sugestão de densidade para um container pelos tamanhos prontos (`containers[]`) das
 * especializações aplicadas: a largura do container ÷ a do tamanho pronto é 1,5, 2, 3 ou 4
 * (tolerância de 2 px no arredondamento). A altura só desempata (a captura costuma recortar barras):
 * entre os candidatos vale o de altura mais próxima de `fator × altura do tamanho pronto` e, em
 * empate, o primeiro na ordem das especializações. Só sugere; quem decide é a pessoa ou o agente.
 */
export function suggestDensity(
  container: { readonly width: number; readonly height: number },
  specs: readonly { readonly id: string; readonly spec: Spec | null }[],
): DensitySuggestion | null {
  let best: DensitySuggestion | null = null;
  let bestGap = Infinity;
  for (const { id, spec } of specs) {
    for (const preset of spec?.containers ?? []) {
      const density = SUGGESTED_DENSITIES.find(
        (d) => Math.abs(container.width - d * preset.width) <= SUGGEST_TOLERANCE,
      );
      if (density === undefined) continue;
      const gap = Math.abs(container.height - density * preset.height);
      if (gap < bestGap) {
        best = { density, specId: id, preset };
        bestGap = gap;
      }
    }
  }
  return best;
}

/**
 * A sugestão de cada container do projeto que tem uma (os demais não aparecem). Sem tamanho pronto
 * em nenhuma especialização aplicada, nem percorre os containers.
 */
export function suggestDensities(
  p: Pick<Project, 'containers' | 'specializations'>,
): Map<string, DensitySuggestion> {
  const found = new Map<string, DensitySuggestion>();
  if (!p.specializations.some((s) => (s.spec?.containers?.length ?? 0) > 0)) return found;
  for (const container of p.containers) {
    const suggestion = suggestDensity(container, p.specializations);
    if (suggestion !== null) found.set(container.id, suggestion);
  }
  return found;
}
