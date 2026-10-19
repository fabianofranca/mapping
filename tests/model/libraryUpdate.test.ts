import { describe, expect, it } from 'vitest';
import {
  getAnnotationIssues,
  ModelError,
  specializationUpdateImpact,
  updateSpecialization,
  validateProject,
  type Spec,
  type SpecAnnotationType,
} from '../../src/model';
import {
  annotationOf,
  badgeType,
  buttonType,
  chipType,
  libProject,
  libSpec,
  row,
  setRaw,
  valuesOf,
} from './libraryMigrationFixtures';
import { idGen } from './specFixtures';

// `updateSpecialization` com o contrato de versão e a execução das migrações, e o impacto
// (`additive`, `refused`, `steps`, `losses`, `pending`). Os passos em si: libraryMigrations.test.ts.

function codeOf(fn: () => unknown): string | null {
  try {
    fn();
    return null;
  } catch (e) {
    if (e instanceof ModelError) return e.code;
    throw e;
  }
}

const update = (p: Parameters<typeof updateSpecialization>[0], next: Spec) =>
  updateSpecialization(p, next, { newId: idGen('N') });

/** O projeto da v1 com algumas anotações de cada tipo. */
function project1() {
  const p = libProject(libSpec(1), [
    {
      id: 'B1',
      type: 'button',
      values: {
        label: 'OK',
        style: 'primary',
        size: 2,
        rows: [row('r1', { col: 'x', kind: 'a' })],
      },
    },
    {
      id: 'B2',
      type: 'button',
      marking: 'M2',
      values: { label: 'Cancelar', style: 'text' },
    },
    { id: 'C1', type: 'chip', parent: 'B1', values: { a: 'um', b: 'dois' } },
    { id: 'G1', type: 'badge', marking: 'M2', values: { text: 'novo' } },
  ]);
  return setRaw(p, 'G1', {
    text: 'novo',
    target: { annotationId: 'B1', key: 'label' },
  });
}

/** A v2 da quebra completa: renomeia, mapeia, preenche e remove. */
function breakingV2(): Spec {
  const button = buttonType({
    fields: [
      { key: 'title', type: 'string', tags: ['x'] },
      { key: 'style', type: 'enum', options: ['filled', 'text'] },
      { key: 'tooltip', type: 'string', required: true },
      {
        key: 'rows',
        type: 'table',
        tags: ['x'],
        columns: [
          { key: 'col', type: 'string' },
          { key: 'kind', type: 'enum', options: ['a', 'b'] },
          { key: 'extra', type: 'string' },
        ],
      },
    ],
  });
  return libSpec(
    2,
    { c: [button, badgeType()], e: [chipType()] },
    {
      migrations: [
        {
          from: 1,
          to: 2,
          steps: [
            { op: 'rename-field', type: 'button', from: 'label', to: 'title' },
            {
              op: 'map-values',
              type: 'button',
              field: 'style',
              values: { primary: 'filled' },
            },
            { op: 'fill-field', type: 'button', field: 'tooltip', default: 'dica' },
            { op: 'remove-field', type: 'button', field: 'size' },
          ],
        },
      ],
    },
  );
}

