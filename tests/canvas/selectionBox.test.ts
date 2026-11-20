import { describe, expect, it } from 'vitest';
import {
  formatSelectionBox,
  formatViewport,
  selectionScreenBox,
} from '../../src/canvas/selectionBox';
import type { Placement } from '../../src/model';
import { arrowProject } from '../model/arrowFixtures';

// Unit tests of the pure functions behind `data-selection-box` and `data-viewport`; the controller
// tests (`CanvasControllerViewAttrs.test.ts`) cover them only through the published attributes.

const project = arrowProject();
const view = { x: 10, y: 20, scale: 0.5 };
const placementsOfB = new Map<string, Placement>([['B', { x: 2000, y: 0, scale: 2 }]]);

describe('selectionScreenBox', () => {
  it('is null without a project or without a selection', () => {
    expect(
      selectionScreenBox(null, { kind: 'marking', id: 'H' }, new Map(), view),
    ).toBeNull();
    expect(selectionScreenBox(project, null, new Map(), view)).toBeNull();
  });

  it('is null with an arrow selected', () => {
    expect(
      selectionScreenBox(project, { kind: 'arrow', id: 'r1' }, placementsOfB, view),
    ).toBeNull();
  });

  it('is null for a container outside the placements', () => {
    expect(
      selectionScreenBox(project, { kind: 'image', id: 'B' }, new Map(), view),
    ).toBeNull();
  });

  it('is null for a marking whose space has no placement', () => {
    expect(
      selectionScreenBox(project, { kind: 'marking', id: 'b1' }, new Map(), view),
    ).toBeNull();
  });

  it('places a container on the screen through the view', () => {
    expect(
      selectionScreenBox(project, { kind: 'image', id: 'B' }, placementsOfB, view),
    ).toEqual({ x: 2000 * 0.5 + 10, y: 20, width: 500, height: 500 });
  });

  it('adds the container placement to a marking inside it', () => {
    // b2 is (300,300,100,100) in B, on the canvas at (2600,600,200,200)
    expect(
      selectionScreenBox(project, { kind: 'marking', id: 'b2' }, placementsOfB, view),
    ).toEqual({ x: 2600 * 0.5 + 10, y: 600 * 0.5 + 20, width: 100, height: 100 });
  });

  it('a canvas marking needs no placement', () => {
    expect(
      selectionScreenBox(project, { kind: 'marking', id: 'H' }, new Map(), view),
    ).toEqual({ x: 400 * 0.5 + 10, y: 1300 * 0.5 + 20, width: 100, height: 50 });
  });
});

describe('formatSelectionBox', () => {
  it('uses 2 decimals and null becomes an absent attribute', () => {
    expect(formatSelectionBox({ x: 1.236, y: 2, width: 3.004, height: 4.5 })).toBe(
      '1.24 2 3 4.5',
    );
    expect(formatSelectionBox(null)).toBeNull();
  });
});

describe('formatViewport', () => {
  it('rounds x and y to 2 decimals and keeps the scale unrounded', () => {
    expect(formatViewport({ x: 1.236, y: -2.001, scale: 0.123456 })).toBe(
      '1.24 -2 0.123456',
    );
  });
});
