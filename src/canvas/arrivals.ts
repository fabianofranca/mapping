// Marcas de chegada no canvas (etapa #659, PE3, decisão 8): o selo "Veio de <nome>" sobre cada raiz
// que chegou à Principal de outra perspectiva e a faixa tracejada "Área de chegada". Função pura
// sobre o projeto desenhado, memoizada por versão dele (o objeto do projeto): pan e zoom não passam
// por aqui; o tamanho do selo (em pixels de tela) entra só em `arrivalBadgeSpot`, na hora de
// desenhar. O renderer só desenha.
import {
  arrivalHasReference,
  projectIndex,
  rootFootprint,
  type Project,
  type Rect,
} from '../model';
import type { Point } from './viewport';

/** Altura do selo (px de tela). */
export const ARRIVAL_BADGE_HEIGHT = 20;
/** Largura de cada caractere do texto e respiro dos lados (px de tela), para a largura do selo. */
const BADGE_CHAR = 7;
const BADGE_PAD = 8;
/** Vão entre o selo e o canto da raiz (px de tela). */
const BADGE_GAP = 4;
/** Vão do selo abaixo de uma raiz pequena: cobre as alças da seleção (px de tela). */
const BADGE_GAP_BELOW = 10;
/** Faixa do nome do container, logo acima de cada raiz (px de tela): o selo não cai nela. */
const NAME_BAND = 24;
/** Folga da faixa em volta das raízes com marca (unidades do canvas). */
export const ARRIVAL_BAND_PAD = 24;
/** Folga a mais (px de tela) que Enquadrar tudo deixa em volta quando há faixa: cabe o rótulo dela. */
export const ARRIVAL_FIT_EXTRA = 48;

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
  /** A pegada de cada raiz (canvas): o selo de uma raiz pequena foge delas. */
  readonly roots: readonly Rect[];
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
 * referência; isso se deduz das setas de agora (`arrivalHasReference`, a mesma regra da busca de
 * lugar), na sessão e depois de recarregar. Ela envolve só as raízes com marca **sem referência**
 * (`orphans`) e só existe quando a caixa delas fica à direita de todas as outras raízes, com ou
 * sem marca (é onde a área de chegada abre colunas, `perspectivePlace.ts`); as com referência
 * levam só o selo.
 */
