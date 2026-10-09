import { signal, type ReadonlySignal } from '@preact/signals';
import { tokenValue } from '../theme/tokens';
import { readSetting, writeSetting } from '../utils/safeStorage';

// Janelas de ferramenta do desktop (docs/redesign/HANDOFF.md, B1 e B2): quais estão
// abertas, qual é a aba da janela inferior e o tamanho de cada lado. É estado de UI,
// por dispositivo: fica no `localStorage` (com try/catch, em `safeStorage`), nunca no
// `mapping.json` nem no histórico de desfazer.

/**
 * Janelas disponíveis. A janela inferior tem uma aba por janela: Lista, Incompletas,
 * Diagnóstico e Propostas (etapa 4).
 */
export const TOOL_WINDOWS = [
  'tree',
  'layers',
  'details',
  'list',
  'incomplete',
  'diagnostics',
  'proposals',
] as const;

export type ToolWindowId = (typeof TOOL_WINDOWS)[number];

export type ToolWindowSide = 'left' | 'right' | 'bottom';

/** Lado de cada janela: esquerda e direita são colunas; a inferior tem abas. */
export const WINDOW_SIDE: Readonly<Record<ToolWindowId, ToolWindowSide>> = {
  tree: 'left',
  layers: 'left',
  details: 'right',
  list: 'bottom',
  incomplete: 'bottom',
  diagnostics: 'bottom',
  proposals: 'bottom',
};

/**
 * Número do atalho de cada janela (Ctrl+Shift+N, e Alt+N onde o navegador deixa).
 * A numeração é a da seção Atalhos do DS 2.0: Árvore 1, Camadas 2, Detalhes 3, e na
 * janela inferior Lista 4, Incompletas 5, Diagnóstico 6 e Propostas 7.
 */
export const WINDOW_NUMBER: Readonly<Record<ToolWindowId, number>> = {
  tree: 1,
  layers: 2,
  details: 3,
  list: 4,
  incomplete: 5,
  diagnostics: 6,
  proposals: 7,
};

/** Janela do atalho Ctrl+Shift+N (`null` se o número não tem janela ainda). */
export function toolWindowByNumber(n: number): ToolWindowId | null {
  return TOOL_WINDOWS.find((id) => WINDOW_NUMBER[id] === n) ?? null;
}

/** Número de um token de comprimento (`--size-tw-left: 264px` → 264). */
function px(token: string): number {
  return Number.parseInt(tokenValue(token, 'light'), 10);
}

/** Largura mínima do canvas: as laterais nunca a invadem (`--size-canvas-min`). */
const CANVAS_MIN = px('size-canvas-min');

/** Padrão e limites de cada lado (seção Layouts do DS 2.0). */
export const WINDOW_LIMITS: Readonly<
  Record<
    ToolWindowSide,
    { readonly default: number; readonly min: number; readonly max: number }
  >
> = {
  left: { default: px('size-tw-left'), min: 200, max: 480 },
  right: { default: px('size-tw-right'), min: 280, max: 560 },
  // A janela inferior vai até 60% da altura do corpo do editor (`maxFraction` abaixo).
  bottom: { default: px('size-tw-bottom'), min: 120, max: Number.POSITIVE_INFINITY },
};

const BOTTOM_MAX_FRACTION = 0.6;

const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);

/** Altura mínima de cada janela da coluna da esquerda quando Árvore e Camadas dividem. */
const SPLIT_MIN = 96;

/**
 * Altura da janela Camadas quando está empilhada embaixo da Árvore: nenhuma das duas
 * fica abaixo de `SPLIT_MIN` (nem passa do espaço da coluna). Função pura.
 */
export function clampLayersHeight(size: number, columnHeight: number): number {
  const max = Math.max(SPLIT_MIN, columnHeight - SPLIT_MIN);
  return clamp(size, SPLIT_MIN, max);
}

/** Passo do Ctrl+Shift+setas (B2). */
export const RESIZE_STEP = 16;

/** Espaço disponível para as janelas: o corpo do editor, sem as faixas. */
export interface LayoutSpace {
  readonly width: number;
  readonly height: number;
  /** Largura da outra janela lateral aberta (0 se ela estiver recolhida). */
  readonly otherWidth: number;
}

/**
 * Tamanho válido para a janela: entre o mínimo e o máximo do lado, sem deixar o
 * canvas abaixo de `--size-canvas-min` (laterais) nem passar de 60% da altura
 * (inferior). Função pura: `tests/store/toolWindows.test.ts` cobre os limites.
 */
