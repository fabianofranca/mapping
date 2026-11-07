import { describe, expect, it } from 'vitest';
import {
  IMAGE_GAP,
  ModelError,
  addBackgroundContainer,
  arriveInPrincipal,
  arrivalArea,
  createArrow,
  createMarking,
  dismissArrival,
  moveContainer,
  perspectiveView,
  placeRootIn,
  rectsOverlap,
  rootFootprint,
  setContainerPlacement,
  validateProject,
  type Perspective,
  type Project,
  type Rect,
} from '../../src/model';
import { emptyProject } from './fixtures';

// Chegada e busca de lugar das perspectivas (v16, decisão 8). Mundo dos testes (Principal):
//
//   S1 (0,0)   S2 (600,0)   S3 (1200,0)     containers de 500×500, escala 1
//   T  (0,700)                                container de 500×500
//   m1 em S1, m2 em S2 (50,50,100,100), mT em T; seta r0 de m1 para m2
//
// Raízes criadas "dentro" de uma perspectiva (X, Y, F…) entram na Principal longe de tudo; a
// chegada as leva ao lugar certo.

function container(p: Project, id: string, x: number, y: number, size = 500): Project {
  const added = addBackgroundContainer(p, {
    id,
    width: size,
    height: size,
    background: '#FFFFFF',
  });
  return setContainerPlacement(added, id, { x, y, scale: 1 });
}

function mark(p: Project, id: string, containerId: string): Project {
  return createMarking(p, {
    id,
    containerId,
    rect: { x: 50, y: 50, width: 100, height: 100 },
  });
}

function world(): Project {
  let p = emptyProject();
  p = container(p, 'S1', 0, 0);
  p = container(p, 'S2', 600, 0);
  p = container(p, 'S3', 1200, 0);
  p = container(p, 'T', 0, 700);
  p = mark(mark(mark(p, 'm1', 'S1'), 'm2', 'S2'), 'mT', 'T');
  return createArrow(p, { id: 'r0', from: 'm1', to: 'm2' });
}

/** Cria o container `id` longe de tudo, com a marcação `${id}m` e uma seta dela até `to`. */
function withLinkedContainer(p: Project, id: string, to: string | null): Project {
  let next = mark(container(p, id, 9000, 9000), `${id}m`, id);
  if (to !== null) next = createArrow(next, { id: `ar-${id}`, from: `${id}m`, to });
  return next;
}

function perspective(
  items: [string, number, number][],
  id = 'P',
  name = 'Fluxo',
): Perspective {
  return {
    id,
    name,
    hiddenLayers: [],
    items: items.map(([root, x, y]) => ({ root, x, y })),
  };
}

const at = (p: Project, id: string) => rootFootprint(p, id) as Rect;
const free = (p: Project, rect: Rect, ...ignore: string[]) =>
  [
    ...p.containers.map((c) => c.id),
    ...p.markings.filter((m) => m.containerId === null).map((m) => m.id),
  ]
    .filter((id) => !ignore.includes(id))
    .every((id) => !rectsOverlap(rect, at(p, id)));

