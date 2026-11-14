import { describe, expect, it } from 'vitest';
import {
  runLibraryMigrations,
  specializationUpdateImpact,
  updateSpecialization,
  type Annotation,
  type JsonValue,
  type Project,
  type Spec,
  type SpecMigrationStep,
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

// Pure execution of the `migrations` (`runLibraryMigrations`): one test per step, the chaining of
// two versions, the broken chain and the no-effect step. The whole update (layers, contract,
// impact) is in libraryUpdate.test.ts.

/** `next` v2 with the given steps in a 1 → 2 entry. */
function nextWith(...steps: SpecMigrationStep[]): Spec {
  return libSpec(2, undefined, { migrations: [{ from: 1, to: 2, steps }] });
}

function run(p: Project, next: Spec, from = 1) {
  return runLibraryMigrations(p, next, from, { newId: idGen('N') });
}

const ref = (annotationId: string, key: string, rowId?: string): JsonValue =>
  rowId === undefined ? { annotationId, key } : { annotationId, key, rowId };

describe('rename-type', () => {
  it('swaps the typeId, keeps the layer and leaves the other annotations as they are', () => {
    const p = libProject(libSpec(1), [
      { id: 'B1', type: 'button' },
      { id: 'G1', type: 'badge' },
    ]);
    const out = run(p, nextWith({ op: 'rename-type', from: 'button', to: 'cta' }));
    expect(annotationOf(out.project, 'B1').type).toEqual({
      specId: 'lib',
      typeId: 'cta',
    });
    expect(annotationOf(out.project, 'B1').layerId).toBe(annotationOf(p, 'B1').layerId);
    expect(annotationOf(out.project, 'G1')).toBe(annotationOf(p, 'G1'));
    expect(out.steps).toHaveLength(1);
    expect(out.steps[0]).toMatchObject({ from: 1, to: 2, index: 0, annotations: 1 });
    expect(out.losses).toEqual([]);
  });
});

describe('remove-type', () => {
  it('convert: becomes free with the values as pairs; the rest does not change', () => {
    const p = libProject(libSpec(1), [
      { id: 'G1', type: 'badge', values: { text: 'new' } },
      { id: 'B1', type: 'button', values: { label: 'OK' } },
    ]);
    const out = run(p, nextWith({ op: 'remove-type', type: 'badge', mode: 'convert' }));
    const free = annotationOf(out.project, 'G1');
    expect(free.type).toBeNull();
    expect(free.values).toBeNull();
    expect(free.name).toBe('Badge');
    expect(free.entries.map((e) => [e.key, e.value])).toEqual([['text', 'new']]);
    expect(annotationOf(out.project, 'B1')).toBe(annotationOf(p, 'B1'));
    expect(out.steps[0]).toMatchObject({ annotations: 1, converted: 1, deleted: 0 });
    expect(out.losses).toEqual([]);
  });

  it('delete: removes the annotation and the linked ones, one loss per deleted one', () => {
    const p = libProject(libSpec(1), [
      { id: 'B1', type: 'button' },
      { id: 'C1', type: 'chip', parent: 'B1' },
      { id: 'G1', type: 'badge' },
    ]);
    const out = run(p, nextWith({ op: 'remove-type', type: 'button', mode: 'delete' }));
    expect(out.project.annotations.map((a) => a.id)).toEqual(['G1']);
    expect(out.steps[0]).toMatchObject({ annotations: 1, deleted: 2, converted: 0 });
    expect(out.losses).toEqual([
      { reason: 'removed-type', annotationId: 'B1', markingId: 'M1', typeId: 'button' },
      { reason: 'removed-type', annotationId: 'C1', markingId: 'M1', typeId: 'chip' },
    ]);
  });

  it('delete: a free linked one leaves with an empty typeId', () => {
    let p = libProject(libSpec(1), [{ id: 'B1', type: 'button' }]);
    const free: Annotation = {
      id: 'F1',
      markingId: 'M1',
      layerId: 'L1',
      name: null,
      parentAnnotationId: 'B1',
      parentRole: null,
      type: null,
      values: null,
      entries: [],
    };
    p = { ...p, annotations: [...p.annotations, free] };
    const out = run(p, nextWith({ op: 'remove-type', type: 'button', mode: 'delete' }));
    expect(out.project.annotations).toEqual([]);
    expect(out.losses.map((l) => [l.annotationId, l.typeId])).toEqual([
      ['B1', 'button'],
      ['F1', ''],
    ]);
  });
});

describe('rename-field', () => {
  it('moves the value to the new key and preserves the others', () => {
    const p = libProject(libSpec(1), [
      { id: 'B1', type: 'button', values: { label: 'OK', size: 3 } },
    ]);
    const out = run(
      p,
      nextWith({ op: 'rename-field', type: 'button', from: 'label', to: 'title' }),
    );
    const values = valuesOf(out.project, 'B1');
    expect(values.title).toBe('OK');
    expect('label' in values).toBe(false);
    expect(values.size).toBe(3);
    expect(out.steps[0]).toMatchObject({ annotations: 1, values: 1, refs: 0 });
    expect(out.losses).toEqual([]);
  });

  it('campo ausente: nada muda', () => {
    const p = libProject(libSpec(1), [{ id: 'B1', type: 'button' }]);
    const out = run(
      p,
      nextWith({ op: 'rename-field', type: 'button', from: 'nope', to: 'title' }),
    );
    expect(out.project).toBe(p);
    expect(out.steps[0]).toMatchObject({ annotations: 0, values: 0 });
  });

  it('occupied and different destination: overwrites with a loss; same or empty origin: no loss', () => {
    let p = libProject(libSpec(1), [
      { id: 'B1', type: 'button' },
      { id: 'B2', type: 'button' },
      { id: 'B3', type: 'button' },
    ]);
    p = setRaw(p, 'B1', { label: 'new', title: 'old' });
    p = setRaw(p, 'B2', { label: '', title: 'stays' });
    p = setRaw(p, 'B3', { label: 'same', title: 'same' });
    const out = run(
      p,
      nextWith({ op: 'rename-field', type: 'button', from: 'label', to: 'title' }),
    );
    expect(valuesOf(out.project, 'B1')).toEqual({ title: 'new' });
    expect(valuesOf(out.project, 'B2')).toEqual({ title: 'stays' });
    expect(valuesOf(out.project, 'B3')).toEqual({ title: 'same' });
    expect(out.losses).toEqual([
      {
        reason: 'overwritten-value',
        annotationId: 'B1',
        markingId: 'M1',
        typeId: 'button',
        field: 'title',
        value: 'old',
      },
    ]);
  });

  it('column of the same table: renames the key in each row', () => {
    const p = libProject(libSpec(1), [
      {
        id: 'B1',
        type: 'button',
        values: {
          rows: [
            row('r1', { col: 'x', kind: 'a' }),
            row('r2', { col: 'y', kind: 'b', extra: 'old' }),
            row('r3', { kind: 'a' }),
          ],
        },
      },
    ]);
    const out = run(
      p,
      nextWith({
        op: 'rename-field',
        type: 'button',
        from: 'rows.col',
        to: 'rows.extra',
      }),
    );
    expect(valuesOf(out.project, 'B1').rows).toEqual([
      row('r1', { extra: 'x', kind: 'a' }),
      row('r2', { extra: 'y', kind: 'b' }),
      row('r3', { kind: 'a' }),
    ]);
    expect(out.steps[0]).toMatchObject({ annotations: 1, values: 2 });
    expect(out.losses).toEqual([
      {
        reason: 'overwritten-value',
        annotationId: 'B1',
        markingId: 'M1',
        typeId: 'button',
        field: 'rows.extra',
        rowId: 'r2',
        value: 'old',
      },
    ]);
  });

  it('different shapes (column to field): the values of from leave with a loss', () => {
    const p = libProject(libSpec(1), [
      {
        id: 'B1',
        type: 'button',
        values: {
          rows: [
            row('r1', { col: 'x' }),
            row('r2', { col: '' }),
            row('r3', { col: 'z' }),
          ],
        },
      },
    ]);
    const out = run(
      p,
      nextWith({ op: 'rename-field', type: 'button', from: 'rows.col', to: 'label' }),
    );
    expect(valuesOf(out.project, 'B1').rows).toEqual([
      row('r1', {}),
      row('r2', {}),
      row('r3', {}),
    ]);
    expect(valuesOf(out.project, 'B1').label).toBeNull();
    expect(out.losses.map((l) => [l.reason, l.field, l.rowId, l.value])).toEqual([
      ['removed-field', 'rows.col', 'r1', 'x'],
      ['removed-field', 'rows.col', 'r3', 'z'],
    ]);
  });

  it('different tables: also removes the values of from', () => {
    const p = libProject(libSpec(1), [
      { id: 'B1', type: 'button', values: { rows: [row('r1', { col: 'x' })] } },
    ]);
    const out = run(
      p,
      nextWith({ op: 'rename-field', type: 'button', from: 'rows.col', to: 'other.col' }),
    );
    expect(out.losses).toHaveLength(1);
    expect(out.losses[0]).toMatchObject({ reason: 'removed-field', rowId: 'r1' });
  });

  it('rewrites the field and row references, from any specialization', () => {
    let p = libProject(libSpec(1), [
      {
        id: 'B1',
        type: 'button',
        values: { label: 'OK', rows: [row('r1', { col: 'x' })] },
      },
      { id: 'B2', type: 'button', values: { label: 'another' } },
      { id: 'G1', type: 'badge', marking: 'M2' },
      { id: 'G2', type: 'badge', marking: 'M2' },
    ]);
    p = setRaw(p, 'G1', { target: ref('B1', 'label') });
    p = setRaw(p, 'G2', { target: ref('B1', 'rows', 'r1') });
    const foreign: Annotation = {
      ...annotationOf(p, 'G1'),
      id: 'X1',
      type: { specId: 'other', typeId: 'any' },
      values: {
        a: ref('B1', 'label'),
        b: ref('B2', 'label'),
        c: ref('B1', 'size'),
        d: { annotationId: 'B1', entryId: 'e1' },
        e: 'text',
      },
    };
    p = { ...p, annotations: [...p.annotations, foreign] };
    const out = run(
      p,
      nextWith(
        { op: 'rename-field', type: 'button', from: 'label', to: 'title' },
        { op: 'rename-field', type: 'button', from: 'rows', to: 'items' },
      ),
    );
    expect(valuesOf(out.project, 'G1').target).toEqual(ref('B1', 'title'));
    expect(valuesOf(out.project, 'G2').target).toEqual(ref('B1', 'items', 'r1'));
    expect(valuesOf(out.project, 'X1')).toEqual({
      a: ref('B1', 'title'),
      b: ref('B2', 'title'),
      c: ref('B1', 'size'),
      d: { annotationId: 'B1', entryId: 'e1' },
      e: 'text',
    });
    // B2 is also of the renamed type: the reference to it follows.
    expect(out.steps.map((s) => s.refs)).toEqual([3, 1]);
    // `annotations` counts only those of the step's type.
    expect(out.steps.map((s) => s.annotations)).toEqual([2, 2]);
    expect(out.losses).toEqual([]);
  });

  it('does not rewrite references of another type or another key', () => {
    let p = libProject(libSpec(1), [
      { id: 'B1', type: 'button', values: { label: 'OK' } },
      { id: 'G1', type: 'badge', values: { text: 'T' } },
      { id: 'G2', type: 'badge' },
    ]);
    p = setRaw(p, 'G2', { target: ref('G1', 'label') });
    const out = run(
      p,
      nextWith({ op: 'rename-field', type: 'button', from: 'label', to: 'title' }),
    );
    expect(valuesOf(out.project, 'G2').target).toEqual(ref('G1', 'label'));
    expect(out.steps[0]?.refs).toBe(0);
  });
});

describe('remove-field', () => {
  it('removes the key and loses only what was not empty', () => {
    let p = libProject(libSpec(1), [
      { id: 'B1', type: 'button', values: { label: 'OK', size: 2 } },
      { id: 'B2', type: 'button', values: { label: '' } },
      { id: 'B3', type: 'button' },
    ]);
    p = setRaw(p, 'B3', { size: 1 });
    const out = run(p, nextWith({ op: 'remove-field', type: 'button', field: 'label' }));
    expect(valuesOf(out.project, 'B1')).toEqual({ style: null, size: 2, rows: [] });
    expect('label' in valuesOf(out.project, 'B2')).toBe(false);
    expect(valuesOf(out.project, 'B3')).toEqual({ size: 1 });
    expect(out.steps[0]).toMatchObject({ annotations: 2, values: 2 });
    expect(out.losses).toEqual([
      {
        reason: 'removed-field',
        annotationId: 'B1',
        markingId: 'M1',
        typeId: 'button',
        field: 'label',
        value: 'OK',
      },
    ]);
  });

  it('a whole table with rows is a loss; an empty one is not', () => {
    const p = libProject(libSpec(1), [
      { id: 'B1', type: 'button', values: { rows: [row('r1', { col: 'x' })] } },
      { id: 'B2', type: 'button' },
    ]);
    const out = run(p, nextWith({ op: 'remove-field', type: 'button', field: 'rows' }));
    expect(out.losses.map((l) => [l.annotationId, l.field])).toEqual([['B1', 'rows']]);
    expect(out.losses[0]?.value).toEqual([row('r1', { col: 'x' })]);
  });

  it('column: removes the cell of each row, with the loss per row', () => {
    const p = libProject(libSpec(1), [
      {
        id: 'B1',
        type: 'button',
        values: { rows: [row('r1', { col: 'x', kind: 'a' }), row('r2', { kind: 'b' })] },
      },
    ]);
    const out = run(
      p,
      nextWith({ op: 'remove-field', type: 'button', field: 'rows.col' }),
    );
    expect(valuesOf(out.project, 'B1').rows).toEqual([
      row('r1', { kind: 'a' }),
      row('r2', { kind: 'b' }),
    ]);
    expect(out.steps[0]).toMatchObject({ annotations: 1, values: 1 });
    expect(out.losses).toEqual([
      {
        reason: 'removed-field',
        annotationId: 'B1',
        markingId: 'M1',
        typeId: 'button',
        field: 'rows.col',
        rowId: 'r1',
        value: 'x',
      },
    ]);
  });
});

describe('map-values', () => {
  it('swaps the old option; what is not in the map stays (pending item, not a loss)', () => {
    const p = libProject(libSpec(1), [
      { id: 'B1', type: 'button', values: { style: 'primary' } },
      { id: 'B2', type: 'button', values: { style: 'text' } },
      { id: 'B3', type: 'button', values: { style: 'odd' } },
      { id: 'B4', type: 'button', values: { style: null } },
    ]);
    const out = run(
      p,
      nextWith({
        op: 'map-values',
        type: 'button',
        field: 'style',
        values: { primary: 'filled', toString: 'x' },
      }),
    );
    expect(valuesOf(out.project, 'B1').style).toBe('filled');
    expect(valuesOf(out.project, 'B2').style).toBe('text');
    expect(valuesOf(out.project, 'B3').style).toBe('odd');
    expect(valuesOf(out.project, 'B4').style).toBeNull();
    expect(out.steps[0]).toMatchObject({ annotations: 1, values: 1 });
    expect(out.losses).toEqual([]);
  });

  it('column: swaps the cell of each row', () => {
    const p = libProject(libSpec(1), [
      {
        id: 'B1',
        type: 'button',
        values: {
          rows: [
            row('r1', { kind: 'a' }),
            row('r2', { kind: 'b' }),
            row('r3', { kind: 'a' }),
          ],
        },
      },
    ]);
    const out = run(
      p,
      nextWith({
        op: 'map-values',
        type: 'button',
        field: 'rows.kind',
        values: { a: 'alpha' },
      }),
    );
    expect(valuesOf(out.project, 'B1').rows).toEqual([
      row('r1', { kind: 'alpha' }),
      row('r2', { kind: 'b' }),
      row('r3', { kind: 'alpha' }),
    ]);
    expect(out.steps[0]).toMatchObject({ annotations: 1, values: 2 });
  });
});

describe('no-effect steps (CR #945, item 27)', () => {
  it('map-values with an identity mapping counts neither values nor annotations', () => {
    const p = libProject(libSpec(1), [
      { id: 'B1', type: 'button', values: { style: 'primary' } },
    ]);
    const out = run(
      p,
      nextWith({
        op: 'map-values',
        type: 'button',
        field: 'style',
        values: { primary: 'primary' },
      }),
    );
    expect(out.steps[0]).toMatchObject({ annotations: 0, values: 0 });
    expect(out.project).toBe(p);
  });

  it('rename-field with from equal to to counts neither values nor annotations', () => {
    const p = libProject(libSpec(1), [
      { id: 'B1', type: 'button', values: { label: 'OK' } },
    ]);
    const out = run(
      p,
      nextWith({ op: 'rename-field', type: 'button', from: 'label', to: 'label' }),
    );
    expect(out.steps[0]).toMatchObject({ annotations: 0, values: 0, refs: 0 });
    expect(valuesOf(out.project, 'B1').label).toBe('OK');
    expect(out.losses).toEqual([]);
  });
});

describe('fill-field', () => {
  const nextFill = (default_: string | number, field = 'size') =>
    libSpec(2, undefined, {
      migrations: [
        {
          from: 1,
          to: 2,
          steps: [{ op: 'fill-field', type: 'button', field, default: default_ }],
        },
      ],
    });

  it('empty or absent gets the default; a valid value stays', () => {
    let p = libProject(libSpec(1), [
      { id: 'B1', type: 'button', values: { size: null } },
      { id: 'B2', type: 'button', values: { size: 5 } },
      { id: 'B3', type: 'button' },
    ]);
    p = setRaw(p, 'B3', { label: 'no size' });
    const out = run(p, nextFill(1));
    expect(valuesOf(out.project, 'B1').size).toBe(1);
    expect(valuesOf(out.project, 'B2').size).toBe(5);
    expect(valuesOf(out.project, 'B3')).toEqual({ label: 'no size', size: 1 });
    expect(out.steps[0]).toMatchObject({ annotations: 2, values: 2 });
    expect(out.losses).toEqual([]);
  });

  it('a value that is not valid for the field type is swapped, with a loss', () => {
    const p = libProject(libSpec(1), [
      { id: 'B1', type: 'button', values: { size: 'large' } },
    ]);
    const out = run(p, nextFill(1));
    expect(valuesOf(out.project, 'B1').size).toBe(1);
    expect(out.losses).toEqual([
      {
        reason: 'replaced-value',
        annotationId: 'B1',
        markingId: 'M1',
        typeId: 'button',
        field: 'size',
        value: 'large',
      },
    ]);
  });

  it('an unknown option stays (pending item, no loss)', () => {
    const p = libProject(libSpec(1), [
      { id: 'B1', type: 'button', values: { style: 'odd' } },
      { id: 'B2', type: 'button', values: { style: null } },
    ]);
    const out = run(p, nextFill('text', 'style'));
    expect(valuesOf(out.project, 'B1').style).toBe('odd');
    expect(valuesOf(out.project, 'B2').style).toBe('text');
    expect(out.losses).toEqual([]);
  });

  it('column: fills the empty cells of each row and swaps the invalid ones', () => {
    const p = libProject(libSpec(1), [
      {
        id: 'B1',
        type: 'button',
        values: {
          rows: [
            row('r1', { col: 'x' }),
            row('r2', {}),
            row('r3', { col: 7 }),
            row('r4', { col: '' }),
          ],
        },
      },
    ]);
    const out = run(p, nextFill('?', 'rows.col'));
    expect(valuesOf(out.project, 'B1').rows).toEqual([
      row('r1', { col: 'x' }),
      row('r2', { col: '?' }),
      row('r3', { col: '?' }),
      row('r4', { col: '?' }),
    ]);
    expect(out.steps[0]).toMatchObject({ annotations: 1, values: 3 });
    expect(out.losses.map((l) => [l.reason, l.rowId, l.value])).toEqual([
      ['replaced-value', 'r3', 7],
    ]);
  });

  it('a field that does not exist in the new version: only fills the empty ones', () => {
    const p = libProject(libSpec(1), [
      { id: 'B1', type: 'button', values: { size: 'large' } },
      { id: 'B2', type: 'button', values: { size: null } },
    ]);
    // `size` was renamed later in the chain: the type exists, the field does not.
    const next = libSpec(
      2,
      {
        c: [buttonType({ fields: [{ key: 'dimension', type: 'number' }] }), badgeType()],
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
    const out = run(p, next);
    expect(valuesOf(out.project, 'B1').size).toBe('large');
    expect(valuesOf(out.project, 'B2').size).toBe(1);
    expect(out.losses).toEqual([]);
  });
});

describe('chain', () => {
  it('chains two versions: rename-type and then rename-field on the new type', () => {
    const p = libProject(libSpec(1), [
      { id: 'B1', type: 'button', values: { label: 'OK' } },
      { id: 'B2', type: 'button', values: { label: 'Cancel' } },
    ]);
    const next = libSpec(3, undefined, {
      migrations: [
        { from: 1, to: 2, steps: [{ op: 'rename-type', from: 'button', to: 'cta' }] },
        {
          from: 2,
          to: 3,
          steps: [
            { op: 'rename-field', type: 'cta', from: 'label', to: 'title' },
            { op: 'remove-field', type: 'cta', field: 'size' },
          ],
        },
      ],
    });
    const out = run(p, next);
    for (const id of ['B1', 'B2']) {
      expect(annotationOf(out.project, id).type).toEqual({
        specId: 'lib',
        typeId: 'cta',
      });
      expect('title' in valuesOf(out.project, id)).toBe(true);
      expect('label' in valuesOf(out.project, id)).toBe(false);
    }
    expect(valuesOf(out.project, 'B1').title).toBe('OK');
    expect(
      out.steps.map((s) => [s.from, s.to, s.index, s.step.op, s.annotations]),
    ).toEqual([
      [1, 2, 0, 'rename-type', 2],
      [2, 3, 0, 'rename-field', 2],
      [2, 3, 1, 'remove-field', 2],
    ]);
    // `size` had the default (null): empty, no loss.
    expect(out.losses).toEqual([]);
  });

  it('a project already at the intermediate version runs only the missing part', () => {
    const p = libProject(libSpec(2), [{ id: 'B1', type: 'button' }]);
    const next = libSpec(3, undefined, {
      migrations: [
        {
          from: 1,
          to: 2,
          steps: [{ op: 'remove-type', type: 'button', mode: 'delete' }],
        },
        {
          from: 2,
          to: 3,
          steps: [{ op: 'remove-field', type: 'button', field: 'size' }],
        },
      ],
    });
    const out = run(p, next, 2);
    expect(out.steps.map((s) => s.step.op)).toEqual(['remove-field']);
    expect(out.project.annotations).toHaveLength(1);
  });

  it('cadeia rompida: nada roda', () => {
    const p = libProject(libSpec(1), [
      { id: 'B1', type: 'button', values: { label: 'OK' } },
    ]);
    const next = libSpec(3, undefined, {
      migrations: [
        {
          from: 2,
          to: 3,
          steps: [{ op: 'rename-field', type: 'button', from: 'label', to: 'title' }],
        },
      ],
    });
    const out = run(p, next);
    expect(out.project).toBe(p);
    expect(out.steps).toEqual([]);
    expect(out.losses).toEqual([]);
  });

  it('without migrations or at the same version: nothing runs', () => {
    const p = libProject(libSpec(1), [{ id: 'B1', type: 'button' }]);
    expect(run(p, libSpec(2)).project).toBe(p);
    expect(run(p, libSpec(2), 2).steps).toEqual([]);
  });

  it('a step that finds nothing is a no-op, but appears in the report', () => {
    const p = libProject(libSpec(1), [{ id: 'G1', type: 'badge' }]);
    const steps: SpecMigrationStep[] = [
      { op: 'rename-type', from: 'button', to: 'cta' },
      { op: 'remove-type', type: 'button', mode: 'delete' },
      { op: 'rename-field', type: 'button', from: 'label', to: 'title' },
      { op: 'remove-field', type: 'button', field: 'label' },
      { op: 'map-values', type: 'button', field: 'style', values: { primary: 'x' } },
      { op: 'fill-field', type: 'button', field: 'size', default: 1 },
    ];
    const out = run(p, nextWith(...steps));
    expect(out.project).toBe(p);
    expect(out.steps).toHaveLength(6);
    for (const report of out.steps) {
      expect(report).toMatchObject({
        annotations: 0,
        values: 0,
        converted: 0,
        deleted: 0,
        refs: 0,
        losses: [],
      });
    }
  });

  it('only touches the annotations of the specialization and does not change the input', () => {
    const p = libProject(libSpec(1), [
      { id: 'B1', type: 'button', values: { label: 'OK' } },
    ]);
    const other: Annotation = {
      ...annotationOf(p, 'B1'),
      id: 'X1',
      type: { specId: 'other', typeId: 'button' },
      values: { label: 'same' },
    };
    const withOther = { ...p, annotations: [...p.annotations, other] };
    const before = JSON.stringify(withOther);
    const out = run(
      withOther,
      nextWith({ op: 'rename-field', type: 'button', from: 'label', to: 'title' }),
    );
    expect(JSON.stringify(withOther)).toBe(before);
    expect(annotationOf(out.project, 'X1')).toBe(other);
    expect(valuesOf(out.project, 'B1')).toEqual({
      ...valuesOf(p, 'B1'),
      label: undefined,
      title: 'OK',
    });
  });
});

// ---------------------------------------------------------------------------
// Link role steps (`rename-role`, `remove-role`, `set-role`)

const ROLES = [
  { id: 'click', name: 'Click' },
  { id: 'tap', name: 'Tap' },
  { id: 'hover', name: 'Focus' },
];

/** Specialization with `button` offering roles; `chip` requires an owner, `badge` does not. */
function roleSpec(version: number, roles = ROLES, over: Partial<Spec> = {}): Spec {
  return libSpec(
    version,
    {
      c: [
        buttonType({ allowedChildren: ['chip', 'badge'], childRoles: roles }),
        badgeType(),
      ],
      e: [chipType()],
    },
    over,
  );
}

/** Free annotation or one of another specialization, linked to `parent`, directly in the project. */
function rawChild(
  p: Project,
  id: string,
  parent: string,
  role: string | null,
  type: Annotation['type'] = null,
): Project {
  const base = annotationOf(p, parent);
  const child: Annotation = {
    id,
    markingId: base.markingId,
    layerId: base.layerId,
    name: null,
    parentAnnotationId: parent,
    parentRole: role,
    type,
    values: null,
    entries: [],
  };
  return { ...p, annotations: [...p.annotations, child] };
}

/** A non-null `parentRole` requires a non-null `parentAnnotationId`. */
function expectRoleInvariant(p: Project): void {
  for (const a of p.annotations) {
    if (a.parentRole !== null) {
      expect(a.parentAnnotationId, `${a.id} has a role without an owner`).not.toBeNull();
    }
  }
}

const roleOf = (p: Project, id: string) => annotationOf(p, id).parentRole;
const ownerOf = (p: Project, id: string) => annotationOf(p, id).parentAnnotationId;

/** B1 (button) with children of several types and roles; X1 is of another specialization, F1 is free. */
function roleProject(): Project {
  let p = libProject(roleSpec(1), [
    { id: 'B1', type: 'button' },
    { id: 'C1', type: 'chip', parent: 'B1', role: 'click' },
    { id: 'C2', type: 'chip', parent: 'B1', role: 'hover' },
    { id: 'C3', type: 'chip', parent: 'B1' },
    { id: 'G1', type: 'badge', parent: 'B1', role: 'click' },
    { id: 'G2', type: 'badge', parent: 'B1' },
  ]);
  p = rawChild(p, 'F1', 'B1', 'click');
  p = rawChild(p, 'F2', 'B1', null);
  p = rawChild(p, 'X1', 'B1', 'click', { specId: 'other', typeId: 'z' });
  p = rawChild(p, 'X2', 'B1', null, { specId: 'other', typeId: 'z' });
  return p;
}

describe('rename-role', () => {
  it('swaps the role of the children of any type; the rest stays as is', () => {
    const p = roleProject();
    const out = run(
      p,
      nextWith({ op: 'rename-role', type: 'button', from: 'click', to: 'tap' }),
    );
    for (const id of ['C1', 'G1', 'F1', 'X1']) {
      expect(roleOf(out.project, id)).toBe('tap');
      expect(ownerOf(out.project, id)).toBe('B1');
    }
    for (const id of ['C2', 'C3', 'G2', 'F2', 'X2', 'B1']) {
      expect(annotationOf(out.project, id)).toBe(annotationOf(p, id));
    }
    expect(out.steps[0]).toMatchObject({ annotations: 4, unlinked: 0, values: 0 });
    expect(out.losses).toEqual([]);
    expectRoleInvariant(out.project);
  });

  it('merges the roles when the destination was already a role of other children, with no loss', () => {
    const p = roleProject();
    const out = run(
      p,
      nextWith({ op: 'rename-role', type: 'button', from: 'hover', to: 'click' }),
    );
    expect(roleOf(out.project, 'C2')).toBe('click');
    expect(roleOf(out.project, 'C1')).toBe('click');
    expect(out.steps[0]).toMatchObject({ annotations: 1 });
    expect(out.losses).toEqual([]);
    expectRoleInvariant(out.project);
  });

  it('a child of an owner of another type or another specialization is not touched', () => {
    let p = libProject(roleSpec(1), [
      { id: 'B1', type: 'button' },
      { id: 'G1', type: 'badge', marking: 'M2' },
    ]);
    p = rawChild(p, 'F1', 'G1', 'click');
    const foreign: Annotation = {
      ...annotationOf(p, 'B1'),
      id: 'OB',
      type: { specId: 'other', typeId: 'button' },
      values: null,
    };
    p = { ...p, annotations: [...p.annotations, foreign] };
    p = rawChild(p, 'F2', 'OB', 'click');
    const out = run(
      p,
      nextWith({ op: 'rename-role', type: 'button', from: 'click', to: 'tap' }),
    );
    expect(out.project).toBe(p);
    expect(out.steps[0]).toMatchObject({ annotations: 0, unlinked: 0, losses: [] });
  });
});

describe('remove-role', () => {
  it('clear: the child is left without a role and stays linked; cleared-role loss', () => {
    const p = roleProject();
    const out = run(
      p,
      nextWith({ op: 'remove-role', type: 'button', role: 'click', mode: 'clear' }),
    );
    for (const id of ['C1', 'G1', 'F1', 'X1']) {
      expect(roleOf(out.project, id)).toBeNull();
      expect(ownerOf(out.project, id)).toBe('B1');
    }
    expect(roleOf(out.project, 'C2')).toBe('hover');
    expect(out.steps[0]).toMatchObject({ annotations: 4, unlinked: 0 });
    expect(out.losses).toEqual([
      {
        reason: 'cleared-role',
        annotationId: 'C1',
        markingId: 'M1',
        typeId: 'chip',
        role: 'click',
      },
      {
        reason: 'cleared-role',
        annotationId: 'G1',
        markingId: 'M1',
        typeId: 'badge',
        role: 'click',
      },
      {
        reason: 'cleared-role',
        annotationId: 'F1',
        markingId: 'M1',
        typeId: '',
        role: 'click',
      },
      {
        reason: 'cleared-role',
        annotationId: 'X1',
        markingId: 'M1',
        typeId: 'z',
        role: 'click',
      },
    ]);
    expectRoleInvariant(out.project);
  });

  it('unlink: the child leaves the link, without owner or role; unlinked loss and count', () => {
    const p = roleProject();
    const out = run(
      p,
      nextWith({ op: 'remove-role', type: 'button', role: 'click', mode: 'unlink' }),
    );
    for (const id of ['C1', 'G1', 'F1', 'X1']) {
      expect(ownerOf(out.project, id)).toBeNull();
      expect(roleOf(out.project, id)).toBeNull();
    }
    expect(ownerOf(out.project, 'C2')).toBe('B1');
    expect(roleOf(out.project, 'C2')).toBe('hover');
    expect(out.steps[0]).toMatchObject({ annotations: 4, unlinked: 4 });
    expect(out.losses.map((l) => [l.reason, l.annotationId, l.role])).toEqual([
      ['unlinked', 'C1', 'click'],
      ['unlinked', 'G1', 'click'],
      ['unlinked', 'F1', 'click'],
      ['unlinked', 'X1', 'click'],
    ]);
    expect(out.losses[0]).toMatchObject({ markingId: 'M1', typeId: 'chip' });
    expect(out.losses[2]?.typeId).toBe('');
    expectRoleInvariant(out.project);
  });

  it('a child without that role (or without a role) is not touched; without children it is a no-op', () => {
    const p = roleProject();
    const out = run(
      p,
      nextWith({ op: 'remove-role', type: 'button', role: 'nothing', mode: 'unlink' }),
    );
    expect(out.project).toBe(p);
    expect(out.steps[0]).toMatchObject({ annotations: 0, unlinked: 0, losses: [] });
  });
});

describe('set-role', () => {
  it('without childType: every child without a role gets the role, of any type; those that already have one stay', () => {
    const p = roleProject();
    const out = run(p, nextWith({ op: 'set-role', type: 'button', role: 'tap' }));
    for (const id of ['C3', 'G2', 'F2', 'X2']) {
      expect(roleOf(out.project, id)).toBe('tap');
      expect(ownerOf(out.project, id)).toBe('B1');
    }
    for (const id of ['C1', 'C2', 'G1', 'F1', 'X1']) {
      expect(annotationOf(out.project, id)).toBe(annotationOf(p, id));
    }
    expect(out.steps[0]).toMatchObject({ annotations: 4, unlinked: 0 });
    expect(out.losses).toEqual([]);
    expectRoleInvariant(out.project);
  });

  it('with childType: only the children of that type of the specialization, without a role', () => {
    const p = roleProject();
    const out = run(
      p,
      nextWith({ op: 'set-role', type: 'button', role: 'tap', childType: 'chip' }),
    );
    expect(roleOf(out.project, 'C3')).toBe('tap');
    for (const id of ['C1', 'C2', 'G1', 'G2', 'F1', 'F2', 'X1', 'X2']) {
      expect(annotationOf(out.project, id)).toBe(annotationOf(p, id));
    }
    expect(out.steps[0]).toMatchObject({ annotations: 1 });
    expect(out.losses).toEqual([]);
  });

  it('a child that already has a role is not touched, nor one with a role different from that of the step', () => {
    const p = libProject(roleSpec(1), [
      { id: 'B1', type: 'button' },
      { id: 'C1', type: 'chip', parent: 'B1', role: 'hover' },
    ]);
    const out = run(
      p,
      nextWith({ op: 'set-role', type: 'button', role: 'click', childType: 'chip' }),
    );
    expect(out.project).toBe(p);
    expect(out.steps[0]).toMatchObject({ annotations: 0, losses: [] });
  });
});

describe('role steps in sequence', () => {
  it('a step after the rename-type of the owner identifies the owner by the new typeId', () => {
    const p = roleProject();
    const out = run(
      p,
      nextWith(
        { op: 'rename-type', from: 'button', to: 'btn' },
        { op: 'rename-role', type: 'btn', from: 'click', to: 'tap' },
        { op: 'rename-role', type: 'button', from: 'hover', to: 'focus' },
      ),
    );
    expect(roleOf(out.project, 'C1')).toBe('tap');
    expect(out.steps[1]).toMatchObject({ annotations: 4 });
    // The old id no longer exists at that point in the chain.
    expect(roleOf(out.project, 'C2')).toBe('hover');
    expect(out.steps[2]).toMatchObject({ annotations: 0 });
  });

  it('set-role with childType before the rename-type of the child uses the old id of the child', () => {
    const p = roleProject();
    const before = run(
      p,
      nextWith(
        { op: 'set-role', type: 'button', role: 'tap', childType: 'chip' },
        { op: 'rename-type', from: 'chip', to: 'pill' },
      ),
    );
    expect(roleOf(before.project, 'C3')).toBe('tap');
    expect(annotationOf(before.project, 'C3').type?.typeId).toBe('pill');
    const after = run(
      p,
      nextWith(
        { op: 'rename-type', from: 'chip', to: 'pill' },
        { op: 'set-role', type: 'button', role: 'tap', childType: 'chip' },
      ),
    );
    expect(roleOf(after.project, 'C3')).toBeNull();
    expect(after.steps[1]).toMatchObject({ annotations: 0 });
  });

  it('rename-role followed by remove-role of the new name loses with the new role', () => {
    const out = run(
      roleProject(),
      nextWith(
        { op: 'rename-role', type: 'button', from: 'click', to: 'tap' },
        { op: 'remove-role', type: 'button', role: 'tap', mode: 'clear' },
      ),
    );
    expect(out.steps[0]?.losses).toEqual([]);
    expect(out.losses.map((l) => [l.reason, l.role])).toEqual([
      ['cleared-role', 'tap'],
      ['cleared-role', 'tap'],
      ['cleared-role', 'tap'],
      ['cleared-role', 'tap'],
    ]);
    expectRoleInvariant(out.project);
  });

  it('the parentRole → parentAnnotationId invariant holds in every combination of steps', () => {
    const combos: SpecMigrationStep[][] = [
      [{ op: 'rename-role', type: 'button', from: 'click', to: 'tap' }],
      [{ op: 'remove-role', type: 'button', role: 'click', mode: 'clear' }],
      [{ op: 'remove-role', type: 'button', role: 'click', mode: 'unlink' }],
      [{ op: 'remove-role', type: 'button', role: 'hover', mode: 'unlink' }],
      [{ op: 'set-role', type: 'button', role: 'tap' }],
      [{ op: 'set-role', type: 'button', role: 'tap', childType: 'badge' }],
      [
        { op: 'remove-role', type: 'button', role: 'click', mode: 'unlink' },
        { op: 'set-role', type: 'button', role: 'click' },
      ],
      [
        { op: 'set-role', type: 'button', role: 'tap' },
        { op: 'remove-role', type: 'button', role: 'tap', mode: 'unlink' },
        { op: 'rename-role', type: 'button', from: 'hover', to: 'click' },
      ],
    ];
    for (const steps of combos) {
      expectRoleInvariant(run(roleProject(), nextWith(...steps)).project);
    }
  });

  it('does not change the input', () => {
    const p = roleProject();
    const before = JSON.stringify(p);
    run(
      p,
      nextWith(
        { op: 'remove-role', type: 'button', role: 'click', mode: 'unlink' },
        { op: 'set-role', type: 'button', role: 'tap' },
      ),
    );
    expect(JSON.stringify(p)).toBe(before);
  });
});

describe('impact and update with role steps', () => {
  const v2Roles = [
    { id: 'tap', name: 'Tap' },
    { id: 'hover', name: 'Focus' },
  ];

  it('remove-role clear: cleared-role loss and missing-role while the owner offers roles', () => {
    const p = roleProject();
    const next = roleSpec(2, v2Roles, {
      migrations: [
        {
          from: 1,
          to: 2,
          steps: [{ op: 'remove-role', type: 'button', role: 'click', mode: 'clear' }],
        },
      ],
    });
    const impact = specializationUpdateImpact(p, next);
    expect(impact.losses.map((l) => l.reason)).toEqual([
      'cleared-role',
      'cleared-role',
      'cleared-role',
      'cleared-role',
    ]);
    expect(impact.unlinked).toBe(0);
    const missing = impact.pending
      .filter((x) => x.issue.code === 'missing-role')
      .map((x) => x.annotationId);
    // C1 and G1 are of the specialization; F1 (free) and X1 (other) do not generate a role pending item.
    expect(missing).toContain('C1');
    expect(missing).toContain('G1');
    expect(missing).not.toContain('C2');
  });

  it('remove-role unlink: unlinked in the report and missing-owner on the type that requires an owner', () => {
    const p = roleProject();
    const next = roleSpec(2, v2Roles, {
      migrations: [
        {
          from: 1,
          to: 2,
          steps: [{ op: 'remove-role', type: 'button', role: 'click', mode: 'unlink' }],
        },
      ],
    });
    const impact = specializationUpdateImpact(p, next);
    expect(impact.unlinked).toBe(4);
    expect(impact.losses.every((l) => l.reason === 'unlinked')).toBe(true);
    const codes = impact.pending.map((x) => [x.annotationId, x.issue.code]);
    expect(codes).toContainEqual(['C1', 'missing-owner']);
    expect(codes).not.toContainEqual(['G1', 'missing-owner']);
  });

  it('updateSpecialization applies the role steps and records the new version', () => {
    const p = roleProject();
    const next = roleSpec(2, v2Roles, {
      migrations: [
        {
          from: 1,
          to: 2,
          steps: [
            { op: 'rename-role', type: 'button', from: 'click', to: 'tap' },
            { op: 'set-role', type: 'button', role: 'hover', childType: 'chip' },
          ],
        },
      ],
    });
    const out = updateSpecialization(p, next, { newId: idGen('N') });
    expect(roleOf(out, 'C1')).toBe('tap');
    expect(roleOf(out, 'C3')).toBe('hover');
    expect(out.specializations[0]?.version).toBe(2);
    expectRoleInvariant(out);
  });

  it('without the step an update that removes a role is refused; with it, it is accepted', () => {
    const p = roleProject();
    const without = roleSpec(2, v2Roles);
    const refused = specializationUpdateImpact(p, without);
    expect(refused.refused).toBe(true);
    expect(refused.missingMigrations.map((c) => [c.code, c.role])).toEqual([
      ['removed-role', 'click'],
    ]);
    expect(() => updateSpecialization(p, without, { newId: idGen('R') })).toThrow(
      /spec-missing-migrations/,
    );
    const withSteps = roleSpec(2, v2Roles, {
      migrations: [
        {
          from: 1,
          to: 2,
          steps: [{ op: 'rename-role', type: 'button', from: 'click', to: 'tap' }],
        },
      ],
    });
    expect(specializationUpdateImpact(p, withSteps).refused).toBe(false);
  });

  it('the update does not change the input project (undo returns the roles)', () => {
    const p = roleProject();
    const before = JSON.stringify(p);
    const next = roleSpec(2, v2Roles, {
      migrations: [
        {
          from: 1,
          to: 2,
          steps: [{ op: 'rename-role', type: 'button', from: 'click', to: 'tap' }],
        },
      ],
    });
    const out = updateSpecialization(p, next, { newId: idGen('U') });
    expect(roleOf(out, 'C1')).toBe('tap');
    expect(JSON.stringify(p)).toBe(before);
  });
});
