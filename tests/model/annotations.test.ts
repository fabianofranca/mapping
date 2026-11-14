import { describe, expect, it } from 'vitest';
import {
  addAnnotation,
  addEntry,
  annotationsOf,
  moveEntry,
  removeAnnotation,
  removeEntry,
  renameAnnotation,
  setEntries,
  updateEntry,
  validateEntries,
} from '../../src/model';
import { expectValid, sampleProject } from './fixtures';

const annotation = (p: ReturnType<typeof sampleProject>, id: string) =>
  p.annotations.find((a) => a.id === id);

describe('annotations', () => {
  it('creates with an optional name and normalized pairs', () => {
    const p = addAnnotation(sampleProject(), {
      id: 'A5',
      markingId: 'M3',
      layerId: 'L2',
      name: '  ',
      entries: [{ key: ' color ', value: ' blue ' }],
    });
    expect(annotation(expectValid(p), 'A5')).toEqual({
      id: 'A5',
      markingId: 'M3',
      layerId: 'L2',
      name: null,
      parentAnnotationId: null,
      parentRole: null,
      type: null,
      values: null,
      entries: [{ id: expect.any(String), key: 'color', value: ' blue ' }],
    });
  });

  it('several annotations on the same layer and marking keep the order', () => {
    let p = sampleProject();
    p = addAnnotation(p, { id: 'A5', markingId: 'M1', layerId: 'L1' });
    const ids = p.annotations
      .filter((a) => a.markingId === 'M1' && a.layerId === 'L1')
      .map((a) => a.id);
    expect(ids).toEqual(['A1', 'A5']);
  });

  it('requires existing marking and layer', () => {
    const p = sampleProject();
    expect(() => addAnnotation(p, { id: 'X', markingId: 'M9', layerId: 'L1' })).toThrow(
      'not-found',
    );
    expect(() => addAnnotation(p, { id: 'X', markingId: 'M1', layerId: 'L9' })).toThrow(
      'not-found',
    );
  });

  it('renames and deletes without cascade', () => {
    let p = renameAnnotation(sampleProject(), 'A2', 'Crack');
    expect(annotation(p, 'A2')?.name).toBe('Crack');
    p = removeAnnotation(p, 'A2');
    expect(p.annotations.map((a) => a.id)).toEqual(['A1', 'A3', 'A4']);
    expect(p.markings).toHaveLength(4);
  });
});

// pt-BR kept: the keys and values 'tipo', 'gravidade' and 'média' come from the sampleProject fixture
describe('key-value pairs', () => {
  it('adds, changes, removes and reorders', () => {
    let p = sampleProject();
    p = addEntry(p, 'A1', { key: 'place', value: '' });
    p = updateEntry(p, 'A1', 'E1', { key: 'type', value: 'risk' });
    p = moveEntry(p, 'A1', p.annotations[0]!.entries[2]!.id, 0);
    expect(
      annotation(p, 'A1')?.entries.map(({ key, value }) => ({ key, value })),
    ).toEqual([
      { key: 'place', value: '' },
      { key: 'type', value: 'risk' },
      { key: 'gravidade', value: 'média' },
    ]);
    // Changing key and value keeps the tuple id.
    expect(annotation(p, 'A1')?.entries[1]?.id).toBe('E1');
    p = removeEntry(p, 'A1', 'E1');
    expect(annotation(expectValid(p), 'A1')?.entries.map((e) => e.key)).toEqual([
      'place',
      'gravidade',
    ]);
  });

  it('operates by the tuple id, regardless of position', () => {
    // Reordering first does not change which pair is changed or removed.
    let p = moveEntry(sampleProject(), 'A1', 'E2', 0);
    expect(annotation(p, 'A1')?.entries.map((e) => e.id)).toEqual(['E2', 'E1']);
    p = updateEntry(p, 'A1', 'E1', { key: 'type', value: 'risk' });
    expect(annotation(p, 'A1')?.entries).toEqual([
      { id: 'E2', key: 'gravidade', value: 'média' },
      { id: 'E1', key: 'type', value: 'risk' },
    ]);
    p = removeEntry(p, 'A1', 'E2');
    expect(annotation(expectValid(p), 'A1')?.entries.map((e) => e.id)).toEqual(['E1']);
    // Moving to the current position changes nothing.
    expect(moveEntry(p, 'A1', 'E1', 0).annotations).toEqual(p.annotations);
  });

  it('rejects a nonexistent tuple or one from another annotation, and an invalid position', () => {
    const p = sampleProject();
    expect(() => updateEntry(p, 'A1', 'X', { key: 'a', value: '' })).toThrow('not-found');
    expect(() => removeEntry(p, 'A1', 'E3')).toThrow('not-found');
    expect(() => moveEntry(p, 'A1', 'X', 0)).toThrow('not-found');
    expect(() => moveEntry(p, 'A1', 'E1', 2)).toThrow('invalid-index');
    expect(() => moveEntry(p, 'A1', 'E1', -1)).toThrow('invalid-index');
    expect(() => removeEntry(p, 'A9', 'E1')).toThrow('not-found');
  });

  it('rejects an empty or duplicate key (after trim)', () => {
    const p = sampleProject();
    expect(() => addEntry(p, 'A1', { key: '  ', value: 'x' })).toThrow('empty-key');
    expect(() => addEntry(p, 'A1', { key: ' tipo', value: 'x' })).toThrow(
      'duplicate-key',
    );
    expect(() => updateEntry(p, 'A1', 'E2', { key: 'tipo', value: 'x' })).toThrow(
      'duplicate-key',
    );
    expect(() =>
      setEntries(p, 'A1', [
        { key: 'a', value: '1' },
        { key: 'a', value: '2' },
      ]),
    ).toThrow('duplicate-key');
  });

  it('validateEntries points out the error of each pair for the editor', () => {
    expect(
      validateEntries([
        { key: 'a', value: '' },
        { key: '', value: '' },
        { key: 'a ', value: '' },
        { key: 'b', value: '' },
      ]),
    ).toEqual([null, 'empty-key', 'duplicate-key', null]);
  });

  it('annotations of a (marking, layer) pair, in display order', () => {
    let p = sampleProject();
    p = addAnnotation(p, { id: 'A9', markingId: 'M1', layerId: 'L1' });
    expect(annotationsOf(p, 'M1', 'L1').map((a) => a.id)).toEqual(['A1', 'A9']);
    expect(annotationsOf(p, 'M1', 'L2').map((a) => a.id)).toEqual(['A2']);
    expect(annotationsOf(p, 'M3', 'L1')).toEqual([]);
  });
});
