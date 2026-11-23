// `formatVersion` 22 (stage #2035, AF6; decisions 3 and 15): `sources` become plain data. The
// specialization refuses `origins` at the root and `system` + `file` on a type example (the plugin
// of a file format replaces them); `path` (field and column sources), `slot` and `ignore` (type
// sources) are allowed for any `system`; a field source needs `name` or `path`. Up to 21 nothing
// changes: `origins` is accepted and `path` needs a system declared in it.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  SPEC_FORMAT_VERSION,
  SPEC_FORMAT_VERSIONS,
  findTypesBySource,
  isExecutableSystem,
  parseSpec,
  type Spec,
  type SpecIssue,
} from '../../src/model';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const jsonSchema = JSON.parse(readFileSync('docs/spec.schema.json', 'utf8')) as Record<
  string,
  unknown
>;
const jsonValidator = z.fromJSONSchema(jsonSchema as never);

const TYPE = 'layers[0].annotationTypes[0]';
const ONLY_UP_TO_21 = 'only allowed up to formatVersion 21';
const NOT_IN_ORIGINS = 'only allowed in a system declared in origins';

const ORIGINS = [
  {
    system: 'sdui',
    node: { type: 'type', props: 'props', children: 'children' },
    screen: {
      width: { path: 'screen.width' },
      height: { path: 'screen.height' },
      roots: [{ path: 'content' }],
    },
  },
];

