import { describe, expect, it } from 'vitest';
import { validateProject, type Project } from '../../src/model';
import { sampleProject } from './fixtures';

function codes(p: Project) {
  return validateProject(p).map((i) => `${i.code}:${i.id}`);
}

describe('validador de invariantes', () => {
  it('o projeto de exemplo é válido', () => {
    expect(validateProject(sampleProject())).toEqual([]);
  });

  it('ids e arquivos repetidos', () => {
    const p = sampleProject();
    const layer = p.layers[0];
    const image = p.images[1];
    if (!layer || !image) throw new Error('fixture');
    expect(codes({ ...p, layers: [...p.layers, layer] })).toContain('duplicate-id:L1');
    expect(
      codes({
        ...p,
        images: p.images.map((i) =>
          i.id === 'I2' ? { ...i, file: 'images/lateral.jpg' } : i,
        ),
      }),
    ).toContain('duplicate-file:I2');
    expect(image.id).toBe('I2');
  });

  it('imagens sobrepostas', () => {
    const p = sampleProject();
    const overlapping = {
      ...p,
      images: p.images.map((i) =>
        i.id === 'I2' ? { ...i, placement: { ...i.placement, x: 500 } } : i,
      ),
    };
    expect(validateProject(overlapping)).toContainEqual({
      code: 'images-overlap',
      id: 'I1',
      otherId: 'I2',
    });
  });

  it('referências quebradas', () => {
    const p = sampleProject();
    const broken: Project = {
      ...p,
      markings: p.markings.map((m) =>
        m.id === 'M4'
          ? { ...m, imageId: 'I9' }
          : m.id === 'M3'
            ? { ...m, parentId: 'M9' }
            : m,
      ),
      annotations: p.annotations.map((a) =>
        a.id === 'A1'
          ? { ...a, markingId: 'M9' }
          : a.id === 'A2'
            ? { ...a, layerId: 'L9' }
            : a,
      ),
    };
    expect(codes(broken)).toEqual(
      expect.arrayContaining([
        'missing-image:M4',
        'missing-parent:M3',
        'missing-marking:A1',
        'missing-layer:A2',
      ]),
    );
  });

  it('retângulos: inteiros, tamanho mínimo, dentro da imagem e do pai', () => {
    const p = sampleProject();
    const withRect = (
      id: string,
      rect: Project['markings'][number]['rect'],
    ): Project => ({
      ...p,
      markings: p.markings.map((m) => (m.id === id ? { ...m, rect } : m)),
    });
    expect(codes(withRect('M4', { x: 0.5, y: 0, width: 10, height: 10 }))).toContain(
      'rect-not-integer:M4',
    );
    expect(codes(withRect('M4', { x: 0, y: 0, width: 7, height: 10 }))).toContain(
      'rect-too-small:M4',
    );
    expect(codes(withRect('M4', { x: 950, y: 0, width: 100, height: 10 }))).toContain(
      'rect-out-of-image:M4',
    );
    expect(codes(withRect('M3', { x: 0, y: 0, width: 10, height: 10 }))).toContain(
      'rect-outside-parent:M3',
    );
  });

  it('pai em outra imagem e ciclos', () => {
    const p = sampleProject();
    const otherImage: Project = {
      ...p,
      markings: p.markings.map((m) => (m.id === 'M4' ? { ...m, parentId: 'M1' } : m)),
    };
    expect(codes(otherImage)).toContain('parent-other-image:M4');
    const cycle: Project = {
      ...p,
      markings: p.markings.map((m) => (m.id === 'M1' ? { ...m, parentId: 'M3' } : m)),
    };
    expect(codes(cycle)).toEqual(
      expect.arrayContaining([
        'hierarchy-cycle:M1',
        'hierarchy-cycle:M2',
        'hierarchy-cycle:M3',
      ]),
    );
  });

  it('chaves vazias ou duplicadas', () => {
    const p = sampleProject();
    const bad: Project = {
      ...p,
      annotations: p.annotations.map((a) =>
        a.id === 'A1'
          ? {
              ...a,
              entries: [
                { id: 'X1', key: 'x', value: '' },
                { id: 'X2', key: 'x', value: '' },
                { id: 'X3', key: ' ', value: '' },
              ],
            }
          : a,
      ),
    };
    expect(codes(bad)).toEqual(['duplicate-key:A1', 'empty-key:A1']);
  });
});
