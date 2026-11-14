// `ref` column in `table` (ME4, decision (e)): the list of references as data. The cell holds
// a reference, with the same `accepts` as a `ref` field; the pending items, the resolution, the
// library migrations and the text of the displays treat the cell as they treat the field.
import { describe, expect, it } from 'vitest';
import {
  addTableRow,
  codeBlueprint,
  countBrokenRefs,
  drawingValues,
  findCellRefTargets,
  getAnnotationIssues,
  getBacklinks,
  isRefAccepted,
  ModelError,
  refColumnOf,
  refLabel,
  refPathText,
  refsBrokenBy,
  refsOf,
  removeTableRow,
  resolveRef,
  runLibraryMigrations,
  setFieldValue,
  setTableCell,
  typedDisplayLines,
  typedValuesToPairs,
  type JsonValue,
  type Project,
} from '../../src/model';
import { R1, R2, E1, build, cell, spec, type Raw } from './refColumnFixtures';

function expectCode(fn: () => unknown, code: string): void {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(ModelError);
    expect((e as ModelError).code).toBe(code);
    return;
  }
  throw new Error(`expected the error ${code}`);
}

describe('setting the cell', () => {
  it('writes an accepted table row and free tuple; null clears', () => {
    let p = build();
    p = setTableCell(p, 'AL', 'alvos', 'L1', 'alvo', R1);
    expect(cell(p)).toEqual(R1);
    p = setTableCell(p, 'AL', 'alvos', 'L1', 'alvo', E1);
    expect(cell(p)).toEqual(E1);
    p = setTableCell(p, 'AL', 'alvos', 'L1', 'alvo', null);
    expect(cell(p)).toBeNull();
    p = setTableCell(p, 'AL', 'alvos', 'L1', 'alvo', R2);
    p = setTableCell(p, 'AL', 'alvos', 'L1', 'alvo', '');
    expect(cell(p)).toBeNull();
  });

  it('refuses a value that is not a reference, a nonexistent target, a target not accepted and the annotation itself', () => {
    const p = build();
    const set = (value: JsonValue) => () =>
      setTableCell(p, 'AL', 'alvos', 'L1', 'alvo', value);
    expectCode(set('text'), 'invalid-value');
    // `{ annotationId }` is the fourth format (whole annotation): valid, but the column does not accept it.
    expectCode(set({ annotationId: 'AM' }), 'ref-not-accepted');
    expectCode(set({ annotationId: 'NONE', key: 'x' }), 'ref-not-accepted');
    // The whole table is not a target (only its rows).
    expectCode(set({ annotationId: 'AM', key: 'campos' }), 'ref-not-accepted');
    // A plain field without the accepted tag.
    expectCode(set({ annotationId: 'AM', key: 'solto' }), 'ref-not-accepted');
    // The annotation itself.
    expectCode(set({ annotationId: 'AL', key: 'titulo' }), 'self-ref');
  });

  it('the other columns stay simple; a ref in a new row starts empty', () => {
    let p = build();
    p = addTableRow(p, 'AL', 'alvos', 'L2');
    const row = (
      p.annotations.find((a) => a.id === 'AL')?.values?.alvos as JsonValue[]
    )[1];
    expect(row).toEqual({ _id: 'L2', nota: null, alvo: null });
    p = setTableCell(p, 'AL', 'alvos', 'L2', 'nota', 'ok');
    expectCode(() => setTableCell(p, 'AL', 'alvos', 'L2', 'nota', R1), 'invalid-value');
  });
});

describe('pending items', () => {
  it('an empty required ref column is required-empty, with row and column', () => {
    const p = build();
    expect(getAnnotationIssues(p, 'AL')).toEqual([
      { code: 'required-empty', key: 'alvos', rowId: 'L1', column: 'alvo' },
    ]);
  });

  it('a target that vanishes is broken-ref; a cell with the wrong format is invalid-value', () => {
    let p = build();
    p = setTableCell(p, 'AL', 'alvos', 'L1', 'alvo', R1);
    expect(getAnnotationIssues(p, 'AL')).toEqual([]);
    const broken = removeTableRow(p, 'AM', 'campos', 'R1');
    expect(getAnnotationIssues(broken, 'AL')).toEqual([
      { code: 'broken-ref', key: 'alvos', rowId: 'L1', column: 'alvo' },
    ]);
    const invalid: Project = {
      ...p,
      annotations: p.annotations.map((a) =>
        a.id === 'AL'
          ? { ...a, values: { ...a.values, alvos: [{ _id: 'L1', alvo: 'text' }] } }
          : a,
      ),
    };
    expect(getAnnotationIssues(invalid, 'AL')).toEqual([
      { code: 'invalid-value', key: 'alvos', rowId: 'L1', column: 'alvo' },
    ]);
  });

  it('a target that lost the tag stops being accepted (ref-not-accepted)', () => {
    let p = build();
    p = setTableCell(p, 'AL', 'alvos', 'L1', 'alvo', R1);
    // The column now accepts only free tuples: the table row no longer holds.
    const listSpec = spec(1);
    const col = listSpec.layers[1]!.annotationTypes[0]!.fields[1];
    if (col?.type !== 'table') throw new Error('expected table');
    const ref = col.columns[1];
    if (ref?.type !== 'ref') throw new Error('expected ref');
    ref.accepts = { free: true };
    const changed: Project = {
      ...p,
      specializations: p.specializations.map((s) => ({ ...s, spec: listSpec })),
    };
    expect(getAnnotationIssues(changed, 'AL')).toEqual([
      { code: 'ref-not-accepted', key: 'alvos', rowId: 'L1', column: 'alvo' },
    ]);
  });
});

