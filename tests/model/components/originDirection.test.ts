// R1 (#1096): `screen.direction` da origem (ltr/rtl), validada e repassada ao `layoutScreen`.
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

describe('origem: screen.direction', () => {
  it('lê ltr e rtl; ausente fica sem a chave', () => {
    for (const direction of ['ltr', 'rtl'] as const) {
      const { origins, problems } = parseOrigins([originOf({ direction })]);
      expect(problems).toEqual([]);
      expect(origins[0]?.screen.direction).toBe(direction);
    }
    const none = parseOrigins([originOf({})]);
    expect(none.origins[0]?.screen).not.toHaveProperty('direction');
  });

  it('valor fora do conjunto é problema no caminho da chave', () => {
    for (const bad of ['cima', 1, null, { path: 'd' }]) {
      const { origins, problems } = parseOrigins([originOf({ direction: bad })]);
      expect(origins).toEqual([]);
      expect(problems.map(originProblemText)).toEqual([
        'origins[0].screen.direction: esperava um de: ltr, rtl',
      ]);
    }
  });
});

const BOX = {
  format: 'mapping-component',
  formatVersion: 1,
  id: 'box',
  name: 'Caixa',
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
        id: 'tela',
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
            name: 'Caixa',
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

describe('origem: direction chega ao layoutScreen', () => {
  it('translateSource põe a direção na LayoutScreen (só em rtl)', () => {
    expect(translateSource(library('rtl'), DOC).layout?.direction).toBe('rtl');
    expect(translateSource(library(), DOC).layout?.direction).toBeUndefined();
  });

  it('a raiz ancorada em top-start vai para a direita em rtl', () => {
    const ltr = screenFromSource(library('ltr'), DOC, { measure: approximateMeasurer });
    const rtl = screenFromSource(library('rtl'), DOC, { measure: approximateMeasurer });
    expect(ltr.error).toBeUndefined();
    const x = (r: typeof ltr) => r.screen?.instances[0]?.box.x;
    expect(x(ltr)).toBe(0);
    expect(x(rtl)).toBe(300);
  });

  it('a Screen pronta leva a direção resolvida (a da origem ou a de options), só em rtl', () => {
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

  it('options.direction vence a da origem (e vale em ltr explícito)', () => {
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
