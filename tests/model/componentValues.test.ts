import { describe, expect, it } from 'vitest';
import {
  addAnnotation,
  addTableRow,
  addTypedAnnotation,
  createMarking,
  drawingValues,
  modelMessage,
  setFieldValue,
  setTableCell,
  type JsonValue,
  type Project,
} from '../../src/model';
import { SPEC_ID, componentProject, testSpec } from './componentFixtures';

const TEXT = (testSpec().layers[0]?.annotationTypes ?? []).find((t) => t.id === 'text')!;

/** Writes values straight into the annotation, without the actions' validation (scenarios the model would refuse). */
function withValues(p: Project, id: string, patch: Record<string, JsonValue>): Project {
  return {
    ...p,
    annotations: p.annotations.map((a) =>
      a.id === id ? { ...a, values: { ...a.values, ...patch } } : a,
    ),
  };
}

function base(): Project {
  let p = componentProject();
  for (const [id, y] of [
    ['M1', 0],
    ['M2', 100],
    ['M3', 200],
  ] as const) {
    p = createMarking(p, {
      id,
      containerId: 'I1',
      rect: { x: 0, y, width: 100, height: 50 },
    });
  }
  p = addTypedAnnotation(p, {
    id: 'A1',
    markingId: 'M1',
    layerId: 'LS1',
    type: { specId: SPEC_ID, typeId: 'text' },
  });
  p = addTypedAnnotation(p, {
    id: 'A3',
    markingId: 'M3',
    layerId: 'LS1',
    type: { specId: SPEC_ID, typeId: 'text' },
  });
  p = setFieldValue(p, 'A3', 'label', 'Target');
  p = addAnnotation(p, {
    id: 'A2',
    markingId: 'M2',
    layerId: 'L1',
    entries: [{ id: 'E1', key: 'key', value: 'Tuple value' }],
  });
  return p;
}

const annotation = (p: Project, id: string) => p.annotations.find((a) => a.id === id)!;
const valuesOf = (p: Project, id = 'A1') => drawingValues(p, annotation(p, id), TEXT);

describe('drawingValues: simple types', () => {
  it('string, number, enum and date; empty becomes null; table becomes the list of rows', () => {
    let p = base();
    p = setFieldValue(p, 'A1', 'label', 'Hi there');
    p = setFieldValue(p, 'A1', 'count', 7);
    p = setFieldValue(p, 'A1', 'kind', 'b');
    p = setFieldValue(p, 'A1', 'when', '2026-10-17');
    p = addTableRow(p, 'A1', 'items', 'R1');
    p = setTableCell(p, 'A1', 'items', 'R1', 'name', 'x');
    const { values, warnings } = valuesOf(p);
    expect(values).toEqual({
      label: 'Hi there',
      count: 7,
      kind: 'b',
      when: '2026-10-17',
      target: null,
      items: [{ name: 'x' }],
    });
    expect(warnings).toEqual([]);
  });

  it('the keys follow the order of the type fields', () => {
    expect(Object.keys(valuesOf(base()).values)).toEqual(TEXT.fields.map((f) => f.key));
  });

  it('the field default applies when the annotation received it on creation', () => {
    const { values } = valuesOf(base());
    expect(values.label).toBe('Hello');
    expect(values.kind).toBe('a');
    expect(values.count).toBeNull();
  });

  it('empty text and an absent value become null', () => {
    let p = base();
    p = withValues(p, 'A1', { label: '', count: null });
    const { values } = valuesOf(withValues(p, 'A1', {}));
    expect(values.label).toBeNull();
    expect(values.count).toBeNull();
    const noKey = {
      ...p,
      annotations: p.annotations.map((a) => (a.id === 'A1' ? { ...a, values: {} } : a)),
    };
    expect(valuesOf(noKey).values.kind).toBeNull();
  });

  it('a value of the wrong type does not go into the drawing', () => {
    const p = withValues(base(), 'A1', { label: 5, count: 'x', kind: 3 });
    const { values } = valuesOf(p);
    expect(values.label).toBeNull();
    expect(values.count).toBeNull();
    expect(values.kind).toBeNull();
  });
});

