import { addAnnotation, type Project } from '../../src/model';
import { arrowProject } from './arrowFixtures';

/**
 * `arrowProject` (markings a1 › a2, a3, b1, b2, c1…; arrow r1 with annotations ra1 and ra2;
 * containers A, B, C; layers L1 and L2) with two extra annotations:
 * - `n1` free on marking a1, with the pair `e1`;
 * - `t1` typed on marking a2, with the field `variant` and the table `table` (row `w1`).
 */
export function viewProject(): Project {
  const p = addAnnotation(arrowProject(), {
    id: 'n1',
    markingId: 'a1',
    layerId: 'L1',
    name: 'Note',
    entries: [{ id: 'e1', key: 'kind', value: 'x' }],
  });
  const free = p.annotations.find((a) => a.id === 'n1');
  if (!free) throw new Error('n1 missing');
  return {
    ...p,
    annotations: [
      ...p.annotations,
      {
        ...free,
        id: 't1',
        markingId: 'a2',
        name: null,
        type: { specId: 's', typeId: 't' },
        values: { variant: 'primary', table: [{ _id: 'w1', name: 'x' }] },
        entries: [],
      },
    ],
  };
}
