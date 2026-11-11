import { describe, expect, it } from 'vitest';
import {
  addBackgroundContainer,
  addContainer,
  createArrow,
  createMarking,
  limitItemsMove,
  moveContainer,
  moveItems,
  moveRootsInPerspective,
  perspectiveView,
  placeCreatedRoot,
  placeRootIn,
  rectsOverlap,
  imageCanvasRect,
  removeMarking,
  repairProject,
  replaceContainer,
  resizeContainer,
  setContainerPlacement,
  snapPlacement,
  validateProject,
  type Perspective,
  type Project,
} from '../../src/model';
import { emptyProject, image, sampleProject } from './fixtures';
import { multiProject } from './multiSelectionFixtures';
import { idGen } from './specFixtures';

// Ruído de ponto flutuante no `placement` (`275.00000000000006`): nenhuma operação do modelo o grava.
const NOISY = 275.00000000000006;
const TINY = 5.6843418860808e-14;

describe('snapPlacement', () => {
  it('inteiro passa como está', () => {
    expect(snapPlacement({ x: 10, y: -20, scale: 2 })).toEqual({
      x: 10,
      y: -20,
      scale: 2,
    });
  });

  it('ruído dos dois lados de um inteiro vira o inteiro', () => {
    expect(
      snapPlacement({ x: NOISY, y: 274.99999999999994, scale: 1.0000000000000002 }),
    ).toEqual({
      x: 275,
      y: 275,
      scale: 1,
    });
  });

  it('fração de verdade fica como está', () => {
    expect(snapPlacement({ x: 1868.13, y: 0.5, scale: 0.25 })).toEqual({
      x: 1868.13,
      y: 0.5,
      scale: 0.25,
    });
  });

  it('o negativo perto de zero dá 0, e não -0', () => {
    const p = snapPlacement({ x: -TINY, y: TINY, scale: 1 });
    expect(Object.is(p.x, 0)).toBe(true);
    expect(Object.is(p.y, 0)).toBe(true);
  });

  it('a escala pequena nunca vira 0 nem inteiro menor que 1', () => {
    expect(snapPlacement({ x: 0, y: 0, scale: 1e-9 }).scale).toBe(1e-9);
    expect(snapPlacement({ x: 0, y: 0, scale: 0.4 }).scale).toBe(0.4);
  });
});

describe('placement sem ruído nas operações do modelo', () => {
  it('setContainerPlacement, moveContainer e resizeContainer gravam o inteiro', () => {
    const p = sampleProject();
    const id = 'I2';
    const a = setContainerPlacement(p, id, { x: NOISY, y: 3000 + TINY, scale: 1 });
    expect(image(a, id).placement).toEqual({ x: 275, y: 3000, scale: 1 });
    const b = moveContainer(p, id, 3000.0000000000005, 4000.0000000000005);
    expect(image(b, id).placement).toMatchObject({ x: 3000, y: 4000 });
    const c = resizeContainer(p, id, { x: 1050, y: 0, scale: 1.0000000000000002 });
    expect(image(c, id).placement.scale).toBe(1);
  });

  it('criar com `center` que dá ruído grava o inteiro', () => {
    // 100 x 100 entra com escala 10 (lado maior = 1000): x = 275.00000000000006 - 500
    const size = { id: 'N1', file: 'images/n.jpg', width: 100, height: 100 };
    const p = addContainer(emptyProject(), {
      ...size,
      center: { x: 275.00000000000006, y: 100.00000000000001 },
    });
    expect(image(p, 'N1').placement).toEqual({ x: -225, y: -400, scale: 10 });
    const bg = addBackgroundContainer(emptyProject(), {
      id: 'N2',
      width: 100,
      height: 100,
      background: '#FFFFFF',
      center: { x: 275.00000000000006, y: 100.00000000000001 },
    });
    expect(image(bg, 'N2').placement).toEqual({ x: -225, y: -400, scale: 10 });
  });

  it('criar à direita de um container com ruído grava o inteiro', () => {
    const base = sampleProject();
    const first = base.containers[0]!;
    // simula um projeto antigo, gravado com ruído
    const noisy = {
      ...base,
      containers: base.containers.map((c) =>
        c.id === first.id ? { ...c, placement: { ...c.placement, x: NOISY } } : c,
      ),
    };
    const p = addContainer(noisy, {
      id: 'N3',
      file: 'images/n3.jpg',
      width: 10,
      height: 10,
    });
    const { x, y, scale } = image(p, 'N3').placement;
    for (const v of [x, y, scale]) expect(v).toBe(Math.round(v * 1e6) / 1e6);
  });
});

