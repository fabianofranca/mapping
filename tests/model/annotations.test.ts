import { describe, expect, it } from 'vitest';
import {
  addAnnotation,
  addEntry,
  annotatedLayersByMarking,
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
      inherit: false,
      parentAnnotationId: null,
      type: null,
      values: null,
      entries: [{ id: expect.any(String), key: 'cor', value: ' azul ' }],
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
    expect(
      annotation(p, 'A1')?.entries.map(({ key, value }) => ({ key, value })),
    ).toEqual([
      { key: 'local', value: '' },
      { key: 'tipo', value: 'risco' },
      { key: 'gravidade', value: 'média' },
    ]);
    // Alterar chave e valor mantém o id da tupla.
    expect(annotation(p, 'A1')?.entries[1]?.id).toBe('E1');
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

  it('lista as camadas anotadas por marcação, só entre as visíveis', () => {
    const p = sampleProject();
    const [l1, l2] = p.layers;
    const both = annotatedLayersByMarking(p, [l1!, l2!]);
    expect(both.get('M1')?.map((l) => l.id)).toEqual(['L1', 'L2']);
    expect(both.get('M2')?.map((l) => l.id)).toEqual(['L1']);
    expect(both.get('M4')?.map((l) => l.id)).toEqual(['L2']);
    expect(both.has('M3')).toBe(false);

    const onlyL2 = annotatedLayersByMarking(p, [l2!]);
    expect(onlyL2.get('M1')?.map((l) => l.id)).toEqual(['L2']);
    expect(onlyL2.has('M2')).toBe(false);
    // A ordem segue a das camadas passadas.
    expect(
      annotatedLayersByMarking(p, [l2!, l1!])
        .get('M1')
        ?.map((l) => l.id),
    ).toEqual(['L2', 'L1']);
  });

  it('anotações de um par (marcação, camada), na ordem de exibição', () => {
    let p = sampleProject();
    p = addAnnotation(p, { id: 'A9', markingId: 'M1', layerId: 'L1' });
    expect(annotationsOf(p, 'M1', 'L1').map((a) => a.id)).toEqual(['A1', 'A9']);
    expect(annotationsOf(p, 'M1', 'L2').map((a) => a.id)).toEqual(['A2']);
    expect(annotationsOf(p, 'M3', 'L1')).toEqual([]);
  });
});
