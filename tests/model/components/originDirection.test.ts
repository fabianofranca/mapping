// R1 (#1096): `screen.direction` of the origin (ltr/rtl), validated and passed on to `layoutScreen`.
import { describe, expect, it } from 'vitest';
import {
  originProblemText,
  parseOrigins,
  screenFromSource,
  translateSource,
} from '../../../src/model/components/origin';
import { approximateMeasurer } from '../../../src/model/components/instantiate';
import { loadLibrary } from '../../../src/model/components/library';

const NODE = { type: 'type', props: 'props', children: 'children' };
const screenOf = (extra: Record<string, unknown>) => ({
  width: { path: 'w' },
  height: { path: 'h' },
  roots: [{ path: 'content', anchor: 'top-start' }],
  ...extra,
});
const originOf = (extra: Record<string, unknown>) => ({
  system: 'sdui',
  node: NODE,
  screen: screenOf(extra),
});

describe('origin: screen.direction', () => {
  it('reads ltr and rtl; absent stays without the key', () => {
    for (const direction of ['ltr', 'rtl'] as const) {
      const { origins, problems } = parseOrigins([originOf({ direction })]);
      expect(problems).toEqual([]);
      expect(origins[0]?.screen.direction).toBe(direction);
    }
    const none = parseOrigins([originOf({})]);
    expect(none.origins[0]?.screen).not.toHaveProperty('direction');
  });

  it('a value outside the set is a problem at the key path', () => {
    for (const bad of ['up', 1, null, { path: 'd' }]) {
      const { origins, problems } = parseOrigins([originOf({ direction: bad })]);
      expect(origins).toEqual([]);
      expect(problems.map(originProblemText)).toEqual([
        'origins[0].screen.direction: expected one of: ltr, rtl',
      ]);
    }
  });
});

const BOX = {
  format: 'mapping-component',
  formatVersion: 1,
  id: 'box',
  name: 'Box',
  size: { width: 100, height: 40 },
  template: { type: 'frame', name: 'box', layout: { type: 'none' } },
};

function library(direction?: string) {
  const spec = {
    format: 'mapping-spec',
    formatVersion: 4,
    id: 'mini',
    name: 'Mini',
    version: 1,
    origins: [
      originOf({
        id: 'screen',
        ...(direction ? { direction } : {}),
      }),
    ],
    layers: [
      {
        id: 'l',
        name: 'L',
        annotationTypes: [
          {
            id: 'box',
            name: 'Box',
            component: 'components/box.json',
            sources: [{ system: 'sdui', name: 'Box' }],
            fields: [],
          },
        ],
      },
    ],
  };
  return loadLibrary([
    { path: 'spec.json', text: JSON.stringify(spec) },
    { path: 'components/box.json', text: JSON.stringify(BOX) },
  ]);
}
const DOC = { w: 400, h: 800, content: { type: 'Box' } };

describe('origin: direction reaches layoutScreen', () => {
  it('translateSource puts the direction in the LayoutScreen (only in rtl)', () => {
    expect(translateSource(library('rtl'), DOC).layout?.direction).toBe('rtl');
    expect(translateSource(library(), DOC).layout?.direction).toBeUndefined();
  });

  it('the root anchored at top-start goes to the right in rtl', () => {
    const ltr = screenFromSource(library('ltr'), DOC, { measure: approximateMeasurer });
    const rtl = screenFromSource(library('rtl'), DOC, { measure: approximateMeasurer });
    expect(ltr.error).toBeUndefined();
    const x = (r: typeof ltr) => r.screen?.instances[0]?.box.x;
    expect(x(ltr)).toBe(0);
    expect(x(rtl)).toBe(300);
  });

  it('the finished Screen carries the resolved direction (that of the origin or of options), only in rtl', () => {
    const dir = (d: 'ltr' | 'rtl' | undefined, origin?: string) =>
      screenFromSource(library(origin), DOC, {
        measure: approximateMeasurer,
        ...(d ? { direction: d } : {}),
      }).screen;
    expect(dir(undefined, 'rtl')?.direction).toBe('rtl');
    expect(dir('rtl')?.direction).toBe('rtl');
    expect(dir('ltr', 'rtl')).not.toHaveProperty('direction');
    expect(dir(undefined, 'ltr')).not.toHaveProperty('direction');
    expect(dir(undefined)).not.toHaveProperty('direction');
  });

  it('options.direction beats that of the origin (and applies in explicit ltr)', () => {
    const rtlOrigin = library('rtl');
    const forced = translateSource(rtlOrigin, DOC, { direction: 'ltr' }).layout;
    expect(forced?.direction).toBeUndefined();
    expect(translateSource(library(), DOC, { direction: 'rtl' }).layout?.direction).toBe(
      'rtl',
    );
    const x = (d?: 'ltr' | 'rtl') =>
      screenFromSource(rtlOrigin, DOC, {
        measure: approximateMeasurer,
        ...(d ? { direction: d } : {}),
      }).screen?.instances[0]?.box.x;
    expect(x()).toBe(300);
    expect(x('ltr')).toBe(0);
  });
});
