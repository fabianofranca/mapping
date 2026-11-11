import { arrowIdsAttachedTo, withoutArrows } from './arrows';
import { fail } from './errors';
import { HEX_COLOR_RE } from './hexColor';
import { idInUse } from './projectIndex';
import {
  MIN_MARKING_SIZE,
  bottom,
  clamp,
  EPSILON,
  containsRect,
  effectiveMinSize,
  imageCanvasRect,
  imagePixelRect,
  rectsOverlap,
  right,
  snapPlacement,
  type Size,
} from './geometry';
import { settleFrom, type SettleOptions } from './hierarchySettle';
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
/** Vão entre uma peça nova e os obstáculos, nas unidades do espaço (pixels da imagem ou do canvas). */
export const PLACEMENT_GAP = 8;
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

/** Cor de fundo válida (`#RRGGBB`), em maiúsculas. */
function checkBackground(color: string): string {
  if (!HEX_COLOR_RE.test(color)) fail('invalid-color');
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
  if (rects.length === 0) return snapPlacement({ x: 0, y: 0, scale });
  const rightmost = rects.reduce((a, b) => (right(b) > right(a) ? b : a));
  return snapPlacement({ x: right(rightmost) + IMAGE_GAP, y: rightmost.y, scale });
}

/** Intervalo aberto de `y` (do canto de cima) que sobrepõe um obstáculo. */
type YSpan = readonly [number, number];

/** Intervalos de `y` barrados pelos obstáculos que cruzam a coluna de `x` a `x + width`, ordenados e fundidos. */
function forbiddenYs(
  obstacles: readonly Rect[],
  x: number,
  width: number,
  height: number,
): YSpan[] {
  const spans: [number, number][] = [];
  for (const o of obstacles) {
    if (!rectsOverlap({ x, y: o.y, width, height: o.height }, o)) continue;
    spans.push([o.y - height + EPSILON, bottom(o) - EPSILON]);
  }
  spans.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const span of spans) {
    const last = merged[merged.length - 1];
    if (last && span[0] < last[1]) last[1] = Math.max(last[1], span[1]);
    else merged.push([span[0], span[1]]);
  }
  return merged;
}

/** `y` cai dentro de algum intervalo aberto (busca binária nos intervalos fundidos). */
function isBlocked(spans: readonly YSpan[], y: number): boolean {
  let lo = 0;
  let hi = spans.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const [from, to] = spans[mid] as YSpan;
    if (y <= from) hi = mid - 1;
    else if (y >= to) lo = mid + 1;
    else return true;
  }
  return false;
}

/**
 * O lugar livre mais próximo de `wanted` (canto de cima à esquerda) para um retângulo de
 * `width` × `height` que não sobreponha nenhum dos `obstacles`. Testa o ponto pedido e os
 * encaixes junto às bordas dos obstáculos (com o vão `gap`); o de menor distância vence e o
 * primeiro empata. Sempre há um (à direita de todos os obstáculos). Vale para qualquer espaço do
 * canvas: serve a `placementNear` e à chegada das perspectivas.
 */
export function nearestFreeSpot(
  obstacles: readonly Rect[],
  width: number,
  height: number,
  wanted: { readonly x: number; readonly y: number },
  gap: number = IMAGE_GAP,
): { x: number; y: number } {
  const xs = [wanted.x];
  const ys = [wanted.y];
  for (const o of obstacles) {
    xs.push(right(o) + gap, o.x - gap - width);
    ys.push(o.y + o.height + gap, o.y - gap - height);
  }
  let best: { x: number; y: number } | null = null;
  let bestDistance = Infinity;
  for (const x of xs) {
    // Só os obstáculos que cruzam a coluna [x, x + width) barram algum y; cada um barra o
    // intervalo aberto de y em que o retângulo o sobreporia.
    const blocked = forbiddenYs(obstacles, x, width, height);
    for (const y of ys) {
      if (isBlocked(blocked, y)) continue;
      const distance = Math.hypot(x - wanted.x, y - wanted.y);
      if (distance < bestDistance) {
        best = { x, y };
        bestDistance = distance;
      }
    }
  }
  if (best) return best;
  if (obstacles.length === 0) return { x: wanted.x, y: wanted.y };
  const rightmost = obstacles.reduce((a, b) => (right(b) > right(a) ? b : a));
  return { x: right(rightmost) + gap, y: rightmost.y };
}