// Decisão 2 da etapa #1190: toda porta de escrita de posição de container (e de posição de
// perspectiva) grava `x`/`y` com no máximo 6 casas e a escala com no máximo 12 algarismos.
const clean6 = (v: number) => expect(v).toBe(Number(v.toFixed(6)));
const clean12 = (v: number) => expect(v).toBe(Number(v.toPrecision(12)));
const placementIsClean = (p: { x: number; y: number; scale: number }) => {
  clean6(p.x);
  clean6(p.y);
  clean12(p.scale);
};

/** Troca o `placement` direto, sem passar pelo modelo (simula entrada ruidosa ou arquivo antigo). */
function rawPlacement(
  p: Project,
  id: string,
  placement: { x: number; y: number; scale: number },
): Project {
  return {
    ...p,
    containers: p.containers.map((c) => (c.id === id ? { ...c, placement } : c)),
  };
}

const persp = (id: string, items: [string, number, number][]): Perspective => ({
  id,
  name: `Vista ${id}`,
  hiddenLayers: [],
  items: items.map(([root, x, y]) => ({ root, x, y })),
});

describe('portas de escrita: a cauda de ponto flutuante some (6 casas, escala com 12 algarismos)', () => {
  it('setContainerPlacement, moveContainer e resizeContainer', () => {
    const p = sampleProject();
    const a = setContainerPlacement(p, 'I2', {
      x: -188.75000000000006,
      y: 100000.6551724138,
      scale: 17.24137931034483,
    });
    expect(image(a, 'I2').placement).toEqual({
      x: -188.75,
      y: 100000.655172,
      scale: 17.2413793103,
    });
    const b = moveContainer(p, 'I2', 1099.9999785087473, 124.99959067430655);
    expect(image(b, 'I2').placement).toMatchObject({ x: 1099.999979, y: 124.999591 });
    const c = resizeContainer(p, 'I2', { x: 5000, y: 0, scale: 0.5000000000000001 });
    expect(image(c, 'I2').placement.scale).toBe(0.5);
  });

  it('moveItems', () => {
    const p = setContainerPlacement(sampleProject(), 'I2', { x: 5000, y: 0, scale: 1 });
    const moved = moveItems(
      p,
      [{ kind: 'image', id: 'I2' }],
      100.1234567891,
      -739.6551724137931,
    );
    expect(image(moved, 'I2').placement).toEqual({
      x: 5100.123457,
      y: -739.655172,
      scale: 1,
    });
  });

  it('addBackgroundContainer com center (o Tamanho da seleção, 58 × 40) e sem center', () => {
    const withCenter = addBackgroundContainer(emptyProject(), {
      id: 'B1',
      width: 58,
      height: 40,
      background: '#FFFFFF',
      center: { x: 100.1234567891, y: -719.6551724137931 },
    });
    placementIsClean(image(withCenter, 'B1').placement);
    expect(image(withCenter, 'B1').placement.scale).toBe(17.2413793103);
    expect(image(withCenter, 'B1').placement.x).toBe(-399.876543);
    // sem `center`: à direita do que existe, com a escala fracionária limpa
    const next = addBackgroundContainer(withCenter, {
      id: 'B2',
      width: 58,
      height: 40,
      background: '#FFFFFF',
    });
    placementIsClean(image(next, 'B2').placement);
  });

  it('replaceContainer (a escala da troca de imagem)', () => {
    const p = sampleProject();
    const replaced = replaceContainer(p, 'I2', {
      file: 'images/nova.jpg',
      width: 580,
      height: 580,
    });
    expect(image(replaced, 'I2').placement.scale).toBe(1.72413793103);
  });

  it('o reparo images-overlap', () => {
    const p = rawPlacement(sampleProject(), 'I1', {
      x: 0.1234567891,
      y: 0,
      scale: 0.30000000000000004,
    });
    const broken: Project = rawPlacement(p, 'I2', { x: 0.2, y: 0, scale: 1 });
    const result = repairProject(broken, validateProject(broken), idGen('NEW'));
    expect(result.repaired.map((r) => r.code)).toContain('images-overlap');
    // 0.1234567891 + 1200.0000000000002 + 50
    expect(image(result.project, 'I2').placement.x).toBe(1250.123457);
  });

  it('movedItem (mover a raiz na perspectiva)', () => {
    const p: Project = {
      ...sampleProject(),
      perspectives: [persp('P', [['I2', 0.1234567891, 10]])],
    };
    const next = moveRootsInPerspective(p, 'P', [
      { root: 'I2', dx: 100.30000000000001, dy: -0.30000000000000004 },
    ]);
    expect(next.perspectives[0]?.items).toEqual([{ root: 'I2', x: 100.423457, y: 9.7 }]);
  });

  it('o item reconciliado (o filho que vira raiz entra onde estava)', () => {
    const base = multiProject();
    const fractional = rawPlacement(base, 'A', {
      x: 0.1234567891,
      y: 0.9876543219,
      scale: 1,
    });
    const p: Project = {
      ...fractional,
      perspectives: [persp('P', [['G', 900, 400]])],
    };
    const next = removeMarking(p, 'G');
    const item = next.perspectives[0]?.items.find((i) => i.root === 'A');
    expect(item).toEqual({ root: 'A', x: 1000.123457, y: 500.987654 });
  });

  it('placeCreatedRoot', () => {
    const base = sampleProject();
    const p = rawPlacement(base, 'I2', { x: 6000.1234567891, y: 0.9876543219, scale: 1 });
    expect(placeCreatedRoot(p, persp('P', []), 'I2')).toEqual({
      x: 6000.123457,
      y: 0.987654,
    });
  });

  it('a posição relativa e a área de chegada (placeRootIn)', () => {
    let p = multiProject();
    p = createMarking(p, {
      id: 'd1',
      containerId: 'D',
      rect: { x: 10, y: 10, width: 50, height: 50 },
    });
    p = createArrow(p, { id: 'r1', from: 'd1', to: 'e1' });
    const source = perspectiveView(
      p,
      persp('S', [
        ['D', 7000, 0],
        ['E', 9000, 0],
      ]),
    );
    // com referência: a mesma distância de D
    const target = perspectiveView(p, persp('T', [['D', 7000.1234567891, 0.9876543219]]));
    const near = placeRootIn(target, source, 'E');
    expect(near).toMatchObject({ kind: 'near', x: 9000.123457, y: 0.987654 });
    // sem referência: a coluna à direita de tudo
    const lone = perspectiveView(p, persp('L', [['D', 7000.1234567891, 0]]));
    const alone = placeRootIn(lone, perspectiveView(p, persp('S2', [['E', 0, 0]])), 'E');
    expect(alone).toMatchObject({ kind: 'arrival-area', x: 8050.123457 });
  });
});

