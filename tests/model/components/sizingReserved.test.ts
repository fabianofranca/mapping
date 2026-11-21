// AM2 (#2150, decision 6 of #1893): `sizing` is evaluated with the instance's reserved values, the same
// ones the template sees: `$anchor.*` (from `options.anchor`) and `$direction` (from `options.direction`).
import { describe, expect, it } from 'vitest';
import type {
  ComponentFile,
  FrameTemplate,
} from '../../../src/model/components/componentFormat';
import type { InstanceAnchor } from '../../../src/model/components/anchor';
import { approximateMeasurer } from '../../../src/model/components/instantiate';
import {
  fitComponentSize,
  resolveSizing,
  sizingFollowsContent,
} from '../../../src/model/components/sizing';

function component(sizing: unknown): ComponentFile {
  return {
    format: 'mapping-component',
    formatVersion: 4,
    id: 'c',
    name: 'C',
    size: { width: 50, height: 40 },
    minSize: { width: 10, height: 10 },
    sizing,
    template: {
      type: 'frame',
      layout: { type: 'column', padding: 0 },
      children: [{ type: 'rect', width: 20, height: 20, fill: '#ffffff' }],
    } as unknown as FrameTemplate,
  } as unknown as ComponentFile;
}

const bySide = component({
  width: { $switch: '$anchor.side', cases: { start: 96, end: 96 }, default: 80 },
});
const byDirection = component({
  width: { $if: { $direction: 'rtl' }, then: 70, else: 60 },
});

const anchorOn = (side: InstanceAnchor['side']): InstanceAnchor => ({
  side,
  centerX: 0,
  centerY: 0,
  width: 10,
  height: 10,
});

const widthOf = (resolved: ReturnType<typeof resolveSizing>) => resolved.width.spec;

describe('resolveSizing with the reserved values', () => {
  it('$anchor.side picks the branch; without an anchor it stays on the default', () => {
    expect(
      widthOf(resolveSizing(bySide, {}, undefined, { anchor: anchorOn('start') })),
    ).toBe(96);
    expect(
      widthOf(resolveSizing(bySide, {}, undefined, { anchor: anchorOn('top') })),
    ).toBe(80);
    expect(widthOf(resolveSizing(bySide, {}))).toBe(80);
    expect(widthOf(resolveSizing(bySide, {}, undefined, {}))).toBe(80);
  });

  it('$direction picks the branch; the default direction is ltr', () => {
    expect(widthOf(resolveSizing(byDirection, {}, undefined, { direction: 'rtl' }))).toBe(
      70,
    );
    expect(widthOf(resolveSizing(byDirection, {}, undefined, { direction: 'ltr' }))).toBe(
      60,
    );
    expect(widthOf(resolveSizing(byDirection, {}))).toBe(60);
  });

  it('a field of the type does not hide the reserved value', () => {
    const shadowed = resolveSizing(bySide, { '$anchor.side': 'top' }, undefined, {
      anchor: anchorOn('end'),
    });
    expect(widthOf(shadowed)).toBe(96);
  });
});

describe('fitComponentSize passes the instance anchor and direction to sizing', () => {
  it('the width by $anchor.side is the one the anchor gives', () => {
    const fit = (anchor?: InstanceAnchor) =>
      fitComponentSize(
        bySide,
        {},
        { measure: approximateMeasurer, ...(anchor ? { anchor } : {}) },
      );
    expect(fit(anchorOn('start'))?.width).toBe(96);
    expect(fit(anchorOn('bottom'))?.width).toBe(80);
    expect(fit()?.width).toBe(80);
  });

  it('the width by $direction is the one of the reading direction', () => {
    const fit = (direction?: 'rtl') =>
      fitComponentSize(
        byDirection,
        {},
        { measure: approximateMeasurer, ...(direction ? { direction } : {}) },
      );
    expect(fit('rtl')?.width).toBe(70);
    expect(fit()?.width).toBe(60);
  });
});

describe('sizingFollowsContent with the reserved values', () => {
  const byAnchorSide = component({
    height: { $switch: '$anchor.side', cases: { top: 'hug' }, default: 48 },
  });

  it('decides on the branch the instance draws', () => {
    expect(sizingFollowsContent(byAnchorSide, {})).toBe(false);
    expect(sizingFollowsContent(byAnchorSide, {}, { anchor: anchorOn('top') })).toBe(
      true,
    );
    expect(sizingFollowsContent(byAnchorSide, {}, { anchor: anchorOn('bottom') })).toBe(
      false,
    );
    const byDir = component({
      width: { $if: { $direction: 'rtl' }, then: 'hug', else: 120 },
    });
    expect(sizingFollowsContent(byDir, {})).toBe(false);
    expect(sizingFollowsContent(byDir, {}, { direction: 'rtl' })).toBe(true);
  });
});
