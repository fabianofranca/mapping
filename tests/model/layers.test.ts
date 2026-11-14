import { describe, expect, it } from 'vitest';
import {
  LAYER_PALETTE,
  ModelError,
  addLayer,
  layerDeletionImpact,
  moveLayer,
  nextLayerColor,
  removeLayer,
  renameLayer,
  setLayerColor,
} from '../../src/model';
import { emptyProject, expectValid, sampleProject } from './fixtures';

describe('layers', () => {
  it('a new project starts with one layer', () => {
    expect(emptyProject().layers).toHaveLength(1);
  });

  it('creates, renames and changes the color', () => {
    let p = addLayer(emptyProject(), { id: 'L2', name: '  Glass ', color: '#1e88e5' });
    expect(p.layers[1]).toEqual({
      id: 'L2',
      name: 'Glass',
      color: '#1E88E5',
      spec: null,
    });
    p = renameLayer(p, 'L2', 'Windows');
    p = setLayerColor(p, 'L2', '#00FF00');
    expect(expectValid(p).layers[1]).toEqual({
      id: 'L2',
      name: 'Windows',
      color: '#00FF00',
      spec: null,
    });
  });

  it('rejects an empty name and an invalid color', () => {
    const p = emptyProject();
    expect(() => addLayer(p, { id: 'X', name: '  ', color: '#000000' })).toThrow(
      ModelError,
    );
    expect(() => setLayerColor(p, 'L1', 'red')).toThrow('invalid-color');
    expect(() => renameLayer(p, 'nope', 'x')).toThrow('not-found');
  });

  it('reorders', () => {
    let p = addLayer(sampleProject(), { id: 'L3', name: 'Tires', color: '#000000' });
    p = moveLayer(p, 'L3', 0);
    expect(p.layers.map((l) => l.id)).toEqual(['L3', 'L1', 'L2']);
    p = moveLayer(p, 'L3', 1);
    expect(p.layers.map((l) => l.id)).toEqual(['L1', 'L3', 'L2']);
    expect(() => moveLayer(p, 'L3', 3)).toThrow('invalid-index');
  });

  it('cascade-deletes only the annotations of the layer', () => {
    const p = sampleProject();
    expect(layerDeletionImpact(p, 'L2')).toMatchObject({ annotations: 2 });
    const next = expectValid(removeLayer(p, 'L2'));
    expect(next.layers.map((l) => l.id)).toEqual(['L1']);
    expect(next.annotations.map((a) => a.id)).toEqual(['A1', 'A3']);
    expect(next.markings).toBe(p.markings);
  });

  it('does not delete the last layer', () => {
    expect(() => removeLayer(emptyProject(), 'L1')).toThrow('last-layer');
  });

  it('does not change the original project (immutable)', () => {
    const p = sampleProject();
    const snapshot = JSON.stringify(p);
    removeLayer(p, 'L1');
    renameLayer(p, 'L1', 'Other');
    expect(JSON.stringify(p)).toBe(snapshot);
  });

  it('suggests the first palette color not yet used', () => {
    const p = emptyProject();
    expect(nextLayerColor(p)).toBe(LAYER_PALETTE[1]);
    let q = addLayer(p, { id: 'L2', name: 'B', color: LAYER_PALETTE[1] as string });
    expect(nextLayerColor(q)).toBe(LAYER_PALETTE[2]);
    // With the whole palette in use, it starts over.
    for (const [i, color] of LAYER_PALETTE.slice(2).entries()) {
      q = addLayer(q, { id: `X${i}`, name: 'X', color });
    }
    expect(LAYER_PALETTE).toContain(nextLayerColor(q));
  });
});
