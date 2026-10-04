import { fail } from './errors';
import {
  MIN_MARKING_SIZE,
  clamp,
  imageCanvasRect,
  imagePixelRect,
  rectsOverlap,
  right,
} from './geometry';
import { topDown } from './hierarchy';
import {
  canDeleteImage,
  canEditImagePlacement,
  canReplaceImage,
  requireUnlocked,
} from './locks';
import { findById, normalizeOptionalName, updateById } from './project';
import { countBrokenRefs } from './refs';
import type { Marking, Placement, Project, ProjectImage, Rect } from './types';

/** Lado maior de uma imagem recém-adicionada, em unidades do canvas. */
export const INITIAL_IMAGE_SIZE = 1000;
/** Espaço entre a nova imagem e a imagem mais à direita, em unidades do canvas. */
export const IMAGE_GAP = 50;
/** Diferença máxima de proporção considerada "a mesma" na troca de imagem. */
export const ASPECT_TOLERANCE = 0.01;

export interface ImageFile {
  readonly file: string;
  readonly width: number;
  readonly height: number;
}

function checkDimensions({ width, height }: ImageFile): void {
  const ok = (n: number) => Number.isInteger(n) && n > 0;
  if (!ok(width) || !ok(height)) fail('invalid-dimensions');
}

function checkPlacement({ x, y, scale }: Placement): void {
  if (![x, y, scale].every(Number.isFinite) || scale <= 0) fail('invalid-placement');
}

/** Posição livre à direita de todas as imagens (exceto `excludeId`). */
function placementAtRight(p: Project, scale: number, excludeId?: string): Placement {
  const others = p.images.filter((i) => i.id !== excludeId);
  const rects = others.map((i) => imageCanvasRect(i, i.placement));
  if (rects.length === 0) return { x: 0, y: 0, scale };
  const rightmost = rects.reduce((a, b) => (right(b) > right(a) ? b : a));
  return { x: right(rightmost) + IMAGE_GAP, y: rightmost.y, scale };
}

/**
 * Posição livre mais próxima de `center` (ponto do canvas onde o centro da
 * imagem deveria ficar). Testa o ponto pedido e os encaixes junto às bordas
 * das outras imagens; sempre existe um (à direita de todas).
 */
export function placementNear(
  p: Project,
  size: { readonly width: number; readonly height: number },
  scale: number,
  center: { readonly x: number; readonly y: number },
  excludeId?: string,
): Placement {
  const w = size.width * scale;
  const h = size.height * scale;
  const wanted = { x: center.x - w / 2, y: center.y - h / 2 };
  const others = p.images
    .filter((i) => i.id !== excludeId)
    .map((i) => imageCanvasRect(i, i.placement));
  const xs = [wanted.x];
  const ys = [wanted.y];
  for (const o of others) {
    xs.push(right(o) + IMAGE_GAP, o.x - IMAGE_GAP - w);
    ys.push(o.y + o.height + IMAGE_GAP, o.y - IMAGE_GAP - h);
  }
  let best: { x: number; y: number } | null = null;
  let bestDistance = Infinity;
  for (const x of xs) {
    for (const y of ys) {
      const rect = { x, y, width: w, height: h };
      if (others.some((o) => rectsOverlap(rect, o))) continue;
      const distance = Math.hypot(x - wanted.x, y - wanted.y);
      if (distance < bestDistance) {
        best = { x, y };
        bestDistance = distance;
      }
    }
  }
  return { ...(best ?? placementAtRight(p, scale)), scale };
}

/** `true` se a imagem pode ocupar `placement` sem sobrepor outra imagem. */
export function canPlaceImage(
  p: Project,
  imageId: string,
  placement: Placement,
): boolean {
  const image = findById(p.images, imageId);
  const rect = imageCanvasRect(image, placement);
  return p.images.every(
    (other) =>
      other.id === imageId ||
      !rectsOverlap(rect, imageCanvasRect(other, other.placement)),
  );
}

/**
 * Nome livre em `images/`: `foto.jpg`, `foto-2.jpg`, `foto-3.jpg`…
 * `taken` lista caminhos ocupados fora do projeto (arquivos já existentes na pasta).
 */
export function uniqueImageFile(
  p: Project,
  fileName: string,
  taken: ReadonlySet<string> = new Set(),
): string {
  const used = new Set([...p.images.map((i) => i.file), ...taken]);
  const dot = fileName.lastIndexOf('.');
  const base = dot > 0 ? fileName.slice(0, dot) : fileName;
  const ext = dot > 0 ? fileName.slice(dot) : '';
  let candidate = `images/${fileName}`;
  for (let n = 2; used.has(candidate); n++) candidate = `images/${base}-${n}${ext}`;
  return candidate;
}

