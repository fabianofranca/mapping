import { describe, expect, it } from 'vitest';
import {
  addAnnotation,
  canDeleteItems,
  containerDeletionImpact,
  itemsDeletionImpact,
  markingDeletionImpact,
  moveItems,
  moveMarking,
  movingItems,
  removeContainer,
  removeItems,
  removeMarking,
  replaceContainer,
  setArrowLocked,
  setArrowRoute,
  setItemsLocked,
  setMarkingFloating,
  setMarkingLocked,
  validateProject,
  type ItemRef,
  type Project,
} from '../../src/model';
import { arrowProject, withArrow } from './arrowFixtures';
import { expectValid } from './fixtures';

// A cascata das setas: apagar uma marcação, um container ou uma seleção leva as setas presas e as
// anotações delas, e a contagem entra no impacto. Fixture: tests/model/arrowFixtures.ts.

const mark = (id: string): ItemRef => ({ kind: 'marking', id });
const img = (id: string): ItemRef => ({ kind: 'image', id });
const arr = (id: string): ItemRef => ({ kind: 'arrow', id });
const ids = (list: readonly { id: string }[]) => list.map((x) => x.id);

/**
 * `arrowProject` (r1: a1 → a3, com ra1 e ra2) mais r2: b1 → a1 (chega em a1), r3: a2 → b1 (sai de
 * uma descendente de a1) e r4: c1 → b1 (longe de A), uma anotação em cada seta de fora de r1 e uma
 * em a1.
 */
function cascadeProject(): Project {
  let p = arrowProject();
  p = withArrow(p, 'r2', 'b1', 'a1');
  p = withArrow(p, 'r3', 'a2', 'b1');
  p = withArrow(p, 'r4', 'c1', 'b1');
  p = addAnnotation(p, { id: 'rb', markingId: 'r2', layerId: 'L1' });
  p = addAnnotation(p, { id: 'rc', markingId: 'r4', layerId: 'L1' });
  return addAnnotation(p, { id: 'ma', markingId: 'a1', layerId: 'L1' });
}

describe('apagar marcação', () => {
  it('leva as setas presas à marcação e às descendentes dela, e as anotações das setas', () => {
    const p = cascadeProject();
    expect(markingDeletionImpact(p, 'a1')).toEqual({
      descendants: 1,
      lockedDescendants: 0,
      // ma (a1) + ra1, ra2 (r1) + rb (r2); r3 não tem anotação.
      annotations: 4,
      containers: 0,
      arrows: 3,
      brokenRefs: 0,
    });
    const next = expectValid(removeMarking(p, 'a1'));
    expect(ids(next.arrows)).toEqual(['r4']);
    expect(ids(next.annotations)).toEqual(['rc']);
    expect(next.markings.some((m) => m.id === 'a2')).toBe(false);
  });

  it('a descendente também leva as dela', () => {
    const p = cascadeProject();
    const next = expectValid(removeMarking(p, 'a2'));
    expect(ids(next.arrows)).toEqual(['r1', 'r2', 'r4']);
    expect(markingDeletionImpact(p, 'a2').arrows).toBe(1);
  });

  it('uma marcação sem seta tem impacto zero e as setas ficam como estão', () => {
    const p = cascadeProject();
    expect(markingDeletionImpact(p, 'e1').arrows).toBe(0);
    expect(removeMarking(p, 'e1').arrows).toBe(p.arrows);
  });

  it('a trava da seta não impede apagar a marcação; a da marcação impede', () => {
    let p = cascadeProject();
    p = setArrowLocked(p, 'r1', true);
    expect(ids(removeMarking(p, 'a3').arrows)).toEqual(['r2', 'r3', 'r4']);
    p = setMarkingLocked(p, 'a3', true);
    expect(() => removeMarking(p, 'a3')).toThrow('locked');
  });

  it('a seta que liga duas marcações que saem conta uma vez', () => {
    // r1 liga a1 e a3; excluir a1 e a3 juntos (removeItems) não conta r1 duas vezes.
    const p = cascadeProject();
    const impact = itemsDeletionImpact(p, [mark('a1'), mark('a3')]);
    expect(impact.arrows).toBe(3);
  });
});

