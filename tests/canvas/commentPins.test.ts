import { describe, expect, it } from 'vitest';
import {
  pinGlyphExtra,
  pinBox,
  pinHit,
  pinPlaces,
  pinWidth,
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
import { TOKENS, canvasProject } from './harness';

const PIN = TOKENS.pin;

// Derivation of the conversation pins (CM4, decision 24): where each group sits on the canvas, the click
// hit and the point of a new conversation. Pure functions, without Konva.

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

describe('pinPlaces: the place of each pin', () => {
  it('marking: the top right corner, with the pin outside it', () => {
    const p = canvasProject();
    const places = pinPlaces(
      p,
      groupsOf(p, [thread('c1', { kind: 'marking', id: 'M1' })]),
      FULL,
    );
    expect(places).toHaveLength(1);
    // M1 is at (100,100,600,500) in container I1, which is at (0,0), scale 1.
    expect(places[0]?.origin).toEqual({ x: 700, y: 100 });
    const m1: Rect = { x: 100, y: 100, width: 600, height: 500 };
    const box = pinBox(places[0]!, 1, PIN);
    expect(box.height).toBe(PIN.height);
    expect(intersects(box, m1)).toBe(false);
  });

  it('the size is in screen pixels: at zoom 2 the box takes half the canvas', () => {
    const p = canvasProject();
    const [place] = pinPlaces(
      p,
      groupsOf(p, [thread('c1', { kind: 'marking', id: 'M1' })]),
      FULL,
    );
    const one = pinBox(place!, 1, PIN);
    const two = pinBox(place!, 2, PIN);
    expect(two.width).toBeCloseTo(one.width / 2);
    expect(two.height).toBeCloseTo(one.height / 2);
  });

  it('does not cover the lock badge of a marking that is small on the screen', () => {
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
    expect(intersects(pinBox(place!, zoom, PIN), lock)).toBe(false);
  });

  it('container: the top right corner of the image', () => {
    const p = canvasProject();
    const [place] = pinPlaces(
      p,
      groupsOf(p, [thread('c1', { kind: 'container', id: 'I1' })]),
      FULL,
    );
    expect(place?.origin).toEqual({ x: 1000, y: 0 });
  });

  it('the conversation of a field goes into the pin of the owning marking, without a second pin', () => {
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

  it('the pin moves with the item that moves and with the container of the point', () => {
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

  it('the pin disappears with the hidden marking', () => {
    const p = canvasProject();
    const groups = groupsOf(p, [thread('c1', { kind: 'marking', id: 'M1' })]);
    const hidden = new Map<string, MarkingVisibility>([['M1', 'hidden']]);
    expect(pinPlaces(p, groups, hidden)).toHaveLength(0);
  });
});

describe('pinHit: the click on the pin wins over the marking underneath', () => {
  it('hits inside the box (in screen pixels) and misses outside', () => {
    const p = canvasProject();
    const places = pinPlaces(
      p,
      groupsOf(p, [thread('c1', { kind: 'marking', id: 'M1' })]),
      FULL,
    );
    const box = pinBox(places[0]!, 2, PIN);
    const inside = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    expect(pinHit(places, inside, 2, PIN)?.group.threadIds).toEqual(['c1']);
    expect(pinHit(places, { x: box.x - 50, y: box.y - 50 }, 2, PIN)).toBeNull();
  });
});

describe('the point of a new conversation', () => {
  it('in a container: its pixels; outside all of them: canvas units', () => {
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

  it('pointCanvas is the inverse: container → canvas', () => {
    const p = canvasProject();
    expect(pointCanvas(p, 'I2', 50, 60)).toEqual({ x: 1150, y: 60 });
    expect(pointCanvas(p, null, 7, 8)).toEqual({ x: 7, y: 8 });
    expect(pointCanvas(p, 'nao-existe', 7, 8)).toBeNull();
  });

  it('commentAnchorAt: over an item anchors to the item; on the empty part of the container, to a point', () => {
    const p = canvasProject();
    // M2 (a mais interna) em (200,200,100,100).
    expect(commentAnchorAt(p, FULL, { x: 250, y: 250 })).toEqual({
      kind: 'marking',
      id: 'M2',
    });
    // Inside I1 and outside any marking.
    expect(commentAnchorAt(p, FULL, { x: 900, y: 700 })).toEqual({
      kind: 'point',
      containerId: 'I1',
      x: 900,
      y: 700,
    });
    // Outside everything: the canvas.
    expect(commentAnchorAt(p, FULL, { x: 5000, y: 5000 })).toEqual({
      kind: 'point',
      containerId: null,
      x: 5000,
      y: 5000,
    });
  });
});

describe('pinWidth: the state glyph goes into the pin width', () => {
  it('counts the glyph and the gap up to the label; the draft (without a glyph) stays as it was', () => {
    expect(pinGlyphExtra(PIN)).toBeGreaterThan(0);
    expect(pinWidth('MA 2', PIN)).toBe(4 * 7 + 16 + pinGlyphExtra(PIN));
    expect(pinWidth('+', PIN, false)).toBe(7 + 16);
  });

  it('the width and height follow the tokens (nothing fixed in the code)', () => {
    const wide = { ...PIN, charWidth: 10, height: 30 };
    expect(pinWidth('MA 2', wide)).toBe(4 * 10 + 16 + pinGlyphExtra(wide));
    const place = pinPlaces(
      canvasProject(),
      groupsOf(canvasProject(), [thread('c1', { kind: 'marking', id: 'M1' })]),
      FULL,
    )[0]!;
    expect(pinBox(place, 1, wide).height).toBe(30);
  });

  it('pinBox and pinHit follow the new width (the click target grows along)', () => {
    const p = canvasProject();
    const places = pinPlaces(
      p,
      groupsOf(p, [thread('c1', { kind: 'marking', id: 'M1' })]),
      FULL,
    );
    const place = places[0]!;
    const box = pinBox(place, 1, PIN);
    expect(box.width).toBe(pinWidth(place.group.label, PIN));
    const insideGlyph = { x: box.x + 4, y: box.y + box.height / 2 };
    expect(pinHit(places, insideGlyph, 1, PIN)?.group.threadIds).toEqual(['c1']);
  });
});
