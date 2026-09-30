import { describe, expect, it } from 'vitest';
import {
  addAnnotation,
  addEntry,
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

describe('anotações', () => {
  it('cria com nome opcional e pares normalizados', () => {
    const p = addAnnotation(sampleProject(), {
      id: 'A5',
      markingId: 'M3',
      layerId: 'L2',
      name: '  ',
      entries: [{ key: ' cor ', value: ' azul ' }],
    });
    expect(annotation(expectValid(p), 'A5')).toEqual({
      id: 'A5',
      markingId: 'M3',
      layerId: 'L2',
      name: null,
      entries: [{ key: 'cor', value: ' azul ' }],
    });
  });

  it('várias anotações na mesma camada e marcação mantêm a ordem', () => {
    let p = sampleProject();
    p = addAnnotation(p, { id: 'A5', markingId: 'M1', layerId: 'L1' });
    const ids = p.annotations
      .filter((a) => a.markingId === 'M1' && a.layerId === 'L1')
      .map((a) => a.id);
    expect(ids).toEqual(['A1', 'A5']);
  });

  it('exige marcação e camada existentes', () => {
    const p = sampleProject();
    expect(() => addAnnotation(p, { id: 'X', markingId: 'M9', layerId: 'L1' })).toThrow(
      'not-found',
    );
    expect(() => addAnnotation(p, { id: 'X', markingId: 'M1', layerId: 'L9' })).toThrow(
      'not-found',
    );
  });

  it('renomeia e exclui sem cascata', () => {
    let p = renameAnnotation(sampleProject(), 'A2', 'Trinca');
    expect(annotation(p, 'A2')?.name).toBe('Trinca');
    p = removeAnnotation(p, 'A2');
    expect(p.annotations.map((a) => a.id)).toEqual(['A1', 'A3', 'A4']);
    expect(p.markings).toHaveLength(4);
  });
});

describe('pares chave-valor', () => {
  it('adiciona, altera, remove e reordena', () => {
    let p = sampleProject();
    p = addEntry(p, 'A1', { key: 'local', value: '' });
    p = updateEntry(p, 'A1', 0, { key: 'tipo', value: 'risco' });
    p = moveEntry(p, 'A1', 2, 0);
    expect(annotation(p, 'A1')?.entries).toEqual([
      { key: 'local', value: '' },
      { key: 'tipo', value: 'risco' },
      { key: 'gravidade', value: 'média' },
    ]);
    p = removeEntry(p, 'A1', 1);
    expect(annotation(expectValid(p), 'A1')?.entries.map((e) => e.key)).toEqual([
      'local',
      'gravidade',
    ]);
  });

  it('rejeita chave vazia ou duplicada (após trim)', () => {
    const p = sampleProject();
    expect(() => addEntry(p, 'A1', { key: '  ', value: 'x' })).toThrow('empty-key');
    expect(() => addEntry(p, 'A1', { key: ' tipo', value: 'x' })).toThrow(
      'duplicate-key',
    );
    expect(() => updateEntry(p, 'A1', 1, { key: 'tipo', value: 'x' })).toThrow(
      'duplicate-key',
    );
    expect(() => removeEntry(p, 'A1', 5)).toThrow('invalid-index');
    expect(() =>
      setEntries(p, 'A1', [
        { key: 'a', value: '1' },
        { key: 'a', value: '2' },
      ]),
    ).toThrow('duplicate-key');
  });

  it('validateEntries aponta o erro de cada par para o editor', () => {
    expect(
      validateEntries([
        { key: 'a', value: '' },
        { key: '', value: '' },
        { key: 'a ', value: '' },
        { key: 'b', value: '' },
      ]),
    ).toEqual([null, 'empty-key', 'duplicate-key', null]);
  });
});
