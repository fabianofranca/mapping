// `formatVersion` 20 (stage #1923, FP1; decisions 7, 8 and 10): `fileFormats` at the root of the
// specialization: a list of `{ id, name, extension, plugin, contract, scope?, description?,
// examples? }`. The key is outside the version contract (`diffSpecs` ignores it) and makes the
// specialization a package (`usesPackageFiles`). Nothing runs a plugin here.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  FORMAT_PLUGIN_CONTRACT,
  MAX_PLUGIN_BYTES,
  SPEC_FORMAT_VERSION,
  SPEC_FORMAT_VERSIONS,
  parseSpec,
  usesPackageFiles,
} from '../../src/model';
import { diffSpecs } from '../../src/model/specVersions';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const jsonSchema = JSON.parse(readFileSync('docs/spec.schema.json', 'utf8')) as Record<
  string,
  unknown
>;
const jsonValidator = z.fromJSONSchema(jsonSchema as never);

const ONLY_V20 = 'only allowed with formatVersion 20';

/** A specialization with one type and one declared file format (with two examples). */
function v20(edit?: (spec: Json) => void, formatVersion = 20): Json {
  const spec: Json = {
    format: 'mapping-spec',
    formatVersion,
    id: 'data-model',
    name: 'Data model',
    version: 1,
    fileFormats: [
      {
        id: 'csv',
        name: 'CSV table',
        extension: 'csv',
        plugin: 'plugins/csv.js',
        contract: 1,
        scope: 'container',
        description: 'Rows of a table, one marking per row.',
        examples: [
          { name: 'Small', file: 'examples/small.csv' },
          {
            name: 'Generated',
            input: 'examples/small.input.json',
            file: 'examples/g.csv',
          },
        ],
      },
      {
        id: 'openapi-yaml',
        name: 'OpenAPI',
        extension: 'yaml',
        plugin: 'plugins/openapi.js',
        contract: 1,
      },
    ],
    layers: [
      {
        id: 'data',
        name: 'Data',
        color: '#112233',
        annotationTypes: [
          { id: 'row', name: 'Row', fields: [{ key: 'cells', type: 'string' }] },
        ],
      },
    ],
  };
  edit?.(spec);
  return spec;
}

const issuesOf = (raw: Json) => {
  const r = parseSpec(raw);
  return r.ok ? [] : r.issues.map(({ path, message }) => ({ path, message }));
};

const fmt = (s: Json, i = 0): Json => s.fileFormats[i];

describe('formatVersion 20: version and shape', () => {
  it('20 is no longer the current version, but still an accepted one', () => {
    expect(SPEC_FORMAT_VERSION).toBe(22);
    expect(SPEC_FORMAT_VERSIONS).toContain(20);
    expect(SPEC_FORMAT_VERSIONS).toContain(19);
    expect(FORMAT_PLUGIN_CONTRACT).toBe(1);
    expect(MAX_PLUGIN_BYTES).toBe(1024 * 1024);
  });

  it('a valid declaration is accepted and read as written', () => {
    expect(issuesOf(v20())).toEqual([]);
    const result = parseSpec(v20());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.spec.fileFormats).toHaveLength(2);
    expect(result.spec.fileFormats?.[0]).toEqual(v20().fileFormats[0]);
    expect(result.spec.fileFormats?.[1]?.scope).toBeUndefined();
  });

  it('the published JSON Schema accepts the declaration', () => {
    expect(jsonValidator.safeParse(v20()).success).toBe(true);
  });

  it('a declaration with no formats ([]) is valid', () => {
    expect(issuesOf(v20((s) => (s.fileFormats = [])))).toEqual([]);
  });
});

