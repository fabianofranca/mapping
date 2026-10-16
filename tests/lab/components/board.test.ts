// Laboratório Componentes: o quadro com várias telas é imutável; a posição fica fora da tela.
import { describe, expect, it } from 'vitest';
import {
  SCREEN_GAP,
  addScreen,
  boardBounds,
  duplicateScreen,
  findScreen,
  moveScreen,
  newBoard,
  removeScreen,
  replaceScreen,
  screenOfInstance,
} from '../../../lab/components/board';
import { addInstance, newScreen, setParent } from '../../../lab/components/screen';

function withInstances() {
  let s = newScreen('Entrar', 390, 844);
  s = addInstance(s, {
    typeId: 'card',
    box: { x: 10, y: 10, width: 100, height: 100 },
    values: {},
  });
  const parent = s.instances[0];
  s = addInstance(s, {
    typeId: 'button',
    box: { x: 20, y: 20, width: 50, height: 20 },
    values: { label: 'OK' },
  });
  const child = s.instances[1];
  if (!parent || !child) throw new Error('setup');
  return setParent(s, child.id, parent.id);
}

describe('board', () => {
  it('começa com uma tela em (0, 0)', () => {
    const screen = newScreen('A', 100, 200);
    const board = newBoard(screen);
    expect(board.screens).toEqual([{ screen, x: 0, y: 0 }]);
  });

  it('adiciona à direita da tela mais à direita, com o espaço entre elas', () => {
    const a = newScreen('A', 100, 200);
    const b = newScreen('B', 300, 50);
    const c = newScreen('C', 10, 10);
    const one = newBoard(a);
    const two = addScreen(one, b);
    const three = addScreen(two, c);
    expect(two.screens[1]).toMatchObject({ x: 100 + SCREEN_GAP, y: 0 });
    expect(three.screens[2]).toMatchObject({ x: 100 + SCREEN_GAP + 300 + SCREEN_GAP });
    expect(addScreen({ screens: [] }, a).screens[0]).toMatchObject({ x: 0, y: 0 });
    // O quadro anterior não muda.
    expect(one.screens).toHaveLength(1);
    expect(two.screens).toHaveLength(2);
  });

  it('replaceScreen troca a tela de mesmo id e preserva a identidade quando nada muda', () => {
    const a = newScreen('A', 100, 200);
    const board = addScreen(newBoard(a), newScreen('B', 50, 50));
    expect(replaceScreen(board, a)).toBe(board);
    const renamed = { ...a, name: 'A2' };
    const next = replaceScreen(board, renamed);
    expect(next).not.toBe(board);
    expect(next.screens[0]?.screen).toBe(renamed);
    expect(next.screens[1]).toBe(board.screens[1]);
    expect(board.screens[0]?.screen).toBe(a);
    // Id desconhecido: nada muda.
    expect(replaceScreen(board, newScreen('Z', 1, 1))).toBe(board);
  });

  it('moveScreen arredonda a posição e não muda o quadro anterior', () => {
    const a = newScreen('A', 100, 200);
    const board = newBoard(a);
    const moved = moveScreen(board, a.id, 12.6, -3.4);
    expect(moved.screens[0]).toMatchObject({ x: 13, y: -3 });
    expect(board.screens[0]).toMatchObject({ x: 0, y: 0 });
    expect(moveScreen(moved, a.id, 13.2, -3.1)).toBe(moved);
    expect(moveScreen(board, 'nada', 5, 5)).toBe(board);
  });

  it('removeScreen tira a tela, mas nunca a última', () => {
    const a = newScreen('A', 100, 200);
    const b = newScreen('B', 100, 200);
    const board = addScreen(newBoard(a), b);
    const without = removeScreen(board, a.id);
    expect(without.screens.map((p) => p.screen.id)).toEqual([b.id]);
    expect(board.screens).toHaveLength(2);
    expect(removeScreen(without, b.id)).toBe(without);
    expect(removeScreen(board, 'nada')).toBe(board);
  });

  it('duplicateScreen cria ids novos, remapeia o pai e põe a cópia à direita', () => {
    const original = withInstances();
    const board = newBoard(original);
    const next = duplicateScreen(board, original.id);
    expect(next.screens).toHaveLength(2);
    const copy = next.screens[1];
    if (!copy) throw new Error('sem cópia');
    expect(copy.screen.name).toBe('Entrar (cópia)');
    expect(copy.screen.id).not.toBe(original.id);
    expect(copy.x).toBe(390 + SCREEN_GAP);
    expect(copy.y).toBe(0);
    const [parent, child] = copy.screen.instances;
    if (!parent || !child) throw new Error('sem instâncias');
    const originalIds = original.instances.map((i) => i.id);
    expect(originalIds).not.toContain(parent.id);
    expect(originalIds).not.toContain(child.id);
    expect(child.parentId).toBe(parent.id);
    expect(parent.parentId).toBeUndefined();
    expect(child.box).toEqual(original.instances[1]?.box);
    expect(child.values).toEqual({ label: 'OK' });
    // O original fica como estava.
    expect(next.screens[0]?.screen).toBe(original);
    expect(duplicateScreen(board, 'nada')).toBe(board);
  });

  it('findScreen e screenOfInstance procuram pelo id', () => {
    const a = withInstances();
    const b = newScreen('B', 10, 10);
    const board = addScreen(newBoard(a), b);
    const inst = a.instances[1];
    if (!inst) throw new Error('setup');
    expect(findScreen(board, b.id)?.screen).toBe(b);
    expect(findScreen(board, 'nada')).toBeUndefined();
    expect(screenOfInstance(board, inst.id)?.screen).toBe(a);
    expect(screenOfInstance(board, 'nada')).toBeUndefined();
  });

  it('boardBounds une os retângulos das telas', () => {
    expect(boardBounds({ screens: [] })).toEqual({ x: 0, y: 0, width: 1, height: 1 });
    const a = newScreen('A', 100, 200);
    const b = newScreen('B', 300, 50);
    const board = moveScreen(addScreen(newBoard(a), b), b.id, 500, -40);
    expect(boardBounds(board)).toEqual({ x: 0, y: -40, width: 800, height: 240 });
    expect(boardBounds(newBoard(a))).toEqual({ x: 0, y: 0, width: 100, height: 200 });
  });
});
