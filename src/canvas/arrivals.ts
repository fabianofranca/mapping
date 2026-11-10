// Marcas de chegada no canvas (etapa #659, PE3, decisão 8): o selo "Veio de <nome>" sobre cada raiz
// que chegou à Principal de outra perspectiva e a faixa tracejada "Área de chegada". Função pura
// sobre o projeto desenhado, memoizada por versão dele (o objeto do projeto): pan e zoom não passam
// por aqui; o tamanho do selo (em pixels de tela) entra só em `arrivalBadgeSpot`, na hora de
// desenhar. O renderer só desenha.
import {
  arrivalHasReference,
  boundingBox,
  bottom,
  projectIndex,
  right,
  rootFootprint,
  type Project,
  type Rect,
} from '../model';
import type { CanvasTokens } from './theme';
import type { Point } from './viewport';

/** As medidas do selo (px de tela), dos tokens do canvas (`size-cv-arrival-*`). */
export type ArrivalMetrics = CanvasTokens['arrival'];

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

/** Uma raiz do canvas: o id (para a raiz não se bloquear a si mesma) e a pegada dela. */
export interface ArrivalRoot {
  readonly id: string;
  readonly rect: Rect;
}

export interface ArrivalMarks {
  readonly badges: readonly ArrivalBadge[];
  /** A faixa "Área de chegada" (canvas, com folga); `null` quando não há o que envolver. */
  readonly band: Rect | null;
  /** A pegada de cada raiz (canvas): o selo de uma raiz pequena foge delas. */
  readonly roots: readonly ArrivalRoot[];
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
  const area = boundingBox(rects);
  if (!area) return null;
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
  const roots: ArrivalRoot[] = [];
  for (const id of projectIndex(project).roots) {
    const rect = rootFootprint(project, id);
    if (rect) roots.push({ id, rect });
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
export function arrivalBadgeWidth(text: string, metrics: ArrivalMetrics): number {
  return text.length * metrics.charWidth + 2 * metrics.pad;
}

/**
 * Onde o selo fica (canto de cima à esquerda dele, em unidades do canvas). Nunca no topo da raiz,
 * onde ficam o nome do container e o título da faixa. Raiz grande: por dentro do canto de baixo à
 * esquerda; se isso cruza a faixa do nome (ou o corpo) de outra raiz, subido até logo acima dela;
 * depois, os lugares da raiz pequena (abaixo, à direita, à esquerda). Vale o primeiro sem bloqueio;
 * sem nenhum livre, o de menor interseção. `self` é o id da raiz do selo: ela não se bloqueia.
 * Tamanho e vão em px de tela. Com `view` (a área visível, em unidades do canvas) o selo é puxado
 * para dentro dela; com `avoid` (um retângulo sobreposto ao canvas, como o minimapa) ele sai de
 * baixo dele. Os dois ajustes valem para cada candidato antes da escolha (um lugar empurrado para
 * dentro da vista não pode cair sobre o título de outra raiz), e `extra` são outros retângulos a
 * evitar, como o título da faixa (CL1, achados 1.2 e 2.1). Raiz pequena sem lugar livre ainda
 * tenta o canto de dentro dela, o único que só cobre a própria raiz.
 */
export function arrivalBadgeSpot(
  rect: Rect,
  zoom: number,
  width: number,
  metrics: ArrivalMetrics,
  view?: Rect,
  avoid?: Rect,
  roots: readonly ArrivalRoot[] = [],
  self?: string,
  extra: readonly Rect[] = [],
): Point {
  const w = width / zoom;
  const h = metrics.height / zoom;
  const nameBand = metrics.nameBand / zoom;
  const blockers = [
    ...roots
      .filter((r) => r.id !== self)
      .map(({ rect: r }) => ({
        x: r.x,
        y: r.y - nameBand,
        width: r.width,
        height: r.height + nameBand,
      })),
    ...extra,
  ];
  const small = rect.width * zoom < 2 * width || rect.height * zoom < 2 * metrics.height;
  const around = smallCandidates(rect, zoom, w, h, metrics);
  const within = insideCandidates(rect, zoom, w, h, metrics, blockers);
  const candidates = (small ? [...around, ...within] : [...within, ...around]).map((c) =>
    fitToView(c, w, h, view, avoid),
  );
  return pickSpot(candidates, w, h, blockers);
}

/** O candidato puxado para dentro da área visível e para fora do minimapa, quando há. */
function fitToView(at: Point, w: number, h: number, view?: Rect, avoid?: Rect): Point {
  if (!view) return at;
  const inside = keepInside(at, w, h, view);
  return avoid ? clearOf(inside, w, h, view, avoid) : inside;
}

/** Por dentro da raiz, no canto de baixo; subido acima do que o cobre. */
function insideCandidates(
  rect: Rect,
  zoom: number,
  w: number,
  h: number,
  metrics: ArrivalMetrics,
  blockers: readonly Rect[],
): Point[] {
  const gap = metrics.gap / zoom;
  const inside = { x: rect.x + gap, y: bottom(rect) - gap - h };
  const list = [inside];
  const covering = blockers.filter((r) => hits(inside, w, h, r));
  if (covering.length > 0) {
    const y = Math.min(...covering.map((r) => r.y)) - gap - h;
    if (y >= rect.y + metrics.nameBand / zoom) list.push({ x: inside.x, y });
  }
  return list;
}

/** Raiz pequena: abaixo do canto de baixo à esquerda, à direita da raiz e à esquerda dela. */
function smallCandidates(
  rect: Rect,
  zoom: number,
  w: number,
  h: number,
  metrics: ArrivalMetrics,
): Point[] {
  const gap = metrics.gap / zoom;
  return [
    { x: rect.x, y: bottom(rect) + metrics.gapBelow / zoom },
    { x: right(rect) + gap, y: bottom(rect) + gap - h },
    { x: rect.x - gap - w, y: bottom(rect) + gap - h },
  ];
}

/** Área da interseção do selo em `at` (w × h) com `r`. */
function overlapArea(at: Point, w: number, h: number, r: Rect): number {
  const dx = Math.min(at.x + w, right(r)) - Math.max(at.x, r.x);
  const dy = Math.min(at.y + h, bottom(r)) - Math.max(at.y, r.y);
  return dx > 0 && dy > 0 ? dx * dy : 0;
}

/** O primeiro candidato sem interseção com `blockers`; sem nenhum, o de menor área (empate: o primeiro). */
function pickSpot(
  candidates: readonly Point[],
  w: number,
  h: number,
  blockers: readonly Rect[],
): Point {
  let best = candidates[0] as Point;
  let bestArea = Infinity;
  for (const c of candidates) {
    const area = blockers.reduce((sum, r) => sum + overlapArea(c, w, h, r), 0);
    if (area === 0) return c;
    if (area < bestArea) {
      best = c;
      bestArea = area;
    }
  }
  return best;
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

/** A área visível (unidades do canvas) menos a margem de `tokens.arrival.pad` em cada lado. */
function labelArea(view: Rect, zoom: number, pad: number): Rect {
  const m = pad / zoom;
  return {
    x: view.x + m,
    y: view.y + m,
    width: Math.max(0, view.width - 2 * m),
    height: Math.max(0, view.height - 2 * m),
  };
}

/**
 * A largura (px de tela) que o rótulo da faixa passa a ter quando o texto, de `textWidth`, não
 * cabe na área visível menos as duas margens (título e dica ganham `width`, `wrap: 'none'` e
 * reticências); `null` quando cabe.
 */
export function arrivalBandLabelFit(
  textWidth: number,
  zoom: number,
  view: Rect,
  metrics: ArrivalMetrics,
): number | null {
  const room = labelArea(view, zoom, metrics.pad).width * zoom;
  return textWidth > room ? room : null;
}

/**
 * Onde o rótulo da faixa ("Área de chegada" e a dica) fica (canto de cima à esquerda dele, em
 * unidades do canvas). `size` é o tamanho dele em px de tela e `nameClear` a altura (px de tela) do
 * nome dos containers, que fica logo acima do conteúdo. A folga da faixa é em unidades do canvas e
 * encolhe com o zoom; por isso o rótulo sobe o que faltar para ficar acima da linha do nome, nunca
 * sobre ela. Sem espaço em cima na área visível, vai para baixo da faixa; em qualquer caso é puxado
 * para dentro de `view`, a `metrics.pad` de cada borda; mais largo que isso, usa a largura que sobra.
 */
export function arrivalBandLabelSpot(
  band: Rect,
  zoom: number,
  size: { readonly width: number; readonly height: number },
  view: Rect,
  nameClear: number,
  metrics: ArrivalMetrics,
): Point {
  const area = labelArea(view, zoom, metrics.pad);
  const w = Math.min(size.width / zoom, area.width);
  const h = size.height / zoom;
  const lift = (nameClearance(zoom, nameClear) + metrics.gap) / zoom;
  const above = band.y - lift - h;
  const y = above >= area.y ? above : bottom(band) + metrics.gap / zoom;
  return keepInside({ x: band.x, y }, w, h, area);
}
