// Drawing mode (stage "faithful components" CF6; a map axis -> entry from stage #1900, NV3): the project's,
// the one the container pins and the effective one, with the per-axis rules. Pure model functions.
import { describe, expect, it } from 'vitest';
import {
  drawingAxesOf,
  effectiveDrawingMode,
  setContainerDrawingAxis,
  setContainerDrawingMode,
  setProjectDrawingAxis,
  setProjectDrawingMode,
  undeclaredDrawingMode,
  type Project,
} from '../../src/model';
import { resolveTokens } from '../../src/model/specTokens';
import { sampleProject } from './fixtures';

const TWO_AXES = {
  axes: { theme: ['light', 'dark'], contrast: ['normal', 'high'] },
  values: {},
};
const MODES = { modes: ['light', 'dark'], values: {} };

function projectWithContainer(): { p: Project; id: string } {
  const p = sampleProject();
  return { p, id: p.containers[0]!.id };
}

describe('drawing mode (single mode axis)', () => {
  it('setProjectDrawingMode sets, switches and removes (null)', () => {
    const { p } = projectWithContainer();
    const dark = setProjectDrawingMode(p, { mode: 'dark' });
    expect(dark.drawingMode).toEqual({ mode: 'dark' });
    expect(setProjectDrawingMode(dark, { mode: 'light' }).drawingMode).toEqual({
      mode: 'light',
    });
    const cleared = setProjectDrawingMode(dark, null);
    expect(cleared.drawingMode).toBeUndefined();
    expect('drawingMode' in cleared).toBe(false);
  });

  it('setContainerDrawingMode sets and goes back to following the project with null', () => {
    const { p, id } = projectWithContainer();
    const fixed = setContainerDrawingMode(p, id, { mode: 'light' });
    expect(fixed.containers[0]!.drawingMode).toEqual({ mode: 'light' });
    const follow = setContainerDrawingMode(fixed, id, null);
    expect(follow.containers[0]!.drawingMode ?? null).toBeNull();
    expect(setContainerDrawingMode(p, id, null)).toBe(p);
  });

  it("effective mode: the container's, else the project's, else undefined (first mode)", () => {
    const { p, id } = projectWithContainer();
    expect(effectiveDrawingMode(p, id)).toBeUndefined();
    const dark = setProjectDrawingMode(p, { mode: 'dark' });
    expect(effectiveDrawingMode(dark, id)).toEqual({ mode: 'dark' });
    const fixed = setContainerDrawingMode(dark, id, { mode: 'light' });
    expect(effectiveDrawingMode(fixed, id)).toEqual({ mode: 'light' });
    expect(effectiveDrawingMode(fixed, null)).toEqual({ mode: 'dark' });
  });
});