export function clampWindowSize(
  side: ToolWindowSide,
  size: number,
  space: LayoutSpace,
): number {
  const { min, max } = WINDOW_LIMITS[side];
  const room =
    side === 'bottom'
      ? space.height * BOTTOM_MAX_FRACTION
      : space.width - space.otherWidth - CANVAS_MIN;
  return clamp(size, min, Math.max(min, Math.min(max, room)));
}

interface StoredLayout {
  readonly open?: readonly string[];
  readonly bottomTab?: string;
  readonly left?: number;
  readonly right?: number;
  readonly bottom?: number;
  /** Altura da janela inferior em modo revisão (guardada à parte da normal). */
  readonly bottomReview?: number;
  readonly layersHeight?: number;
}

const KEY = 'mapping.toolWindows';

function isToolWindow(value: unknown): value is ToolWindowId {
  return TOOL_WINDOWS.some((id) => id === value);
}

function readStored(): StoredLayout {
  const text = readSetting(KEY);
  if (text === null) return {};
  try {
    const parsed: unknown = JSON.parse(text);
    return parsed !== null && typeof parsed === 'object' ? (parsed as StoredLayout) : {};
  } catch {
    // Valor corrompido: vale o padrão.
    return {};
  }
}

function storedSize(value: unknown, side: ToolWindowSide): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : WINDOW_LIMITS[side].default;
}

/** Abertas por padrão: Árvore, Camadas e Detalhes (a Lista abre pela faixa). */
const DEFAULT_OPEN: readonly ToolWindowId[] = ['tree', 'layers', 'details'];

const stored = readStored();
/** Havia layout guardado: o desktop compacto não mexe no que o usuário escolheu. */
const hadStored = readSetting(KEY) !== null;

const openIds = signal<ReadonlySet<ToolWindowId>>(
  new Set(stored.open?.filter(isToolWindow) ?? DEFAULT_OPEN),
);

/** Altura inicial da janela inferior em modo revisão (`--size-tw-bottom-review`). */
export const REVIEW_BOTTOM_DEFAULT = px('size-tw-bottom-review');

/**
 * A janela inferior tem duas alturas guardadas: a normal e a do modo revisão, que começa
 * maior (filtros, cerca de nove linhas e o rodapé de atalhos). `sizes.bottom` é a da vez.
 */
let bottomHeights = {
  normal: storedSize(stored.bottom, 'bottom'),
  review:
    typeof stored.bottomReview === 'number' &&
    Number.isFinite(stored.bottomReview) &&
    stored.bottomReview > 0
      ? stored.bottomReview
      : REVIEW_BOTTOM_DEFAULT,
};
let reviewLayout = false;

const sizes = signal<Readonly<Record<ToolWindowSide, number>>>({
  left: storedSize(stored.left, 'left'),
  right: storedSize(stored.right, 'right'),
  bottom: bottomHeights.normal,
});

/** Altura da janela Camadas quando ela divide a coluna da esquerda com a Árvore. */
const layersSplit = signal<number>(
  typeof stored.layersHeight === 'number' &&
    Number.isFinite(stored.layersHeight) &&
    stored.layersHeight > 0
    ? stored.layersHeight
    : px('size-tw-layers'),
);

/** Aba ativa da janela inferior (uma por vez, como numa IDE). */
const bottomTab = signal<ToolWindowId>(
  isToolWindow(stored.bottomTab) && WINDOW_SIDE[stored.bottomTab] === 'bottom'
    ? stored.bottomTab
    : 'list',
);

export const openToolWindows: ReadonlySignal<ReadonlySet<ToolWindowId>> = openIds;
export const toolWindowSizes: ReadonlySignal<Readonly<Record<ToolWindowSide, number>>> =
  sizes;
export const bottomToolWindow: ReadonlySignal<ToolWindowId> = bottomTab;
export const layersWindowHeight: ReadonlySignal<number> = layersSplit;

/**
 * Janelas visíveis de um lado, na ordem das janelas. A esquerda empilha Árvore e
 * Camadas; a direita tem uma só; a inferior mostra a aba ativa.
 */
