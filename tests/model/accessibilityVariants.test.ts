// `accessibility.variants` (formatVersion 21, decisions 24 to 26 of the accessibility variants stage): role
// and label per case of an enum field. The format (the paths and messages), the resolution per annotation
// (`accessibilityAudit`, `annotationAccessibility`, `typeAccessibility`) and the warning.
import { describe, expect, it } from 'vitest';
import {
  accessibilityAudit,
  addContainer,
  addTypedAnnotation,
  annotationAccessibility,
  applySpecialization,
  createMarking,
  parseSpec,
  setFieldValue,
  specWarnings,
  typeAccessibility,
  type Project,
  type Rect,
  type Spec,
} from '../../src/model';
import { ACCESSIBILITY_VARIANTS_VERSION } from '../../src/model/specAccessibility';
import { diffSpecs } from '../../src/model/specVersions';
import { emptyProject } from './fixtures';
import { idGen, layerOf } from './specFixtures';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const ACC = 'layers[0].annotationTypes[0].accessibility';
const VAR = `${ACC}.variants`;
const ROOT_TOUCH = { width: 44, height: 44, mode: 'visual' };

function rawSpec(edit?: (accessibility: Json, type: Json, spec: Json) => void): Json {
  const text = (key: string) => ({ key, type: 'string' });
  const s: Json = {
    format: 'mapping-spec',
    formatVersion: 21,
    id: 'a11y',
    name: 'A11y',
    version: 1,
    accessibility: { touchTarget: ROOT_TOUCH },
    layers: [
      {
        id: 'ui',
        name: 'UI',
        color: '#112233',
        annotationTypes: [
          {
            id: 'chip',
            name: 'Chip',
            fields: [
              { key: 'kind', type: 'enum', options: ['assist', 'filter', 'input'] },
              text('label'),
              text('text'),
              { key: 'n', type: 'number' },
            ],
            accessibility: {
              role: 'button',
              label: { fields: ['label'] },
              parts: [{ id: 'close', when: 'text', label: { fields: ['label'] } }],
              variants: {
                field: 'kind',
                cases: { filter: { role: 'checkbox' }, input: { role: 'checkbox' } },
              },
            },
          },
        ],
      },
    ],
  };
  const type = s.layers[0].annotationTypes[0];
  edit?.(type.accessibility, type, s);
  return s;
}

function issuesOf(input: unknown): { path: string; message: string }[] {
  const result = parseSpec(input);
  return result.ok ? [] : result.issues.map(({ path, message }) => ({ path, message }));
}

function specOf(edit?: Parameters<typeof rawSpec>[0]): Spec {
  const parsed = parseSpec(rawSpec(edit));
  if (!parsed.ok) throw new Error(JSON.stringify(parsed.issues));
  return parsed.spec;
}

const variantsOf = (a: Json): Json => a.variants;