describe('placeRootIn: perto da referência', () => {
  // X fica abaixo de S2 na perspectiva (700 abaixo), com uma seta de X para m2.
  const base = withLinkedContainer(world(), 'X', 'm2');
  const from = perspective([
    ['S1', 1000, 1000],
    ['S2', 1600, 1000],
    ['X', 1600, 1700],
  ]);

  it('perto da referência, na mesma distância que tinha dela', () => {
    const place = placeRootIn(base, perspectiveView(base, from), 'X');
    expect(place).toEqual({ x: 600, y: 700, kind: 'near', referenceId: 'S2' });
  });

  it('sem ruído de ponto flutuante na posição calculada', () => {
    // 3000.1 + 2000.3 - 2000.4 = 2999.9999999999995 em ponto flutuante: o lugar sai limpo.
    const far = setContainerPlacement(base, 'S2', { x: 3000.1, y: 0, scale: 1 });
    const noisy = perspective([
      ['S2', 2000.4, 1000],
      ['X', 2000.3, 1700],
    ]);
    const place = placeRootIn(far, perspectiveView(far, noisy), 'X');
    expect(place).toEqual({ x: 3000, y: 700, kind: 'near', referenceId: 'S2' });
  });

  it('ocupado: vai ao livre mais próximo, sem sobrepor nada', () => {
    const busy = container(base, 'B', 550, 650);
    const place = placeRootIn(busy, perspectiveView(busy, from), 'X');
    expect(place.kind).toBe('occupied');
    expect(place.referenceId).toBe('S2');
    expect(free(busy, { x: place.x, y: place.y, width: 500, height: 500 }, 'X')).toBe(
      true,
    );
  });

  it('nunca dentro de uma marcação do canvas', () => {
    const frame = createMarking(base, {
      id: 'K',
      containerId: null,
      rect: { x: 580, y: 680, width: 700, height: 700 },
    });
    const place = placeRootIn(frame, perspectiveView(frame, from), 'X');
    expect(place.kind).toBe('occupied');
    expect(
      rectsOverlap({ x: place.x, y: place.y, width: 500, height: 500 }, at(frame, 'K')),
    ).toBe(false);
  });

  it('a primeira seta (na ordem do array) é a referência', () => {
    const two = createArrow(base, { id: 'ar-S1', from: 'Xm', to: 'm1' });
    const place = placeRootIn(two, perspectiveView(two, from), 'X');
    expect(place.referenceId).toBe('S2');
  });

  it('flutuante ocupada: a margem do container do alvo, sem sobrepor outras flutuantes', () => {
    let p = world();
    p = createMarking(p, {
      id: 'F',
      containerId: null,
      rect: { x: 9000, y: 9000, width: 200, height: 50 },
      floating: true,
    });
    p = createArrow(p, { id: 'ar-F', from: 'F', to: 'm2' });
    const source = perspective([
      ['S1', 1000, 1000],
      ['S2', 1600, 1000],
      ['F', 1600, 1600],
    ]);
    const near = placeRootIn(p, perspectiveView(p, source), 'F');
    expect(near).toEqual({ x: 600, y: 600, kind: 'near', referenceId: 'S2' });

    const busy = createMarking(p, {
      id: 'F2',
      containerId: null,
      rect: { x: near.x, y: near.y, width: 200, height: 50 },
      floating: true,
    });
    const place = placeRootIn(busy, perspectiveView(busy, source), 'F');
    expect(place.kind).toBe('occupied');
    expect(Number.isInteger(place.x) && Number.isInteger(place.y)).toBe(true);
    expect(
      rectsOverlap({ x: place.x, y: place.y, width: 200, height: 50 }, at(busy, 'F2')),
    ).toBe(false);
    expect(free(busy, { x: place.x, y: place.y, width: 200, height: 50 }, 'F')).toBe(
      true,
    );
  });
});

describe('placeRootIn: área de chegada', () => {
  it('sem referência: coluna à direita de tudo, a partir do topo', () => {
    const p = withLinkedContainer(world(), 'Y', null);
    const source = perspective([['Y', 50, 50]]);
    const place = placeRootIn(p, perspectiveView(p, source), 'Y', { arrivalsFrom: 'P' });
    expect(place).toEqual({
      x: 1700 + IMAGE_GAP,
      y: 0,
      kind: 'arrival-area',
      referenceId: null,
    });
  });

  it('seta para uma raiz que não está nas duas vistas não é referência', () => {
    const p = withLinkedContainer(world(), 'Y', 'mT');
    const source = perspective([['Y', 50, 50]]); // T não está na perspectiva
    const place = placeRootIn(p, perspectiveView(p, source), 'Y', { arrivalsFrom: 'P' });
    expect(place.kind).toBe('arrival-area');
  });

  it('o destino é uma vista: coluna à direita das raízes dela', () => {
    const p = withLinkedContainer(world(), 'Y', null);
    const target = perspectiveView(p, perspective([['S1', 0, 0]]));
    const source = perspectiveView(p, perspective([['Y', 50, 50]]));
    const place = placeRootIn(target, source, 'Y');
    expect(place).toEqual({
      x: 500 + IMAGE_GAP,
      y: 0,
      kind: 'arrival-area',
      referenceId: null,
    });
  });
});