/** A specialization with one type that has a table field, with its sources. */
function spec(formatVersion: number, edit?: (spec: Json) => void): Json {
  const result: Json = {
    format: 'mapping-spec',
    formatVersion,
    id: 'sources-data',
    name: 'Sources as data',
    version: 1,
    layers: [
      {
        id: 'ui',
        name: 'Interface',
        color: '#6750A4',
        annotationTypes: [
          {
            id: 'button',
            name: 'Button',
            sources: [{ system: 'dom', name: 'button', slot: 'content', ignore: ['a'] }],
            examples: [{ name: 'Primary', values: { label: 'Save' } }],
            fields: [
              {
                key: 'label',
                type: 'string',
                sources: [{ system: 'dom', path: 'text' }],
              },
              {
                key: 'rows',
                type: 'table',
                columns: [
                  {
                    key: 'name',
                    type: 'string',
                    sources: [{ system: 'dom', path: 'n' }],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  };
  edit?.(result);
  return result;
}

const v22 = (edit?: (spec: Json) => void): Json => spec(22, edit);
const v21 = (edit?: (spec: Json) => void): Json => spec(21, edit);
const type = (s: Json): Json => s.layers[0].annotationTypes[0];

function issuesOf(input: Json): SpecIssue[] {
  const result = parseSpec(input);
  if (result.ok) throw new Error('was supposed to fail');
  return result.issues;
}

function parsed(input: Json): Spec {
  const result = parseSpec(input);
  if (!result.ok) throw new Error(result.errors.join('\n'));
  return result.spec;
}

const messageAt = (input: Json, path: string): string[] =>
  issuesOf(input)
    .filter((i) => i.path === path)
    .map((i) => i.message);

describe('formatVersion 22', () => {
  it('is the current version and the list ends in it', () => {
    expect(SPEC_FORMAT_VERSION).toBe(22);
    expect(SPEC_FORMAT_VERSIONS.at(-1)).toBe(22);
    expect(SPEC_FORMAT_VERSIONS).toHaveLength(22);
  });

  it('accepts the plain-data specialization in zod and in the JSON Schema', () => {
    expect(parseSpec(v22()).ok).toBe(true);
    expect(jsonValidator.safeParse(v22()).success).toBe(true);
  });

  it('refuses origins at the root, at the exact path', () => {
    const input = v22((s) => (s.origins = ORIGINS));
    expect(messageAt(input, 'origins')).toEqual([ONLY_UP_TO_21]);
  });

  it('refuses origins even when it is empty', () => {
    expect(
      messageAt(
        v22((s) => (s.origins = [])),
        'origins',
      ),
    ).toEqual([ONLY_UP_TO_21]);
  });

  it('refuses a type example with system and file, at the example', () => {
    const input = v22((s) => {
      type(s).examples = [{ name: 'Node', system: 'dom', file: 'examples/button.json' }];
    });
    const issues = issuesOf(input);
    const at = `${TYPE}.examples[0]`;
    expect(issues).toContainEqual(
      expect.objectContaining({ path: `${at}.system`, message: ONLY_UP_TO_21 }),
    );
    expect(issues).toContainEqual(
      expect.objectContaining({ path: `${at}.file`, message: ONLY_UP_TO_21 }),
    );
  });

  it('an example with only system or only file gets only the refusal, never "required with"', () => {
    for (const key of ['system', 'file'] as const) {
      const input = v22((s) => {
        type(s).examples = [{ name: 'Half', [key]: key === 'system' ? 'dom' : 'a.json' }];
      });
      const issues = issuesOf(input).filter((i) =>
        i.path.startsWith(`${TYPE}.examples[0]`),
      );
      expect(issues.map((i) => [i.path, i.message])).toEqual([
        [`${TYPE}.examples[0].${key}`, ONLY_UP_TO_21],
      ]);
    }
  });

  it('an example with neither values nor an external mode asks only for values', () => {
    const input = v22((s) => {
      type(s).examples = [{ name: 'Empty' }];
    });
    expect(messageAt(input, `${TYPE}.examples[0]`)).toEqual(['needs "values"']);
  });

  it('a field source with only path is valid in any system, with no origins', () => {
    const input = v22((s) => {
      type(s).fields[0].sources = [
        { system: 'dom', path: 'text' },
        { system: 'figma', path: 'characters' },
      ];
    });
    expect(parseSpec(input).ok).toBe(true);
  });

  it('a column source with only path is valid in any system', () => {
    expect(parseSpec(v22()).ok).toBe(true);
    const input = v22((s) => {
      type(s).fields[1].columns[0].sources = [{ system: 'other', path: 'rows[0]' }];
    });
    expect(parseSpec(input).ok).toBe(true);
  });

  it('a field source with neither name nor path is an error', () => {
    const input = v22((s) => {
      type(s).fields[0].sources = [{ system: 'dom' }];
    });
    expect(messageAt(input, `${TYPE}.fields[0].sources[0].name`)).toEqual([
      'required when there is no path',
    ]);
  });

  it('a field source with name and without path is still valid', () => {
    const input = v22((s) => {
      type(s).fields[0].sources = [{ system: 'dom', name: 'Text' }];
    });
    expect(parseSpec(input).ok).toBe(true);
  });

  it('path keeps its syntax check: [*] is an error', () => {
    const input = v22((s) => {
      type(s).fields[0].sources = [{ system: 'dom', path: 'items[*].text' }];
    });
    expect(issuesOf(input).map((i) => i.path)).toContain(
      `${TYPE}.fields[0].sources[0].path`,
    );
  });

  it('slot and ignore in a system without origins are valid', () => {
    const input = v22((s) => {
      type(s).sources = [
        { system: 'dom', name: 'Card', slot: 'content', ignore: ['x', 'y'] },
      ];
    });
    expect(parseSpec(input).ok).toBe(true);
  });

  it('ignore keeps the repetition check', () => {
    const input = v22((s) => {
      type(s).sources = [{ system: 'dom', name: 'Card', ignore: ['x', 'x'] }];
    });
    expect(issuesOf(input).map((i) => i.path)).toContain(`${TYPE}.sources[0].ignore[1]`);
  });

  it('isExecutableSystem is false for every system, with or without origins in the data', () => {
    const read = parsed(v22());
    expect(isExecutableSystem(read, 'dom')).toBe(false);
    expect(isExecutableSystem(read, 'sdui')).toBe(false);
    expect(isExecutableSystem(null, 'dom')).toBe(false);
  });

  it('the type search reports not-executable for every system', () => {
    const read = parsed(v22());
    const matches = findTypesBySource([read], 'dom', { name: 'button' });
    expect(matches).toHaveLength(1);
    expect(matches[0]?.executable).toBe(false);
  });
});

describe('the previous version behaves as before', () => {
  it('21 accepts origins', () => {
    const input = v21((s) => {
      s.origins = ORIGINS;
      type(s).sources = [{ system: 'sdui', name: 'Button', slot: 'content' }];
      type(s).fields[0].sources = [{ system: 'sdui', path: 'text' }];
      type(s).fields[1].columns[0].sources = [{ system: 'sdui', path: 'rows[0]' }];
      type(s).examples = [
        { name: 'Primary', values: { label: 'Save' } },
        { name: 'Node', system: 'sdui', file: 'examples/button.sdui.json' },
      ];
    });
    expect(parseSpec(input).ok).toBe(true);
    expect(isExecutableSystem(parsed(input), 'sdui')).toBe(true);
  });

  it('21 still needs a declared system for path, slot and an example system', () => {
    const input = v21((s) => {
      type(s).sources = [{ system: 'dom', name: 'Card', slot: 'content' }];
      type(s).examples = [{ name: 'Node', system: 'dom', file: 'examples/a.json' }];
    });
    const issues = issuesOf(input);
    expect(issues).toContainEqual(
      expect.objectContaining({
        path: `${TYPE}.sources[0].slot`,
        message: NOT_IN_ORIGINS,
      }),
    );
    expect(issues.map((i) => i.path)).toContain(`${TYPE}.examples[0].system`);
    expect(messageAt(v21(), `${TYPE}.fields[0].sources[0].path`)).toEqual([
      NOT_IN_ORIGINS,
    ]);
  });
});
