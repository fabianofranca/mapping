// Drawing mode (stage "faithful components", CF6): the project's, the one the container fixes and the
// effective one. Pure model functions.
import { describe, expect, it } from 'vitest';
import {
  drawingModesOf,
  effectiveDrawingMode,
  setContainerDrawingMode,
  setProjectDrawingMode,
  undeclaredDrawingMode,
  type Project,
} from '../../src/model';
import { sampleProject } from './fixtures';

function projectWithContainer(): { p: Project; containerId: string } {
  const p = sampleProject();
  const containerId = p.containers[0]!.id;
  return { p, containerId };
}

describe('drawing mode', () => {
  it('setProjectDrawingMode sets, switches and removes (null)', () => {
    const { p } = projectWithContainer();
    const dark = setProjectDrawingMode(p, 'dark');
    expect(dark.drawingMode).toBe('dark');
    expect(setProjectDrawingMode(dark, 'light').drawingMode).toBe('light');
    const cleared = setProjectDrawingMode(dark, null);
    expect(cleared.drawingMode).toBeUndefined();
    expect('drawingMode' in cleared).toBe(false);
    // Same as what was already there: returns the same project.
    expect(setProjectDrawingMode(dark, 'dark')).toBe(dark);
    expect(setProjectDrawingMode(p, null)).toBe(p);
  });

  it('refuses an empty mode or one outside the pattern', () => {
    const { p } = projectWithContainer();
    expect(() => setProjectDrawingMode(p, '')).toThrow();
    expect(() => setProjectDrawingMode(p, 'Dark Mode')).toThrow();
  });

  it('setContainerDrawingMode sets and goes back to following the project with null', () => {
    const { p, containerId } = projectWithContainer();
    const fixed = setContainerDrawingMode(p, containerId, 'light');
    expect(fixed.containers[0]!.drawingMode).toBe('light');
    const follow = setContainerDrawingMode(fixed, containerId, null);
    expect(follow.containers[0]!.drawingMode ?? null).toBeNull();
    expect(setContainerDrawingMode(p, containerId, null)).toBe(p);
    expect(() => setContainerDrawingMode(p, 'does-not-exist', 'dark')).toThrow();
  });

  it("effective mode: the container's, else the project's, else undefined (first mode)", () => {
    const { p, containerId } = projectWithContainer();
    expect(effectiveDrawingMode(p, containerId)).toBeUndefined();
    const dark = setProjectDrawingMode(p, 'dark');
    expect(effectiveDrawingMode(dark, containerId)).toBe('dark');
    const fixed = setContainerDrawingMode(dark, containerId, 'light');
    expect(effectiveDrawingMode(fixed, containerId)).toBe('light');
    // A canvas marking (no container) follows the project.
    expect(effectiveDrawingMode(fixed, null)).toBe('dark');
  });

  it('drawingModesOf joins the modes of the specializations, without repeating', () => {
    expect(
      drawingModesOf([
        { modes: ['light', 'dark'] },
        { modes: ['dark', 'solar'] },
        undefined,
      ]),
    ).toEqual(['light', 'dark', 'solar']);
    expect(drawingModesOf([])).toEqual([]);
  });

  it('undeclaredDrawingMode: a saved mode that no specialization declares', () => {
    const { p, containerId } = projectWithContainer();
    const declared = ['light', 'dark'];
    expect(undeclaredDrawingMode(setProjectDrawingMode(p, 'dark'), declared)).toEqual([]);
    expect(undeclaredDrawingMode(setProjectDrawingMode(p, 'solar'), declared)).toEqual([
      'solar',
    ]);
    const both = setContainerDrawingMode(
      setProjectDrawingMode(p, 'solar'),
      containerId,
      'neon',
    );
    expect(undeclaredDrawingMode(both, declared)).toEqual(['solar', 'neon']);
  });
});
