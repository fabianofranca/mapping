// `formatVersion` 23 (stage #1900, NV4): a token as the background of a container preset and of the
// screen of an origin.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { parseSpec } from '../../src/model';
import { approximateMeasurer } from '../../src/model/components/instantiate';
import { loadLibrary } from '../../src/model/components/library';
import { screenFromSource } from '../../src/model/components/origin';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const fixture = (): Json =>
  JSON.parse(readFileSync('tests/fixtures/named-values-background.json', 'utf8')) as Json;
const schema = JSON.parse(readFileSync('docs/spec.schema.json', 'utf8')) as Json;
const jsonValidator = z.fromJSONSchema(schema as never);

const issuesOf = (raw: Json) => {
  const r = parseSpec(raw);
  return r.ok ? [] : r.issues.map(({ path, message }) => ({ path, message }));
};

const preset = (background: unknown, formatVersion = 23, tokens?: unknown): Json => {
  const spec = fixture();
  spec.formatVersion = formatVersion;
  if (tokens !== undefined) spec.tokens = tokens;
  spec.containers = [{ id: 'p', name: 'P', width: 100, height: 100, background }];
  return spec;
};

const ONLY = 'only allowed with formatVersion 23';
const MISSING = 'the token "x" does not exist in the specialization tokens';
const NUMBER = 'the token "gap" is a number, but a color is expected here';

describe('preset containers[].background: token (decision 28)', () => {
  it('the fixture is valid and a token background passes in the JSON Schema', () => {
    expect(issuesOf(fixture())).toEqual([]);
    expect(jsonValidator.safeParse(fixture()).success).toBe(true);
  });

  it('a token that does not exist is an error at the background', () => {
    expect(issuesOf(preset({ $token: 'x' }))).toEqual([
      { path: 'containers[0].background', message: MISSING },
    ]);
  });

  it('a number token is an error at the background', () => {
    expect(issuesOf(preset({ $token: 'gap' }))).toEqual([
      { path: 'containers[0].background', message: NUMBER },
    ]);
  });

  it('a token with another key is refused (strict object)', () => {
    expect(issuesOf(preset({ $token: 'surface', alpha: 0.5 })).length).toBeGreaterThan(0);
  });

  it('formatVersion 22 refuses the token with the version message only', () => {
    const tokens = { modes: ['light'], values: { surface: '#ffffff' } };
    expect(issuesOf(preset({ $token: 'surface' }, 22, tokens))).toEqual([
      { path: 'containers[0].background', message: ONLY },
    ]);
  });

  it('#RRGGBB stays valid in every version from 6 to 23', () => {
    for (let v = 6; v <= 23; v++) {
      const spec = preset('#112233', v);
      delete spec.tokens;
      expect(issuesOf(spec)).toEqual([]);
    }
  });
});

const NODE = { type: 'type', props: 'props', children: 'children' };
const originSpec = (background: unknown, formatVersion = 21): Json => ({
  format: 'mapping-spec',
  formatVersion,
  id: 'o',
  name: 'O',
  version: 1,
  layers: [],
  tokens: {
    modes: ['light', 'dark'],
    values: { surface: { light: '#FFFFFF', dark: '#121212' }, gap: 8 },
  },
  origins: [
    {
      system: 'sdui',
      node: NODE,
      screen: { width: 10, height: 10, roots: [{ path: 'content' }], background },
    },
  ],
});
const AT = 'origins[0].screen.background';