/**
 * Adiciona a imagem, com o lado maior medindo `INITIAL_IMAGE_SIZE` unidades do
 * canvas: perto de `center`, se informado; senão à direita da imagem mais à direita.
 */
export function addImage(
  p: Project,
  args: ImageFile & {
    readonly id: string;
    /** Onde o centro da imagem deve ficar (vai para o espaço livre mais próximo). */
    readonly center?: { readonly x: number; readonly y: number };
  },
): Project {
  checkDimensions(args);
  if (p.images.some((i) => i.file === args.file)) fail('duplicate-file');
  const scale = INITIAL_IMAGE_SIZE / Math.max(args.width, args.height);
  const image: ProjectImage = {
    id: args.id,
    name: null,
    markingColor: null,
    locked: false,
    file: args.file,
    width: args.width,
    height: args.height,
    placement: args.center
      ? placementNear(p, args, scale, args.center)
      : placementAtRight(p, scale),
  };
  return { ...p, images: [...p.images, image] };
}

/** Nome de exibição da imagem; vazio vira `null` (a app mostra o nome do arquivo). */
export function renameImage(p: Project, imageId: string, name: string | null): Project {
  const normalized = normalizeOptionalName(name);
  return {
    ...p,
    images: updateById(p.images, imageId, (i) => ({ ...i, name: normalized })),
  };
}

/** Sugestões de cor para a borda das marcações (alto contraste sobre fotos claras e escuras). */
export const MARKING_COLOR_PALETTE: readonly string[] = [
  '#FFFFFF',
  '#000000',
  '#FFEB3B',
  '#00E5FF',
  '#76FF03',
  '#FF4081',
  '#FF6D00',
  '#E53935',
];

