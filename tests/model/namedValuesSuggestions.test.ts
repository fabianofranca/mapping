// `{ "$tokens": "<group>" }` in `suggestions` (stage #1900, NV1): expanded when the specialization is parsed.
import { describe, expect, it } from 'vitest';
import { parseSpec, type Spec } from '../../src/model/spec';
import { serializeSpec } from '../../src/model/serialization';
import { diffSpecs } from '../../src/model/specVersions';

type Json = Record<string, unknown>;

const AXES = { theme: ['light', 'dark'] };

function spec(
  suggestions: unknown[],
  values: Json,
  formatVersion = 23,
  asColumn = false,
): Json {
  const field = { key: 'kind', type: 'string', suggestions };
  const fields = asColumn
    ? [
        {
          key: 'tabela',
          type: 'table',
          columns: [{ key: 'label', type: 'string' }, field],
        },
      ]
    : [field];
  return {
    format: 'mapping-spec',
    formatVersion,
    id: 's',
    name: 'S',
    version: 1,
    tokens: { axes: AXES, values },
    layers: [
      {
        id: 'l',
        name: 'L',
        color: '#112233',
        annotationTypes: [{ id: 't', name: 'T', fields }],
      },
    ],
  };
}

const FIELD = 'layers[0].annotationTypes[0].fields[0]';
const COLUMN = `${FIELD}.columns[1]`;

const issuesOf = (raw: unknown) => {
  const r = parseSpec(raw);
  return r.ok ? [] : r.issues.map(({ path, message }) => ({ path, message }));
};

function parsed(raw: unknown): Spec {
  const r = parseSpec(raw);
  if (!r.ok) throw new Error(JSON.stringify(r.issues));
  return r.spec;
}

const suggestionsOf = (s: Spec, column = false): unknown => {
  const field: unknown = s.layers[0]?.annotationTypes[0]?.fields[0];
  const holder = field as {
    suggestions?: unknown;
    columns?: { suggestions?: unknown }[];
  };
  return column ? holder.columns?.[1]?.suggestions : holder.suggestions;
};

const ICONS: Json = {
  home: { $value: 'Home', $group: 'icon' },
  search: { $value: 'Search', $group: 'icon' },
  gap: 8,
};

const GROUP = { $tokens: 'icon' };

describe('$tokens suggestions: expansion', () => {
  it('expands in place and in the file order of tokens.values', () => {
    const s = parsed(spec(['First', GROUP, 'Last'], ICONS));
    expect(suggestionsOf(s)).toEqual(['First', 'Home', 'Search', 'Last']);
  });

  it('expands in a string column of a table', () => {
    const s = parsed(spec([GROUP], ICONS, 23, true));
    expect(suggestionsOf(s, true)).toEqual(['Home', 'Search']);
  });

  it('the parsed Spec carries a plain string list', () => {
    const list = suggestionsOf(parsed(spec([GROUP], ICONS)));
    expect(Array.isArray(list)).toBe(true);
    expect((list as unknown[]).every((x) => typeof x === 'string')).toBe(true);
  });

  it('leaves out the deprecated and removed tokens', () => {
    const values = {
      ...ICONS,
      old: {
        $value: 'Old',
        $group: 'icon',
        $notices: [{ kind: 'deprecated', message: 'use home' }],
      },
      gone: {
        $value: 'Gone',
        $group: 'icon',
        $notices: [{ kind: 'removed', message: 'x' }],
      },
      careful: {
        $value: 'Careful',
        $group: 'icon',
        $notices: [{ kind: 'pending', message: 'x' }],
      },
    };
    expect(suggestionsOf(parsed(spec([GROUP], values)))).toEqual([
      'Home',
      'Search',
      'Careful',
    ]);
  });

  it('only takes the tokens of the group', () => {
    const values = {
      ...ICONS,
      other: { $value: 'Other', $group: 'other' },
      bare: 'Bare',
    };
    expect(suggestionsOf(parsed(spec([GROUP], values)))).toEqual(['Home', 'Search']);
  });

  it('drops repeated texts (the first wins), also against a literal', () => {
    const values = {
      a: { $value: 'Home', $group: 'icon' },
      b: { $value: 'Home', $group: 'icon' },
      c: { $value: 'Search', $group: 'icon' },
    };
    const s = parsed(spec(['Search', GROUP, GROUP], values));
    expect(suggestionsOf(s)).toEqual(['Search', 'Home']);
  });

  it('reads an alias to a fixed text as fixed text', () => {
    const values = {
      base: 'Base',
      home: { $value: { $token: 'base' }, $group: 'icon' },
    };
    expect(suggestionsOf(parsed(spec([GROUP], values)))).toEqual(['Base']);
  });

  it('the limit of 200 applies to the expanded list', () => {
    const values: Json = {};
    for (let i = 0; i < 201; i += 1)
      values[`t${i}`] = { $value: `v${i}`, $group: 'icon' };
    expect(issuesOf(spec([GROUP], values))).toEqual([
      { path: `${FIELD}.suggestions`, message: 'at most 200 suggestions' },
    ]);
    delete values.t200;
    expect(suggestionsOf(parsed(spec([GROUP], values)))).toHaveLength(200);
  });

  it('repeated texts are dropped before the limit is counted', () => {
    const values: Json = {};
    for (let i = 0; i < 250; i += 1) {
      values[`t${i}`] = { $value: `v${i % 200}`, $group: 'icon' };
    }
    expect(suggestionsOf(parsed(spec([GROUP], values)))).toHaveLength(200);
  });

  it('an expanded text with spaces at the edge is an error at the item', () => {
    const values = { a: { $value: ' a', $group: 'icon' } };
    expect(issuesOf(spec(['x', GROUP], values))).toEqual([
      {
        path: `${FIELD}.suggestions[1]`,
        message: 'suggestions cannot have spaces at the start or the end',
      },
    ]);
  });

  it('literals repeated by hand are still an error', () => {
    expect(issuesOf(spec(['a', 'a', GROUP], ICONS))).toEqual([
      { path: `${FIELD}.suggestions`, message: 'repeated suggestions' },
    ]);
  });
});