/**
 * O retângulo é livre? Cabe em `area` (quando há) e não se sobrepõe a nenhum dos `obstacles`
 * (`rectsOverlap`, área positiva: encostar não é sobrepor).
 */
export function isFreeRect(
  rect: Rect,
  obstacles: readonly Rect[],
  area: Rect | null,
): boolean {
  if (area !== null && !containsRect(area, rect)) return false;
  return !obstacles.some((o) => rectsOverlap(rect, o));
}

/** Coordenadas candidatas de um eixo, inteiras e sempre para longe do obstáculo (teto à frente, piso atrás). */
function spotAxis(
  wanted: number,
  size: number,
  gap: number,
  edges: readonly (readonly [number, number])[],
  bounds: readonly [number, number] | null,
): number[] {
  const values = [wanted];
  if (bounds !== null) values.push(Math.ceil(bounds[0]), Math.floor(bounds[1] - size));
  for (const [low, high] of edges) {
    values.push(Math.ceil(high + gap), Math.floor(low - gap - size));
  }
  // Sem repetidos (grades e peças repetidas dão a mesma borda várias vezes); a ordem de
  // primeira aparição fica, e ela desempata a distância.
  const unique = [...new Set(values)];
  return bounds === null
    ? unique
    : unique.filter((v) => v >= bounds[0] && v + size <= bounds[1]);
}

/**
 * O lugar livre mais próximo de `wanted` (canto de cima à esquerda) para um retângulo de
 * `width` × `height` que não se sobreponha a nenhum dos `obstacles`, **dentro de `area`** (quando
 * há). Os candidatos são o próprio `wanted`, os encaixes junto às bordas dos obstáculos (com o
 * vão `gap`) e as bordas da `area` (sem vão: a peça pode encostar nelas); vale só o que cabe na
 * área e é livre. O de menor distância vence e o primeiro empata. Com `area`, sem candidato válido
 * devolve `null`; sem `area` sempre há um (à direita de todos). Coordenadas inteiras.
 */
export function nearestFreeSpotIn(
  obstacles: readonly Rect[],
  width: number,
  height: number,
  wanted: { readonly x: number; readonly y: number },
  area: Rect | null,
  gap: number = PLACEMENT_GAP,
): { x: number; y: number } | null {
  const xs = spotAxis(
    wanted.x,
    width,
    gap,
    obstacles.map((o) => [o.x, right(o)] as const),
    area === null ? null : [area.x, right(area)],
  );
  const ys = spotAxis(
    wanted.y,
    height,
    gap,
    obstacles.map((o) => [o.y, bottom(o)] as const),
    area === null ? null : [area.y, bottom(area)],
  );
  let best: { x: number; y: number } | null = null;
  let bestDistance = Infinity;
  for (const x of xs) {
    const blocked = forbiddenYs(obstacles, x, width, height);
    for (const y of ys) {
      if (isBlocked(blocked, y)) continue;
      const distance = Math.hypot(x - wanted.x, y - wanted.y);
      if (distance < bestDistance) {
        best = { x, y };
        bestDistance = distance;
      }
    }
  }
  return best;
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
  return snapPlacement({ ...nearestFreeSpot(others, w, h, wanted), scale });
}

/**
 * O primeiro container com que a imagem, em `placement`, passaria a se sobrepor; `null` se
 * nenhum. É o "outro" do `image-overlap`.
 */
export function overlappingContainer(
  p: Project,
  containerId: string,
  placement: Placement,
): ProjectContainer | null {
  const image = findById(p.containers, containerId);
  const rect = imageCanvasRect(image, placement);
  return (
    p.containers.find(
      (other) =>
        other.id !== containerId &&
        rectsOverlap(rect, imageCanvasRect(other, other.placement)),
    ) ?? null
  );
}

