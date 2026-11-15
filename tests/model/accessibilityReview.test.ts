// Phase A5 (fix round of #1081): D2 (the audit and the code hints agree on what a label value is) and D7
// (an empty `accessibility` reads as "none declared").
import { describe, expect, it } from 'vitest';
import {
  accessibilityAudit,
  addContainer,
  addTypedAnnotation,
  annotationAccessibility,
  applySpecialization,
  createMarking,
  parseSpec,
  typeAccessibility,
  type JsonValue,
  type Project,
} from '../../src/model';
import { emptyProject } from './fixtures';
import { idGen, layerOf } from './specFixtures';

const text = (key: string) => ({ key, type: 'string' });

function spec(accessibility: unknown) {
  const parsed = parseSpec({
    format: 'mapping-spec',
    formatVersion: 18,
    id: 'a11y',
    name: 'A11y',
    version: 1,
    layers: [
      {
        id: 'ui',
        name: 'UI',
        color: '#112233',
        annotationTypes: [
          { id: 'button', name: 'Button', fields: [text('label')], accessibility },
        ],
      },
    ],
  });
  if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
  return parsed.spec;
}

function worldWith(value: JsonValue) {
  let p: Project = applySpecialization(
    emptyProject(),
    spec({ role: 'button', label: { fields: ['label'] } }),
    { newId: idGen('SL') },
  );
  p = addContainer(p, { id: 'I1', file: 'a.png', width: 1000, height: 1000 });
  p = createMarking(p, {
    id: 'M1',
    containerId: 'I1',
    rect: { x: 0, y: 0, width: 500, height: 500 },
  });
  p = addTypedAnnotation(p, {
    id: 'A',
    markingId: 'M1',
    layerId: layerOf(p, 'a11y', 'ui'),
    type: { specId: 'a11y', typeId: 'button' },
  });
  // The value is set straight on the annotation: a label field of another kind than text.
  return {
    ...p,
    annotations: p.annotations.map((a) => ({ ...a, values: { label: value } })),
  };
}

describe('D2: one definition of a label value', () => {
  it.each<[string, JsonValue]>([
    ['a boolean', true],
    ['false', false],
    ['an empty array', []],
    ['an object', { a: 1 }],
  ])('%s is not a name: the audit and the hints both say it is missing', (_, value) => {
    const p = worldWith(value);
    const audit = accessibilityAudit(p).get('A');
    const hints = annotationAccessibility(p, p.annotations[0]!);
    expect(hints).toMatchObject({ label: null, missing: true });
    expect(audit?.issues.map((i) => i.code)).toEqual(['accessible-label-missing']);
  });

  it.each<[string, JsonValue, string]>([
    ['text', 'Pay', 'Pay'],
    ['a number', 7, '7'],
  ])('%s is a name for both', (_, value, label) => {
    const p = worldWith(value);
    expect(accessibilityAudit(p).get('A')).toBeUndefined();
    expect(annotationAccessibility(p, p.annotations[0]!)).toMatchObject({ label });
  });
});

describe('D7: an empty accessibility declares nothing', () => {
  it('typeAccessibility is null for `accessibility: {}`', () => {
    const s = spec({});
    expect(typeAccessibility(s, s.layers[0]!.annotationTypes[0]!)).toBeNull();
  });
});
