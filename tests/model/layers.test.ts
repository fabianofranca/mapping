import { describe, expect, it } from 'vitest';
import {
  ModelError,
  addLayer,
  layerDeletionImpact,
  moveLayer,
  removeLayer,
  renameLayer,
  setLayerColor,
} from '../../src/model';
import { emptyProject, expectValid, sampleProject } from './fixtures';

describe('camadas', () => {
  it('projeto novo começa com uma camada', () => {
    expect(emptyProject().layers).toHaveLength(1);
  });

  it('cria, renomeia e muda a cor', () => {
    let p = addLayer(emptyProject(), { id: 'L2', name: '  Vidros ', color: '#1e88e5' });
    expect(p.layers[1]).toEqual({ id: 'L2', name: 'Vidros', color: '#1E88E5' });
    p = renameLayer(p, 'L2', 'Janelas');
    p = setLayerColor(p, 'L2', '#00FF00');
    expect(expectValid(p).layers[1]).toEqual({
      id: 'L2',
      name: 'Janelas',
      color: '#00FF00',
    });
  });

  it('rejeita nome vazio e cor inválida', () => {
    const p = emptyProject();
    expect(() => addLayer(p, { id: 'X', name: '  ', color: '#000000' })).toThrow(
      ModelError,
    );
    expect(() => setLayerColor(p, 'L1', 'red')).toThrow('invalid-color');
    expect(() => renameLayer(p, 'nope', 'x')).toThrow('not-found');
  });

  it('reordena', () => {
    let p = addLayer(sampleProject(), { id: 'L3', name: 'Pneus', color: '#000000' });
    p = moveLayer(p, 'L3', 0);
    expect(p.layers.map((l) => l.id)).toEqual(['L3', 'L1', 'L2']);
    p = moveLayer(p, 'L3', 1);
    expect(p.layers.map((l) => l.id)).toEqual(['L1', 'L3', 'L2']);
    expect(() => moveLayer(p, 'L3', 3)).toThrow('invalid-index');
  });

  it('exclui em cascata só as anotações da camada', () => {
    const p = sampleProject();
    expect(layerDeletionImpact(p, 'L2')).toEqual({ annotations: 2 });
    const next = expectValid(removeLayer(p, 'L2'));
    expect(next.layers.map((l) => l.id)).toEqual(['L1']);
    expect(next.annotations.map((a) => a.id)).toEqual(['A1', 'A3']);
    expect(next.markings).toBe(p.markings);
  });

  it('não exclui a última camada', () => {
    expect(() => removeLayer(emptyProject(), 'L1')).toThrow('last-layer');
  });

  it('não altera o projeto original (imutável)', () => {
    const p = sampleProject();
    const snapshot = JSON.stringify(p);
    removeLayer(p, 'L1');
    renameLayer(p, 'L1', 'Outro');
    expect(JSON.stringify(p)).toBe(snapshot);
  });
});