describe('effective drawing mode as a map', () => {
  it('the container pins contrast and follows the project theme', () => {
    const { p, id } = projectWithContainer();
    const set = setContainerDrawingMode(
      setProjectDrawingMode(p, { theme: 'dark', contrast: 'normal' }),
      id,
      { contrast: 'high' },
    );
    expect(effectiveDrawingMode(set, id)).toEqual({ theme: 'dark', contrast: 'high' });
  });

  it('the canvas marking (null container) follows the project', () => {
    const { p, id } = projectWithContainer();
    const set = setContainerDrawingMode(setProjectDrawingMode(p, { theme: 'dark' }), id, {
      theme: 'light',
    });
    expect(effectiveDrawingMode(set, null)).toEqual({ theme: 'dark' });
    expect(effectiveDrawingMode(set, id)).toEqual({ theme: 'light' });
  });

  it('is undefined with nothing pinned, and the project map itself when the container pins none', () => {
    const { p, id } = projectWithContainer();
    expect(effectiveDrawingMode(p, id)).toBeUndefined();
    const set = setProjectDrawingMode(p, { theme: 'dark' });
    expect(effectiveDrawingMode(set, id)).toBe(set.drawingMode);
  });

  it('an undeclared axis or entry draws with the default of each axis', () => {
    const selection = { theme: 'solar', density: 'compact', contrast: 'high' };
    const table = resolveTokens(
      {
        axes: TWO_AXES.axes,
        values: {
          bg: { $axis: 'theme', light: '#ffffff', dark: '#000000' },
        },
      } as never,
      {},
      selection,
    );
    expect(table.bg).toBe('#ffffff');
  });

  it('undeclaredDrawingMode lists, per axis, what no library declares', () => {
    const { p, id } = projectWithContainer();
    const declared = drawingAxesOf([TWO_AXES]);
    const set = setContainerDrawingMode(
      setProjectDrawingMode(p, { theme: 'solar', contrast: 'high' }),
      id,
      { density: 'compact', theme: 'dark' },
    );
    expect(undeclaredDrawingMode(set, declared)).toEqual([
      { axis: 'theme', entry: 'solar' },
      { axis: 'density', entry: 'compact' },
    ]);
    expect(undeclaredDrawingMode(p, declared)).toEqual([]);
  });

  it('a `modes` library and a two-axis library in the same project', () => {
    const axes = drawingAxesOf([MODES, TWO_AXES, undefined]);
    expect([...axes.keys()]).toEqual(['mode', 'theme', 'contrast']);
    expect(axes.get('mode')).toEqual(['light', 'dark']);
    const { p } = projectWithContainer();
    const set = setProjectDrawingMode(p, { mode: 'dark', theme: 'dark' });
    expect(undeclaredDrawingMode(set, axes)).toEqual([]);
  });

  it('drawingAxesOf merges entries by axis name in order of appearance, without repeats', () => {
    const axes = drawingAxesOf([
      { axes: { theme: ['light', 'dark'] }, values: {} },
      { axes: { theme: ['dark', 'sepia'] }, values: {} },
      { modes: ['light', 'dark'], values: {} },
    ]);
    expect(axes.get('theme')).toEqual(['light', 'dark', 'sepia']);
    expect(axes.get('mode')).toEqual(['light', 'dark']);
    expect(drawingAxesOf([]).size).toBe(0);
  });
});

describe('setting the map and one axis', () => {
  it('replaces the whole map; null and an empty map remove it; the same map returns the project', () => {
    const { p } = projectWithContainer();
    const a = setProjectDrawingMode(p, { theme: 'dark' });
    expect(setProjectDrawingMode(a, { contrast: 'high' }).drawingMode).toEqual({
      contrast: 'high',
    });
    expect(setProjectDrawingMode(a, { theme: 'dark' })).toBe(a);
    for (const empty of [null, {}]) {
      const cleared = setProjectDrawingMode(a, empty);
      expect('drawingMode' in cleared).toBe(false);
    }
    expect(setProjectDrawingMode(p, null)).toBe(p);
  });

  it('refuses an axis or an entry outside the pattern', () => {
    const { p, id } = projectWithContainer();
    expect(() => setProjectDrawingMode(p, { Theme: 'dark' })).toThrow();
    expect(() => setProjectDrawingMode(p, { theme: 'Dark Mode' })).toThrow();
    expect(() => setContainerDrawingMode(p, id, { theme: '' })).toThrow();
    expect(() => setContainerDrawingMode(p, 'nope', { theme: 'dark' })).toThrow();
  });

  it('the per-axis setters change one axis; null removes it; the last one removes the map', () => {
    const { p, id } = projectWithContainer();
    const a = setProjectDrawingAxis(
      setProjectDrawingAxis(p, 'theme', 'dark'),
      'contrast',
      'high',
    );
    expect(a.drawingMode).toEqual({ theme: 'dark', contrast: 'high' });
    const b = setProjectDrawingAxis(a, 'theme', null);
    expect(b.drawingMode).toEqual({ contrast: 'high' });
    expect('drawingMode' in setProjectDrawingAxis(b, 'contrast', null)).toBe(false);
    expect(setProjectDrawingAxis(a, 'theme', 'dark')).toBe(a);

    const c = setContainerDrawingAxis(p, id, 'contrast', 'high');
    expect(c.containers[0]!.drawingMode).toEqual({ contrast: 'high' });
    const d = setContainerDrawingAxis(c, id, 'contrast', null);
    expect(d.containers[0]!.drawingMode ?? null).toBeNull();
    expect(() => setContainerDrawingAxis(p, id, 'Bad', 'x')).toThrow();
  });
});