describe('arriveInPrincipal', () => {
  const from = perspective([
    ['S1', 1000, 1000],
    ['S2', 1600, 1000],
    ['X', 1600, 1700],
    ['Y', 50, 50],
    ['Y2', 50, 700],
  ]);

  it('leva a raiz ao lugar, assenta e põe a marca "Veio de…" depois', () => {
    const p = withLinkedContainer(world(), 'X', 'm2');
    const r = arriveInPrincipal(p, 'X', from);
    expect(r.kind).toBe('near');
    expect(r.referenceId).toBe('S2');
    expect(at(r.project, 'X')).toMatchObject({ x: 600, y: 700 });
    expect(r.project.arrivals).toEqual([{ root: 'X', from: 'P', fromName: 'Fluxo' }]);
    expect(validateProject(r.project)).toEqual([]);
  });

  it('sem referência, agrupa por origem: a mesma origem empilha, outra abre coluna nova', () => {
    let p = withLinkedContainer(world(), 'Y', null);
    p = arriveInPrincipal(p, 'Y', from).project;
    expect(at(p, 'Y')).toMatchObject({ x: 1750, y: 0 });

    p = withLinkedContainer(p, 'Y2', null);
    const second = arriveInPrincipal(p, 'Y2', from);
    expect(second.kind).toBe('arrival-area');
    expect(at(second.project, 'Y2')).toMatchObject({ x: 1750, y: 500 + IMAGE_GAP });

    p = withLinkedContainer(second.project, 'Z', null);
    const other = perspective([['Z', 0, 0]], 'Q', 'Outra');
    const third = arriveInPrincipal(p, 'Z', other);
    expect(at(third.project, 'Z')).toMatchObject({ x: 1750 + 500 + IMAGE_GAP, y: 0 });
    expect(third.project.arrivals.map((a) => [a.root, a.from])).toEqual([
      ['Y', 'P'],
      ['Y2', 'P'],
      ['Z', 'Q'],
    ]);
    expect(validateProject(third.project)).toEqual([]);
  });

  it('a flutuante vai por rect, inteiro', () => {
    let p = world();
    p = createMarking(p, {
      id: 'F',
      containerId: null,
      rect: { x: 9000, y: 9000, width: 200, height: 50 },
      floating: true,
    });
    p = createArrow(p, { id: 'ar-F', from: 'F', to: 'm2' });
    const source = perspective([
      ['S1', 1000, 1000],
      ['S2', 1600, 1000],
      ['F', 1600, 1600],
    ]);
    const r = arriveInPrincipal(p, 'F', source);
    const f = r.project.markings.find((m) => m.id === 'F');
    expect(f?.floating).toBe(true);
    expect(Number.isInteger(f?.rect.x) && Number.isInteger(f?.rect.y)).toBe(true);
    expect(r.project.arrivals.map((a) => a.root)).toEqual(['F']);
    expect(validateProject(r.project)).toEqual([]);
  });

  it('uma marca anterior da mesma raiz é substituída', () => {
    let p = withLinkedContainer(world(), 'Y', null);
    p = arriveInPrincipal(p, 'Y', from).project;
    const again = arriveInPrincipal(p, 'Y', perspective([['Y', 0, 0]], 'Q', 'Outra'));
    expect(again.project.arrivals).toEqual([{ root: 'Y', from: 'Q', fromName: 'Outra' }]);
  });

  it('recusa quem não é raiz ou não está na perspectiva de origem', () => {
    const p = withLinkedContainer(world(), 'X', 'm2');
    expect(() => arriveInPrincipal(p, 'm1', from)).toThrow(ModelError);
    expect(() => arriveInPrincipal(p, 'zzz', from)).toThrow(ModelError);
    expect(() => arriveInPrincipal(p, 'X', perspective([['S1', 0, 0]]))).toThrow(
      ModelError,
    );
  });
});

describe('marca de chegada', () => {
  const from = perspective([['Y', 0, 0]]);
  const arrived = () =>
    arriveInPrincipal(withLinkedContainer(world(), 'Y', null), 'Y', from).project;

  it('mover a raiz na Principal tira a marca', () => {
    expect(moveContainer(arrived(), 'Y', 3000, 3000).arrivals).toEqual([]);
  });

  it('dispensar tira a marca; dispensar sem marca devolve o mesmo projeto', () => {
    const p = arrived();
    expect(dismissArrival(p, 'Y').arrivals).toEqual([]);
    const clean = dismissArrival(p, 'Y');
    expect(dismissArrival(clean, 'Y')).toBe(clean);
  });

  it('arrivalArea: a caixa das raízes marcadas; sem marca, nada', () => {
    const p = arrived();
    expect(arrivalArea(world())).toBeNull();
    expect(arrivalArea(p)).toEqual({ x: 1750, y: 0, width: 500, height: 500 });
  });
});
