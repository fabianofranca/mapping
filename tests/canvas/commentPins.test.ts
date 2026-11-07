import { describe, expect, it } from 'vitest';
import {
  PIN_HEIGHT,
  pinBox,
  pinHit,
  pinPlaces,
  pointCanvas,
} from '../../src/canvas/commentPins';
import { commentAnchorAt, pointAnchorAt } from '../../src/canvas/input/intents';
import { lockBadgeSpot } from '../../src/canvas/renderers/lockBadge';
import {
  pinGroups,
  setContainerPlacement,
  type MarkingVisibility,
  type Project,
  type Rect,
  type Thread,
  type ThreadAnchor,
} from '../../src/model';
import { arrowProject } from '../model/arrowFixtures';
import { AGENT, HUMAN, T0, T1, message, sampleThread } from '../model/threadFixtures';
import { canvasProject } from './harness';

// Derivação dos pinos das conversas (CM4, decisão 24): onde cada grupo fica no canvas, o acerto do
// clique e o ponto de uma conversa nova. Funções puras, sem Konva.

const thread = (id: string, anchor: ThreadAnchor, extra: Partial<Thread> = {}) =>
  sampleThread({
    id,
    anchor,
    messages: [message(`${id}a`, T0, HUMAN, 'oi'), message(`${id}b`, T1, AGENT, 'ok')],
    ...extra,
  });

const groupsOf = (project: Project, threads: readonly Thread[]) =>
  pinGroups(project, threads, { selectedThreadId: null, unread: () => false });

const FULL = new Map<string, MarkingVisibility>();
const intersects = (a: Rect, b: Rect) =>
  a.x < b.x + b.width &&
  b.x < a.x + a.width &&
  a.y < b.y + b.height &&
  b.y < a.y + a.height;

describe('pinPlaces: o lugar de cada pino', () => {
  it('marcação: o canto de cima à direita, com o pino fora dela', () => {
    const p = canvasProject();
    const places = pinPlaces(
      p,
      groupsOf(p, [thread('c1', { kind: 'marking', id: 'M1' })]),
      FULL,
    );
    expect(places).toHaveLength(1);
    // M1 está em (100,100,600,500) no container I1, que está em (0,0), escala 1.
    expect(places[0]?.origin).toEqual({ x: 700, y: 100 });
    const m1: Rect = { x: 100, y: 100, width: 600, height: 500 };
    const box = pinBox(places[0]!, 1);
    expect(box.height).toBe(PIN_HEIGHT);
    expect(intersects(box, m1)).toBe(false);
  });

  it('o tamanho é em pixels de tela: no zoom 2 a caixa ocupa metade do canvas', () => {
    const p = canvasProject();
    const [place] = pinPlaces(
      p,
      groupsOf(p, [thread('c1', { kind: 'marking', id: 'M1' })]),
      FULL,
    );
    const one = pinBox(place!, 1);
    const two = pinBox(place!, 2);
    expect(two.width).toBeCloseTo(one.width / 2);
    expect(two.height).toBeCloseTo(one.height / 2);
  });

  it('não cobre o emblema do cadeado de uma marcação pequena na tela', () => {
    const p = canvasProject();
    const [place] = pinPlaces(
      p,
      groupsOf(p, [thread('c1', { kind: 'marking', id: 'M2' })]),
      FULL,
    );
    const m2: Rect = { x: 200, y: 200, width: 100, height: 100 };
    const view: Rect = { x: 0, y: 0, width: 2000, height: 2000 };
    const zoom = 0.5;
    const size = 20;
    const spot = lockBadgeSpot(m2, view, zoom, size);
    const lock: Rect = { x: spot.x, y: spot.y, width: size / zoom, height: size / zoom };
    expect(intersects(pinBox(place!, zoom), lock)).toBe(false);
  });

  it('container: o canto de cima à direita da imagem', () => {
    const p = canvasProject();
    const [place] = pinPlaces(
      p,
      groupsOf(p, [thread('c1', { kind: 'container', id: 'I1' })]),
      FULL,
    );
    expect(place?.origin).toEqual({ x: 1000, y: 0 });
  });

  it('a conversa de um campo entra no pino da marcação dona, sem um segundo pino', () => {
    const p = canvasProject();
    const places = pinPlaces(
      p,
      groupsOf(p, [
        thread('c1', { kind: 'marking', id: 'M1' }),
        thread('c2', { kind: 'field', annotationId: 'A1', key: 'tipo' }),
      ]),
      FULL,
    );
    expect(places).toHaveLength(1);
    expect(places[0]?.group.count).toBe(2);
  });

  it('seta: no meio da rota', () => {
    const p = arrowProject();
    const arrowId = p.arrows[0]!.id;
    const places = pinPlaces(
      p,
      groupsOf(p, [thread('c1', { kind: 'arrow', id: arrowId })]),
      FULL,
    );
    expect(places).toHaveLength(1);
    expect(places[0]?.align).toBe('center');
  });

  it('ponto solto: no container (pixels dele) e no canvas', () => {
    const p = canvasProject();
    const places = pinPlaces(
      p,
      groupsOf(p, [
        thread('c1', { kind: 'point', containerId: 'I2', x: 10, y: 20 }),
        thread('c2', { kind: 'point', containerId: null, x: 5, y: 6 }),
      ]),
      FULL,
    );
    expect(places.map((x) => x.origin)).toEqual([
      { x: 1110, y: 20 },
      { x: 5, y: 6 },
    ]);
    expect(places.every((x) => x.align === 'center')).toBe(true);
  });

  it('o pino anda com o item que se move e com o container do ponto', () => {
    const p = canvasProject();
    const groups = groupsOf(p, [
      thread('c1', { kind: 'marking', id: 'M1' }),
      thread('c2', { kind: 'point', containerId: 'I1', x: 10, y: 20 }),
    ]);
    const moved = setContainerPlacement(p, 'I1', { x: 0, y: 900, scale: 1 });
    const before = pinPlaces(p, groups, FULL).map((x) => x.origin);
    const after = pinPlaces(moved, groups, FULL).map((x) => x.origin);
    expect(after[0]).toEqual({ x: before[0]!.x, y: before[0]!.y + 900 });
    expect(after[1]).toEqual({ x: before[1]!.x, y: before[1]!.y + 900 });
  });

  it('o pino some com a marcação escondida', () => {
    const p = canvasProject();
    const groups = groupsOf(p, [thread('c1', { kind: 'marking', id: 'M1' })]);
    const hidden = new Map<string, MarkingVisibility>([['M1', 'hidden']]);
    expect(pinPlaces(p, groups, hidden)).toHaveLength(0);
  });
});