export function openWindowsOf(side: ToolWindowSide): readonly ToolWindowId[] {
  const open = openToolWindows.value;
  if (side === 'bottom') {
    const tab = bottomToolWindow.value;
    return open.has(tab) ? [tab] : [];
  }
  return TOOL_WINDOWS.filter((id) => WINDOW_SIDE[id] === side && open.has(id));
}

/** Primeira janela visível de um lado; `null` se o lado está recolhido. */
export function openWindowOf(side: ToolWindowSide): ToolWindowId | null {
  return openWindowsOf(side)[0] ?? null;
}

/** A janela está visível (e, na inferior, é a aba ativa). */
export function isToolWindowOpen(id: ToolWindowId): boolean {
  return openWindowsOf(WINDOW_SIDE[id]).includes(id);
}

/** Largura que cada lateral ocupa agora (0 quando recolhida). */
export function sideWidth(side: 'left' | 'right'): number {
  return openWindowOf(side) ? toolWindowSizes.value[side] : 0;
}

function persist(): void {
  bottomHeights = reviewLayout
    ? { ...bottomHeights, review: sizes.value.bottom }
    : { ...bottomHeights, normal: sizes.value.bottom };
  writeSetting(
    KEY,
    JSON.stringify({
      open: [...openIds.value],
      bottomTab: bottomTab.value,
      left: sizes.value.left,
      right: sizes.value.right,
      bottom: bottomHeights.normal,
      bottomReview: bottomHeights.review,
      layersHeight: layersSplit.value,
    } satisfies StoredLayout),
  );
}

/**
 * Entra ou sai do layout da revisão: a janela inferior troca para a altura guardada do
 * modo (a da revisão começa em `size-tw-bottom-review`). Redimensionar depois grava na
 * altura do modo atual.
 */
export function setReviewLayout(on: boolean): void {
  if (reviewLayout === on) return;
  reviewLayout = on;
  sizes.value = {
    ...sizes.value,
    bottom: on ? bottomHeights.review : bottomHeights.normal,
  };
}

export function showToolWindow(id: ToolWindowId): void {
  const side = WINDOW_SIDE[id];
  if (side === 'bottom') bottomTab.value = id;
  const next = new Set(openIds.value);
  // A esquerda empilha Árvore e Camadas; os outros lados mostram uma janela por vez.
  if (side !== 'left') {
    for (const other of next) if (WINDOW_SIDE[other] === side) next.delete(other);
  }
  next.add(id);
  openIds.value = next;
  persist();
}

export function hideToolWindow(id: ToolWindowId): void {
  if (!openIds.value.has(id)) return;
  const next = new Set(openIds.value);
  next.delete(id);
  openIds.value = next;
  persist();
}

/** Clique na faixa (ou atalho): abre, troca de aba ou esconde a janela visível. */
export function toggleToolWindow(id: ToolWindowId): void {
  if (isToolWindowOpen(id)) hideToolWindow(id);
  else showToolWindow(id);
}

/** Grava o tamanho do lado, já limitado ao espaço disponível. */
export function resizeToolWindow(
  side: ToolWindowSide,
  size: number,
  space: LayoutSpace,
): void {
  const next = clampWindowSize(side, size, space);
  if (next === sizes.value[side]) return;
  sizes.value = { ...sizes.value, [side]: next };
  persist();
}

/** Grava a altura da janela Camadas, limitada ao espaço da coluna da esquerda. */
export function resizeLayersWindow(size: number, columnHeight: number): void {
  const next = clampLayersHeight(size, columnHeight);
  if (next === layersSplit.value) return;
  layersSplit.value = next;
  persist();
}

/** Duplo clique na divisória entre Árvore e Camadas: volta à altura padrão. */
export function resetLayersWindowHeight(columnHeight: number): void {
  resizeLayersWindow(px('size-tw-layers'), columnHeight);
}

/** Duplo clique na divisória: volta ao tamanho padrão do lado (o da revisão, nela). */
export function resetToolWindowSize(side: ToolWindowSide, space: LayoutSpace): void {
  const size =
    side === 'bottom' && reviewLayout
      ? REVIEW_BOTTOM_DEFAULT
      : WINDOW_LIMITS[side].default;
  resizeToolWindow(side, size, space);
}

/**
 * Desktop compacto (abaixo de 1200px): Detalhes começa recolhido (B2). Só na
 * primeira visita; depois vale o layout guardado.
 */
export function collapseDetailsOnCompact(): void {
  if (hadStored) return;
  hideToolWindow('details');
}