describe('resolution and targets', () => {
  it('the target text and the resolution are the usual ones', () => {
    const p = build();
    // pt-BR kept: shared fixture data (refColumnFixtures) asserted by tests/components and tests/store
    expect(refLabel(p, R1)).toBe('Cliente.cpf');
    expect(resolveRef(p, R1)?.kind).toBe('row');
    expect(
      isRefAccepted(p, 'AL', refColumnOf(p, 'AL', 'alvos', 'alvo')!.accepts, R1),
    ).toBe(true);
  });

  it('refColumnOf finds the ref column and denies the rest', () => {
    const p = build();
    expect(refColumnOf(p, 'AL', 'alvos', 'alvo')).toMatchObject({
      type: 'ref',
      key: 'alvo',
    });
    expect(refColumnOf(p, 'AL', 'alvos', 'nota')).toBeNull();
    expect(refColumnOf(p, 'AL', 'titulo', 'alvo')).toBeNull();
    expect(refColumnOf(p, 'AM', 'campos', 'nome')).toBeNull();
  });

  it('findCellRefTargets lists the rows with the tag and the free tuples, never the annotation itself', () => {
    const p = build();
    expect(findCellRefTargets(p, 'AL', 'alvos', 'alvo').map((t) => t.label)).toEqual([
      // pt-BR kept: shared fixture data (refColumnFixtures) asserted by tests/components and tests/store
      'Cliente.cpf',
      'Cliente.nome',
      // pt-BR kept: shared fixture data (refColumnFixtures) asserted by tests/components and tests/store
      'Glossário.termo',
    ]);
    expect(findCellRefTargets(p, 'AL', 'alvos', 'nota')).toEqual([]);
    expect(findCellRefTargets(p, 'AL', 'titulo', 'alvo')).toEqual([]);
  });
});

describe('refsOf, backlinks and broken references', () => {
  it('refsOf includes the cell with the row, the column and the position; the ref field stays as it was', () => {
    let p = build();
    p = addTableRow(p, 'AL', 'alvos', 'L2');
    p = setTableCell(p, 'AL', 'alvos', 'L1', 'alvo', R1);
    p = setTableCell(p, 'AL', 'alvos', 'L2', 'alvo', R2);
    p = setFieldValue(p, 'AL', 'principal', R1);
    const refs = refsOf(
      p,
      p.annotations.find((a) => a.id === 'AL')!,
    );
    expect(refs).toEqual([
      { key: 'alvos', ref: R1, rowId: 'L1', column: 'alvo', rowIndex: 0 },
      { key: 'alvos', ref: R2, rowId: 'L2', column: 'alvo', rowIndex: 1 },
      { key: 'principal', ref: R1 },
    ]);
    expect(refPathText(refs[0]!)).toBe('alvos[1].alvo');
    expect(refPathText(refs[1]!)).toBe('alvos[2].alvo');
    expect(refPathText(refs[2]!)).toBe('principal');
  });

  it("the target receives the cell's backlink", () => {
    let p = build();
    p = setTableCell(p, 'AL', 'alvos', 'L1', 'alvo', R1);
    const links = getBacklinks(p, 'AM');
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({ key: 'alvos', rowId: 'L1', column: 'alvo' });
    expect(links[0]?.source.id).toBe('AL');
  });

  it('deleting the target row breaks the cell (counted for the dialog)', () => {
    let p = build();
    p = setTableCell(p, 'AL', 'alvos', 'L1', 'alvo', R1);
    expect(refsBrokenBy(p, (x) => removeTableRow(x, 'AM', 'campos', 'R1'))).toBe(1);
    expect(refsBrokenBy(p, (x) => removeTableRow(x, 'AM', 'campos', 'R2'))).toBe(0);
    expect(countBrokenRefs(p, removeTableRow(p, 'AM', 'campos', 'R1'))).toBe(1);
  });

  it('without a type, a cell in the reference format still counts', () => {
    let p = build();
    p = setTableCell(p, 'AL', 'alvos', 'L1', 'alvo', R1);
    const orphan: Project = {
      ...p,
      specializations: [],
      annotations: p.annotations.map((a) => ({ ...a })),
    };
    const refs = refsOf(
      orphan,
      orphan.annotations.find((a) => a.id === 'AL')!,
    );
    expect(refs).toEqual([
      { key: 'alvos', ref: R1, rowId: 'L1', column: 'alvo', rowIndex: 0 },
    ]);
  });
});