function bandOf(project: Project, orphans: ReadonlySet<string>): Rect | null {
  const rects: Rect[] = [];
  for (const id of orphans) {
    const rect = rootFootprint(project, id);
    if (rect) rects.push(rect);
  }
  if (rects.length === 0) return null;
  const area = boxOf(rects);
  for (const id of projectIndex(project).roots) {
    if (orphans.has(id)) continue;
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
  const orphans = new Set(
    badges.filter((b) => !arrivalHasReference(project, b.root)).map((b) => b.root),
  );
  const roots: Rect[] = [];
  for (const id of projectIndex(project).roots) {
    const rect = rootFootprint(project, id);
    if (rect) roots.push(rect);
  }
  return { badges, band: bandOf(project, orphans), roots };
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
 * Onde o selo fica (canto de cima à esquerda dele, em unidades do canvas). Nunca no topo da raiz,
 * onde ficam o nome do container e o título da faixa: raiz grande, por dentro do canto de baixo à
 * esquerda; pequena na tela, por fora, abaixo do canto. Tamanho e vão em px de tela. Com `view` (a
 * área visível, em unidades do canvas) o selo é puxado para dentro dela; com `avoid` (um retângulo
 * sobreposto ao canvas, como o minimapa) ele sai de baixo dele.
 */
export function arrivalBadgeSpot(
  rect: Rect,
  zoom: number,
  width: number,
  view?: Rect,
  avoid?: Rect,
  roots: readonly Rect[] = [],
): Point {
  const gap = BADGE_GAP / zoom;
  const height = ARRIVAL_BADGE_HEIGHT / zoom;
  const w = width / zoom;
  const small =
    rect.width * zoom < 2 * width || rect.height * zoom < 2 * ARRIVAL_BADGE_HEIGHT;
  const at = small
    ? smallSpot(rect, zoom, w, height, roots)
    : { x: rect.x + gap, y: bottom(rect) - gap - height };
  if (!view) return at;
  const inside = keepInside(at, w, height, view);
  return avoid ? clearOf(inside, w, height, view, avoid) : inside;
}

/**
 * Lugar do selo de uma raiz pequena: abaixo do canto de baixo à esquerda; se isso cai sobre outra
 * raiz ou sobre o nome dela (a faixa logo acima), à direita da raiz e, depois, à esquerda.
 */
function smallSpot(
  rect: Rect,
  zoom: number,
  w: number,
  h: number,
  roots: readonly Rect[],
): Point {
  const below = { x: rect.x, y: bottom(rect) + BADGE_GAP_BELOW / zoom };
  const gap = BADGE_GAP / zoom;
  const candidates = [
    below,
    { x: right(rect) + gap, y: bottom(rect) + gap - h },
    { x: rect.x - gap - w, y: bottom(rect) + gap - h },
  ];
  const nameBand = NAME_BAND / zoom;
  const blocked = (at: Point): boolean =>
    roots.some(
      (r) =>
        r !== rect &&
        hits(at, w, h, {
          x: r.x,
          y: r.y - nameBand,
          width: r.width,
          height: r.height + nameBand,
        }),
    );
  return candidates.find((c) => !blocked(c)) ?? below;
}

const hits = (at: Point, w: number, h: number, r: Rect): boolean =>
  at.x < right(r) && at.x + w > r.x && at.y < bottom(r) && at.y + h > r.y;

/** Tira o selo de debaixo de `avoid` (o minimapa): para a esquerda dele; sem espaço, para cima. */
function clearOf(at: Point, w: number, h: number, view: Rect, avoid: Rect): Point {
  if (!hits(at, w, h, avoid)) return at;
  const left = { x: avoid.x - w, y: at.y };
  if (left.x >= view.x) return left;
  return { x: at.x, y: Math.max(view.y, avoid.y - h) };
}

function clampAxis(at: number, size: number, start: number, length: number): number {
  return Math.max(start, Math.min(at, start + length - size));
}

function keepInside(at: Point, w: number, h: number, view: Rect): Point {
  return {
    x: clampAxis(at.x, w, view.x, view.width),
    y: clampAxis(at.y, h, view.y, view.height),
  };
}

/** O que falta de folga (px de tela) entre a faixa e a linha do nome dos containers. */
function nameClearance(zoom: number, nameClear: number): number {
  return Math.max(0, nameClear - ARRIVAL_BAND_PAD * zoom);
}

/**
 * Onde o rótulo da faixa ("Área de chegada" e a dica) fica (canto de cima à esquerda dele, em
 * unidades do canvas). `size` é o tamanho dele em px de tela e `nameClear` a altura (px de tela) do
 * nome dos containers, que fica logo acima do conteúdo. A folga da faixa é em unidades do canvas e
 * encolhe com o zoom; por isso o rótulo sobe o que faltar para ficar acima da linha do nome, nunca
 * sobre ela. Sem espaço em cima na área visível, vai para baixo da faixa; em qualquer caso é puxado
 * para dentro de `view`.
 */
export function arrivalBandLabelSpot(
  band: Rect,
  zoom: number,
  size: { readonly width: number; readonly height: number },
  view: Rect,
  nameClear: number,
): Point {
  const w = size.width / zoom;
  const h = size.height / zoom;
  const lift = (nameClearance(zoom, nameClear) + BADGE_GAP) / zoom;
  const above = band.y - lift - h;
  const y = above >= view.y ? above : bottom(band) + BADGE_GAP / zoom;
  return keepInside({ x: band.x, y }, w, h, view);
}