function failOverlap(other: ProjectContainer): never {
  fail('image-overlap', undefined, { containerId: other.id });
}

/** Arquivos das imagens (o container sem arquivo não tem), na ordem das imagens. */
export function imageFileNames(
  images: readonly Pick<ProjectContainer, 'file'>[],
): string[] {
  const files: string[] = [];
  for (const image of images) if (image.file !== null) files.push(image.file);
  return files;
}

/** Arquivo do projeto na raiz da pasta/zip (app e servidor MCP). */
export const MAPPING_FILE = 'mapping.json';
/** Pasta das imagens, relativa à raiz do projeto (app e servidor MCP). */
export const IMAGES_DIR = 'images';

/**
 * Chave de comparação de nomes de arquivo: NFC e minúsculas. Em NTFS/APFS `Foto.jpg` e
 * `foto.jpg` são o mesmo arquivo, e o nome decomposto (`é` = `e` + acento) vira o composto
 * ao gravar; a unicidade dos nomes que a app e o MCP criam é decidida por esta chave. O nome
 * gravado mantém a caixa que veio.
 */
export function fileNameKey(path: string): string {
  return path.normalize('NFC').toLowerCase();
}

const sameFile = (a: string, b: string): boolean => fileNameKey(a) === fileNameKey(b);

/**
 * Nome livre em `images/`: `foto.jpg`, `foto-2.jpg`, `foto-3.jpg`… sem diferenciar maiúsculas
 * e minúsculas (`fileNameKey`). `taken` lista caminhos ocupados fora do projeto (arquivos já
 * existentes na pasta).
 */
export function uniqueImageFile(
  p: Project,
  fileName: string,
  taken: ReadonlySet<string> = new Set(),
): string {
  const used = new Set<string>();
  for (const path of taken) used.add(fileNameKey(path));
  for (const i of p.containers) if (i.file !== null) used.add(fileNameKey(i.file));
  const dot = fileName.lastIndexOf('.');
  const base = dot > 0 ? fileName.slice(0, dot) : fileName;
  const ext = dot > 0 ? fileName.slice(dot) : '';
  let candidate = `${IMAGES_DIR}/${fileName}`;
  for (let n = 2; used.has(fileNameKey(candidate)); n++) {
    candidate = `${IMAGES_DIR}/${base}-${n}${ext}`;
  }
  return candidate;
}

/**
 * Lugar e escala de um container novo ao lado de `besideId`: à direita dele (borda direita mais
 * `IMAGE_GAP`), com o topo alinhado e a mesma `scale`; ocupado, vai para o espaço livre mais
 * próximo, mantendo a escala. `besideId` inexistente falha com `not-found`.
 */
function placementBeside(
  p: Project,
  size: { readonly width: number; readonly height: number },
  besideId: string,
): Placement {
  const reference = p.containers.find((c) => c.id === besideId);
  if (!reference) fail('not-found', besideId);
  const { scale } = reference.placement;
  const referenceRect = imageCanvasRect(reference, reference.placement);
  const wanted = { x: right(referenceRect) + IMAGE_GAP, y: referenceRect.y };
  const obstacles = p.containers.map((c) => imageCanvasRect(c, c.placement));
  return snapPlacement({
    ...nearestFreeSpot(obstacles, size.width * scale, size.height * scale, wanted),
    scale,
  });
}

/** Escala e lugar de um container novo: ao lado de `beside`, perto de `center` ou à direita de todos. */
function newContainerPlacement(
  p: Project,
  size: { readonly width: number; readonly height: number },
  args: {
    readonly center?: { readonly x: number; readonly y: number };
    readonly beside?: string;
  },
): Placement {
  if (args.beside !== undefined) return placementBeside(p, size, args.beside);
  const scale = INITIAL_IMAGE_SIZE / Math.max(size.width, size.height);
  return args.center
    ? placementNear(p, size, scale, args.center)
    : placementAtRight(p, scale);
}