describe('display, conversion to text and blueprint', () => {
  it('the table shows the cell as "→ target"; broken becomes "→ (broken reference)" and alerts', () => {
    let p = build();
    p = setTableCell(p, 'AL', 'alvos', 'L1', 'alvo', R1);
    const lines = typedDisplayLines(
      p,
      p.annotations.find((a) => a.id === 'AL')!,
      {
        tables: 'full',
      },
    );
    const table = lines.find((l) => l.kind === 'table');
    expect(table).toMatchObject({
      kind: 'table',
      key: 'alvos',
      alert: false,
      columns: [
        { key: 'nota', label: 'nota' },
        // pt-BR kept: shared fixture data (refColumnFixtures) asserted by tests/components and tests/store
        { key: 'alvo', label: 'Alvo' },
      ],
      rows: [{ id: 'L1', cells: ['', '→ Cliente.cpf'] }],
    });
    const broken = removeTableRow(p, 'AM', 'campos', 'R1');
    const after = typedDisplayLines(
      broken,
      broken.annotations.find((a) => a.id === 'AL')!,
      {
        tables: 'full',
      },
    ).find((l) => l.kind === 'table');
    expect(after).toMatchObject({
      alert: true,
      rows: [{ id: 'L1', cells: ['', '→ (broken reference)'] }],
    });
  });

  it('the conversion to a free annotation writes the cell as "→ target"', () => {
    let p = build();
    p = setTableCell(p, 'AL', 'alvos', 'L1', 'alvo', E1);
    p = setTableCell(p, 'AL', 'alvos', 'L1', 'nota', 'first');
    const pairs = typedValuesToPairs(
      p,
      p.annotations.find((a) => a.id === 'AL')!,
    );
    expect(pairs).toContainEqual({ key: 'alvos[1].nota', value: 'first' });
    // pt-BR kept: shared fixture data (refColumnFixtures) asserted by tests/components and tests/store
    expect(pairs).toContainEqual({ key: 'alvos[1].alvo', value: '→ Glossário.termo' });
  });

  it('the code blueprint delivers the target label in the cell (broken: null)', () => {
    let p = build();
    p = setTableCell(p, 'AL', 'alvos', 'L1', 'alvo', R1);
    p = setTableCell(p, 'AL', 'alvos', 'L1', 'nota', 'first');
    const param = (project: Project) => {
      const node = codeBlueprint(project, 'M2', 'web').root;
      return node.annotations[0]?.params.find((x) => x.key === 'alvos');
    };
    // pt-BR kept: shared fixture data (refColumnFixtures) asserted by tests/components and tests/store
    expect(param(p)).toMatchObject({
      name: 'destinos',
      value: [{ nota: 'first', alvo: 'Cliente.cpf' }],
    });
    const broken = removeTableRow(p, 'AM', 'campos', 'R1');
    expect(param(broken)?.value).toEqual([{ nota: 'first', alvo: null }]);
  });
});

