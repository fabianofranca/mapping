import { addAnnotation, type Project } from '../../src/model';
import { arrowProject } from './arrowFixtures';

/**
 * `arrowProject` (marcações a1 › a2, a3, b1, b2, c1…; seta r1 com anotações ra1 e ra2;
 * containers A, B, C; camadas L1 e L2) com duas anotações a mais:
 * - `n1` livre na marcação a1, com o par `e1`;
 * - `t1` tipada na marcação a2, com o campo `variante` e a tabela `tabela` (linha `w1`).
 */
export function viewProject(): Project {
  const p = addAnnotation(arrowProject(), {
    id: 'n1',
    markingId: 'a1',
    layerId: 'L1',
    name: 'Nota',
    entries: [{ id: 'e1', key: 'tipo', value: 'x' }],
  });
  const free = p.annotations.find((a) => a.id === 'n1');
  if (!free) throw new Error('n1 ausente');
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
        values: { variante: 'primary', tabela: [{ _id: 'w1', nome: 'x' }] },
        entries: [],
      },
    ],
  };
}