const BROKEN_TARGET = modelMessage(
  'value.refBroken',
  { key: 'target' },
  'broken reference: target',
);

describe('drawingValues: references', () => {
  it('FieldRef: the simple value of the target field', () => {
    let p = base();
    p = setFieldValue(p, 'A1', 'target', { annotationId: 'A3', key: 'label' });
    expect(valuesOf(p).values.target).toBe('Target');
    expect(valuesOf(p).warnings).toEqual([]);
  });

  it('FieldRef to a number becomes a number', () => {
    // The `count` field has no tag: write it directly.
    let p = withValues(base(), 'A3', { count: 12 });
    p = withValues(p, 'A1', { target: { annotationId: 'A3', key: 'count' } });
    expect(valuesOf(p).values.target).toBe(12);
  });

  it('EntryRef: the value of the tuple of the free annotation', () => {
    let p = base();
    p = setFieldValue(p, 'A1', 'target', { annotationId: 'A2', entryId: 'E1' });
    expect(valuesOf(p).values.target).toBe('Tuple value');
  });

  it('RowRef: the row label (rowLabel column), or the position when empty', () => {
    let p = base();
    p = addTableRow(p, 'A3', 'items', 'R1');
    p = addTableRow(p, 'A3', 'items', 'R2');
    p = setTableCell(p, 'A3', 'items', 'R1', 'name', 'Row one');
    p = setFieldValue(p, 'A1', 'target', {
      annotationId: 'A3',
      key: 'items',
      rowId: 'R1',
    });
    expect(valuesOf(p).values.target).toBe('Row one');
    p = setFieldValue(p, 'A1', 'target', {
      annotationId: 'A3',
      key: 'items',
      rowId: 'R2',
    });
    expect(valuesOf(p).values.target).toBe('#2');
  });

  it('more than one level: the target is another reference, it is not followed', () => {
    let p = base();
    p = withValues(p, 'A3', { target: { annotationId: 'A2', entryId: 'E1' } });
    p = withValues(p, 'A1', { target: { annotationId: 'A3', key: 'target' } });
    const { values, warnings } = valuesOf(p);
    expect(values.target).toBeNull();
    expect(warnings).toEqual([
      modelMessage(
        'value.refDeep',
        { key: 'target' },
        'reference through more than one level: target',
      ),
    ]);
  });

  it('cycle: the target goes back to the annotation itself', () => {
    const p = withValues(base(), 'A1', { target: { annotationId: 'A1', key: 'label' } });
    const { values, warnings } = valuesOf(p);
    expect(values.target).toBeNull();
    expect(warnings).toEqual([
      modelMessage('value.refCycle', { key: 'target' }, 'reference cycle: target'),
    ]);
  });

  it('broken reference: a target that does not exist, or a format that is not a reference', () => {
    let p = withValues(base(), 'A1', { target: { annotationId: 'ZZ', key: 'label' } });
    expect(valuesOf(p).values.target).toBeNull();
    expect(valuesOf(p).warnings).toEqual([BROKEN_TARGET]);
    p = withValues(p, 'A1', {
      target: { annotationId: 'A3', key: 'items', rowId: 'nonexistent' },
    });
    expect(valuesOf(p).warnings).toEqual([BROKEN_TARGET]);
    p = withValues(p, 'A1', { target: 'loose text' });
    expect(valuesOf(p).warnings).toEqual([BROKEN_TARGET]);
    p = withValues(p, 'A1', { target: { annotationId: 'A2', entryId: 'EX' } });
    expect(valuesOf(p).warnings).toEqual([BROKEN_TARGET]);
  });

  it('an empty reference does not warn', () => {
    const p = withValues(base(), 'A1', { target: null });
    expect(valuesOf(p)).toEqual({
      values: expect.objectContaining({ target: null }),
      warnings: [],
    });
  });
});
