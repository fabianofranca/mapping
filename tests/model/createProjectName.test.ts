import { describe, expect, it } from 'vitest';
import { createProject } from '../../src/model';

const layer = { id: 'L1', name: 'Camada', color: '#ff0000' };

describe('createProject: nome', () => {
  it('nome vazio depois do trim lança invalid-name, como renameProject', () => {
    for (const name of ['', '   ', '\t\n']) {
      expect(() => createProject({ name, now: 'agora', firstLayer: layer })).toThrow(
        expect.objectContaining({ code: 'invalid-name' }),
      );
    }
  });

  it('nome com texto é aparado', () => {
    const p = createProject({ name: '  Casa  ', now: 'agora', firstLayer: layer });
    expect(p.project.name).toBe('Casa');
  });
});
