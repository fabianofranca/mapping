// @vitest-environment node
import { signal } from '@preact/signals';
import { describe, expect, it, vi } from 'vitest';
import type { Project, ProjectSpecialization } from '../../src/model';
import { createProjectCatalogs } from '../../src/store/projectCatalogs';

// Etapa #940, decisão 16 (item 48): o dono que falhou é tentado de novo no próximo pedido.

const owner = {
  id: 'ds',
  version: 1,
  file: 'specs/ds/spec.json',
  spec: { name: 'DS' },
} as unknown as ProjectSpecialization;
const project = { specializations: [owner] } as unknown as Project;

describe('createProjectCatalogs', () => {
  it('um dono que falhou ao carregar é tentado de novo no pedido seguinte', async () => {
    const read = vi
      .fn()
      .mockRejectedValueOnce(new Error('falhou'))
      .mockResolvedValue(null);
    const catalogs = createProjectCatalogs({ project: signal(project), read });
    catalogs.request();
    await catalogs.whenIdle();
    expect(read).toHaveBeenCalledTimes(1);
    catalogs.request();
    await catalogs.whenIdle();
    expect(read).toHaveBeenCalledTimes(2);
  });

  it('sem falha, o mesmo pedido não lê duas vezes', async () => {
    const read = vi.fn().mockResolvedValue(null);
    const catalogs = createProjectCatalogs({ project: signal(project), read });
    catalogs.request();
    await catalogs.whenIdle();
    catalogs.request();
    await catalogs.whenIdle();
    expect(read).toHaveBeenCalledTimes(1);
  });
});
