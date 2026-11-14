// R3 (#1096, decision 11): `anchorValues` puts the anchor of a marking into what the instance reads
// (`$anchor.*`): center and size in units, relative to the instance box; the side is the logical one.
import { describe, expect, it } from 'vitest';
import { anchorValues } from '../../src/model/componentValues';

const rect = { x: 100, y: 200, width: 80, height: 40 };
const target = { x: 110, y: 100, width: 60, height: 20 };

describe('anchorValues', () => {
  it('density 1: the anchor center relative to the marking corner, in pixels', () => {
    expect(
      anchorValues({
        rect,
        anchorRect: target,
        side: 'top',
        defaults: { side: 'bottom' },
        density: 1,
      }),
    ).toEqual({ side: 'top', centerX: 40, centerY: -90, width: 60, height: 20 });
  });

  it('the density converts everything to component units', () => {
    expect(
      anchorValues({
        rect,
        anchorRect: target,
        side: 'top',
        defaults: { side: 'bottom' },
        density: 2,
      }),
    ).toEqual({ side: 'top', centerX: 20, centerY: -45, width: 30, height: 10 });
  });

  it('the center can go past the box (x greater than the width, negative y)', () => {
    const far = { x: 500, y: 0, width: 20, height: 20 };
    const v = anchorValues({
      rect,
      anchorRect: far,
      side: 'start',
      defaults: { side: 'top' },
      density: 1,
    });
    expect(v.centerX).toBe(410);
    expect(v.centerY).toBe(-190);
  });

  it('without a declared side, the component default applies; the side is logical, not physical', () => {
    const v = anchorValues({
      rect,
      anchorRect: target,
      side: undefined,
      defaults: { side: 'end' },
      density: 1,
    });
    expect(v.side).toBe('end');
  });
});
