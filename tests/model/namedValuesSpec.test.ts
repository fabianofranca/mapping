// `formatVersion` 23 (stage #1900, NV1): `tokens` with axes, aliases, composites and the `$value` wrapper.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseSpec } from '../../src/model';

type Json = Record<string, unknown>;

function spec(tokens: unknown, formatVersion = 23): Json {
  return {
    format: 'mapping-spec',
    formatVersion,
    id: 's',
    name: 'S',
    version: 1,
    layers: [],
    tokens,
  };
}

const issuesOf = (raw: Json) => {
  const r = parseSpec(raw);
  return r.ok ? [] : r.issues.map(({ path, message }) => ({ path, message }));
};

const THEME = { theme: ['light', 'dark'], contrast: ['standard', 'high'] };

/** Tokens of version 23 with the two axes of the example and the given values. */
const withAxes = (values: unknown) => ({ axes: THEME, values });

const AXIS_MSG = 'only allowed with formatVersion 23';

describe('formatVersion 23: axes', () => {
  it('axes with values that vary by axis are valid', () => {
    const tokens = withAxes({
      bg: { $axis: 'theme', light: '#ffffff', dark: '#000000' },
      gap: 8,
    });
    expect(issuesOf(spec(tokens))).toEqual([]);
  });

  it('modes and axes together are an error at tokens.axes', () => {
    const tokens = { modes: ['light'], axes: THEME, values: {} };
    expect(issuesOf(spec(tokens))).toContainEqual({
      path: 'tokens.axes',
      message: 'use modes or axes, not both',
    });
  });

  it('axes in a version below 23 are an error at tokens.axes', () => {
    const tokens = { modes: ['light'], axes: THEME, values: {} };
    expect(issuesOf(spec(tokens, 22))).toContainEqual({
      path: 'tokens.axes',
      message: AXIS_MSG,
    });
  });

  it('an empty axis is an error at its path', () => {
    expect(issuesOf(spec({ axes: { theme: [] }, values: {} }))).toEqual([
      { path: 'tokens.axes.theme', message: 'must be a list with at least one mode' },
    ]);
  });

  it('a repeated entry is an error at its index', () => {
    expect(issuesOf(spec({ axes: { theme: ['light', 'light'] }, values: {} }))).toEqual([
      { path: 'tokens.axes.theme[1]', message: 'mode "light" repeated' },
    ]);
  });

  it('an entry outside the pattern is an error at its index', () => {
    expect(issuesOf(spec({ axes: { theme: ['Light'] }, values: {} }))).toEqual([
      { path: 'tokens.axes.theme[0]', message: 'invalid mode; use [a-z0-9][a-z0-9-]*' },
    ]);
  });

  it('an axis name outside the pattern is an error at the axis', () => {
    expect(issuesOf(spec({ axes: { Theme: ['light'] }, values: {} }))).toEqual([
      { path: 'tokens.axes.Theme', message: 'invalid name; use [a-z0-9][a-z0-9-]*' },
    ]);
  });

  it('modes and axes are optional in 23, and required in 22 as before', () => {
    expect(issuesOf(spec({ values: { gap: 8 } }))).toEqual([]);
    expect(issuesOf(spec({ values: { gap: 8 } }, 22))).toEqual([
      { path: 'tokens.modes', message: 'must be a list with at least one mode' },
    ]);
  });

  it('without axes no value may vary', () => {
    const tokens = { values: { bg: { $axis: 'theme', light: 1, dark: 2 } } };
    expect(issuesOf(spec(tokens))).toEqual([
      { path: 'tokens.values.bg', message: 'the axis "theme" is not declared' },
    ]);
  });
});

