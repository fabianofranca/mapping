// Notes library v6 (stage #2825, FN3): the `tabela` type moved into `nota`. Every older version
// declares the migration (`rename-type`), and updating a project turns each table into a yellow note
// with the same title and rows, in one undo entry.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { NOTES_FILES, NOTES_ID, NOTES_SPEC_FILE } from '../../libraries/notas';
import {
  addTableRow,
  addTypedAnnotation,
  applySpecialization,
  createMarking,
  missingMigrations,
  parseSpecText,
  setFieldValue,
  setTableCell,
  specializationUpdateImpact,
  updateSpecialization,
  type Project,
  type Spec,
} from '../../src/model';
import { createProjectStore } from '../../src/store/history';
import { createProjectActions } from '../../src/store/project';
import { emptyProject } from './fixtures';

function load(text: string): Spec {
  const parsed = parseSpecText(text);
  if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
  return parsed.spec;
}

const fixture = (name: string) => readFileSync(join(__dirname, 'fixtures', name), 'utf8');

const current = load(NOTES_FILES.get(NOTES_SPEC_FILE) ?? '');
const v5 = load(fixture('notas-v5.spec.json'));
const v4 = load(fixture('notas-v4.spec.json'));

/** The history before the repository's shallow history: version 5 minus what each step added. */
function without(spec: Spec, version: number, ...types: string[]): Spec {
  return {
    ...spec,
    version,
    layers: spec.layers.map((layer) => ({
      ...layer,
      annotationTypes: layer.annotationTypes.filter((t) => !types.includes(t.id)),
    })),
  };
}

const HISTORY: readonly [number, Spec][] = [
  [1, without(v5, 1, 'tabela', 'texto')],
  [2, without(v5, 2, 'texto')],
  [3, { ...without(v4, 3) }],
  [4, v4],
  [5, v5],
];

describe('the migrations of the notes library v6', () => {
  it('declares one 1..5 → 6 entry each, with the single step rename-type tabela → nota', () => {
    expect(current.version).toBe(6);
    expect(current.migrations).toEqual(
      [1, 2, 3, 4, 5].map((from) => ({
        from,
        to: 6,
        steps: [{ op: 'rename-type', from: 'tabela', to: 'nota' }],
      })),
    );
  });

  it.each(HISTORY)('version %i: no missing migration to version 6', (version, spec) => {
    expect(spec.version).toBe(version);
    expect(missingMigrations(spec, current)).toEqual([]);
  });
});

/** A project at `spec` with a table annotation (`tabela`) of two rows, and a plain note. */
function tableProject(spec: Spec): Project {
  let p = applySpecialization(emptyProject(), spec, { newId: () => 'LN' });
  p = createMarking(p, {
    id: 'T1',
    containerId: null,
    rect: { x: 0, y: 0, width: 240, height: 140 },
    floating: true,
  });
  p = addTypedAnnotation(p, {
    id: 'AT1',
    markingId: 'T1',
    layerId: 'LN',
    type: { specId: NOTES_ID, typeId: 'tabela' },
  });
  p = setFieldValue(p, 'AT1', 'titulo', 'checkout_started');
  for (const [id, key, value] of [
    ['R1', 'source', 'cart'],
    ['R2', 'total', '149.90'],
  ] as const) {
    p = addTableRow(p, 'AT1', 'linhas', id);
    p = setTableCell(p, 'AT1', 'linhas', id, 'chave', key);
    p = setTableCell(p, 'AT1', 'linhas', id, 'valor', value);
  }
  p = createMarking(p, {
    id: 'N1',
    containerId: null,
    rect: { x: 300, y: 0, width: 240, height: 120 },
    floating: true,
  });
  p = addTypedAnnotation(p, {
    id: 'AN1',
    markingId: 'N1',
    layerId: 'LN',
    type: { specId: NOTES_ID, typeId: 'nota' },
  });
  return setFieldValue(p, 'AN1', 'texto', 'A plain note');
}

describe.each([
  ['v4 (fixture)', v4],
  ['v5', v5],
])('updating a %s project with a table', (_name, spec) => {
  const before = tableProject(spec);

  it('is not additive, has no missing migration and no loss', () => {
    const impact = specializationUpdateImpact(before, current);
    expect(impact.additive).toBe(false);
    expect(impact.missingMigrations).toEqual([]);
    expect(impact.losses).toEqual([]);
  });

  it('turns the table into a note with the same title and rows, and leaves the note alone', () => {
    const after = updateSpecialization(before, current, { newId: () => 'X' });
    expect(after.specializations[0]).toMatchObject({ id: NOTES_ID, version: 6 });
    const table = after.annotations.find((a) => a.id === 'AT1')!;
    expect(table.type).toEqual({ specId: NOTES_ID, typeId: 'nota' });
    const was = before.annotations.find((a) => a.id === 'AT1')!;
    expect(table.values).toEqual(was.values);
    expect(table.values?.titulo).toBe('checkout_started');
    expect(table.values?.linhas).toEqual([
      { _id: 'R1', chave: 'source', valor: 'cart' },
      { _id: 'R2', chave: 'total', valor: '149.90' },
    ]);
    // A table becomes a yellow note: the color field stays empty.
    expect(table.values?.cor).toBeUndefined();
    expect(after.annotations.find((a) => a.id === 'AN1')).toEqual(
      before.annotations.find((a) => a.id === 'AN1'),
    );
    expect(table.layerId).toBe(was.layerId);
    // The input project is not touched.
    expect(before.annotations.find((a) => a.id === 'AT1')?.type?.typeId).toBe('tabela');
  });

  it('is one undo entry through the store', () => {
    const store = createProjectStore({ now: () => '2026-10-01T00:00:00.000Z' });
    const actions = createProjectActions(store, { newId: () => 'X' });
    store.load(before);
    actions.updateSpecialization(current);
    const typeOf = () =>
      (store.project.value as Project).annotations.find((a) => a.id === 'AT1')?.type
        ?.typeId;
    expect(typeOf()).toBe('nota');
    expect(store.undo()).toBe(true);
    expect(typeOf()).toBe('tabela');
    expect(store.undo()).toBe(false);
    expect(store.redo()).toBe(true);
    expect(typeOf()).toBe('nota');
  });
});
