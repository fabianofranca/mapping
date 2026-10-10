import { describe, expect, it } from 'vitest';
import {
  addAnnotation,
  addEntry,
  addImage,
  addLayer,
  createMarking,
  setEntries,
  updateEntry,
} from '../../src/model';
import { expectValid, sampleProject } from './fixtures';

// As operações aceitam ids explícitos: um id já usado faria o projeto gravar o que o
// carregador recusa (`duplicate-id`/`duplicate-entry-id` em `validateProject`).
describe('operações recusam id explícito já existente', () => {
  it('marcação', () => {
    expect(() =>
      createMarking(sampleProject(), {
        id: 'M4',
        imageId: 'I2',
        rect: { x: 500, y: 500, width: 100, height: 100 },
      }),
    ).toThrow('duplicate-id');
  });

  it('imagem', () => {
    expect(() =>
      addImage(sampleProject(), {
        id: 'I1',
        file: 'images/outra.jpg',
        width: 100,
        height: 100,
      }),
    ).toThrow('duplicate-id');
  });

  it('camada', () => {
    expect(() =>
      addLayer(sampleProject(), { id: 'L2', name: 'Outra', color: '#000000' }),
    ).toThrow('duplicate-id');
  });

  it('anotação', () => {
    expect(() =>
      addAnnotation(sampleProject(), { id: 'A1', markingId: 'M2', layerId: 'L2' }),
    ).toThrow('duplicate-id');
  });

  it('par com id já usado em outra anotação', () => {
    const p = sampleProject();
    expect(() =>
      addAnnotation(p, {
        id: 'A9',
        markingId: 'M2',
        layerId: 'L2',
        entries: [{ id: 'E1', key: 'tipo', value: 'x' }],
      }),
    ).toThrow('duplicate-id');
    expect(() => addEntry(p, 'A2', { id: 'E1', key: 'outro', value: 'x' })).toThrow(
      'duplicate-id',
    );
    expect(() => setEntries(p, 'A3', [{ id: 'E3', key: 'tipo', value: 'x' }])).toThrow(
      'duplicate-id',
    );
  });

  it('os ids da própria anotação continuam valendo', () => {
    const p = sampleProject();
    expectValid(updateEntry(p, 'A1', 'E1', { key: 'tipo', value: 'risco' }));
    expectValid(
      setEntries(p, 'A1', [
        { id: 'E2', key: 'gravidade', value: 'alta' },
        { id: 'E1', key: 'tipo', value: 'risco' },
      ]),
    );
    expectValid(addEntry(p, 'A1', { key: 'novo', value: 'x' }));
  });
});
