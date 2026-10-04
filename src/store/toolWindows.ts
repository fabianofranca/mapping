import { signal, type ReadonlySignal } from '@preact/signals';
import { tokenValue } from '../theme/tokens';
import { readSetting, writeSetting } from '../utils/safeStorage';

// Janelas de ferramenta do desktop (docs/redesign/HANDOFF.md, B1 e B2): quais estão
// abertas, qual é a aba da janela inferior e o tamanho de cada lado. É estado de UI,
// por dispositivo: fica no `localStorage` (com try/catch, em `safeStorage`), nunca no
// `mapping.json` nem no histórico de desfazer.

/**
 * Janelas disponíveis. Camadas (esquerda) entra na fase R6, que só acrescenta o id
 * nesta lista. A janela inferior tem uma aba por janela: Lista, Incompletas e Diagnóstico.
 */
export const TOOL_WINDOWS = [
  'tree',
  'details',
  'list',
  'incomplete',
  'diagnostics',
] as const;

export type ToolWindowId = (typeof TOOL_WINDOWS)[number];

export type ToolWindowSide = 'left' | 'right' | 'bottom';

/** Lado de cada janela: esquerda e direita são colunas; a inferior tem abas. */
export const WINDOW_SIDE: Readonly<Record<ToolWindowId, ToolWindowSide>> = {
  tree: 'left',
  details: 'right',
  list: 'bottom',
  incomplete: 'bottom',
  diagnostics: 'bottom',
};

/**
 * Número do atalho de cada janela (Ctrl+Shift+N, e Alt+N onde o navegador deixa).
 * A numeração é a da seção Atalhos do DS 2.0, com o buraco da janela que chega
 * na fase R6: Camadas é a 2.
 */
export const WINDOW_NUMBER: Readonly<Record<ToolWindowId, number>> = {
  tree: 1,
  details: 3,
  list: 4,
  incomplete: 5,
  diagnostics: 6,
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

/** Passo do Ctrl+Shift+setas (B2). */
export const RESIZE_STEP = 16;

/** Espaço disponível para as janelas: o corpo do editor, sem as faixas. */
export interface LayoutSpace {
  readonly width: number;
  readonly height: number;
  /** Largura da outra janela lateral aberta (0 se ela estiver recolhida). */
  readonly otherWidth: number;
}

const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);

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

/** Abertas por padrão: Árvore e Detalhes (a Lista abre pela faixa). */
const DEFAULT_OPEN: readonly ToolWindowId[] = ['tree', 'details'];

const stored = readStored();
/** Havia layout guardado: o desktop compacto não mexe no que o usuário escolheu. */
const hadStored = readSetting(KEY) !== null;

const openIds = signal<ReadonlySet<ToolWindowId>>(
  new Set(stored.open?.filter(isToolWindow) ?? DEFAULT_OPEN),
);

const sizes = signal<Readonly<Record<ToolWindowSide, number>>>({
  left: storedSize(stored.left, 'left'),
  right: storedSize(stored.right, 'right'),
  bottom: storedSize(stored.bottom, 'bottom'),
});

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

/** Janela visível de um lado (a inferior respeita a aba ativa); `null` se recolhido. */
export function openWindowOf(side: ToolWindowSide): ToolWindowId | null {
  const open = openToolWindows.value;
  if (side === 'bottom') {
    const tab = bottomToolWindow.value;
    return open.has(tab) ? tab : null;
  }
  return TOOL_WINDOWS.find((id) => WINDOW_SIDE[id] === side && open.has(id)) ?? null;
}

/** A janela está visível (e, na inferior, é a aba ativa). */
export function isToolWindowOpen(id: ToolWindowId): boolean {
  return openWindowOf(WINDOW_SIDE[id]) === id;
}

/** Largura que cada lateral ocupa agora (0 quando recolhida). */
export function sideWidth(side: 'left' | 'right'): number {
  return openWindowOf(side) ? toolWindowSizes.value[side] : 0;
}

function persist(): void {
  writeSetting(
    KEY,
    JSON.stringify({
      open: [...openIds.value],
      bottomTab: bottomTab.value,
      ...sizes.value,
    } satisfies StoredLayout),
  );
}

export function showToolWindow(id: ToolWindowId): void {
  const side = WINDOW_SIDE[id];
  if (side === 'bottom') bottomTab.value = id;
  const next = new Set(openIds.value);
  // Um lado mostra uma janela por vez (a divisória entre Árvore e Camadas vem na R6).
  for (const other of next) if (WINDOW_SIDE[other] === side) next.delete(other);
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

/** Duplo clique na divisória: volta ao tamanho padrão do lado. */
export function resetToolWindowSize(side: ToolWindowSide, space: LayoutSpace): void {
  resizeToolWindow(side, WINDOW_LIMITS[side].default, space);
}

/**
 * Desktop compacto (abaixo de 1200px): Detalhes começa recolhido (B2). Só na
 * primeira visita; depois vale o layout guardado.
 */
export function collapseDetailsOnCompact(): void {
  if (hadStored) return;
  hideToolWindow('details');
}