describe('formatVersion 23: per-axis values', () => {
  it('a missing entry is an error at the value', () => {
    const tokens = withAxes({ bg: { $axis: 'theme', light: '#ffffff' } });
    expect(issuesOf(spec(tokens))).toEqual([
      { path: 'tokens.values.bg', message: 'missing the mode dark' },
    ]);
  });

  it('an extra entry is an error at the value', () => {
    const tokens = withAxes({
      bg: { $axis: 'theme', light: '#fff', dark: '#000', sepia: '#aaa' },
    });
    expect(issuesOf(spec(tokens))).toEqual([
      { path: 'tokens.values.bg', message: 'mode not declared in modes: sepia' },
    ]);
  });

  it('an unknown axis is an error at the value', () => {
    const tokens = withAxes({ bg: { $axis: 'size', small: 1 } });
    expect(issuesOf(spec(tokens))).toEqual([
      { path: 'tokens.values.bg', message: 'the axis "size" is not declared' },
    ]);
  });

  it('the same axis nested twice is an error at the inner value', () => {
    const tokens = withAxes({
      bg: {
        $axis: 'theme',
        light: { $axis: 'theme', light: 1, dark: 2 },
        dark: 3,
      },
    });
    expect(issuesOf(spec(tokens))).toEqual([
      {
        path: 'tokens.values.bg.light',
        message: 'the axis "theme" is already used by an enclosing value',
      },
    ]);
  });

  it('another axis nested is valid', () => {
    const inner = (a: number, b: number) => ({
      $axis: 'contrast',
      standard: a,
      high: b,
    });
    const tokens = withAxes({
      gap: { $axis: 'theme', light: inner(1, 2), dark: inner(3, 4) },
    });
    expect(issuesOf(spec(tokens))).toEqual([]);
  });

  it('branches of different kinds are an error at the value', () => {
    const tokens = withAxes({ bg: { $axis: 'theme', light: '#ffffff', dark: 3 } });
    expect(issuesOf(spec(tokens))).toEqual([
      {
        path: 'tokens.values.bg',
        message: 'the branches of a value must have the same kind',
      },
    ]);
  });

  it('a color and a font family in two branches differ in kind', () => {
    const tokens = withAxes({ bg: { $axis: 'theme', light: '#ffffff', dark: 'Roboto' } });
    expect(issuesOf(spec(tokens)).map((i) => i.path)).toEqual(['tokens.values.bg']);
  });

  it('composite branches with different fields are an error at the value', () => {
    const tokens = withAxes({
      t: { $axis: 'theme', light: { size: 1, weight: 400 }, dark: { size: 2 } },
    });
    expect(issuesOf(spec(tokens))).toEqual([
      {
        path: 'tokens.values.t',
        message: 'the branches of a composite must have the same fields',
      },
    ]);
  });

  it('composite branches with the same fields are valid', () => {
    const tokens = withAxes({
      t: { $axis: 'theme', light: { size: 1 }, dark: { size: 2 } },
    });
    expect(issuesOf(spec(tokens))).toEqual([]);
  });

  it('a scalar branch and a composite branch differ in kind', () => {
    const tokens = withAxes({
      t: { $axis: 'theme', light: { size: 1 }, dark: 2 },
    });
    expect(issuesOf(spec(tokens))).toEqual([
      {
        path: 'tokens.values.t',
        message: 'the branches of a value must have the same kind',
      },
    ]);
  });

  it('$axis must be text', () => {
    const tokens = withAxes({ bg: { $axis: 3, light: 1 } });
    expect(issuesOf(spec(tokens))).toEqual([
      { path: 'tokens.values.bg.$axis', message: 'must be text' },
    ]);
  });

  it('with modes, $axis "mode" and the legacy plain object are both accepted', () => {
    const tokens = {
      modes: ['light', 'dark'],
      values: {
        a: { $axis: 'mode', light: '#ffffff', dark: '#000000' },
        b: { light: '#ffffff', dark: '#000000' },
      },
    };
    expect(issuesOf(spec(tokens))).toEqual([]);
  });

  it('a legacy per-mode value keeps the 15 to 22 messages when the keys match', () => {
    const tokens = {
      modes: ['light', 'dark'],
      values: { a: { light: '#fff', dark: 3 } },
    };
    expect(issuesOf(spec(tokens))).toEqual([
      {
        path: 'tokens.values.a',
        message: 'the branches of a value must have the same kind',
      },
    ]);
  });
});