/** Cor da borda das marcações da imagem (`#RRGGBB`); `null` volta para a cor do tema. */
export function setImageMarkingColor(
  p: Project,
  imageId: string,
  color: string | null,
): Project {
  if (color !== null && !/^#[0-9A-Fa-f]{6}$/.test(color)) fail('invalid-color');
  const normalized = color === null ? null : color.toUpperCase();
  return {
    ...p,
    images: updateById(p.images, imageId, (i) => ({ ...i, markingColor: normalized })),
  };
}

/** Define posição e escala (mover ou redimensionar). Falha se sobrepor outra imagem. */
export function setImagePlacement(
  p: Project,
  imageId: string,
  placement: Placement,
): Project {
  checkPlacement(placement);
  requireUnlocked(canEditImagePlacement(p, imageId));
  if (!canPlaceImage(p, imageId, placement)) fail('image-overlap');
  const copy: Placement = { x: placement.x, y: placement.y, scale: placement.scale };
  return {
    ...p,
    images: updateById(p.images, imageId, (i) => ({ ...i, placement: copy })),
  };
}

export function moveImage(p: Project, imageId: string, x: number, y: number): Project {
  const { placement } = findById(p.images, imageId);
  return setImagePlacement(p, imageId, { ...placement, x, y });
}

/** Redimensionamento proporcional: nova escala com o canto (`x`, `y`) informado. */
export function resizeImage(p: Project, imageId: string, placement: Placement): Project {
  return setImagePlacement(p, imageId, placement);
}

export function imageDeletionImpact(
  p: Project,
  imageId: string,
): { markings: number; annotations: number; brokenRefs: number } {
  findById(p.images, imageId);
  const ids = new Set(p.markings.filter((m) => m.imageId === imageId).map((m) => m.id));
  return {
    markings: ids.size,
    annotations: p.annotations.filter((a) => ids.has(a.markingId)).length,
    brokenRefs: countBrokenRefs(p, cascadeRemoveImage(p, imageId)),
  };
}

/** Exclui a imagem com as marcações e anotações dela. Falha se ela ou uma marcação estiver trancada. */
export function removeImage(p: Project, imageId: string): Project {
  findById(p.images, imageId);
  requireUnlocked(canDeleteImage(p, imageId));
  return cascadeRemoveImage(p, imageId);
}

/** A exclusão em si, sem a trava: também serve para contar o impacto. */
function cascadeRemoveImage(p: Project, imageId: string): Project {
  const ids = new Set(p.markings.filter((m) => m.imageId === imageId).map((m) => m.id));
  return {
    ...p,
    images: p.images.filter((i) => i.id !== imageId),
    markings: p.markings.filter((m) => !ids.has(m.id)),
    annotations: p.annotations.filter((a) => !ids.has(a.markingId)),
  };
}

/** `true` se a troca mantém a proporção (diferença ≤ 1%). */
export function isSameAspect(
  old: Pick<ProjectImage, 'width' | 'height'>,
  next: Pick<ImageFile, 'width' | 'height'>,
): boolean {
  const sx = next.width / old.width;
  const sy = next.height / old.height;
  return Math.abs(sx / sy - 1) <= ASPECT_TOLERANCE;
}

/**
 * Reescala um intervalo [start, end) arredondando as bordas. Como o arredondamento
 * é monotônico, contenção entre pai e filha e os limites da imagem se preservam.
 */
function scaleSpan(start: number, size: number, factor: number): [number, number] {
  const a = Math.round(start * factor);
  const b = Math.round((start + size) * factor);
  return [a, b - a];
}

/**
 * Garante o tamanho mínimo aumentando o lado pequeno em volta do centro, sem sair
 * de [min, max). O resultado sempre contém o intervalo original.
 */
function growSpan(
  start: number,
  size: number,
  min: number,
  max: number,
): [number, number] {
  if (size >= MIN_MARKING_SIZE) return [start, size];
  const grown = clamp(
    start - Math.floor((MIN_MARKING_SIZE - size) / 2),
    min,
    max - MIN_MARKING_SIZE,
  );
  return [grown, MIN_MARKING_SIZE];
}

function rescaleMarkings(
  markings: readonly Marking[],
  image: ProjectImage,
  next: ImageFile,
  needsReview: boolean,
): Map<string, Marking> {
  const sx = next.width / image.width;
  const sy = next.height / image.height;
  const bounds = imagePixelRect(next);
  const result = new Map<string, Marking>();
  // De cima para baixo: cada filha é ajustada dentro do pai já reescalado.
  for (const m of topDown(markings)) {
    const container: Rect = (m.parentId && result.get(m.parentId)?.rect) || bounds;
    const [x0, w0] = scaleSpan(m.rect.x, m.rect.width, sx);
    const [y0, h0] = scaleSpan(m.rect.y, m.rect.height, sy);
    const [x, width] = growSpan(x0, w0, container.x, right(container));
    const [y, height] = growSpan(y0, h0, container.y, container.y + container.height);
    result.set(m.id, {
      ...m,
      rect: { x, y, width, height },
      needsReview: needsReview || m.needsReview,
    });
  }
  return result;
}

export interface ReplaceImageOptions {
  /** O usuário confirmou a troca por uma imagem com proporção diferente. */
  readonly confirmAspectChange?: boolean;
}

/**
 * Troca o arquivo da imagem mantendo as marcações (reescaladas). Com proporção
 * diferente, exige confirmação e marca todas as marcações com `needsReview`.
 * Mantém `x`/`y` e a largura exibida; se passar a sobrepor outra imagem,
 * vai para um espaço livre à direita.
 */
export function replaceImage(
  p: Project,
  imageId: string,
  next: ImageFile,
  options: ReplaceImageOptions = {},
): Project {
  checkDimensions(next);
  const image = findById(p.images, imageId);
  requireUnlocked(canReplaceImage(p, imageId, next));
  if (p.images.some((i) => i.id !== imageId && i.file === next.file))
    fail('duplicate-file');
  const sameAspect = isSameAspect(image, next);
  if (!sameAspect && !options.confirmAspectChange) fail('aspect-change-not-confirmed');

  const own = p.markings.filter((m) => m.imageId === imageId);
  if (
    own.length > 0 &&
    (next.width < MIN_MARKING_SIZE || next.height < MIN_MARKING_SIZE)
  ) {
    fail('image-too-small');
  }
  const rescaled = rescaleMarkings(own, image, next, !sameAspect);

  const scale = (image.placement.scale * image.width) / next.width;
  let placement: Placement = { ...image.placement, scale };
  const candidate = imageCanvasRect(next, placement);
  const overlaps = p.images.some(
    (o) => o.id !== imageId && rectsOverlap(candidate, imageCanvasRect(o, o.placement)),
  );
  if (overlaps) {
    placement = placementAtRight(p, scale, imageId);
  }

  const updated: ProjectImage = {
    id: image.id,
    name: image.name,
    markingColor: image.markingColor,
    locked: image.locked,
    file: next.file,
    width: next.width,
    height: next.height,
    placement,
  };
  return {
    ...p,
    images: p.images.map((i) => (i.id === imageId ? updated : i)),
    markings: p.markings.map((m) => rescaled.get(m.id) ?? m),
  };
}