describe('encostar em bordas fracionárias não cria sobreposição nem muda pertencimento', () => {
  it('dois containers encostados por slideToTouch: depois de gravar não se sobrepõem', () => {
    const p = rawPlacement(multiProject(), 'D', {
      x: 7000.1234567891,
      y: 0.9876543219,
      scale: 1,
    });
    const items = [{ kind: 'image', id: 'E' }] as const;
    const wanted = limitItemsMove(p, items, -1500, 0.5);
    expect(wanted.dx).toBeGreaterThan(-1500); // encostou em D
    const moved = moveItems(p, items, wanted.dx, wanted.dy);
    const e = image(moved, 'E');
    const d = image(moved, 'D');
    expect(
      rectsOverlap(imageCanvasRect(e, e.placement), imageCanvasRect(d, d.placement)),
    ).toBe(false);
    placementIsClean(e.placement);
  });

  it('o assentar mantém o pai de um container encostado na borda de uma marcação do canvas', () => {
    // K (3000 × 1000, escala 1/3) ocupa 1000 × 333,33…: encostado na borda direita de W.
    let p = emptyProject();
    p = addBackgroundContainer(p, {
      id: 'K',
      width: 3000,
      height: 1000,
      background: '#FFFFFF',
    });
    p = createMarking(p, {
      id: 'W',
      containerId: null,
      rect: { x: 0, y: 0, width: 1000, height: 400 },
    });
    const resized = resizeContainer(p, 'K', { x: 0, y: 0, scale: 1 / 3 });
    expect(image(resized, 'K').placement.scale).toBe(0.333333333333);
    expect(image(resized, 'K').parentId).toBe('W');
  });
});