describe('formatVersion 23: aliases', () => {
  it('an alias to a scalar, to font-sans and to a composite field is valid', () => {
    const tokens = withAxes({
      primary: '#1a73e8',
      title: { size: 22, family: { $token: 'font-sans' } },
      accent: { $token: 'primary' },
      body: { $token: 'font-sans' },
      big: { $token: 'title.size' },
      face: { $token: 'title.family' },
    });
    expect(issuesOf(spec(tokens))).toEqual([]);
  });

  it('alpha and over on a color alias are valid', () => {
    const tokens = withAxes({
      surface: '#ffffff',
      ink: '#000000',
      muted: { $token: 'ink', alpha: 0.38, over: 'surface' },
      faded: { $token: 'ink', alpha: 0.5, over: '#ffffff' },
    });
    expect(issuesOf(spec(tokens))).toEqual([]);
  });

  it('an alias in a branch and in a composite field is valid', () => {
    const tokens = withAxes({
      a: '#ffffff',
      b: '#000000',
      c: { $axis: 'theme', light: { $token: 'a' }, dark: { $token: 'b' } },
      t: { color: { $token: 'a' }, size: 3 },
    });
    expect(issuesOf(spec(tokens))).toEqual([]);
  });

  it('a missing target is an error at the position', () => {
    const tokens = withAxes({
      c: { $axis: 'theme', light: { $token: 'zzz' }, dark: '#000000' },
    });
    expect(issuesOf(spec(tokens))).toEqual([
      {
        path: 'tokens.values.c.light',
        message: 'the token "zzz" does not exist in the specialization tokens',
      },
    ]);
  });

  it('a cycle is an error at the token that closes it', () => {
    const tokens = withAxes({ a: { $token: 'b' }, b: { $token: 'a' } });
    expect(issuesOf(spec(tokens))).toEqual([
      { path: 'tokens.values.b', message: 'token cycle: a → b → a' },
    ]);
  });

  it('an alias to itself is a cycle', () => {
    expect(issuesOf(spec(withAxes({ a: { $token: 'a' } })))).toEqual([
      { path: 'tokens.values.a', message: 'token cycle: a → a' },
    ]);
  });

  it('alpha on a number is an error at the $token', () => {
    const tokens = withAxes({ n: 4, b: { $token: 'n', alpha: 0.5 } });
    expect(issuesOf(spec(tokens))).toEqual([
      {
        path: 'tokens.values.b.$token',
        message: 'alpha is only valid on a color $token',
      },
    ]);
  });

  it('over on a number is an error at the $token', () => {
    const tokens = withAxes({ n: 4, c: '#ffffff', b: { $token: 'n', over: 'c' } });
    expect(issuesOf(spec(tokens))).toEqual([
      { path: 'tokens.values.b.$token', message: 'over is only valid in a color $token' },
    ]);
  });

  it('alpha must be a number from 0 to 1', () => {
    const tokens = withAxes({ c: '#ffffff', b: { $token: 'c', alpha: 2 } });
    expect(issuesOf(spec(tokens))).toEqual([
      {
        path: 'tokens.values.b.alpha',
        message: 'alpha must be a number from 0 to 1 or a number $token',
      },
    ]);
  });

  it('a whole composite read as a scalar is an error', () => {
    const tokens = withAxes({ title: { size: 22 }, b: { $token: 'title' } });
    expect(issuesOf(spec(tokens))).toEqual([
      {
        path: 'tokens.values.b',
        message: 'the token "title" is a composite; read one field (title.<field>)',
      },
    ]);
  });

  it('a field of a scalar or a missing field is an error', () => {
    const tokens = withAxes({
      x: 1,
      title: { size: 22 },
      a: { $token: 'x.y' },
      b: { $token: 'title.nope' },
    });
    expect(issuesOf(spec(tokens))).toEqual([
      { path: 'tokens.values.a', message: 'the token "x" has no field "y"' },
      { path: 'tokens.values.b', message: 'the token "title" has no field "nope"' },
    ]);
  });

  it('an alias with an unknown key is an error', () => {
    const tokens = withAxes({ c: '#ffffff', b: { $token: 'c', beta: 1 } });
    expect(issuesOf(spec(tokens))).toEqual([
      { path: 'tokens.values.b.beta', message: 'unknown key: beta' },
    ]);
  });
});

