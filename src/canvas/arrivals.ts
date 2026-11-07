// Marcas de chegada no canvas (etapa #659, PE3, decisão 8): o selo "Veio de <nome>" sobre cada raiz
// que chegou à Principal de outra perspectiva e a faixa tracejada "Área de chegada". Função pura
// sobre o projeto desenhado, memoizada por versão dele (o objeto do projeto): pan e zoom não passam
// por aqui; o tamanho do selo (em pixels de tela) entra só em `arrivalBadgeSpot`, na hora de
// desenhar. O renderer só desenha.
import { projectIndex, rootFootprint, type Project, type Rect } from '../model';
import type { Point } from './viewport';

/** Altura do selo (px de tela). */
export const ARRIVAL_BADGE_HEIGHT = 20;
/** Largura de cada caractere do texto e respiro dos lados (px de tela), para a largura do selo. */
const BADGE_CHAR = 7;
const BADGE_PAD = 8;
/** Vão entre o selo e o canto da raiz (px de tela). */
const BADGE_GAP = 4;
/** Folga da faixa em volta das raízes com marca (unidades do canvas). */
export const ARRIVAL_BAND_PAD = 24;

/** Um selo a desenhar: a raiz, o nome da perspectiva de origem e a pegada da raiz (canvas). */
export interface ArrivalBadge {
  readonly root: string;
  readonly name: string;
  readonly rect: Rect;
}

export interface ArrivalMarks {
  readonly badges: readonly ArrivalBadge[];
  /** A faixa "Área de chegada" (canvas, com folga); `null` quando não há o que envolver. */
  readonly band: Rect | null;
}

const right = (r: Rect) => r.x + r.width;
const bottom = (r: Rect) => r.y + r.height;

function boxOf(rects: readonly Rect[]): Rect {
  const x = Math.min(...rects.map((r) => r.x));
  const y = Math.min(...rects.map((r) => r.y));
  return {
    x,
    y,
    width: Math.max(...rects.map(right)) - x,
    height: Math.max(...rects.map(bottom)) - y,
  };
}

/**
 * A faixa: `project.arrivals` não grava se a raiz foi para a área de chegada ou para perto da
 * referência. Por isso a faixa só existe quando a caixa das raízes com marca fica à direita de tudo
 * o que não tem marca (é onde a área de chegada abre colunas, `perspectivePlace.ts`); uma marca
 * "perto da referência" fica no meio do conteúdo e leva só o selo. Sem raízes sem marca, a faixa
 * envolve todas.
 */
function bandOf(
  project: Project,
  marked: ReadonlySet<string>,
  rects: Rect[],
): Rect | null {
  const area = boxOf(rects);
  for (const id of projectIndex(project).roots) {
    if (marked.has(id)) continue;
    const rect = rootFootprint(project, id);
    if (rect && right(rect) > area.x) return null;
  }
  const pad = ARRIVAL_BAND_PAD;
  return {
    x: area.x - pad,
    y: area.y - pad,
    width: area.width + 2 * pad,
    height: area.height + 2 * pad,
  };
}

function compute(project: Project): ArrivalMarks | null {
  const badges: ArrivalBadge[] = [];
  for (const a of project.arrivals) {
    const rect = rootFootprint(project, a.root);
    if (rect) badges.push({ root: a.root, name: a.fromName, rect });
  }
  if (badges.length === 0) return null;
  const marked = new Set(badges.map((b) => b.root));
  return {
    badges,
    band: bandOf(
      project,
      marked,
      badges.map((b) => b.rect),
    ),
  };
}

const memo = new WeakMap<Project, ArrivalMarks | null>();

/** As marcas de chegada do projeto desenhado; `null` sem nenhuma (nada a desenhar). */
export function arrivalMarks(project: Project | null): ArrivalMarks | null {
  if (!project || project.arrivals.length === 0) return null;
  if (!memo.has(project)) memo.set(project, compute(project));
  return memo.get(project) ?? null;
}

/** Largura do selo (px de tela): cresce com o texto. */
export function arrivalBadgeWidth(text: string): number {
  return text.length * BADGE_CHAR + 2 * BADGE_PAD;
}

/**
 * Onde o selo fica (canto de cima à esquerda dele, em unidades do canvas). Raiz grande: por dentro
 * do canto de cima à esquerda; pequena na tela: por fora, acima do canto. Tamanho e vão em px de tela.
 */
export function arrivalBadgeSpot(rect: Rect, zoom: number, width: number): Point {
  const gap = BADGE_GAP / zoom;
  const small =
    rect.width * zoom < 2 * width || rect.height * zoom < 2 * ARRIVAL_BADGE_HEIGHT;
  return small
    ? { x: rect.x, y: rect.y - ARRIVAL_BADGE_HEIGHT / zoom - gap }
    : { x: rect.x + gap, y: rect.y + gap };
}