describe('library migrations with the ref cell', () => {
  const modelFields = (raw: Raw) => raw.layers[0].annotationTypes[0].fields;
  const targetsColumns = (raw: Raw) => raw.layers[1].annotationTypes[0].fields[1].columns;
  const migrations = (steps: Raw[]) => ({ migrations: [{ from: 1, to: 2, steps }] });

  it('rename-field of a table rewrites the key in the row references that are in cells', () => {
    let p = build();
    p = setTableCell(p, 'AL', 'alvos', 'L1', 'alvo', R1);
    p = setFieldValue(p, 'AL', 'principal', R2);
    const next = spec(
      2,
      migrations([
        { op: 'rename-field', type: 'modelo', from: 'campos', to: 'attributes' },
      ]),
      (raw) => {
        modelFields(raw)[1].key = 'attributes';
      },
    );
    const run = runLibraryMigrations(p, next, 1);
    expect(run.steps[0]).toMatchObject({ refs: 2 });
    const listAnnotation = run.project.annotations.find((a) => a.id === 'AL')!;
    expect(cell(run.project)).toEqual({
      annotationId: 'AM',
      key: 'attributes',
      rowId: 'R1',
    });
    expect(listAnnotation.values?.principal).toEqual({
      annotationId: 'AM',
      key: 'attributes',
      rowId: 'R2',
    });
    // The other column of the same row does not change.
    const row = (listAnnotation.values?.alvos as Record<string, JsonValue>[])[0];
    expect(row?.nota).toBeNull();
  });

  it('rename-field of the ref column (alvos.alvo to alvos.destination) carries the reference along, without loss', () => {
    let p = build();
    p = setTableCell(p, 'AL', 'alvos', 'L1', 'alvo', R1);
    const next = spec(
      2,
      migrations([
        {
          op: 'rename-field',
          type: 'lista',
          from: 'alvos.alvo',
          to: 'alvos.destination',
        },
      ]),
      (raw) => {
        targetsColumns(raw)[1].key = 'destination';
      },
    );
    const run = runLibraryMigrations(p, next, 1);
    expect(run.losses).toEqual([]);
    const row = (
      run.project.annotations.find((a) => a.id === 'AL')?.values?.alvos as Record<
        string,
        JsonValue
      >[]
    )[0];
    expect(row?.destination).toEqual(R1);
    expect(row).not.toHaveProperty('alvo');
  });

  it('remove-field of the ref column loses the filled reference (and counts it)', () => {
    let p = build();
    p = setTableCell(p, 'AL', 'alvos', 'L1', 'alvo', R1);
    const next = spec(
      2,
      migrations([{ op: 'remove-field', type: 'lista', field: 'alvos.alvo' }]),
      (raw) => {
        targetsColumns(raw).splice(1, 1);
      },
    );
    const run = runLibraryMigrations(p, next, 1);
    expect(run.losses).toEqual([
      expect.objectContaining({
        reason: 'removed-field',
        annotationId: 'AL',
        field: 'alvos.alvo',
        rowId: 'L1',
        value: R1,
      }),
    ]);
  });

  it('fill-field on a ref column is not valid in the specialization (the ref column has no default)', () => {
    expect(() =>
      spec(
        2,
        migrations([
          { op: 'fill-field', type: 'lista', field: 'alvos.alvo', default: 'x' },
        ]),
      ),
    ).toThrow(/default/);
  });
});

describe('drawing values (component engine)', () => {
  const listType = () => {
    const type = spec(1).layers[1]!.annotationTypes[0]!;
    return type;
  };

  it("the table reaches the engine as rows and the ref cell as the target's value (the row by rowLabel, the free tuple by value)", () => {
    let p = build();
    p = addTableRow(p, 'AL', 'alvos', 'L2');
    p = addTableRow(p, 'AL', 'alvos', 'L3');
    p = setTableCell(p, 'AL', 'alvos', 'L1', 'alvo', R1);
    p = setTableCell(p, 'AL', 'alvos', 'L1', 'nota', 'primeira');
    p = setTableCell(p, 'AL', 'alvos', 'L2', 'alvo', E1);
    const { values, warnings } = drawingValues(
      p,
      p.annotations.find((a) => a.id === 'AL')!,
      listType(),
    );
    expect(values.alvos).toEqual([
      { nota: 'primeira', alvo: 'cpf' },
      { nota: null, alvo: 'valor' },
      { nota: null, alvo: null },
    ]);
    expect(warnings).toEqual([]);
  });

  it('a broken cell becomes null with the warning "table[n].column"; the rest of the table goes on', () => {
    let p = build();
    p = addTableRow(p, 'AL', 'alvos', 'L2');
    p = setTableCell(p, 'AL', 'alvos', 'L1', 'alvo', R1);
    p = setTableCell(p, 'AL', 'alvos', 'L2', 'alvo', R2);
    const broken = removeTableRow(p, 'AM', 'campos', 'R1');
    const { values, warnings } = drawingValues(
      broken,
      broken.annotations.find((a) => a.id === 'AL')!,
      listType(),
    );
    expect(values.alvos).toEqual([
      { nota: null, alvo: null },
      { nota: null, alvo: 'nome' },
    ]);
    expect(warnings.map((w) => w.text)).toEqual(['broken reference: alvos[1].alvo']);
  });
});