describe('formatVersion 23: composites', () => {
  it('a composite with literal, alias and per-axis fields is valid', () => {
    const tokens = withAxes({
      title: {
        size: { $axis: 'theme', light: 22, dark: 24 },
        lineHeight: 28,
        weight: 500,
        family: { $token: 'font-sans' },
      },
    });
    expect(issuesOf(spec(tokens))).toEqual([]);
  });

  it('a field name outside the pattern is an error at the field', () => {
    expect(issuesOf(spec({ values: { t: { Size: 1 } } }))).toEqual([
      {
        path: 'tokens.values.t.Size',
        message: 'invalid field name; use [a-z][a-zA-Z0-9]*',
      },
    ]);
  });

  it('a composite needs at least one field', () => {
    expect(issuesOf(spec({ values: { t: {} } }))).toEqual([
      { path: 'tokens.values.t', message: 'a composite needs at least one field' },
    ]);
  });

  it('a nested composite is an error at the field', () => {
    expect(issuesOf(spec({ values: { t: { a: { b: 1 } } } }))).toEqual([
      {
        path: 'tokens.values.t.a',
        message: 'a composite cannot contain another composite',
      },
    ]);
  });

  it('a field per-axis value with a composite branch is an error', () => {
    const tokens = withAxes({
      t: { a: { $axis: 'theme', light: { b: 1 }, dark: 2 } },
    });
    expect(issuesOf(spec(tokens)).map((i) => i.message)).toContain(
      'a composite cannot contain another composite',
    );
  });

  it('a field value that is not text or a number is an error', () => {
    expect(issuesOf(spec({ values: { t: { a: true } } }))).toEqual([
      {
        path: 'tokens.values.t.a',
        message: 'must be text, a number, an alias, a composite or a per-axis value',
      },
    ]);
  });

  it('in a modes library a plain object with exactly the modes is still per-mode', () => {
    const tokens = {
      modes: ['light', 'dark'],
      values: { p: { light: '#111111', dark: '#222222' } },
    };
    expect(issuesOf(spec(tokens))).toEqual([]);
  });

  it('a plain object that is not exactly the modes is a composite', () => {
    const tokens = { modes: ['light', 'dark'], values: { p: { light: 1 } } };
    expect(issuesOf(spec(tokens))).toEqual([]);
  });

  it('a field named like a mode is a field when the library has axes', () => {
    const tokens = withAxes({ p: { light: 1, dark: 2 } });
    expect(issuesOf(spec(tokens))).toEqual([]);
  });
});