/**
 * Adiciona a imagem, com o lado maior medindo `INITIAL_IMAGE_SIZE` unidades do
 * canvas: perto de `center`, se informado; senão à direita da imagem mais à direita. Nasce
 * sem pai (`parentId: null`); o assentar decide se alguma marcação do canvas a contém.
 */
export function addContainer(
  p: Project,
  args: ImageFile & {
    readonly id: string;
    /** Onde o centro da imagem deve ficar (vai para o espaço livre mais próximo). */
    readonly center?: { readonly x: number; readonly y: number };
    /** Id de um container: o novo nasce à direita dele, com a mesma escala. */
    readonly beside?: string;
  },
  options?: SettleOptions,
): Project {
  if (idInUse(p, args.id)) fail('duplicate-id', args.id);
  checkDimensions(args);
  if (p.containers.some((i) => i.file !== null && sameFile(i.file, args.file))) {
    fail('duplicate-file');
  }
  const image: ProjectContainer = {
    id: args.id,
    name: null,
    parentId: null,
    markingColor: null,
    locked: false,
    source: null,
    file: args.file,
    background: null,
    width: args.width,
    height: args.height,
    placement: newContainerPlacement(p, args, args),
  };
  return settleFrom(p, { ...p, containers: [...p.containers, image] }, options);
}

/**
 * Adiciona um container sem arquivo (imagem sem arquivo, só com cor de fundo), com a mesma
 * colocação de `addContainer`: lado maior de `INITIAL_IMAGE_SIZE` unidades do canvas.
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
    /** Id de um container: o novo nasce à direita dele, com a mesma escala. */
    readonly beside?: string;
  },
  options?: SettleOptions,
): Project {
  if (idInUse(p, args.id)) fail('duplicate-id', args.id);
  checkBackgroundDimensions(args);
  const background = checkBackground(args.background);
  const name = normalizeOptionalName(args.name ?? null);
  const image: ProjectContainer = {
    id: args.id,
    name,
    parentId: null,
    markingColor: null,
    locked: false,
    source: null,
    file: null,
    background,
    width: args.width,
    height: args.height,
    placement: newContainerPlacement(p, args, args),
  };
  return settleFrom(p, { ...p, containers: [...p.containers, image] }, options);
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
  options?: SettleOptions,
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
    const overlap = overlappingContainer(
      {
        ...p,
        containers: updateById(p.containers, containerId, (i) => ({
          ...i,
          width,
          height,
        })),
      },
      containerId,
      image.placement,
    );
    if (overlap) failOverlap(overlap);
  }
  if (!resized && background === image.background) return p;
  return settleFrom(
    p,
    {
      ...p,
      containers: updateById(p.containers, containerId, (i) => ({
        ...i,
        width,
        height,
        background,
      })),
    },
    options,
  );
}

