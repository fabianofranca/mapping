/**
 * Laboratório "Componentes": o quadro (canvas) com várias telas. A posição de cada tela no
 * quadro fica aqui, fora da `Screen`: o formato da tela (`*.screen.json`) não muda.
 * Funções puras e imutáveis, sem DOM.
 */
import type { Box, Instance, Screen } from './screen';

export interface PlacedScreen {
  readonly screen: Screen;
  readonly x: number;
  readonly y: number;
}

export interface Board {
  readonly screens: readonly PlacedScreen[];
}

/** Espaço entre telas vizinhas no quadro, em px. */
export const SCREEN_GAP = 80;

export function newBoard(screen: Screen): Board {
  return { screens: [{ screen, x: 0, y: 0 }] };
}

/** Acrescenta a tela à direita da tela mais à direita; quadro vazio: em (0, 0). */
export function addScreen(board: Board, screen: Screen): Board {
  const x =
    board.screens.length === 0
      ? 0
      : Math.max(...board.screens.map((p) => p.x + p.screen.width)) + SCREEN_GAP;
  return { screens: [...board.screens, { screen, x, y: 0 }] };
}

/** Troca a tela de mesmo id (a posição fica); o mesmo objeto devolve o próprio quadro. */
export function replaceScreen(board: Board, screen: Screen): Board {
  let changed = false;
  const screens = board.screens.map((placed) => {
    if (placed.screen.id !== screen.id || placed.screen === screen) return placed;
    changed = true;
    return { ...placed, screen };
  });
  return changed ? { screens } : board;
}

export function moveScreen(board: Board, id: string, x: number, y: number): Board {
  const nx = Math.round(x);
  const ny = Math.round(y);
  let changed = false;
  const screens = board.screens.map((placed) => {
    if (placed.screen.id !== id || (placed.x === nx && placed.y === ny)) return placed;
    changed = true;
    return { ...placed, x: nx, y: ny };
  });
  return changed ? { screens } : board;
}

/** Remove a tela; a única tela do quadro não sai. */
export function removeScreen(board: Board, id: string): Board {
  if (board.screens.length <= 1) return board;
  const screens = board.screens.filter((p) => p.screen.id !== id);
  return screens.length === board.screens.length ? board : { screens };
}

/** Cópia da tela com id novo e ids novos nas instâncias (o `parentId` acompanha). */
export function cloneScreen(screen: Screen, name: string): Screen {
  const ids = new Map(screen.instances.map((i) => [i.id, crypto.randomUUID()]));
  const instances: Instance[] = screen.instances.map((i) => {
    const { parentId, ...rest } = i;
    const parent = parentId === undefined ? undefined : ids.get(parentId);
    return {
      ...rest,
      id: ids.get(i.id) ?? crypto.randomUUID(),
      ...(parent !== undefined ? { parentId: parent } : {}),
    };
  });
  return { ...screen, id: crypto.randomUUID(), name, instances };
}

export function duplicateScreen(board: Board, id: string): Board {
  const placed = findScreen(board, id);
  if (!placed) return board;
  return addScreen(board, cloneScreen(placed.screen, `${placed.screen.name} (cópia)`));
}

export function findScreen(board: Board, id: string): PlacedScreen | undefined {
  return board.screens.find((p) => p.screen.id === id);
}

export function screenOfInstance(
  board: Board,
  instanceId: string,
): PlacedScreen | undefined {
  return board.screens.find((p) => p.screen.instances.some((i) => i.id === instanceId));
}

/** União dos retângulos das telas no quadro (quadro vazio: 0, 0, 1, 1). */
export function boardBounds(board: Board): Box {
  if (board.screens.length === 0) return { x: 0, y: 0, width: 1, height: 1 };
  const left = Math.min(...board.screens.map((p) => p.x));
  const top = Math.min(...board.screens.map((p) => p.y));
  const right = Math.max(...board.screens.map((p) => p.x + p.screen.width));
  const bottom = Math.max(...board.screens.map((p) => p.y + p.screen.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}
