import { describe, expect, it } from 'vitest';
import {
  addAnnotation,
  addEntry,
  addContainer,
  addLayer,
  createMarking,
  setEntries,
  updateEntry,
} from '../../src/model';
import { expectValid, sampleProject } from './fixtures';

// The operations accept explicit ids: an id already in use would make the project save what the
// loader refuses (`duplicate-id`/`duplicate-entry-id` in `validateProject`).
describe('operations refuse an explicit id that already exists', () => {
  it('marking', () => {
    expect(() =>
      createMarking(sampleProject(), {
        id: 'M4',
        containerId: 'I2',
        rect: { x: 500, y: 500, width: 100, height: 100 },
      }),
    ).toThrow('duplicate-id');
  });

  it('image', () => {
    expect(() =>
      addContainer(sampleProject(), {
        id: 'I1',
        file: 'images/other.jpg',
        width: 100,
        height: 100,
      }),
    ).toThrow('duplicate-id');
  });

  it('layer', () => {
    expect(() =>
      addLayer(sampleProject(), { id: 'L2', name: 'Another', color: '#000000' }),
    ).toThrow('duplicate-id');
  });

  it('annotation', () => {
    expect(() =>
      addAnnotation(sampleProject(), { id: 'A1', markingId: 'M2', layerId: 'L2' }),
    ).toThrow('duplicate-id');
  });

  it('an entry with an id already used in another annotation', () => {
    const p = sampleProject();
    expect(() =>
      addAnnotation(p, {
        id: 'A9',
        markingId: 'M2',
        layerId: 'L2',
        entries: [{ id: 'E1', key: 'type', value: 'x' }],
      }),
    ).toThrow('duplicate-id');
    expect(() => addEntry(p, 'A2', { id: 'E1', key: 'other', value: 'x' })).toThrow(
      'duplicate-id',
    );
    expect(() => setEntries(p, 'A3', [{ id: 'E3', key: 'type', value: 'x' }])).toThrow(
      'duplicate-id',
    );
  });

  it("the annotation's own ids remain valid", () => {
    const p = sampleProject();
    expectValid(updateEntry(p, 'A1', 'E1', { key: 'type', value: 'risk' }));
    expectValid(
      setEntries(p, 'A1', [
        { id: 'E2', key: 'severity', value: 'high' },
        { id: 'E1', key: 'type', value: 'risk' },
      ]),
    );
    expectValid(addEntry(p, 'A1', { key: 'new', value: 'x' }));
  });
});
