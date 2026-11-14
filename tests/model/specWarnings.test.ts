import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  ignoredFieldWarnings,
  parseSpecText,
  specWarnings,
  type IgnoredSpecField,
  type Spec,
} from '../../src/model';

// Warnings of a valid specialization (stage 4.2; the ignored field, stage 9): they do not prevent the
// import.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parse(path: string, edit?: (spec: Record<string, any>) => void) {
  const raw = JSON.parse(readFileSync(path, 'utf8')) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  edit?.(raw);
  const parsed = parseSpecText(JSON.stringify(raw));
  if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
  return parsed;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function load(path: string, edit?: (spec: Record<string, any>) => void): Spec {
  return parse(path, edit).spec;
}

/** The SDUI from before `repo` (formatVersion 2): platforms with `path` and without `repo`. */
const LEGACY_SDUI = 'tests/fixtures/sdui-v2.json';

describe('specWarnings', () => {
  it('the repository examples only have the warning for the type without code (screen)', () => {
    expect(specWarnings(load('examples/specs/modelo-de-dados.json'))).toEqual([]);
    // The SDUI declares the `repo` of the three platforms: no `path-without-repo`.
    const sdui = specWarnings(load('examples/specs/sdui.json'));
    expect(sdui).toEqual([
      expect.objectContaining({
        code: 'type-without-code',
        path: 'layers[2].annotationTypes[0]',
      }),
    ]);
  });

  it('type-without-code: the text says that no platform explains how to create the instance', () => {
    const spec = load('examples/specs/sdui.json');
    const warning = specWarnings(spec).find((w) => w.code === 'type-without-code');
    expect(warning?.message).toBe(
      `the type "${spec.layers[2]?.annotationTypes[0]?.id}" has no \`code\`: no platform says how to create an instance of it`,
    );
  });

  describe('path-without-repo', () => {
    const repo = { url: 'https://github.com/acme/android' };
    /** sdui with the android (and ios) `path`s and version 5, with `repo` only where requested. */
    const v5 = (repos: Record<string, unknown>) =>
      load(LEGACY_SDUI, (raw) => {
        raw.formatVersion = 5;
        for (const p of raw.platforms)
          if (repos[p.id] !== undefined) p.repo = repos[p.id];
      });
    const only = (spec: Spec) =>
      specWarnings(spec).filter((w) => w.code === 'path-without-repo');

    it('platform with types with path and without repo: one warning per platform, in order', () => {
      const warnings = only(v5({}));
      expect(warnings.map((w) => w.path)).toEqual(['platforms[0]', 'platforms[1]']);
      expect(warnings[0]?.message).toMatch(
        /^the platform "android" has types with `path` \((\d+)\), but does not declare `repo`: the agent does not know which repository holds those files; declare `repo` \(formatVersion 5\)$/,
      );
    });

    it('with repo, the platform does not warn; the others keep warning', () => {
      expect(only(v5({ android: repo })).map((w) => w.path)).toEqual(['platforms[1]']);
      expect(only(v5({ android: repo, ios: repo }))).toEqual([]);
    });

    it('also counts the path of variants.cases (CR #945, item 47)', () => {
      const parsed = parseSpecText(
        JSON.stringify({
          format: 'mapping-spec',
          formatVersion: 9,
          id: 's',
          name: 'S',
          version: 1,
          platforms: [{ id: 'android', name: 'Android' }],
          layers: [
            {
              id: 'l',
              name: 'L',
              color: '#112233',
              annotationTypes: [
                {
                  id: 'btn',
                  name: 'Btn',
                  fields: [
                    { key: 'kind', label: 'Kind', type: 'enum', options: ['a', 'b'] },
                  ],
                  code: {
                    android: {
                      symbol: 'Button',
                      variants: {
                        field: 'kind',
                        cases: { a: { path: 'app/A.kt' }, b: { path: 'app/B.kt' } },
                      },
                    },
                  },
                },
              ],
            },
          ],
        }),
      );
      if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
      const warnings = specWarnings(parsed.spec).filter(
        (w) => w.code === 'path-without-repo',
      );
      expect(warnings).toHaveLength(1);
      expect(warnings[0]?.message).toContain('has types with `path` (2)');
    });

    it('platform without types with path does not warn (the bff of the example)', () => {
      expect(only(v5({})).some((w) => w.path === 'platforms[2]')).toBe(false);
    });

    it('also applies in a v2 (the message guides upgrading to 5)', () => {
      const spec = load(LEGACY_SDUI);
      expect(spec.formatVersion).toBe(2);
      expect(only(spec).length).toBeGreaterThan(0);
    });

    it('comes after the type and unused-platform warnings', () => {
      const spec = load(LEGACY_SDUI, (raw) => {
        raw.platforms.push({ id: 'web', name: 'Web' });
      });
      expect(specWarnings(spec).map((w) => w.code)).toEqual([
        'type-without-code',
        'unused-platform',
        'path-without-repo',
        'path-without-repo',
      ]);
    });
  });

  it('platform declared and not used in code', () => {
    const spec = load(LEGACY_SDUI, (raw) => {
      raw.platforms.push({ id: 'web', name: 'Web' });
    });
    const unused = specWarnings(spec).filter((w) => w.code === 'unused-platform');
    expect(unused).toEqual([expect.objectContaining({ path: 'platforms[3]' })]);
  });

  it('removed type field (codeRef): warning with the path, right after the old format', () => {
    const parsed = parse(LEGACY_SDUI, (raw) => {
      raw.format = 'mapeador-spec';
      raw.platforms.push({ id: 'web', name: 'Web' });
      raw.layers[2].annotationTypes[0].fields.push({
        key: 'implementation',
        type: 'codeRef',
        platforms: ['web'],
      });
    });
    const warnings = specWarnings(parsed.spec, parsed.ignored);
    expect(warnings.map((w) => [w.code, w.path])).toEqual([
      ['legacy-format', 'format'],
      ['ignored-field', 'layers[2].annotationTypes[0].fields[2]'],
      ['type-without-code', 'layers[2].annotationTypes[0]'],
      // The `platforms` of the ignored field no longer counts as platform usage.
      ['unused-platform', 'platforms[3]'],
      ['path-without-repo', 'platforms[0]'],
      ['path-without-repo', 'platforms[1]'],
    ]);
    expect(warnings[1]?.message).toBe(
      'the field "implementation" of the type "screen" is "codeRef", which was removed from the format: it was ignored (its values are not saved); remove it from the file',
    );
  });

  it('ignoredFieldWarnings: one warning per field, in order', () => {
    const ignored: IgnoredSpecField[] = [
      { path: 'layers[0].annotationTypes[0].fields[1]', typeId: 'a', key: 'x' },
      { path: 'layers[1].annotationTypes[2].fields[0]', typeId: 'b', key: 'y' },
    ];
    expect(ignoredFieldWarnings(ignored).map((w) => [w.code, w.path])).toEqual([
      ['ignored-field', 'layers[0].annotationTypes[0].fields[1]'],
      ['ignored-field', 'layers[1].annotationTypes[2].fields[0]'],
    ]);
    expect(ignoredFieldWarnings([])).toEqual([]);
  });

  it('without declared platforms, a type without code is not an oversight', () => {
    const spec = load('examples/specs/modelo-de-dados.json', (raw) => {
      raw.layers[0].annotationTypes[0].code = undefined;
    });
    expect(specWarnings(spec)).toEqual([]);
  });

  it('the old format warns', () => {
    const spec = load('examples/specs/modelo-de-dados.json', (raw) => {
      raw.format = 'mapeador-spec';
    });
    expect(specWarnings(spec)).toEqual([
      expect.objectContaining({ code: 'legacy-format' }),
    ]);
  });
});
