// @vitest-environment node
import { signal } from '@preact/signals';
import { describe, expect, it, vi } from 'vitest';
import type { Project, ProjectSpecialization } from '../../src/model';
import { createProjectCatalogs } from '../../src/store/projectCatalogs';

// Stage #940, decision 16 (item 48): the owner that failed is tried again on the next request.

const owner = {
  id: 'ds',
  version: 1,
  file: 'specs/ds/spec.json',
  spec: { name: 'DS' },
} as unknown as ProjectSpecialization;
const project = { specializations: [owner] } as unknown as Project;

describe('createProjectCatalogs', () => {
  it('an owner that failed to load is tried again on the following request', async () => {
    const read = vi
      .fn()
      .mockRejectedValueOnce(new Error('failed'))
      .mockResolvedValue(null);
    const catalogs = createProjectCatalogs({ project: signal(project), read });
    catalogs.request();
    await catalogs.whenIdle();
    expect(read).toHaveBeenCalledTimes(1);
    catalogs.request();
    await catalogs.whenIdle();
    expect(read).toHaveBeenCalledTimes(2);
  });

  it('without a failure, the same request does not read twice', async () => {
    const read = vi.fn().mockResolvedValue(null);
    const catalogs = createProjectCatalogs({ project: signal(project), read });
    catalogs.request();
    await catalogs.whenIdle();
    catalogs.request();
    await catalogs.whenIdle();
    expect(read).toHaveBeenCalledTimes(1);
  });
});
