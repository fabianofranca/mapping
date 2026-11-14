// `formatVersion` 16 (stage #1079, S1): `fieldModels` at the root and, in each platform's `code` (and
// in each `variants` case), `signature`, `ignore`, `calls` and `formats`; `params` with a path
// (`colors.containerColor`) and positional (`#0`); `signature` and `ignore` in the type's `sources`.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { SPEC_FORMAT_VERSION, SPEC_FORMAT_VERSIONS, parseSpec } from '../../src/model';
import { diffSpecs } from '../../src/model/specVersions';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const jsonSchema = JSON.parse(readFileSync('docs/spec.schema.json', 'utf8')) as Record<
  string,
  unknown
>;
const jsonValidator = z.fromJSONSchema(jsonSchema as never);

const CODE = 'layers[0].annotationTypes[0].code.compose';

/** Specialization with a `button` and a `surface`, the `compose` platform and the full v16 `code`. */
function v16(edit?: (spec: Json) => void, formatVersion = 16): Json {
  const spec: Json = {
    format: 'mapping-spec',
    formatVersion,
    id: 'm3',
    name: 'M3',
    version: 1,
    platforms: [{ id: 'compose', name: 'Compose', language: 'kotlin' }],
    fieldModels: {
      compose: {
        Color: { like: 'surface.color' },
        Dp: { type: 'number', format: '{value}.dp' },
        boolean: { type: 'enum', options: ['true', 'false'] },
        PaddingValues: {
          expand: { call: 'PaddingValues', params: { horizontal: 'Dp' } },
        },
        Modifier: { ignore: true },
      },
    },
    layers: [
      {
        id: 'components',
        name: 'Components',
        color: '#112233',
        annotationTypes: [
          {
            id: 'button',
            name: 'Button',
            fields: [
              { key: 'label', type: 'string' },
              { key: 'containerColor', type: 'enum', options: ['primary', 'secondary'] },
              { key: 'width', type: 'number' },
            ],
            code: {
              compose: {
                symbol: 'androidx.compose.material3.Button',
                path: 'compose/Button.kt',
                signature: 'signatures/button.compose.json',
                ignore: ['modifier'],
                calls: {
                  colors: 'androidx.compose.material3.ButtonDefaults.buttonColors',
                },
                formats: { width: '{value}.dp' },
                params: {
                  label: '#0',
                  containerColor: 'colors.containerColor',
                  width: 'width',
                },
              },
            },
          },
          {
            id: 'surface',
            name: 'Surface',
            fields: [
              { key: 'color', type: 'enum', options: ['surface', 'primary'] },
              { key: 'kind', type: 'enum', options: ['filled', 'outlined'] },
            ],
            code: {
              compose: {
                symbol: 'androidx.compose.material3.Surface',
                variants: {
                  field: 'kind',
                  cases: {
                    outlined: {
                      symbol: 'androidx.compose.material3.OutlinedSurface',
                      signature: 'signatures/surface.outlined.compose.json',
                      ignore: ['tonalElevation'],
                      calls: { colors: 'SurfaceDefaults.outlined' },
                      formats: { color: '{value}' },
                      params: { color: 'colors.container' },
                    },
                  },
                },
              },
            },
          },
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

const ONLY_V16 = 'only allowed with formatVersion 16';

describe('formatVersion 16: version and contract', () => {
  it('the current version is 16 and 15 is still accepted', () => {
    expect(SPEC_FORMAT_VERSION).toBe(16);
    expect(SPEC_FORMAT_VERSIONS).toContain(15);
    expect(SPEC_FORMAT_VERSIONS.at(-1)).toBe(16);
  });

  it('the v16 specialization with fieldModels, signature, calls, formats, #0 and colors.containerColor is valid', () => {
    expect(issuesOf(v16())).toEqual([]);
    const result = parseSpec(v16());
    expect(result.ok).toBe(true);
    if (result.ok) {
      const code = result.spec.layers[0]?.annotationTypes[0]?.code?.compose;
      expect(code?.signature).toBe('signatures/button.compose.json');
      expect(code?.ignore).toEqual(['modifier']);
      expect(code?.calls).toEqual({
        colors: 'androidx.compose.material3.ButtonDefaults.buttonColors',
      });
      expect(code?.formats).toEqual({ width: '{value}.dp' });
      expect(code?.params).toEqual({
        label: '#0',
        containerColor: 'colors.containerColor',
        width: 'width',
      });
      expect(result.spec.fieldModels?.compose?.Color).toEqual({ like: 'surface.color' });
    }
  });

  it('the JSON Schema accepts the full v16', () => {
    expect(jsonValidator.safeParse(v16()).success).toBe(true);
    expect(jsonValidator.safeParse(v16(undefined, 15)).success).toBe(true);
  });

  it('in a v15, each new key gives "only allowed with formatVersion 16" at the exact path', () => {
    const issues = issuesOf(v16(undefined, 15));
    for (const path of [
      'fieldModels',
      `${CODE}.signature`,
      `${CODE}.ignore`,
      `${CODE}.calls`,
      `${CODE}.formats`,
      'layers[0].annotationTypes[1].code.compose.variants.cases.outlined.signature',
      'layers[0].annotationTypes[1].code.compose.variants.cases.outlined.ignore',
      'layers[0].annotationTypes[1].code.compose.variants.cases.outlined.calls',
      'layers[0].annotationTypes[1].code.compose.variants.cases.outlined.formats',
    ]) {
      expect(issues, path).toContainEqual({ path, message: ONLY_V16 });
    }
  });

  it('in a v15, params with a path and positional are still opaque texts (no error)', () => {
    const issues = issuesOf(
      v16((spec) => {
        delete spec.fieldModels;
        const t = spec.layers[0].annotationTypes[0];
        const code = t.code.compose;
        delete code.signature;
        delete code.ignore;
        delete code.calls;
        delete code.formats;
        const outlined =
          spec.layers[0].annotationTypes[1].code.compose.variants.cases.outlined;
        for (const k of ['signature', 'ignore', 'calls', 'formats']) delete outlined[k];
        outlined.params = { color: 'a.b' };
      }, 15),
    );
    expect(issues).toEqual([]);
  });

  it("in a v15, signature in the type's sources is an error", () => {
    const spec = v16((s) => {
      s.layers[0].annotationTypes[0].sources = [
        { system: 'figma', name: 'Button', signature: 'signatures/button.figma.json' },
      ];
    }, 15);
    expect(issuesOf(spec)).toContainEqual({
      path: 'layers[0].annotationTypes[0].sources[0].signature',
      message: ONLY_V16,
    });
  });
});

describe('formatVersion 16: validation of what is new', () => {
  it('like that does not find the field is an error', () => {
    for (const like of ['surface.nope', 'nope.color', 'nodot']) {
      const issues = issuesOf(v16((s) => (s.fieldModels.compose.Color = { like })));
      expect(
        issues.map((i) => i.path),
        like,
      ).toEqual(['fieldModels.compose.Color.like']);
    }
  });

  it('format without {value} is an error, in the field model and in code.formats', () => {
    expect(
      issuesOf(v16((s) => (s.fieldModels.compose.Dp.format = '16.dp'))).map(
        (i) => i.path,
      ),
    ).toEqual(['fieldModels.compose.Dp.format']);
    expect(
      issuesOf(
        v16((s) => (s.layers[0].annotationTypes[0].code.compose.formats.width = '16.dp')),
      ).map((i) => i.path),
    ).toEqual([`${CODE}.formats.width`]);
  });

  it('format of a field that the type does not have is an error', () => {
    expect(
      issuesOf(
        v16(
          (s) => (s.layers[0].annotationTypes[0].code.compose.formats.nope = '{value}'),
        ),
      ).map((i) => i.path),
    ).toEqual([`${CODE}.formats.nope`]);
  });

  it('path in params without the first segment in calls is an error', () => {
    const issues = issuesOf(
      v16((s) => {
        s.layers[0].annotationTypes[0].code.compose.params.containerColor =
          'border.color';
      }),
    );
    expect(issues).toEqual([
      { path: `${CODE}.params.containerColor`, message: '"border" is not in calls' },
    ]);
  });

  it("the case's calls counts for the case's path, and the base's too", () => {
    expect(issuesOf(v16())).toEqual([]);
    const issues = issuesOf(
      v16((s) => {
        s.layers[0].annotationTypes[1].code.compose.variants.cases.outlined.params = {
          color: 'shadow.color',
        };
      }),
    );
    expect(issues.map((i) => i.path)).toEqual([
      'layers[0].annotationTypes[1].code.compose.variants.cases.outlined.params.color',
    ]);
  });

  it('field model with more than one form, an unknown form or empty is an error', () => {
    expect(
      issuesOf(
        v16(
          (s) =>
            (s.fieldModels.compose.Color = { like: 'surface.color', type: 'number' }),
        ),
      ),
    ).not.toEqual([]);
    expect(issuesOf(v16((s) => (s.fieldModels.compose.Color = {})))).not.toEqual([]);
    expect(
      issuesOf(v16((s) => (s.fieldModels.compose.Color = { bogus: true }))),
    ).not.toEqual([]);
    expect(
      issuesOf(v16((s) => (s.fieldModels.compose.Color = { type: 'table' }))),
    ).not.toEqual([]);
    expect(
      issuesOf(v16((s) => (s.fieldModels.compose.Color = { ignore: false }))),
    ).not.toEqual([]);
  });

  it('signature must be a .json path of the package', () => {
    expect(
      issuesOf(
        v16((s) => (s.layers[0].annotationTypes[0].code.compose.signature = '../x.json')),
      ).map((i) => i.path),
    ).toEqual([`${CODE}.signature`]);
    expect(
      issuesOf(
        v16((s) => (s.layers[0].annotationTypes[0].code.compose.signature = 'sig/x.txt')),
      ).map((i) => i.path),
    ).toEqual([`${CODE}.signature`]);
  });

  it('ignore with a repeated or empty name is an error', () => {
    expect(
      issuesOf(
        v16((s) => (s.layers[0].annotationTypes[0].code.compose.ignore = ['a', 'a'])),
      ).map((i) => i.path),
    ).toEqual([`${CODE}.ignore[1]`]);
  });

  it('a variants case with only signature is a valid case', () => {
    expect(
      issuesOf(
        v16((s) => {
          s.layers[0].annotationTypes[1].code.compose.variants.cases.outlined = {
            signature: 'signatures/s.json',
          };
        }),
      ),
    ).toEqual([]);
  });

  it("signature in the type's sources, in v16, is valid", () => {
    const spec = v16((s) => {
      s.layers[0].annotationTypes[0].sources = [
        { system: 'figma', name: 'Button', signature: 'signatures/button.figma.json' },
      ];
    });
    expect(issuesOf(spec)).toEqual([]);
    expect(jsonValidator.safeParse(spec).success).toBe(true);
  });
});

describe('formatVersion 16: version contract', () => {
  it('diffSpecs sees no difference when adding or changing the new keys', () => {
    const base = v16((s) => {
      delete s.fieldModels;
      const code = s.layers[0].annotationTypes[0].code.compose;
      for (const k of ['signature', 'ignore', 'calls', 'formats']) delete code[k];
      code.params = { label: 'label', containerColor: 'containerColor', width: 'width' };
      delete s.layers[0].annotationTypes[1].code.compose.variants;
    });
    const withNew = v16((s) => {
      delete s.layers[0].annotationTypes[1].code.compose.variants;
    });
    const changed = v16((s) => {
      delete s.layers[0].annotationTypes[1].code.compose.variants;
      s.fieldModels.compose.Dp.format = '{value}.sp';
      s.layers[0].annotationTypes[0].code.compose.ignore = ['modifier', 'content'];
    });
    const parse = (raw: Json) => {
      const r = parseSpec(raw);
      if (!r.ok) throw new Error(JSON.stringify(r.issues));
      return r.spec;
    };
    expect(diffSpecs(parse(base), parse(withNew))).toEqual([]);
    expect(diffSpecs(parse(withNew), parse(changed))).toEqual([]);
  });
});
