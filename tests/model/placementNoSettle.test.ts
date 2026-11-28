// The placement reads the defaults of a type from a throwaway project: it must not settle the whole project
// (stage #3087 MS2, review finding): `addTypedAnnotation` ends in the nature pass, which the scratch marking skips.
import { describe, expect, it, vi } from 'vitest';
import { approximateMeasurer, componentPlacement } from '../../src/model';
import { SPEC_ID, componentProject, testCatalog } from './componentFixtures';

const calls = vi.hoisted(() => ({ settle: 0 }));

vi.mock('../../src/model/hierarchySettle', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../src/model/hierarchySettle')>();
  return {
    ...real,
    settleFrom: (...args: Parameters<typeof real.settleFrom>) => {
      calls.settle++;
      return real.settleFrom(...args);
    },
  };
});

describe('componentPlacement', () => {
  it('does not settle the project to read the default values', () => {
    const p = componentProject();
    calls.settle = 0;
    componentPlacement(
      p,
      testCatalog(),
      { containerId: 'I1', parentId: null, specId: SPEC_ID, typeId: 'rowhug' },
      approximateMeasurer,
    );
    expect(calls.settle).toBe(0);
  });
});