describe('pinHit: o clique no pino ganha da marcação embaixo', () => {
  it('acerta dentro da caixa (em pixels de tela) e erra fora', () => {
    const p = canvasProject();
    const places = pinPlaces(
      p,
      groupsOf(p, [thread('c1', { kind: 'marking', id: 'M1' })]),
      FULL,
    );
    const box = pinBox(places[0]!, 2);
    const inside = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    expect(pinHit(places, inside, 2)?.group.threadIds).toEqual(['c1']);
    expect(pinHit(places, { x: box.x - 50, y: box.y - 50 }, 2)).toBeNull();
  });
});

describe('o ponto de uma conversa nova', () => {
  it('num container: pixels dele; fora de todos: unidades do canvas', () => {
    const p = canvasProject();
    expect(pointAnchorAt(p, { x: 1150, y: 60 })).toEqual({
      kind: 'point',
      containerId: 'I2',
      x: 50,
      y: 60,
    });
    expect(pointAnchorAt(p, { x: 1050, y: 900 })).toEqual({
      kind: 'point',
      containerId: null,
      x: 1050,
      y: 900,
    });
  });

  it('respeita a escala do container', () => {
    const p = setContainerPlacement(canvasProject(), 'I1', { x: 100, y: 0, scale: 0.5 });
    expect(pointAnchorAt(p, { x: 300, y: 50 })).toEqual({
      kind: 'point',
      containerId: 'I1',
      x: 400,
      y: 100,
    });
  });

  it('pointCanvas é o inverso: container → canvas', () => {
    const p = canvasProject();
    expect(pointCanvas(p, 'I2', 50, 60)).toEqual({ x: 1150, y: 60 });
    expect(pointCanvas(p, null, 7, 8)).toEqual({ x: 7, y: 8 });
    expect(pointCanvas(p, 'nao-existe', 7, 8)).toBeNull();
  });

  it('commentAnchorAt: sobre um item ancora no item; no vazio do container, num ponto', () => {
    const p = canvasProject();
    // M2 (a mais interna) em (200,200,100,100).
    expect(commentAnchorAt(p, FULL, { x: 250, y: 250 })).toEqual({
      kind: 'marking',
      id: 'M2',
    });
    // Dentro de I1 e fora de qualquer marcação.
    expect(commentAnchorAt(p, FULL, { x: 900, y: 700 })).toEqual({
      kind: 'point',
      containerId: 'I1',
      x: 900,
      y: 700,
    });
    // Fora de tudo: o canvas.
    expect(commentAnchorAt(p, FULL, { x: 5000, y: 5000 })).toEqual({
      kind: 'point',
      containerId: null,
      x: 5000,
      y: 5000,
    });
  });
});
