import {
  addAnnotation,
  settleHierarchy,
  type Marking,
  type Placement,
  type Project,
  type ProjectContainer,
  type Rect,
} from '../../src/model';
import { emptyProject } from './fixtures';

// Projeto do arrasto conjunto e da seleção múltipla (ME2), montado à mão e assentado.
//
//   Canvas (unidades do canvas)
//   G   marcação do canvas (-100,-100)–(5200,1100), cerca A, B e C
//   G2  marcação do canvas (-50,-50)–(1050,1050), dentro de G, cerca A
//   H   marcação do canvas (400,1300) 200×100, solta no vazio
//   N   marcação FLUTUANTE (100,1300) 200×100
//
//   Containers (largura × altura em pixels, escala, posição no canvas)
//   A 1000×1000 escala 1   em (0,0)        marcações a1 › a2 e a3
//   B  500×500  escala 2   em (2000,0)     (1000×1000 no canvas) marcação b1
//   C 1000×1000 escala 1   em (4000,0)     marcação c1 colada no canto de baixo à direita
//   D 1000×1000 escala 1   em (7000,0)     sem marcações (fora de G)
//   E 2000×2000 escala 0,5 em (9000,0)     (1000×1000 no canvas) marcação e1
//
// Pertencimento assentado: A › G2 › G, B e C › G, D e E sem pai; a2 › a1.

export function rect(x: number, y: number, width: number, height: number): Rect {
  return { x, y, width, height };
}

export function container(
  id: string,
  width: number,
  height: number,
  placement: Placement,
): ProjectContainer {
  return {
    id,
    name: null,
    file: null,
    width,
    height,
    placement,
    parentId: null,
    markingColor: null,
    locked: false,
    source: null,
    background: '#FFFFFF',
  };
}

export function mk(
  id: string,
  containerId: string | null,
  r: Rect,
  extra: Partial<Marking> = {},
): Marking {
  return {
    id,
    containerId,
    parentId: null,
    name: null,
    rect: r,
    needsReview: false,
    locked: false,
    floating: false,
    source: null,
    ...extra,
  };
}

export function multiProject(): Project {
  const base = emptyProject();
  return settleHierarchy({
    ...base,
    containers: [
      container('A', 1000, 1000, { x: 0, y: 0, scale: 1 }),
      container('B', 500, 500, { x: 2000, y: 0, scale: 2 }),
      container('C', 1000, 1000, { x: 4000, y: 0, scale: 1 }),
      container('D', 1000, 1000, { x: 7000, y: 0, scale: 1 }),
      container('E', 2000, 2000, { x: 9000, y: 0, scale: 0.5 }),
    ],
    markings: [
      mk('G', null, rect(-100, -100, 5300, 1200)),
      mk('G2', null, rect(-50, -50, 1100, 1100)),
      mk('a1', 'A', rect(100, 100, 300, 300)),
      mk('a2', 'A', rect(150, 150, 100, 100)),
      mk('a3', 'A', rect(600, 600, 200, 200)),
      mk('b1', 'B', rect(50, 50, 100, 100)),
      mk('c1', 'C', rect(900, 900, 100, 100)),
      mk('e1', 'E', rect(100, 100, 200, 200)),
      mk('N', null, rect(100, 1300, 200, 100), { floating: true }),
      mk('H', null, rect(400, 1300, 200, 100)),
    ],
  });
}

/** `multiProject` com anotações livres na camada L1: duas em a1, uma em a2 e uma em b1. */
export function multiProjectAnnotated(): Project {
  let p = multiProject();
  for (const [id, markingId] of [
    ['n1', 'a1'],
    ['n2', 'a1'],
    ['n3', 'a2'],
    ['n4', 'b1'],
  ] as const) {
    p = addAnnotation(p, { id, markingId, layerId: 'L1' });
  }
  return p;
}
