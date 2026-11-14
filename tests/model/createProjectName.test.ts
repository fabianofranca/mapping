import { describe, expect, it } from 'vitest';
import { createProject } from '../../src/model';

const layer = { id: 'L1', name: 'Layer', color: '#ff0000' };

describe('createProject: name', () => {
  it('an empty name after trim throws invalid-name, like renameProject', () => {
    for (const name of ['', '   ', '\t\n']) {
      expect(() => createProject({ name, now: 'now', firstLayer: layer })).toThrow(
        expect.objectContaining({ code: 'invalid-name' }),
      );
    }
  });

  it('a name with text is trimmed', () => {
    const p = createProject({ name: '  House  ', now: 'now', firstLayer: layer });
    expect(p.project.name).toBe('House');
  });
});