describe('updateSpecialization: contrato de versão', () => {
  it('v4 aditiva aplica direto, sem tocar nos valores', () => {
    const p = project1();
    const button = buttonType();
    const extended: SpecAnnotationType = {
      ...button,
      fields: [...button.fields, { key: 'hint', type: 'string' }],
    };
    const next = libSpec(2, {
      c: [extended, badgeType(), { id: 'card', name: 'Card', fields: [] }],
      e: [chipType()],
    });
    const impact = specializationUpdateImpact(p, next);
    expect(impact).toMatchObject({
      comparable: true,
      additive: true,
      refused: false,
      steps: [],
      losses: [],
      pending: [],
      converted: 0,
      deleted: 0,
    });
    const after = update(p, next);
    expect(after.specializations[0]?.version).toBe(2);
    expect(after.annotations).toEqual(p.annotations);
    expect(validateProject(after)).toEqual([]);
  });

  it('quebra sem migração: spec-missing-migrations; o impacto não lança e diz refused', () => {
    const p = project1();
    const button = buttonType();
    const next = libSpec(2, {
      c: [
        { ...button, fields: button.fields.filter((f) => f.key !== 'label') },
        badgeType(),
      ],
      e: [chipType()],
    });
    expect(codeOf(() => update(p, next))).toBe('spec-missing-migrations');
    const impact = specializationUpdateImpact(p, next);
    expect(impact.refused).toBe(true);
    expect(impact.additive).toBe(false);
    expect(impact.missingMigrations).toHaveLength(1);
    expect(impact.steps).toEqual([]);
    // o que aconteceria sem a recusa: o valor fica e vira pendência
    expect(impact.pending).toContainEqual({
      annotationId: 'B1',
      issue: { code: 'unknown-field', key: 'label' },
    });
  });

  it('versão que não cresceu continua spec-not-newer, antes do contrato', () => {
    const p = project1();
    expect(codeOf(() => update(p, libSpec(1)))).toBe('spec-not-newer');
    expect(codeOf(() => specializationUpdateImpact(p, libSpec(1)))).toBe(
      'spec-not-newer',
    );
  });

  it('quebra com migração: valores seguem o campo novo e o projeto fica válido', () => {
    const p = project1();
    const next = breakingV2();
    const impact = specializationUpdateImpact(p, next);
    expect(impact.refused).toBe(false);
    expect(impact.additive).toBe(false);
    expect(impact.missingMigrations).toEqual([]);
    expect(impact.steps.map((s) => [s.step.op, s.annotations, s.values, s.refs])).toEqual(
      [
        ['rename-field', 2, 2, 1],
        ['map-values', 1, 1, 0],
        ['fill-field', 2, 2, 0],
        ['remove-field', 2, 2, 0],
      ],
    );
    // o tamanho preenchido de B1 se perde; o de B2 era vazio
    expect(impact.losses).toEqual([
      {
        reason: 'removed-field',
        annotationId: 'B1',
        markingId: 'M1',
        typeId: 'button',
        field: 'size',
        value: 2,
      },
    ]);
    expect(impact.brokenRefs).toBe(0);
    expect(impact.pending).toEqual([]);

    const after = update(p, next);
    expect(valuesOf(after, 'B1')).toMatchObject({
      title: 'OK',
      style: 'filled',
      tooltip: 'dica',
    });
    expect('label' in valuesOf(after, 'B1')).toBe(false);
    expect('size' in valuesOf(after, 'B1')).toBe(false);
    expect(valuesOf(after, 'B2')).toMatchObject({ title: 'Cancelar', style: 'text' });
    expect(valuesOf(after, 'G1').target).toEqual({ annotationId: 'B1', key: 'title' });
    expect(after.specializations[0]).toMatchObject({ version: 2, spec: next });
    expect(validateProject(after)).toEqual([]);
    for (const a of after.annotations) {
      expect(getAnnotationIssues(after, a.id)).toEqual([]);
    }
  });

  it('remove-type delete leva as vinculadas e o projeto continua válido', () => {
    const p = project1();
    const next = libSpec(
      2,
      { c: [buttonType({ allowedChildren: [] }), badgeType()], e: [] },
      {
        migrations: [
          {
            from: 1,
            to: 2,
            steps: [{ op: 'remove-type', type: 'chip', mode: 'delete' }],
          },
        ],
      },
    );
    const impact = specializationUpdateImpact(p, next);
    expect(impact.deleted).toBe(1);
    expect(impact.losses.map((l) => [l.reason, l.annotationId])).toEqual([
      ['removed-type', 'C1'],
    ]);
    const after = update(p, next);
    expect(after.annotations.map((a) => a.id)).toEqual(['B1', 'B2', 'G1']);
    expect(validateProject(after)).toEqual([]);
  });

  it('remove-type convert: vira livre e a pendência layer-mismatch avisa', () => {
    const p = project1();
    const next = libSpec(
      2,
      { c: [buttonType({ allowedChildren: [] }), badgeType()], e: [] },
      {
        migrations: [
          {
            from: 1,
            to: 2,
            steps: [{ op: 'remove-type', type: 'chip', mode: 'convert' }],
          },
        ],
      },
    );
    const impact = specializationUpdateImpact(p, next);
    expect(impact.converted).toBe(1);
    expect(impact.pending).toEqual([
      { annotationId: 'C1', issue: { code: 'layer-mismatch' } },
    ]);
    const after = update(p, next);
    expect(annotationOf(after, 'C1').type).toBeNull();
    expect(annotationOf(after, 'C1').entries.map((e) => [e.key, e.value])).toEqual([
      ['a', 'um'],
      ['b', 'dois'],
    ]);
    expect(validateProject(after)).toEqual([]);
  });

  it('a camada que some converte com a especialização nova quando o tipo resolve nela', () => {
    const p = project1();
    // `chip` muda da camada `e` (que some) para `c`, com os campos em outra ordem.
    const next = libSpec(2, {
      c: [
        buttonType(),
        badgeType(),
        chipType({
          fields: [
            { key: 'b', type: 'string' },
            { key: 'a', type: 'string' },
          ],
        }),
      ],
    });
    const after = update(p, next);
    const chip = annotationOf(after, 'C1');
    expect(chip.type).toBeNull();
    expect(chip.entries.map((e) => e.key)).toEqual(['b', 'a']);
  });

  it('v3 com quebra continua aceita: o que ficar inválido vira pendência', () => {
    const v1 = libSpec(1, undefined, { formatVersion: 3 });
    const p = libProject(v1, [{ id: 'B1', type: 'button', values: { label: 'OK' } }]);
    const button = buttonType();
    const next = libSpec(
      2,
      {
        c: [
          { ...button, fields: button.fields.filter((f) => f.key !== 'label') },
          badgeType(),
        ],
        e: [chipType()],
      },
      { formatVersion: 3 },
    );
    const impact = specializationUpdateImpact(p, next);
    expect(impact.refused).toBe(false);
    expect(impact.additive).toBe(false);
    expect(impact.breaking).toHaveLength(1);
    const after = update(p, next);
    expect(valuesOf(after, 'B1').label).toBe('OK');
    expect(getAnnotationIssues(after, 'B1')).toEqual([
      { code: 'unknown-field', key: 'label' },
    ]);
  });

  it('cópia aplicada indisponível: não há contrato a conferir', () => {
    const p = project1();
    const noCopy = {
      ...p,
      specializations: p.specializations.map((s) => ({ ...s, spec: null })),
    };
    const next = libSpec(2, { c: [badgeType()], e: [] });
    const impact = specializationUpdateImpact(noCopy, next);
    expect(impact).toMatchObject({ comparable: false, additive: false, refused: false });
    expect(() => update(noCopy, next)).not.toThrow();
  });
});