describe('accessibility.variants: the format', () => {
  it('a valid declaration has no issue', () => {
    expect(issuesOf(rawSpec())).toEqual([]);
    expect(ACCESSIBILITY_VARIANTS_VERSION).toBe(21);
  });

  it('field that is not a field of the type', () => {
    expect(issuesOf(rawSpec((a) => (variantsOf(a).field = 'zz')))).toEqual([
      { path: `${VAR}.field`, message: '"zz" is not a field of the type' },
    ]);
  });

  it('field that is not an enum', () => {
    expect(issuesOf(rawSpec((a) => (variantsOf(a).field = 'label')))).toEqual([
      { path: `${VAR}.field`, message: '"label" must be an enum field of the type' },
    ]);
  });

  it('cases empty', () => {
    expect(issuesOf(rawSpec((a) => (variantsOf(a).cases = {})))).toEqual([
      { path: `${VAR}.cases`, message: 'declare at least one case' },
    ]);
  });

  it('a case value outside the options', () => {
    expect(
      issuesOf(rawSpec((a) => (variantsOf(a).cases.elevated = { role: 'link' }))),
    ).toEqual([
      {
        path: `${VAR}.cases.elevated`,
        message: '"elevated" is not in the options of "kind"',
      },
    ]);
  });

  it('an empty case', () => {
    expect(issuesOf(rawSpec((a) => (variantsOf(a).cases.assist = {})))).toEqual([
      {
        path: `${VAR}.cases.assist`,
        message: 'empty case: declare role or label',
      },
    ]);
  });

  it('a role outside the list', () => {
    const [issue, ...rest] = issuesOf(
      rawSpec((a) => (variantsOf(a).cases.filter.role = 'zz')),
    );
    expect(rest).toEqual([]);
    expect(issue?.path).toBe(`${VAR}.cases.filter.role`);
    expect(issue?.message).toMatch(/^role "zz" is invalid; use button, /);
  });

  it('a label field that is not a field of the type, and one that is not text', () => {
    expect(
      issuesOf(
        rawSpec((a) => (variantsOf(a).cases.filter.label = { fields: ['label', 'zz'] })),
      ),
    ).toEqual([
      {
        path: `${VAR}.cases.filter.label.fields[1]`,
        message: 'label: field does not exist: zz',
      },
    ]);
    expect(
      issuesOf(rawSpec((a) => (variantsOf(a).cases.filter.label = { fields: ['n'] }))),
    ).toEqual([
      {
        path: `${VAR}.cases.filter.label.fields[0]`,
        message: 'label: field n must be string or enum',
      },
    ]);
  });

  it('an unknown key in variants, in a case and a touchTarget or parts in a case', () => {
    const inVariants = issuesOf(rawSpec((a) => (variantsOf(a).extra = 1)));
    expect(inVariants).toHaveLength(1);
    expect(inVariants[0]?.path).toBe(VAR);
    for (const key of ['extra', 'touchTarget', 'parts']) {
      const inCase = issuesOf(rawSpec((a) => (variantsOf(a).cases.filter[key] = 1)));
      expect(inCase, key).toHaveLength(1);
      expect(inCase[0]?.path, key).toBe(`${VAR}.cases.filter`);
    }
  });

  it('only from formatVersion 21; the base accessibility works from 18', () => {
    for (const version of [18, 19, 20]) {
      expect(
        issuesOf(rawSpec((_a, _t, s) => (s.formatVersion = version))),
        String(version),
      ).toEqual([{ path: VAR, message: 'only allowed with formatVersion 21' }]);
      expect(
        issuesOf(
          rawSpec((a, _t, s) => {
            s.formatVersion = version;
            delete a.variants;
          }),
        ),
        String(version),
      ).toEqual([]);
    }
  });

  it('is outside the version contract: no difference with or without variants', () => {
    const without = specOf((a) => delete a.variants);
    const withVariants = specOf();
    expect(diffSpecs(without, withVariants)).toEqual([]);
    expect(diffSpecs(withVariants, without)).toEqual([]);
  });
});

const SIZE = { width: 1000, height: 1000 };
const BIG: Rect = { x: 0, y: 0, width: 500, height: 500 };
const SMALL: Rect = { x: 0, y: 0, width: 20, height: 20 };

function put(spec: Spec, values: Record<string, string> = {}, rect: Rect = BIG): Project {
  let p = applySpecialization(emptyProject(), spec, { newId: idGen('SL') });
  p = addContainer(p, { id: 'I1', file: 'a.png', ...SIZE });
  p = createMarking(p, { id: 'M_A', containerId: 'I1', rect, name: 'A' });
  p = addTypedAnnotation(p, {
    id: 'A',
    markingId: 'M_A',
    layerId: layerOf(p, 'a11y', 'ui'),
    type: { specId: 'a11y', typeId: 'chip' },
  });
  for (const [key, value] of Object.entries(values))
    p = setFieldValue(p, 'A', key, value);
  return p;
}

const annotation = (p: Project) => p.annotations.find((a) => a.id === 'A')!;
const roleOf = (p: Project) => annotationAccessibility(p, annotation(p))?.role;
const issuesAt = (p: Project) => accessibilityAudit(p).get('A')?.issues ?? [];
const findingsAt = (p: Project) => accessibilityAudit(p).get('A')?.findings ?? [];

