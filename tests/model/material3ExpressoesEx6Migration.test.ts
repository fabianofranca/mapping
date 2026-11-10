// EX6 da etapa "expressões que calculam no formato 4" (#897), decisão 14: o slider passa a ter
// `value`, `valueStart` e `valueEnd` numéricos. O texto que o `enum` gravava ("0.3") não vale num
// campo `number`: o `fill-field` o troca pelo default e reporta a perda (`replaced-value`).
// Decisão do dono (2026-11-10): nenhum projeto usa o slider ainda, então fica o mais simples, sem
// converter o texto (o `fillField` e o docs/SPEC-FORMAT.md não mudam).
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

describe('EX6 — o texto do enum antigo do slider na migração para number', () => {
  it('o texto vira o default e a perda é reportada; número e vazio ficam como são', () => {
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