describe('$tokens suggestions: errors', () => {
  it('is only allowed with formatVersion 23', () => {
    const raw = spec([GROUP], {}, 22);
    raw.tokens = { modes: ['light'], values: { a: 'x' } };
    expect(issuesOf(raw)).toEqual([
      { path: `${FIELD}.suggestions[0]`, message: 'only allowed with formatVersion 23' },
    ]);
  });

  it('is only allowed with formatVersion 23 in a column', () => {
    const raw = spec(['a', GROUP], {}, 8, true);
    delete raw.tokens;
    expect(issuesOf(raw)).toEqual([
      { path: `${COLUMN}.suggestions[1]`, message: 'only allowed with formatVersion 23' },
    ]);
  });

  it('a group without tokens', () => {
    expect(issuesOf(spec(['a', { $tokens: 'nope' }], ICONS))).toEqual([
      { path: `${FIELD}.suggestions[1]`, message: 'no token in group "nope"' },
    ]);
  });

  it('a group whose tokens are all deprecated has no token', () => {
    const values = {
      a: {
        $value: 'A',
        $group: 'icon',
        $notices: [{ kind: 'deprecated', message: 'x' }],
      },
    };
    expect(issuesOf(spec([GROUP], values))).toEqual([
      { path: `${FIELD}.suggestions[0]`, message: 'no token in group "icon"' },
    ]);
  });

  it('a number is not fixed text', () => {
    const values = { size: { $value: 12, $group: 'icon' } };
    expect(issuesOf(spec([GROUP], values))).toEqual([
      {
        path: `${FIELD}.suggestions[0]`,
        message: 'the token "size" of group "icon" is not fixed text',
      },
    ]);
  });

  it('a composite is not fixed text', () => {
    const values = { type: { $value: { size: 12, family: 'x' }, $group: 'icon' } };
    expect(issuesOf(spec([GROUP], values))).toEqual([
      {
        path: `${FIELD}.suggestions[0]`,
        message: 'the token "type" of group "icon" is not fixed text',
      },
    ]);
  });

  it('a value that varies by axis is not fixed text', () => {
    const values = {
      mark: { $value: { $axis: 'theme', light: 'A', dark: 'B' }, $group: 'icon' },
    };
    expect(issuesOf(spec([GROUP], values))).toEqual([
      {
        path: `${FIELD}.suggestions[0]`,
        message: 'the token "mark" of group "icon" is not fixed text',
      },
    ]);
  });

  it('an alias to a value that varies by axis is not fixed text', () => {
    const values = {
      base: { $axis: 'theme', light: 'A', dark: 'B' },
      mark: { $value: { $token: 'base' }, $group: 'icon' },
    };
    expect(issuesOf(spec([GROUP], values))).toEqual([
      {
        path: `${FIELD}.suggestions[0]`,
        message: 'the token "mark" of group "icon" is not fixed text',
      },
    ]);
  });

  it('is not an item of another shape', () => {
    expect(parseSpec(spec([{ $tokens: 'icon', extra: 1 }], ICONS)).ok).toBe(false);
    expect(parseSpec(spec([{ $tokens: 3 }], ICONS)).ok).toBe(false);
  });
});

describe('$tokens suggestions: compatibility', () => {
  it('a plain list in versions 8 to 22 behaves as before', () => {
    for (const version of [8, 15, 22, 23]) {
      const raw = spec(['A', 'B'], {}, version);
      if (version < 15) delete raw.tokens;
      else if (version < 23) raw.tokens = { modes: ['light'], values: { a: 'x' } };
      expect(suggestionsOf(parsed(raw))).toEqual(['A', 'B']);
    }
  });

  it('a plain list with repeats or edge spaces is still an error', () => {
    expect(issuesOf(spec(['a', 'a'], {}, 22))).toContainEqual({
      path: `${FIELD}.suggestions`,
      message: 'repeated suggestions',
    });
    expect(issuesOf(spec([' a'], {}, 23))).toContainEqual({
      path: `${FIELD}.suggestions`,
      message: 'suggestions cannot have spaces at the start or the end',
    });
  });

  it('the version-contract diff ignores the $tokens item and the tokens of the group', () => {
    const before = parsed(spec(['a'], ICONS));
    const withItem = parsed(spec(['a', GROUP], ICONS));
    const moreTokens = parsed(
      spec(['a', GROUP], { ...ICONS, more: { $value: 'More', $group: 'icon' } }),
    );
    expect(diffSpecs(before, withItem)).toEqual([]);
    expect(diffSpecs(withItem, moreTokens)).toEqual([]);
    expect(diffSpecs(moreTokens, before)).toEqual([]);
  });
});

describe('$tokens suggestions: the file keeps the items', () => {
  it('serializeSpec writes the list as written, in a field and in a column', () => {
    const field = [GROUP, 'Other'];
    for (const asColumn of [false, true]) {
      const raw = spec(field, ICONS, 23, asColumn);
      const text = serializeSpec(parsed(raw));
      const back = JSON.parse(text) as Json;
      expect(back).toEqual(raw);
      expect(text).not.toContain('suggestionsSource');
    }
  });

  it('a plain list is written untouched', () => {
    const raw = spec(['a', 'b'], ICONS);
    expect(JSON.parse(serializeSpec(parsed(raw)))).toEqual(raw);
  });
});