describe('accessibility.variants: the resolution per annotation', () => {
  it('the value of the field chooses the case; no case uses the base', () => {
    expect(roleOf(put(specOf(), { kind: 'filter' }))).toBe('checkbox');
    expect(roleOf(put(specOf(), { kind: 'input' }))).toBe('checkbox');
    expect(roleOf(put(specOf(), { kind: 'assist' }))).toBe('button');
  });

  it('no value uses the default of the enum field, then the base', () => {
    expect(roleOf(put(specOf()))).toBe('button');
    const withDefault = specOf((_a, t) => (t.fields[0].default = 'filter'));
    expect(roleOf(put(withDefault))).toBe('checkbox');
    expect(roleOf(put(withDefault, { kind: 'assist' }))).toBe('button');
  });

  it('a filter chip with no label is pending as a checkbox with a required label', () => {
    const p = put(specOf(), { kind: 'filter' });
    expect(issuesAt(p)).toEqual([{ code: 'accessible-label-missing', key: 'label' }]);
    expect(annotationAccessibility(p, annotation(p))).toEqual({
      role: 'checkbox',
      label: null,
      missing: true,
    });
  });

  it('required defaults by the resolved role: a role-only case recomputes it', () => {
    const spec = specOf((a) => {
      a.role = 'image';
    });
    expect(issuesAt(put(spec, { kind: 'assist' }))).toEqual([]);
    expect(issuesAt(put(spec, { kind: 'filter' }))).toEqual([
      { code: 'accessible-label-missing', key: 'label' },
    ]);
  });

  it('a case with a label replaces the whole label', () => {
    const spec = specOf((a) => {
      variantsOf(a).cases.filter = { role: 'link', label: { fields: ['text'] } };
    });
    expect(issuesAt(put(spec, { kind: 'filter', label: 'x' }))).toEqual([
      { code: 'accessible-label-missing', key: 'text' },
    ]);
    expect(issuesAt(put(spec, { kind: 'filter', text: 'x', label: 'y' }))).toEqual([]);
    expect(issuesAt(put(spec, { kind: 'assist' }))).toEqual([
      { code: 'accessible-label-missing', key: 'label' },
    ]);
  });

  it('a case with role none (and a label) is not audited', () => {
    const spec = specOf((a) => {
      variantsOf(a).cases.filter = { role: 'none', label: { fields: ['text'] } };
    });
    const p = put(spec, { kind: 'filter' }, SMALL);
    expect(issuesAt(p).filter((i) => !('part' in i))).toEqual([]);
    expect(findingsAt(p)).toEqual([]);
    expect(roleOf(p)).toBe('none');
  });

  it('the touch target is audited only with an interactive resolved role', () => {
    const spec = specOf((a) => {
      a.variants.cases.input = { role: 'none' };
    });
    expect(findingsAt(put(spec, { kind: 'filter' }, SMALL)).map((f) => f.code)).toEqual([
      'touch-target-small',
    ]);
    expect(findingsAt(put(spec, { kind: 'input' }, SMALL))).toEqual([]);
    expect(findingsAt(put(spec, { kind: 'assist' }, SMALL)).map((f) => f.code)).toEqual([
      'touch-target-small',
    ]);
  });

  it('a type whose base has no role but whose cases do is still audited', () => {
    const spec = specOf((a) => {
      delete a.role;
      delete a.label;
      delete a.parts;
    });
    expect(issuesAt(put(spec, { kind: 'assist' }))).toEqual([]);
    expect(
      annotationAccessibility(put(spec, { kind: 'assist' }), annotation(put(spec))),
    ).toBeNull();
    expect(findingsAt(put(spec, { kind: 'assist' }, SMALL))).toEqual([]);
    expect(findingsAt(put(spec, { kind: 'filter' }, SMALL)).map((f) => f.code)).toEqual([
      'touch-target-small',
    ]);
  });

  it('the parts stay from the base', () => {
    const p = put(specOf(), { kind: 'filter', text: 'x', label: 'y' });
    expect(issuesAt(p)).toEqual([]);
    const q = put(specOf(), { kind: 'filter', text: 'x' });
    expect(issuesAt(q).map((i) => ('part' in i ? i.part?.id : undefined))).toEqual([
      undefined,
      'close',
    ]);
    expect(annotationAccessibility(q, annotation(q))?.parts).toEqual([
      { id: 'close', name: 'close', role: 'button', label: null, missing: true },
    ]);
  });
});

