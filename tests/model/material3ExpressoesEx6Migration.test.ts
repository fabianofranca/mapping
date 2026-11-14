// EX6 of the "expressions that compute in format 4" stage (#897), decision 14: the slider now has
// numeric `value`, `valueStart` and `valueEnd`. The text the `enum` stored ("0.3") is not valid in a
// `number` field: `fill-field` replaces it with the default and reports the loss (`replaced-value`).
// Owner's decision (2026-11-10): no project uses the slider yet, so it stays as simple as possible, without
// converting the text (`fillField` and docs/SPEC-FORMAT.md do not change).
import { describe, expect, it } from 'vitest';
import {
  runLibraryMigrations,
  type SpecAnnotationType,
  type SpecMigrationStep,
} from '../../src/model';
import { libProject, libSpec, valuesOf } from './libraryMigrationFixtures';
import { idGen } from './specFixtures';

const TENTHS = ['0', '0.1', '0.2', '0.3', '0.4', '0.5', '0.6', '0.7', '0.8', '0.9', '1'];

const sliderOld: SpecAnnotationType = {
  id: 'slider',
  name: 'Slider',
  fields: [
    { key: 'value', type: 'enum', default: '0.5', options: TENTHS },
    { key: 'valueStart', type: 'enum', default: '0.2', options: TENTHS },
    { key: 'valueEnd', type: 'enum', default: '0.8', options: TENTHS },
  ],
};
const sliderNew: SpecAnnotationType = {
  id: 'slider',
  name: 'Slider',
  fields: [
    { key: 'value', type: 'number', default: 0.5 },
    { key: 'valueStart', type: 'number', default: 0.2 },
    { key: 'valueEnd', type: 'number', default: 0.8 },
  ],
};
const steps: SpecMigrationStep[] = [
  { op: 'fill-field', type: 'slider', field: 'value', default: 0.5 },
  { op: 'fill-field', type: 'slider', field: 'valueStart', default: 0.2 },
  { op: 'fill-field', type: 'slider', field: 'valueEnd', default: 0.8 },
];

describe('EX6 — the text of the old slider enum in the migration to number', () => {
  it('the text becomes the default and the loss is reported; number and empty stay as they are', () => {
    const p = libProject(libSpec(1, { c: [sliderOld] }), [
      {
        id: 'S1',
        type: 'slider',
        values: { value: '0.3', valueStart: '0.1', valueEnd: '0.9' },
      },
      {
        id: 'S2',
        type: 'slider',
        values: { value: null, valueStart: null, valueEnd: null },
      },
    ]);
    const next = libSpec(
      2,
      { c: [sliderNew] },
      { migrations: [{ from: 1, to: 2, steps }] },
    );
    const out = runLibraryMigrations(p, next, 1, { newId: idGen('N') });
    expect(valuesOf(out.project, 'S1')).toEqual({
      value: 0.5,
      valueStart: 0.2,
      valueEnd: 0.8,
    });
    expect(out.losses.map((l) => [l.reason, l.annotationId, l.field, l.value])).toEqual([
      ['replaced-value', 'S1', 'value', '0.3'],
      ['replaced-value', 'S1', 'valueStart', '0.1'],
      ['replaced-value', 'S1', 'valueEnd', '0.9'],
    ]);
    expect(valuesOf(out.project, 'S2').value).toBe(0.5);
  });
});