describe('origin screen.background: token (decision 29)', () => {
  it('a token is valid as the whole value, in values and in default', () => {
    expect(issuesOf(originSpec({ $token: 'surface' }))).toEqual([]);
    const mapped = {
      path: 'bg',
      values: { a: { $token: 'surface' } },
      default: { $token: 'surface' },
    };
    expect(issuesOf(originSpec(mapped))).toEqual([]);
  });

  it('a missing or number token is an error at the path of each position', () => {
    const mapped = (a: string, d: string) => ({
      path: 'bg',
      values: { a: { $token: a } },
      default: { $token: d },
    });
    expect(issuesOf(originSpec({ $token: 'x' }))).toEqual([
      { path: AT, message: MISSING },
    ]);
    expect(issuesOf(originSpec(mapped('gap', 'x')))).toEqual([
      { path: `${AT}.values.a`, message: NUMBER },
      { path: `${AT}.default`, message: MISSING },
    ]);
  });

  it('a token with another key is a problem; before the tokens version it is an error', () => {
    expect(issuesOf(originSpec({ $token: 'surface', alpha: 1 })).length).toBeGreaterThan(
      0,
    );
    const old = originSpec({ $token: 'surface' }, 14);
    delete old.tokens;
    expect(issuesOf(old)).toEqual([
      { path: AT, message: 'only allowed with formatVersion 15' },
    ]);
  });

  it('a color string stays valid in every version with origins', () => {
    for (const v of [4, 15, 21]) {
      const spec = originSpec('#FFFFFF', v);
      if (v < 15) delete spec.tokens;
      expect(issuesOf(spec)).toEqual([]);
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

function library(background: unknown, tokens: unknown) {
  const spec = {
    format: 'mapping-spec',
    formatVersion: 15,
    id: 'mini',
    name: 'Mini',
    version: 1,
    tokens,
    origins: [
      {
        system: 'sdui',
        node: NODE,
        screen: {
          id: 'screen',
          width: { path: 'w' },
          height: { path: 'h' },
          background,
          roots: [{ path: 'content', anchor: 'top-start' }],
        },
      },
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
const DOC = { w: 400, h: 800, content: { type: 'Box' }, bg: 'a' };
const TOKENS = {
  modes: ['light', 'dark'],
  values: {
    surface: { light: '#FFFFFF', dark: '#121212' },
    veil: { light: '#00000080', dark: '#ffffff80' },
    gap: 8,
  },
};
const bgOf = (
  background: unknown,
  selection?: Record<string, string>,
  tokens: unknown = TOKENS,
) =>
  screenFromSource(library(background, tokens), DOC, {
    measure: approximateMeasurer,
    ...(selection ? { selection } : {}),
  });

describe('screenFromSource resolves the background token in the selection', () => {
  it('light by default and dark when the selection says so', () => {
    expect(bgOf({ $token: 'surface' }).screen?.background).toBe('#FFFFFF');
    expect(bgOf({ $token: 'surface' }, { mode: 'dark' }).screen?.background).toBe(
      '#121212',
    );
  });

  it('alpha is composited over white', () => {
    expect(bgOf({ $token: 'veil' }).screen?.background).toBe('#7F7F7F');
  });

  it('an undeclared or number token gives white', () => {
    expect(bgOf({ $token: 'x' }, { mode: 'dark' }).screen?.background).toBe('#FFFFFF');
    expect(bgOf({ $token: 'gap' }, { mode: 'dark' }).screen?.background).toBe('#FFFFFF');
    expect(bgOf({ $token: 'surface' }, undefined, undefined).screen?.background).toBe(
      '#FFFFFF',
    );
  });

  it('a token in values and in default is resolved too; a plain color is untouched', () => {
    const mapped = {
      path: 'bg',
      values: { a: { $token: 'surface' } },
      default: { $token: 'veil' },
    };
    expect(bgOf(mapped, { mode: 'dark' }).screen?.background).toBe('#121212');
    expect(bgOf({ ...mapped, path: 'nothing' }).screen?.background).toBe('#7F7F7F');
    expect(bgOf('#ABCDEF').screen?.background).toBe('#ABCDEF');
  });

  it('a token object READ FROM THE DOCUMENT is not a token: white', () => {
    const doc = { ...DOC, bg: { $token: 'veil' } };
    const lib = library({ path: 'bg' }, TOKENS);
    const screen = screenFromSource(lib, doc, { measure: approximateMeasurer });
    expect(screen.screen?.background).toBe('#FFFFFF');
  });
});
