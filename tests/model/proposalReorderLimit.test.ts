import { describe, expect, it } from 'vitest';
import {
  addContainer,
  computeChanges,
  createMarking,
  patchProject,
  reorderMarking,
  wrapItems,
  type Project,
} from '../../src/model';
import { emptyProject } from './fixtures';

// LIMITAÇÃO CONHECIDA (issue #549), fixada aqui para a documentação não prometer mais do que o
// código dá: sem reordenação no lote, aplicar as mudanças dá os mesmos pais e a mesma ordem do
// projeto proposto (tests/model/proposalInsertBefore.test.ts); com uma reordenação (`position`)
// junto de um empate de retângulo, o `position` só ordena irmãs e vale depois do assentar, então
// os PAIS podem sair diferentes. Quando a #549 for corrigida, o segundo teste passa a falhar e
// deve virar uma igualdade (apague o `limitation` e confira os pais com `toEqual`).

const rect = (x: number, y: number, width: number, height: number) => ({
  x,
  y,
  width,
  height,
});

/** Container C 100×100 com M1 e M4 dentro de M2, que o preenche (criadas na ordem M1, M2, M4). */
function base(): Project {
  let p = addContainer(emptyProject(), {
    id: 'C',
    file: 'c.png',
    width: 100,
    height: 100,
  });
  p = createMarking(p, { id: 'M1', containerId: 'C', rect: rect(0, 0, 50, 50) });
  p = createMarking(p, { id: 'M2', containerId: 'C', rect: rect(0, 0, 100, 100) });
  p = createMarking(p, { id: 'M4', containerId: 'C', rect: rect(50, 0, 50, 50) });
  return p;
}

const wrap = (p: Project) =>
  wrapItems(
    p,
    {
      id: 'W',
      items: ['M1', 'M2'].map((id) => ({ kind: 'marking' as const, id })),
    },
    { settle: true },
  );

const parents = (p: Project) =>
  Object.fromEntries(p.markings.map((m) => [m.id, m.parentId]));

describe('proposta v4: limite conhecido com reordenação (#549)', () => {
  it('controle: sem reordenação o empate aplica a hierarquia do plano', () => {
    const start = base();
    expect(parents(start)).toMatchObject({ M1: 'M2', M2: null, M4: 'M2' });
    const after = wrap(start);
    // O plano: W (mesmo retângulo de M2) na raiz, M2 filha de W.
    expect(parents(after)).toMatchObject({ W: null, M2: 'W' });
    const applied = patchProject(start, computeChanges(start, after));
    expect(applied.problems).toEqual([]);
    expect(parents(applied.project)).toEqual(parents(after));
  });

  it('limitação (#549): com move_marking no mesmo lote, os pais do aplicado divergem do plano', () => {
    const start = base();
    const after = reorderMarking(wrap(start), 'M1', 1);
    // O plano continua W na raiz e M2 filha de W...
    expect(parents(after)).toMatchObject({ W: null, M2: 'W' });
    const applied = patchProject(start, computeChanges(start, after));
    expect(applied.problems).toEqual([]);
    // ...mas o aplicado inverte o empate: M2 na raiz e W filha de M2.
    expect(parents(applied.project)).toMatchObject({ M2: null, W: 'M2' });
    expect(parents(applied.project)).not.toEqual(parents(after));
  });
});