/** Nome de exibição da imagem; vazio vira `null` (a app mostra o nome do arquivo). */
export function renameContainer(
  p: Project,
  containerId: string,
  name: string | null,
): Project {
  const normalized = normalizeOptionalName(name);
  return {
    ...p,
    containers: updateById(p.containers, containerId, (i) => ({
      ...i,
      name: normalized,
    })),
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
  if (color !== null && !HEX_COLOR_RE.test(color)) fail('invalid-color');
  const normalized = color === null ? null : color.toUpperCase();
  return {
    ...p,
    containers: updateById(p.containers, containerId, (i) => ({
      ...i,
      markingColor: normalized,
    })),
  };
}

/**
 * Define posição e escala (mover ou redimensionar). Falha se sobrepor outra imagem ou se o
 * container (ou a marcação do canvas que o contém) estiver trancado. Assenta ao fim (salvo
 * `settle: false`, das prévias de gesto): o container entra ou sai de uma marcação do canvas,
 * e as marcações do canvas que passam a caber inteiras nele viram dele.
 */
export function setContainerPlacement(
  p: Project,
  containerId: string,
  placement: Placement,
  options?: SettleOptions,
): Project {
  checkPlacement(placement);
  requireUnlocked(canEditImagePlacement(p, containerId));
  // Única porta de escrita do `placement` por movimento: o ruído de ponto flutuante some aqui.
  const copy = snapPlacement(placement);
  const overlap = overlappingContainer(p, containerId, copy);
  if (overlap) failOverlap(overlap);
  // Placement igual ao de agora: nada mudou (arrasto sem efeito); devolve o mesmo projeto para
  // o gesto não gravar uma entrada de desfazer vazia.
  const current = findById(p.containers, containerId).placement;
  if (current.x === copy.x && current.y === copy.y && current.scale === copy.scale) {
    return p;
  }
  return settleFrom(
    p,
    {
      ...p,
      containers: updateById(p.containers, containerId, (i) => ({
        ...i,
        placement: copy,
      })),
    },
    options,
  );
}

export function moveContainer(
  p: Project,
  containerId: string,
  x: number,
  y: number,
  options?: SettleOptions,
): Project {
  const { placement } = findById(p.containers, containerId);
  return setContainerPlacement(p, containerId, { ...placement, x, y }, options);
}

/** Redimensionamento proporcional: nova escala com o canto (`x`, `y`) informado. */
export function resizeContainer(
  p: Project,
  containerId: string,
  placement: Placement,
  options?: SettleOptions,
): Project {
  return setContainerPlacement(p, containerId, placement, options);
}

export function containerDeletionImpact(
  p: Project,
  containerId: string,
): {
  markings: number;
  /** Quantas das marcações estão trancadas (serão excluídas junto). */
  lockedMarkings: number;
  /** Anotações que saem: as das marcações do container e as das setas presas a elas. */
  annotations: number;
  /** Setas presas a alguma marcação do container (como origem ou destino): saem junto. */
  arrows: number;
  brokenRefs: number;
} {
  findById(p.containers, containerId);
  const own = p.markings.filter((m) => m.containerId === containerId);
  const ids = new Set(own.map((m) => m.id));
  const arrowIds = arrowIdsAttachedTo(p, ids);
  return {
    markings: ids.size,
    lockedMarkings: own.filter((m) => m.locked).length,
    annotations: p.annotations.filter(
      (a) => ids.has(a.markingId) || arrowIds.has(a.markingId),
    ).length,
    arrows: arrowIds.size,
    brokenRefs: countBrokenRefs(p, cascadeRemoveImage(p, containerId)),
  };
}

/**
 * Exclui a imagem com as marcações (trancadas ou não), as setas presas a elas e as anotações de
 * tudo isso. Falha só se a própria imagem estiver trancada. As marcações do canvas ficam e o
 * assentar refaz o pertencimento.
 */
export function removeContainer(
  p: Project,
  containerId: string,
  options?: SettleOptions,
): Project {
  findById(p.containers, containerId);
  requireUnlocked(canDeleteImage(p, containerId));
  return settleFrom(p, cascadeRemoveImage(p, containerId), options);
}

/** A exclusão em si, sem a trava: também serve para contar o impacto. */
function cascadeRemoveImage(p: Project, containerId: string): Project {
  const ids = new Set(
    p.markings.filter((m) => m.containerId === containerId).map((m) => m.id),
  );
  return withoutArrows(
    {
      ...p,
      containers: p.containers.filter((i) => i.id !== containerId),
      markings: p.markings.filter((m) => !ids.has(m.id)),
      annotations: p.annotations.filter((a) => !ids.has(a.markingId)),
    },
    arrowIdsAttachedTo(p, ids),
  );
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

/** O retângulo reescalado de `from` para `to`, sem o mínimo (a proposta compara com ele). */
export function scaleRect(r: Rect, from: Size, to: Size): Rect {
  const [x, width] = scaleSpan(r.x, r.width, to.width / from.width);
  const [y, height] = scaleSpan(r.y, r.height, to.height / from.height);
  return { x, y, width, height };
}

/**
 * Garante o tamanho mínimo aumentando o lado pequeno em volta do centro, sem sair
 * de [min, max). O resultado sempre contém o intervalo original; se o mínimo não cabe,
 * o lado ocupa o intervalo inteiro.
 */
function growSpan(
  start: number,
  size: number,
  min: number,
  max: number,
  least: number,
): [number, number] {
  if (size >= least) return [start, size];
  if (least >= max - min) return [min, max - min];
  const grown = clamp(start - Math.floor((least - size) / 2), min, max - least);
  return [grown, least];
}

/**
 * Reescala cada marcação da imagem sozinha (bordas arredondadas, presa à imagem nova), sem
 * depender do pai: o pai é derivado da geometria, e o assentar refaz o pertencimento depois.
 * Na mesma escala o retângulo fica como está. O lado só cresce se a reescala o deixou abaixo do
 * mínimo efetivo da marcação (`minSizeOf`: o `minSize` do componente, ou 8 px numa marcação
 * comum); quem cresceu por isso deixou de ser proporcional e ganha `needsReview`.
 */
function rescaleMarkings(
  markings: readonly Marking[],
  image: ProjectContainer,
  next: ImageFile,
  needsReview: boolean,
  minSizeOf?: (markingId: string) => Size | null,
): Map<string, Marking> {
  const sx = next.width / image.width;
  const sy = next.height / image.height;
  const bounds = imagePixelRect(next);
  const result = new Map<string, Marking>();
  for (const m of markings) {
    if (sx === 1 && sy === 1) {
      result.set(m.id, { ...m, needsReview: needsReview || m.needsReview });
      continue;
    }
    const least = effectiveMinSize(minSizeOf?.(m.id) ?? null);
    const [x0, w0] = scaleSpan(m.rect.x, m.rect.width, sx);
    const [y0, h0] = scaleSpan(m.rect.y, m.rect.height, sy);
    const [x, width] = growSpan(x0, w0, bounds.x, right(bounds), least.width);
    const [y, height] = growSpan(y0, h0, bounds.y, bottom(bounds), least.height);
    const grew = width !== w0 || height !== h0;
    result.set(m.id, {
      ...m,
      rect: { x, y, width, height },
      needsReview: needsReview || grew || m.needsReview,
    });
  }
  return result;
}

export interface ReplaceContainerOptions extends SettleOptions {
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
  if (
    p.containers.some(
      (i) => i.id !== containerId && i.file !== null && sameFile(i.file, next.file),
    )
  )
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
  const rescaled = rescaleMarkings(own, image, next, !sameAspect, options.minSizeOf);

  const scale = (image.placement.scale * image.width) / next.width;
  let placement: Placement = snapPlacement({ ...image.placement, scale });
  const candidate = imageCanvasRect(next, placement);
  const overlaps = p.containers.some(
    (o) =>
      o.id !== containerId && rectsOverlap(candidate, imageCanvasRect(o, o.placement)),
  );
  if (overlaps) {
    placement = placementAtRight(p, scale, containerId);
  }

  // A troca pode mover a imagem no canvas (escala e lugar): trava de cima também impede.
  requireUnlocked(canReplaceImage(p, containerId, { ...next, placement }));

  const ownIds = new Set(own.map((m) => m.id));
  const sx = next.width / image.width;
  const sy = next.height / image.height;
  // Seta com as duas pontas neste container: os pontos de passagem estão em pixels dele e
  // acompanham a imagem nova (a rota sobrevive à troca; com a mesma resolução nada muda).
  const arrows =
    sx === 1 && sy === 1
      ? p.arrows
      : p.arrows.map((a) =>
          a.points.length > 0 && ownIds.has(a.from) && ownIds.has(a.to)
            ? {
                ...a,
                points: a.points.map((pt) => ({ x: pt.x * sx, y: pt.y * sy })),
              }
            : a,
        );

  const updated: ProjectContainer = {
    ...image,
    file: next.file,
    background: null,
    width: next.width,
    height: next.height,
    placement,
  };
  return settleFrom(
    p,
    {
      ...p,
      containers: p.containers.map((i) => (i.id === containerId ? updated : i)),
      markings: p.markings.map((m) => rescaled.get(m.id) ?? m),
      arrows,
    },
    options,
  );
}
