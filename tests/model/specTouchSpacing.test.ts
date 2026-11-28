// `formatVersion` 27 (stage #1998, TA3; decision 16): `touchTarget.spacing`, the opt-in of the
// WCAG 2.5.8 spacing exception, at the root and on the type. Every error sits at the exact path
// `…touchTarget.spacing`. The audit does not read the key yet (TA4).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  ACCESSIBILITY_SPACING_VERSION,
  SPEC_FORMAT_VERSION,
  SPEC_FORMAT_VERSIONS,
  parseSpec,
} from '../../src/model';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const jsonSchema = JSON.parse(readFileSync('docs/spec.schema.json', 'utf8')) as Record<
  string,
  unknown
>;
const jsonValidator = z.fromJSONSchema(jsonSchema as never);

const N = 27;
const ROOT = 'accessibility.touchTarget.spacing';
const TYPE = 'layers[0].annotationTypes[0].accessibility.touchTarget.spacing';
const ONLY_N = `only allowed with formatVersion ${N}`;
const NOT_BOOL = 'must be true or false';
const VISUAL_ONLY = 'spacing: only valid with mode "visual"';
const SQUARE = 'spacing: needs width equal to height';

const SPACED = { width: 24, height: 24, mode: 'visual', spacing: true };

/** A specialization with a root touch target and a button with its own. */
function spec(edit?: (s: Json) => void, formatVersion: number = N): Json {
  const s: Json = {
    format: 'mapping-spec',
    formatVersion,
    id: 'spacing',
    name: 'Spacing',
    version: 1,
    accessibility: { touchTarget: { ...SPACED } },
    layers: [
      {
        id: 'ui',
        name: 'UI',
        color: '#112233',
        annotationTypes: [
          {
            id: 'button',
            name: 'Button',
            fields: [{ key: 'label', type: 'string' }],
            accessibility: { role: 'button', touchTarget: { ...SPACED } },
          },
        ],
      },
    ],
  };
  edit?.(s);
  return s;
}

const issuesOf = (raw: Json) => {
  const r = parseSpec(raw);
  return r.ok ? [] : r.issues.map(({ path, message }) => ({ path, message }));
};

const root = (s: Json): Json => s.accessibility.touchTarget;
const type = (s: Json): Json => s.layers[0].annotationTypes[0].accessibility.touchTarget;

describe('formatVersion 27: touchTarget.spacing', () => {
  it('the key is read at N, and the version constants say N', () => {
    expect(ACCESSIBILITY_SPACING_VERSION).toBe(N);
    expect(SPEC_FORMAT_VERSION).toBe(N);
    expect(SPEC_FORMAT_VERSIONS.at(-1)).toBe(N);
    expect(SPEC_FORMAT_VERSIONS).toContain(N - 1);
  });

  it('spacing: true with { 24, 24, visual } at the root and on a type is valid and read as declared', () => {
    expect(issuesOf(spec())).toEqual([]);
    const result = parseSpec(spec());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.spec.accessibility?.touchTarget).toEqual(SPACED);
    expect(result.spec.layers[0]?.annotationTypes[0]?.accessibility?.touchTarget).toEqual(
      SPACED,
    );
  });

  it('spacing without a mode is valid (visual is the default)', () => {
    const s = spec((x) => delete root(x).mode);
    expect(issuesOf(s)).toEqual([]);
  });

  it('spacing: false is valid, with any mode and size, and the same as no key', () => {
    const off = spec((x) => {
      root(x).spacing = false;
      root(x).mode = 'expanded';
      root(x).height = 32;
      type(x).spacing = false;
      type(x).mode = 'expanded';
      type(x).height = 32;
    });
    const none = spec((x) => {
      for (const t of [root(x), type(x)]) {
        delete t.spacing;
        t.mode = 'expanded';
        t.height = 32;
      }
    });
    expect(issuesOf(off)).toEqual([]);
    expect(issuesOf(none)).toEqual([]);
  });

  it('before N the key is only allowed with formatVersion N, at the exact path', () => {
    const issues = issuesOf(spec(undefined, N - 1));
    expect(issues).toContainEqual({ path: ROOT, message: ONLY_N });
    expect(issues).toContainEqual({ path: TYPE, message: ONLY_N });
    expect(issues).toHaveLength(2);
  });

  it('before N even spacing: false is refused, and a specialization without the key still passes', () => {
    const off = spec((x) => {
      root(x).spacing = false;
      delete type(x).spacing;
    }, N - 1);
    expect(issuesOf(off)).toEqual([{ path: ROOT, message: ONLY_N }]);
    const none = spec((x) => {
      delete root(x).spacing;
      delete type(x).spacing;
    }, N - 1);
    expect(issuesOf(none)).toEqual([]);
    expect(issuesOf(spec(undefined, 18))).toHaveLength(2);
  });

  it('a spacing that is not a boolean is "must be true or false"', () => {
    const issues = issuesOf(
      spec((x) => {
        root(x).spacing = 'yes';
        type(x).spacing = 1;
      }),
    );
    expect(issues).toContainEqual({ path: ROOT, message: NOT_BOOL });
    expect(issues).toContainEqual({ path: TYPE, message: NOT_BOOL });
  });

  it('spacing: true with mode "expanded" is only valid with mode "visual"', () => {
    const issues = issuesOf(
      spec((x) => {
        root(x).mode = 'expanded';
        type(x).mode = 'expanded';
      }),
    );
    expect(issues).toContainEqual({ path: ROOT, message: VISUAL_ONLY });
    expect(issues).toContainEqual({ path: TYPE, message: VISUAL_ONLY });
    expect(issues).toHaveLength(2);
  });

  it('spacing: true with a width different from the height needs a square', () => {
    const issues = issuesOf(
      spec((x) => {
        root(x).height = 32;
        type(x).width = 24;
        type(x).height = 32;
      }),
    );
    expect(issues).toContainEqual({ path: ROOT, message: SQUARE });
    expect(issues).toContainEqual({ path: TYPE, message: SQUARE });
    expect(issues).toHaveLength(2);
  });

  it('expanded and not square: both errors, each at the key', () => {
    const issues = issuesOf(
      spec((x) => {
        root(x).mode = 'expanded';
        root(x).height = 32;
      }),
    );
    expect(issues).toEqual([
      { path: ROOT, message: VISUAL_ONLY },
      { path: ROOT, message: SQUARE },
    ]);
  });

  it('a type with touchTarget: false has no spacing to check', () => {
    const s = spec((x) => {
      x.layers[0].annotationTypes[0].accessibility.touchTarget = false;
    });
    expect(issuesOf(s)).toEqual([]);
  });

  it('the JSON Schema accepts the key as a boolean and refuses other values', () => {
    expect(jsonValidator.safeParse(spec()).success).toBe(true);
    expect(
      jsonValidator.safeParse(
        spec((x) => {
          root(x).spacing = 'yes';
        }),
      ).success,
    ).toBe(false);
  });
});
