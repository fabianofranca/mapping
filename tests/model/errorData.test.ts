import { describe, expect, it } from 'vitest';
import {
  ModelError,
  addBackgroundContainer,
  addContainer,
  createMarking,
  moveContainer,
  moveItems,
  setBackgroundContainer,
  setContainerPlacement,
  setMarkingRect,
  setMarkingSpace,
} from '../../src/model';
import { emptyProject, sampleProject } from './fixtures';
import { multiProject } from './multiSelectionFixtures';

// `ModelError.data`: structured facts about the error (received size, minimum, other container).
// The model knows no references or interface text; the MCP is what writes the detail.

function errorOf(op: () => unknown): ModelError {
  try {
    op();
  } catch (e) {
    if (e instanceof ModelError) return e;
    throw e;
  }
  throw new Error('the operation did not fail');
}

const rect = (x: number, y: number, width: number, height: number) => ({
  x,
  y,
  width,
  height,
});

describe('ModelError.data: rect-too-small', () => {
  it('createMarking below the marking minimum carries received and minimum', () => {
    const error = errorOf(() =>
      createMarking(sampleProject(), {
        id: 'X',
        containerId: 'I2',
        rect: rect(0, 0, 5, 3),
      }),
    );
    expect(error.code).toBe('rect-too-small');
    expect(error.data).toEqual({
      received: { width: 5, height: 3 },
      min: { width: 8, height: 8 },
      source: 'marking',
    });
    // Today's message does not change.
    expect(error.message).toBe('rect-too-small');
  });

  it("with a larger component minSize, the minimum is the component's", () => {
    const error = errorOf(() =>
      createMarking(
        sampleProject(),
        { id: 'X', containerId: 'I2', rect: rect(0, 0, 30, 30) },
        { minSize: { width: 48, height: 40 } },
      ),
    );
    expect(error.data).toEqual({
      received: { width: 30, height: 30 },
      min: { width: 48, height: 40 },
      source: 'component',
    });
  });

  it('below both, the larger of each side wins and the source is the component', () => {
    const error = errorOf(() =>
      setMarkingRect(sampleProject(), 'M1', rect(0, 0, 5, 50), {
        minSize: { width: 48, height: 40 },
      }),
    );
    expect(error.data).toEqual({
      received: { width: 5, height: 50 },
      min: { width: 48, height: 40 },
      source: 'component',
    });
  });

  it('setMarkingRect and setMarkingSpace below the minimum carry the data', () => {
    const a = errorOf(() => setMarkingRect(sampleProject(), 'M1', rect(0, 0, 7, 10)));
    expect(a.data).toMatchObject({
      received: { width: 7, height: 10 },
      source: 'marking',
    });
    const b = errorOf(() =>
      setMarkingSpace(sampleProject(), 'M1', null, rect(0, 0, 10, 2)),
    );
    expect(b.data).toMatchObject({
      received: { width: 10, height: 2 },
      source: 'marking',
    });
  });
});

describe('ModelError.data: image-overlap', () => {
  it('moveContainer says which container it overlaps (the other one)', () => {
    const error = errorOf(() => moveContainer(sampleProject(), 'I2', 999, 0));
    expect(error.code).toBe('image-overlap');
    expect(error.data).toEqual({ containerId: 'I1' });
    expect(error.message).toBe('image-overlap');
  });

  it('setContainerPlacement says the other container', () => {
    const error = errorOf(() =>
      setContainerPlacement(sampleProject(), 'I2', { x: 999, y: 0, scale: 1 }),
    );
    expect(error.data).toEqual({ containerId: 'I1' });
  });

  it('setBackgroundContainer growing over another says which', () => {
    let p = addBackgroundContainer(emptyProject(), {
      id: 'B1',
      width: 100,
      height: 100,
      background: '#FFFFFF',
    });
    p = addBackgroundContainer(p, {
      id: 'B2',
      width: 100,
      height: 100,
      background: '#000000',
    });
    const error = errorOf(() => setBackgroundContainer(p, 'B1', { width: 2000 }));
    expect(error.code).toBe('image-overlap');
    expect(error.data).toEqual({ containerId: 'B2' });
  });

  it('moveItems: the id is that of the container that does NOT move, not the moved one', () => {
    const error = errorOf(() =>
      moveItems(multiProject(), [{ kind: 'image', id: 'A' }], 1500, 0),
    );
    expect(error.code).toBe('image-overlap');
    expect(error.data).toEqual({ containerId: 'B' });
    expect(error.message).toBe('image-overlap');
  });
});

describe('ModelError without data', () => {
  it('the other errors stay without the field', () => {
    const error = errorOf(() =>
      addContainer(sampleProject(), { id: 'I1', file: 'x.png', width: 1, height: 1 }),
    );
    expect(error.data).toBeUndefined();
  });
});