describe('formatVersion 23: the $value wrapper', () => {
  it('a wrapper with description, group and notices is valid', () => {
    const tokens = {
      values: {
        a: {
          $value: '#ffffff',
          $description: 'The page color',
          $group: 'colors-1',
          $notices: [{ kind: 'deprecated', message: 'use b', since: '2026-01-01' }],
        },
      },
    };
    expect(issuesOf(spec(tokens))).toEqual([]);
  });

  it('a wrapper around an alias, a per-axis value and a composite is valid', () => {
    const tokens = withAxes({
      a: { $value: '#ffffff' },
      b: { $value: { $token: 'a' }, $description: 'alias' },
      c: { $value: { $axis: 'theme', light: 1, dark: 2 } },
      d: { $value: { size: 2 }, $group: 'text' },
    });
    expect(issuesOf(spec(tokens))).toEqual([]);
  });

  it('$value is required', () => {
    expect(issuesOf(spec({ values: { a: { $description: 'x' } } }))).toEqual([
      { path: 'tokens.values.a.$value', message: 'required' },
    ]);
  });

  it('$group follows the name pattern', () => {
    expect(issuesOf(spec({ values: { a: { $value: 1, $group: 'Bad' } } }))).toEqual([
      {
        path: 'tokens.values.a.$group',
        message: 'invalid group; use [a-z0-9][a-z0-9-]*',
      },
    ]);
  });

  it('$description must be text', () => {
    expect(issuesOf(spec({ values: { a: { $value: 1, $description: 3 } } }))).toEqual([
      { path: 'tokens.values.a.$description', message: 'must be text' },
    ]);
  });

  it('$notices follow the notice rules of formatVersion 10', () => {
    const bad = { $value: 1, $notices: [{ kind: 'x', message: 'm' }] };
    expect(issuesOf(spec({ values: { a: bad } }))).toEqual([
      {
        path: 'tokens.values.a.$notices[0].kind',
        message: '"x" is invalid; use "removed", "deprecated", "diverges" or "pending"',
      },
    ]);
    const notice = { kind: 'deprecated', message: 'm' };
    const repeated = { $value: 1, $notices: [notice, { ...notice }] };
    expect(issuesOf(spec({ values: { a: repeated } }))).toEqual([
      { path: 'tokens.values.a.$notices[1]', message: 'repeated notice' },
    ]);
  });

  it('$notices must be a list', () => {
    const tokens = { values: { a: { $value: 1, $notices: 'x' } } };
    expect(issuesOf(spec(tokens)).map((i) => i.path)).toEqual([
      'tokens.values.a.$notices',
    ]);
  });

  it('another $ key is an unknown key', () => {
    expect(issuesOf(spec({ values: { a: { $value: 1, $other: 1 } } }))).toEqual([
      { path: 'tokens.values.a.$other', message: 'unknown key: $other' },
    ]);
  });

  it('the wrapper only exists at the top of a token', () => {
    const tokens = withAxes({
      a: { $axis: 'theme', light: { $value: 1 }, dark: 2 },
    });
    expect(issuesOf(spec(tokens))).toEqual([
      {
        path: 'tokens.values.a.light',
        message: 'a $value wrapper is only allowed on a whole token',
      },
    ]);
  });
});

describe('formatVersion 15 to 22 stay as before', () => {
  it('the material3-compose library (18) still validates', () => {
    const raw = JSON.parse(
      readFileSync('libraries/material3-compose/material3-compose.spec.json', 'utf8'),
    ) as Json;
    expect(issuesOf(raw)).toEqual([]);
  });

  it('an alias or an axis in a 15 to 22 library is read as a per-mode value', () => {
    const tokens = {
      modes: ['light'],
      values: { a: '#fff', b: { $token: 'a' }, c: { $axis: 'mode', light: 1 } },
    };
    const paths = new Set(issuesOf(spec(tokens, 22)).map((i) => i.path));
    expect([...paths]).toEqual(['tokens.values.b', 'tokens.values.c']);
  });

  it('a text and a number across the modes keep the old message', () => {
    const tokens = { modes: ['light', 'dark'], values: { s: { light: 8, dark: '8' } } };
    expect(issuesOf(spec(tokens, 22))).toEqual([
      {
        path: 'tokens.values.s',
        message: 'the modes of a token must have the same type (text or number)',
      },
    ]);
  });

  it('tokens in a v14 specialization fail with the version message', () => {
    expect(issuesOf(spec({ values: {} }, 14))).toContainEqual({
      path: 'tokens',
      message: 'only allowed with formatVersion 15',
    });
  });
});