describe('specializationUpdateImpact: pendências', () => {
  it('campo obrigatório novo sem fill-field: required-empty em cada anotação', () => {
    const p = project1();
    const button = buttonType();
    const next = libSpec(2, {
      c: [
        {
          ...button,
          fields: [...button.fields, { key: 'tooltip', type: 'string', required: true }],
        },
        badgeType(),
      ],
      e: [chipType()],
    });
    const impact = specializationUpdateImpact(p, next);
    expect(impact.refused).toBe(true);
    expect(impact.pending).toEqual([
      { annotationId: 'B1', issue: { code: 'required-empty', key: 'tooltip' } },
      { annotationId: 'B2', issue: { code: 'required-empty', key: 'tooltip' } },
    ]);
  });

  it('map-values incompleto: o valor sem destino vira unknown-option; as pendências antigas não contam', () => {
    let p = libProject(
      libSpec(1, {
        c: [
          buttonType({
            fields: [
              { key: 'style', type: 'enum', options: ['primary', 'text', 'ghost'] },
            ],
          }),
        ],
      }),
      [
        { id: 'B1', type: 'button', values: { style: 'primary' } },
        { id: 'B2', type: 'button', values: { style: 'ghost' } },
        { id: 'B3', type: 'button', values: { style: 'text' } },
      ],
    );
    // B3 já nascia com uma pendência: ela não entra entre as novas.
    p = setRaw(p, 'B3', { style: 'text', antigo: 1 });
    const next = libSpec(
      2,
      {
        c: [
          buttonType({
            fields: [{ key: 'style', type: 'enum', options: ['filled', 'text'] }],
          }),
        ],
      },
      {
        migrations: [
          {
            from: 1,
            to: 2,
            steps: [
              {
                op: 'map-values',
                type: 'button',
                field: 'style',
                values: { primary: 'filled' },
              },
            ],
          },
        ],
      },
    );
    const impact = specializationUpdateImpact(p, next);
    expect(impact.refused).toBe(true);
    expect(impact.pending).toEqual([
      { annotationId: 'B2', issue: { code: 'unknown-option', key: 'style' } },
    ]);
  });

  it('valor inválido trocado pelo fill-field é perda, não pendência', () => {
    const p = libProject(libSpec(1), [
      { id: 'B1', type: 'button', values: { size: 'grande' } },
    ]);
    const button = buttonType();
    const next = libSpec(
      2,
      {
        c: [
          {
            ...button,
            fields: button.fields.map((f) =>
              f.key === 'size' ? { ...f, required: true } : f,
            ),
          },
          badgeType(),
        ],
        e: [chipType()],
      },
      {
        migrations: [
          {
            from: 1,
            to: 2,
            steps: [{ op: 'fill-field', type: 'button', field: 'size', default: 1 }],
          },
        ],
      },
    );
    const impact = specializationUpdateImpact(p, next);
    expect(impact.refused).toBe(false);
    expect(impact.losses.map((l) => [l.reason, l.value])).toEqual([
      ['replaced-value', 'grande'],
    ]);
    expect(impact.pending).toEqual([]);
  });
});