describe('apagar container', () => {
  it('leva as setas das marcações dele, mesmo as que chegam de fora, e as anotações delas', () => {
    const p = cascadeProject();
    expect(containerDeletionImpact(p, 'A')).toEqual({
      markings: 3,
      lockedMarkings: 0,
      annotations: 4,
      arrows: 3,
      brokenRefs: 0,
    });
    const next = expectValid(removeContainer(p, 'A'));
    expect(ids(next.arrows)).toEqual(['r4']);
    expect(ids(next.annotations)).toEqual(['rc']);
  });

  it('um container sem marcação com seta não tira nenhuma', () => {
    const p = cascadeProject();
    expect(containerDeletionImpact(p, 'D').arrows).toBe(0);
    expect(removeContainer(p, 'D').arrows).toBe(p.arrows);
  });
});

describe('seleção múltipla com setas', () => {
  it('excluir uma seta selecionada leva as anotações dela e nada mais', () => {
    const p = cascadeProject();
    expect(itemsDeletionImpact(p, [arr('r4')])).toEqual({
      markings: 0,
      containers: 0,
      arrows: 1,
      annotations: 1,
      lockedMarkings: 0,
      containersStay: 0,
      brokenRefs: 0,
    });
    const next = expectValid(removeItems(p, [arr('r4')]));
    expect(ids(next.arrows)).toEqual(['r1', 'r2', 'r3']);
    expect(ids(next.annotations)).toEqual(['ra1', 'ra2', 'rb', 'ma']);
    expect(next.markings).toEqual(p.markings);
  });

  it('seta selecionada e marcação dela selecionada: conta uma vez', () => {
    const p = cascadeProject();
    const impact = itemsDeletionImpact(p, [mark('a1'), arr('r1'), arr('r4')]);
    expect(impact).toMatchObject({ markings: 2, arrows: 4, annotations: 5 });
    const next = expectValid(removeItems(p, [mark('a1'), arr('r1'), arr('r4')]));
    expect(next.arrows).toEqual([]);
    expect(next.annotations).toEqual([]);
  });

  it('o container e a seta que chega a ele de fora saem juntos', () => {
    const p = cascadeProject();
    const next = expectValid(removeItems(p, [img('A')]));
    expect(ids(next.arrows)).toEqual(['r4']);
  });

  it('seta trancada selecionada bloqueia; sai junto com a ponta selecionada sem bloquear', () => {
    const p = setArrowLocked(cascadeProject(), 'r4', true);
    expect(canDeleteItems(p, [arr('r4')])).toBe(false);
    expect(() => removeItems(p, [arr('r4')])).toThrow('locked');
    // Selecionada junto com uma das pontas, ela sai com a marcação e a trava não impede.
    expect(canDeleteItems(p, [arr('r4'), mark('c1')])).toBe(true);
    expect(ids(removeItems(p, [arr('r4'), mark('c1')]).arrows)).toEqual([
      'r1',
      'r2',
      'r3',
    ]);
    // Uma seta trancada que só está presa a uma marcação que sai também não bloqueia.
    expect(canDeleteItems(p, [mark('c1')])).toBe(true);
  });

  it('seta inexistente é ignorada', () => {
    const p = cascadeProject();
    expect(removeItems(p, [arr('zz')])).toBe(p);
    expect(itemsDeletionImpact(p, [arr('zz')]).arrows).toBe(0);
    expect(canDeleteItems(p, [arr('zz')])).toBe(false);
  });

  it('mover não se aplica a setas: movingItems e moveItems as ignoram', () => {
    const p = withArrow(cascadeProject(), 'r5', 'H', 'a1', {
      points: [{ x: 700, y: 700 }],
    });
    expect(movingItems(p, [arr('r5'), mark('H')])).toEqual([mark('H')]);
    expect(movingItems(p, [arr('r5')])).toEqual([]);
    // Só setas: nada para mover, o mesmo projeto.
    expect(moveItems(p, [arr('r5')], 40, 40)).toBe(p);
    // Com uma marcação: ela anda, a seta (e a rota) ficam como estão.
    const moved = moveItems(p, [arr('r5'), mark('H')], 40, 20);
    expect(moved.markings.find((m) => m.id === 'H')?.rect).toMatchObject({
      x: 440,
      y: 1320,
    });
    expect(moved.arrows).toBe(p.arrows);
  });

  it('trancar e destrancar a seleção alcança as setas', () => {
    const p = cascadeProject();
    const locked = setItemsLocked(p, [arr('r1'), mark('a1')], true);
    expect(locked.arrows.find((a) => a.id === 'r1')?.locked).toBe(true);
    expect(locked.arrows.find((a) => a.id === 'r2')?.locked).toBe(false);
    expect(locked.markings.find((m) => m.id === 'a1')?.locked).toBe(true);
    expect(setItemsLocked(locked, [arr('r1'), mark('a1')], true)).toBe(locked);
    const open = setItemsLocked(locked, [arr('r1')], false);
    expect(open.arrows.find((a) => a.id === 'r1')?.locked).toBe(false);
    // Só setas: as marcações não são tocadas.
    expect(open.markings).toBe(locked.markings);
  });
});