describe('formatVersion 20: each error of decision 10, at its exact path', () => {
  it('id: invalid characters', () => {
    for (const id of ['CSV', '-csv', 'a_b', 'a b']) {
      const issues = issuesOf(v20((s) => (fmt(s).id = id)));
      expect(issues).toEqual([
        { path: 'fileFormats[0].id', message: 'invalid id; use [a-z0-9][a-z0-9-]*' },
      ]);
    }
  });

  it('id: repeated in the specialization', () => {
    expect(issuesOf(v20((s) => (fmt(s, 1).id = 'csv')))).toEqual([
      { path: 'fileFormats[1].id', message: 'id "csv" repeated' },
    ]);
  });

  it('name: empty', () => {
    expect(issuesOf(v20((s) => (fmt(s).name = '')))).toEqual([
      { path: 'fileFormats[0].name', message: 'cannot be empty' },
    ]);
  });

  it('extension: a dot, uppercase or empty', () => {
    for (const extension of ['.csv', 'CSV', 'tar.gz']) {
      expect(issuesOf(v20((s) => (fmt(s).extension = extension)))).toEqual([
        {
          path: 'fileFormats[0].extension',
          message: 'invalid extension; use [a-z0-9]+ (lowercase, without the dot)',
        },
      ]);
    }
  });

  it('plugin: not .js, with "..", absolute or empty', () => {
    expect(issuesOf(v20((s) => (fmt(s).plugin = 'plugins/csv.json')))).toEqual([
      { path: 'fileFormats[0].plugin', message: 'invalid extension: expected .js' },
    ]);
    for (const plugin of ['../csv.js', 'plugins/../csv.js', '/csv.js']) {
      const issues = issuesOf(v20((s) => (fmt(s).plugin = plugin)));
      expect(issues).toHaveLength(1);
      expect(issues[0]?.path).toBe('fileFormats[0].plugin');
      expect(issues[0]?.message).toContain('invalid path');
    }
  });

  it('contract: only 1', () => {
    for (const contract of [2, 0, '1']) {
      expect(issuesOf(v20((s) => (fmt(s).contract = contract)))).toEqual([
        { path: 'fileFormats[0].contract', message: 'must be 1' },
      ]);
    }
    expect(
      issuesOf(
        v20((s) => {
          delete fmt(s).contract;
        }),
      ),
    ).toEqual([{ path: 'fileFormats[0].contract', message: 'required' }]);
  });

  it('scope: project or container, nothing else', () => {
    expect(issuesOf(v20((s) => (fmt(s, 1).scope = 'project')))).toEqual([]);
    expect(issuesOf(v20((s) => (fmt(s).scope = 'layer')))).toEqual([
      {
        path: 'fileFormats[0].scope',
        message: 'invalid scope; use "project" or "container"',
      },
    ]);
  });

  it('an unknown key, in the format and in an example', () => {
    expect(issuesOf(v20((s) => (fmt(s).run = 'now')))).toEqual([
      { path: 'fileFormats[0].run', message: 'unknown key: run' },
    ]);
    expect(issuesOf(v20((s) => (fmt(s).examples[0].extra = 1)))).toEqual([
      { path: 'fileFormats[0].examples[0].extra', message: 'unknown key: extra' },
    ]);
  });

  it('example: a repeated name, a missing file, a bad path and a non-.json input', () => {
    expect(issuesOf(v20((s) => (fmt(s).examples[1].name = 'Small')))).toEqual([
      { path: 'fileFormats[0].examples[1].name', message: 'name "Small" repeated' },
    ]);
    expect(
      issuesOf(
        v20((s) => {
          delete fmt(s).examples[0].file;
        }),
      ),
    ).toEqual([{ path: 'fileFormats[0].examples[0].file', message: 'required' }]);
    expect(issuesOf(v20((s) => (fmt(s).examples[0].file = '../x.csv')))[0]?.path).toBe(
      'fileFormats[0].examples[0].file',
    );
    expect(issuesOf(v20((s) => (fmt(s).examples[1].input = 'examples/in.csv')))).toEqual([
      {
        path: 'fileFormats[0].examples[1].input',
        message: 'invalid extension: expected .json',
      },
    ]);
  });

  it('shapes: the list, the entry and the texts', () => {
    expect(issuesOf(v20((s) => (s.fileFormats = {})))).toEqual([
      { path: 'fileFormats', message: 'must be a list of file formats' },
    ]);
    expect(issuesOf(v20((s) => (s.fileFormats = ['csv'])))).toEqual([
      { path: 'fileFormats[0]', message: 'must be an object' },
    ]);
    expect(issuesOf(v20((s) => (fmt(s).description = 3)))).toEqual([
      { path: 'fileFormats[0].description', message: 'must be text' },
    ]);
  });
});

describe('formatVersion 20: earlier versions and the version contract', () => {
  it('fileFormats in 19 (and in 4) is "only allowed with formatVersion 20", at fileFormats', () => {
    for (const version of [19, 4, 1]) {
      expect(issuesOf(v20(undefined, version))).toEqual([
        { path: 'fileFormats', message: ONLY_V20 },
      ]);
    }
  });

  it('a 19 without fileFormats is untouched', () => {
    expect(
      issuesOf(
        v20((s) => {
          delete s.fileFormats;
        }, 19),
      ),
    ).toEqual([]);
  });

  it('diffSpecs sees no difference when only fileFormats changes', () => {
    const before = parseSpec(v20());
    const after = parseSpec(
      v20((s) => {
        s.fileFormats = [{ ...fmt(s, 1), name: 'Other', extension: 'yml' }];
      }),
    );
    const bare = parseSpec(
      v20((s) => {
        delete s.fileFormats;
      }),
    );
    expect(before.ok && after.ok && bare.ok).toBe(true);
    if (!before.ok || !after.ok || !bare.ok) return;
    expect(diffSpecs(before.spec, after.spec)).toEqual([]);
    expect(diffSpecs(after.spec, before.spec)).toEqual([]);
    expect(diffSpecs(bare.spec, before.spec)).toEqual([]);
    expect(diffSpecs(before.spec, bare.spec)).toEqual([]);
  });

  it('declaring a format makes the specialization a package', () => {
    const spec = parseSpec(v20());
    const empty = parseSpec(
      v20((s) => {
        s.fileFormats = [];
      }),
    );
    expect(spec.ok && empty.ok).toBe(true);
    if (!spec.ok || !empty.ok) return;
    expect(usesPackageFiles(spec.spec)).toBe(true);
    expect(usesPackageFiles(empty.spec)).toBe(false);
  });
});
