import { fail } from './errors';
import {
  MIN_MARKING_SIZE,
  clamp,
  containsRect,
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
import type { Marking, Placement, Project, ProjectContainer, Rect } from './types';

/** Lado maior de uma imagem recém-adicionada, em unidades do canvas. */
export const INITIAL_IMAGE_SIZE = 1000;
/** Espaço entre a nova imagem e a imagem mais à direita, em unidades do canvas. */
export const IMAGE_GAP = 50;
/** Diferença máxima de proporção considerada "a mesma" na troca de imagem. */
export const ASPECT_TOLERANCE = 0.01;

/** Maior lado (largura ou altura) de um container sem arquivo, em pixels. */
export const MAX_CONTAINER_SIZE = 20000;

export interface ImageFile {
  readonly file: string;
  readonly width: number;
  readonly height: number;
}

function checkDimensions({
  width,
  height,
}: {
  readonly width: number;
  readonly height: number;
}): void {
  const ok = (n: number) => Number.isInteger(n) && n > 0;
  if (!ok(width) || !ok(height)) fail('invalid-dimensions');
}

const COLOR_RE = /^#[0-9A-Fa-f]{6}$/;

/** Cor de fundo válida (`#RRGGBB`), em maiúsculas. */
function checkBackground(color: string): string {
  if (!COLOR_RE.test(color)) fail('invalid-color');
  return color.toUpperCase();
}

/** Dimensões de um container sem arquivo: inteiros de 1 a `MAX_CONTAINER_SIZE`. */
function checkBackgroundDimensions(size: {
  readonly width: number;
  readonly height: number;
}): void {
  checkDimensions(size);
  if (size.width > MAX_CONTAINER_SIZE || size.height > MAX_CONTAINER_SIZE) {
    fail('invalid-dimensions');
  }
}

/** `true` se a imagem é um container sem arquivo (sem arquivo, só com cor de fundo). */
export function isBackgroundContainer(image: Pick<ProjectContainer, 'file'>): boolean {
  return image.file === null;
}

function checkPlacement({ x, y, scale }: Placement): void {
  if (![x, y, scale].every(Number.isFinite) || scale <= 0) fail('invalid-placement');
}

/** Posição livre à direita de todas as imagens (exceto `excludeId`). */
function placementAtRight(p: Project, scale: number, excludeId?: string): Placement {
  const others = p.containers.filter((i) => i.id !== excludeId);
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
  const others = p.containers
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
export function canPlaceContainer(
  p: Project,
  containerId: string,
  placement: Placement,
): boolean {
  const image = findById(p.containers, containerId);
  const rect = imageCanvasRect(image, placement);
  return p.containers.every(
    (other) =>
      other.id === containerId ||
      !rectsOverlap(rect, imageCanvasRect(other, other.placement)),
  );
}

/** Arquivos das imagens (o container sem arquivo não tem), na ordem das imagens. */
export function imageFileNames(images: readonly Pick<ProjectContainer, 'file'>[]): string[] {
  const files: string[] = [];
  for (const image of images) if (image.file !== null) files.push(image.file);
  return files;
}

/** Arquivo do projeto na raiz da pasta/zip (app e servidor MCP). */
export const MAPPING_FILE = 'mapping.json';
/** Pasta das imagens, relativa à raiz do projeto (app e servidor MCP). */
export const IMAGES_DIR = 'images';

/**
 * Nome livre em `images/`: `foto.jpg`, `foto-2.jpg`, `foto-3.jpg`…
 * `taken` lista caminhos ocupados fora do projeto (arquivos já existentes na pasta).
 */
export function uniqueImageFile(
  p: Project,
  fileName: string,
  taken: ReadonlySet<string> = new Set(),
): string {
  const used = new Set<string>(taken);
  for (const i of p.containers) if (i.file !== null) used.add(i.file);
  const dot = fileName.lastIndexOf('.');
  const base = dot > 0 ? fileName.slice(0, dot) : fileName;
  const ext = dot > 0 ? fileName.slice(dot) : '';
  let candidate = `${IMAGES_DIR}/${fileName}`;
  for (let n = 2; used.has(candidate); n++) {
    candidate = `${IMAGES_DIR}/${base}-${n}${ext}`;
  }
  return candidate;
}

/**
 * Adiciona a imagem, com o lado maior medindo `INITIAL_IMAGE_SIZE` unidades do
 * canvas: perto de `center`, se informado; senão à direita da imagem mais à direita.
 */
export function addContainer(
  p: Project,
  args: ImageFile & {
    readonly id: string;
    /** Onde o centro da imagem deve ficar (vai para o espaço livre mais próximo). */
    readonly center?: { readonly x: number; readonly y: number };
  },
): Project {
  if (p.containers.some((i) => i.id === args.id)) fail('duplicate-id', args.id);
  checkDimensions(args);
  if (p.containers.some((i) => i.file !== null && i.file === args.file)) {
    fail('duplicate-file');
  }
  const scale = INITIAL_IMAGE_SIZE / Math.max(args.width, args.height);
  const image: ProjectContainer = {
    id: args.id,
    name: null,
    markingColor: null,
    locked: false,
    source: null,
    file: args.file,
    background: null,
    width: args.width,
    height: args.height,
    placement: args.center
      ? placementNear(p, args, scale, args.center)
      : placementAtRight(p, scale),
  };
  return { ...p, containers: [...p.containers, image] };
}

/**
 * Adiciona um container sem arquivo (imagem sem arquivo, só com cor de fundo), com a mesma
 * colocação de `addImage`: lado maior de `INITIAL_IMAGE_SIZE` unidades do canvas.
 */
export function addBackgroundContainer(
  p: Project,
  args: {
    readonly id: string;
    readonly name?: string | null;
    readonly width: number;
    readonly height: number;
    /** Cor de fundo (`#RRGGBB`). */
    readonly background: string;
    /** Onde o centro da imagem deve ficar (vai para o espaço livre mais próximo). */
    readonly center?: { readonly x: number; readonly y: number };
  },
): Project {
  if (p.containers.some((i) => i.id === args.id)) fail('duplicate-id', args.id);
  checkBackgroundDimensions(args);
  const background = checkBackground(args.background);
  const name = normalizeOptionalName(args.name ?? null);
  const scale = INITIAL_IMAGE_SIZE / Math.max(args.width, args.height);
  const image: ProjectContainer = {
    id: args.id,
    name,
    markingColor: null,
    locked: false,
    source: null,
    file: null,
    background,
    width: args.width,
    height: args.height,
    placement: args.center
      ? placementNear(p, args, scale, args.center)
      : placementAtRight(p, scale),
  };
  return { ...p, containers: [...p.containers, image] };
}

export interface BackgroundContainerChanges {
  readonly width?: number;
  readonly height?: number;
  readonly background?: string;
}

/**
 * Edita o container sem arquivo: tamanho e/ou cor de fundo. Mudar o tamanho é geometria
 * (imagem trancada recusa com `locked`), mantém a escala do `placement` e recusa se alguma
 * marcação deixar de caber (`rect-out-of-image`) ou se a imagem passar a sobrepor outra
 * (`image-overlap`). Só vale para container sem arquivo (`container-has-file`).
 */
export function setBackgroundContainer(
  p: Project,
  containerId: string,
  changes: BackgroundContainerChanges,
): Project {
  const image = findById(p.containers, containerId);
  if (!isBackgroundContainer(image)) fail('container-has-file');
  const background =
    changes.background === undefined
      ? image.background
      : checkBackground(changes.background);
  const width = changes.width ?? image.width;
  const height = changes.height ?? image.height;
  const resized = width !== image.width || height !== image.height;
  if (resized) {
    checkBackgroundDimensions({ width, height });
    requireUnlocked(canEditImagePlacement(p, containerId));
    const bounds = imagePixelRect({ width, height });
    for (const m of p.markings) {
      if (m.containerId === containerId && !containsRect(bounds, m.rect)) {
        fail('rect-out-of-image', m.id);
      }
    }
    if (
      !canPlaceContainer(
        { ...p, containers: updateById(p.containers, containerId, (i) => ({ ...i, width, height })) },
        containerId,
        image.placement,
      )
    ) {
      fail('image-overlap');
    }
  }
  if (!resized && background === image.background) return p;
  return {
    ...p,
    containers: updateById(p.containers, containerId, (i) => ({ ...i, width, height, background })),
  };
}

/** Nome de exibição da imagem; vazio vira `null` (a app mostra o nome do arquivo). */
export function renameContainer(p: Project, containerId: string, name: string | null): Project {
  const normalized = normalizeOptionalName(name);
  return {
    ...p,
    containers: updateById(p.containers, containerId, (i) => ({ ...i, name: normalized })),
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
export function setContainerMarkingColor(
  p: Project,
  containerId: string,
  color: string | null,
): Project {
  if (color !== null && !/^#[0-9A-Fa-f]{6}$/.test(color)) fail('invalid-color');
  const normalized = color === null ? null : color.toUpperCase();
  return {
    ...p,
    containers: updateById(p.containers, containerId, (i) => ({ ...i, markingColor: normalized })),
  };
}

/** Define posição e escala (mover ou redimensionar). Falha se sobrepor outra imagem. */
export function setContainerPlacement(
  p: Project,
  containerId: string,
  placement: Placement,
): Project {
  checkPlacement(placement);
  requireUnlocked(canEditImagePlacement(p, containerId));
  if (!canPlaceContainer(p, containerId, placement)) fail('image-overlap');
  const copy: Placement = { x: placement.x, y: placement.y, scale: placement.scale };
  return {
    ...p,
    containers: updateById(p.containers, containerId, (i) => ({ ...i, placement: copy })),
  };
}

export function moveContainer(p: Project, containerId: string, x: number, y: number): Project {
  const { placement } = findById(p.containers, containerId);
  return setContainerPlacement(p, containerId, { ...placement, x, y });
}

/** Redimensionamento proporcional: nova escala com o canto (`x`, `y`) informado. */
export function resizeContainer(p: Project, containerId: string, placement: Placement): Project {
  return setContainerPlacement(p, containerId, placement);
}

export function containerDeletionImpact(
  p: Project,
  containerId: string,
): {
  markings: number;
  /** Quantas das marcações estão trancadas (serão excluídas junto). */
  lockedMarkings: number;
  annotations: number;
  brokenRefs: number;
} {
  findById(p.containers, containerId);
  const own = p.markings.filter((m) => m.containerId === containerId);
  const ids = new Set(own.map((m) => m.id));
  return {
    markings: ids.size,
    lockedMarkings: own.filter((m) => m.locked).length,
    annotations: p.annotations.filter((a) => ids.has(a.markingId)).length,
    brokenRefs: countBrokenRefs(p, cascadeRemoveImage(p, containerId)),
  };
}

/** Exclui a imagem com as marcações (trancadas ou não) e anotações dela. Falha só se a própria imagem estiver trancada. */
export function removeContainer(p: Project, containerId: string): Project {
  findById(p.containers, containerId);
  requireUnlocked(canDeleteImage(p, containerId));
  return cascadeRemoveImage(p, containerId);
}

/** A exclusão em si, sem a trava: também serve para contar o impacto. */
function cascadeRemoveImage(p: Project, containerId: string): Project {
  const ids = new Set(p.markings.filter((m) => m.containerId === containerId).map((m) => m.id));
  return {
    ...p,
    containers: p.containers.filter((i) => i.id !== containerId),
    markings: p.markings.filter((m) => !ids.has(m.id)),
    annotations: p.annotations.filter((a) => !ids.has(a.markingId)),
  };
}

/** `true` se a troca mantém a proporção (diferença ≤ 1%). */
export function isSameAspect(
  old: Pick<ProjectContainer, 'width' | 'height'>,
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
  image: ProjectContainer,
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

export interface ReplaceContainerOptions {
  /** O usuário confirmou a troca por uma imagem com proporção diferente. */
  readonly confirmAspectChange?: boolean;
}

/**
 * Troca o arquivo da imagem mantendo as marcações (reescaladas). Com proporção
 * diferente, exige confirmação e marca todas as marcações com `needsReview`.
 * Mantém `x`/`y` e a largura exibida; se passar a sobrepor outra imagem,
 * vai para um espaço livre à direita.
 */
export function replaceContainer(
  p: Project,
  containerId: string,
  next: ImageFile,
  options: ReplaceContainerOptions = {},
): Project {
  checkDimensions(next);
  const image = findById(p.containers, containerId);
  if (isBackgroundContainer(image)) fail('container-without-file');
  requireUnlocked(canReplaceImage(p, containerId, next));
  if (p.containers.some((i) => i.id !== containerId && i.file !== null && i.file === next.file))
    fail('duplicate-file');
  const sameAspect = isSameAspect(image, next);
  if (!sameAspect && !options.confirmAspectChange) fail('aspect-change-not-confirmed');

  const own = p.markings.filter((m) => m.containerId === containerId);
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
  const overlaps = p.containers.some(
    (o) => o.id !== containerId && rectsOverlap(candidate, imageCanvasRect(o, o.placement)),
  );
  if (overlaps) {
    placement = placementAtRight(p, scale, containerId);
  }

  const updated: ProjectContainer = {
    id: image.id,
    name: image.name,
    markingColor: image.markingColor,
    locked: image.locked,
    source: image.source,
    file: next.file,
    background: null,
    width: next.width,
    height: next.height,
    placement,
  };
  return {
    ...p,
    containers: p.containers.map((i) => (i.id === containerId ? updated : i)),
    markings: p.markings.map((m) => rescaled.get(m.id) ?? m),
  };
}