describe('accessibility.variants: typeAccessibility', () => {
  const resolved = (spec: Spec) =>
    typeAccessibility(spec, spec.layers[0]!.annotationTypes[0]!);

  it('carries each case already resolved, in the declaration order', () => {
    const spec = specOf((a) => {
      a.variants.cases = {
        input: { role: 'none' },
        filter: { role: 'link', label: { fields: ['text'] } },
        assist: { label: { fields: ['text'], required: false } },
      };
    });
    const got = resolved(spec)!;
    expect(Object.keys(got.variants!.cases)).toEqual(['input', 'filter', 'assist']);
    expect(got.variants).toEqual({
      field: 'kind',
      cases: {
        input: { role: 'none' },
        filter: {
          role: 'link',
          label: { fields: ['text'], required: true },
          touchTarget: ROOT_TOUCH,
        },
        assist: {
          role: 'button',
          label: { fields: ['text'], required: false },
          touchTarget: ROOT_TOUCH,
        },
      },
    });
    expect(got.role).toBe('button');
  });

  it('a role-only case keeps the base label, with required recomputed', () => {
    const got = resolved(specOf((a) => (a.role = 'image')))!;
    expect(got.variants?.cases.filter).toEqual({
      role: 'checkbox',
      label: { fields: ['label'], required: true },
      touchTarget: ROOT_TOUCH,
    });
  });

  it('without variants the output has no variants key', () => {
    expect(resolved(specOf((a) => delete a.variants))).not.toHaveProperty('variants');
  });

  it('a type with only variants does not read as declaring nothing', () => {
    const got = resolved(
      specOf((a) => {
        delete a.role;
        delete a.label;
        delete a.parts;
      }),
    );
    expect(got).not.toBeNull();
    expect(got?.variants?.field).toBe('kind');
  });
});

describe('accessibility.variants: the warning', () => {
  const warns = (spec: Spec) =>
    specWarnings(spec).filter((w) => w.code === 'label-without-role');

  it('a case that resolves to no role or none and declares a label warns at its path', () => {
    const spec = specOf((a) => {
      a.variants.cases.filter = { role: 'none', label: { fields: ['text'] } };
    });
    const found = warns(spec);
    expect(found.map((w) => w.path)).toEqual([`${VAR}.cases.filter.label`]);
    expect(found[0]?.message).toBe(
      'the type "chip" declares `label` in the case "filter" without a role: it has no effect until the case has a role other than `none`',
    );
  });

  it('a case label inherits the base role; none without a label does not warn', () => {
    expect(
      warns(specOf((a) => (a.variants.cases.filter.label = { fields: ['text'] }))),
    ).toEqual([]);
    expect(warns(specOf((a) => (a.variants.cases.filter = { role: 'none' })))).toEqual(
      [],
    );
    const noBase = specOf((a) => {
      delete a.role;
      delete a.label;
      delete a.parts;
      a.variants.cases.input = { label: { fields: ['text'] } };
    });
    expect(warns(noBase).map((w) => w.path)).toEqual([`${VAR}.cases.input.label`]);
  });

  it('the base label is read through any case that gives a role, so it does not warn', () => {
    const roleOnlyCases = specOf((a) => {
      delete a.role;
      a.variants.cases = { filter: { role: 'checkbox' }, assist: { role: 'button' } };
    });
    expect(warns(roleOnlyCases)).toEqual([]);
    // No case gives a role (or only `none`): the base label is read by nothing, as before.
    const noRoleAnywhere = specOf((a) => {
      delete a.role;
      a.variants.cases = { filter: { role: 'none' }, input: { role: 'none' } };
    });
    expect(warns(noRoleAnywhere).map((w) => w.path)).toEqual([`${ACC}.label`]);
  });
});