describe('trocar de espaço e trocar a imagem', () => {
  const route = [{ x: 500, y: 100 }];

  it('a marcação arrastada para fora do container apaga os pontos da seta', () => {
    const p = setArrowRoute(arrowProject(), 'r1', route);
    // Dentro do container a rota fica.
    expect(
      moveMarking(p, 'a3', 10, 10).arrows.find((a) => a.id === 'r1')?.points,
    ).toEqual(route);
    // Para fora (600 px à direita, no vão entre A e B): vira marcação do canvas.
    const out = moveMarking(p, 'a3', 600, 0);
    expect(out.markings.find((m) => m.id === 'a3')?.containerId).toBeNull();
    expect(out.arrows.find((a) => a.id === 'r1')?.points).toEqual([]);
    expect(validateProject(out)).toEqual([]);
  });

  it('tornar a marcação flutuante apaga os pontos da seta', () => {
    const p = setArrowRoute(arrowProject(), 'r1', route);
    const next = setMarkingFloating(p, 'a3', true);
    expect(next.markings.find((m) => m.id === 'a3')).toMatchObject({
      containerId: null,
      floating: true,
    });
    expect(next.arrows.find((a) => a.id === 'r1')?.points).toEqual([]);
  });

  it('trocar o arquivo por um de outra resolução reescala os pontos do container', () => {
    // Um container com arquivo: a1 → a3 no mesmo container, com rota em pixels dele.
    let p = arrowProject();
    p = {
      ...p,
      containers: p.containers.map((c) =>
        c.id === 'A' ? { ...c, file: 'images/a.png', background: null } : c,
      ),
    };
    p = setArrowRoute(p, 'r1', [{ x: 500, y: 100 }]);
    const same = replaceContainer(p, 'A', {
      file: 'images/a2.png',
      width: 1000,
      height: 1000,
    });
    expect(same.arrows.find((a) => a.id === 'r1')?.points).toEqual([{ x: 500, y: 100 }]);
    const bigger = replaceContainer(p, 'A', {
      file: 'images/a2.png',
      width: 2000,
      height: 2000,
    });
    expect(bigger.arrows.find((a) => a.id === 'r1')?.points).toEqual([
      { x: 1000, y: 200 },
    ]);
    expect(validateProject(bigger)).toEqual([]);
  });

  it('a rota entre containers diferentes (no canvas) não é reescalada', () => {
    let p = withArrow(arrowProject(), 'r5', 'a1', 'b1', { points: [{ x: 1500, y: 50 }] });
    p = {
      ...p,
      containers: p.containers.map((c) =>
        c.id === 'A' ? { ...c, file: 'images/a.png', background: null } : c,
      ),
    };
    const next = replaceContainer(p, 'A', {
      file: 'images/a2.png',
      width: 2000,
      height: 2000,
    });
    expect(next.arrows.find((a) => a.id === 'r5')?.points).toEqual([{ x: 1500, y: 50 }]);
  });
});
