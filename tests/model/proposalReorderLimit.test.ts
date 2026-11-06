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

// Reordenação no lote junto de um empate de retângulo (etapa #549, item 1 e decisão 3): a
// âncora da criada respeita o desempate, então aplicar as mudanças dá os mesmos pais do projeto
// proposto, com ou sem `move_marking` no lote. Antes da correção, a âncora saía do array final
// do proposto, já reordenado, e o aplicado invertia o empate (M2 na raiz e W filha de M2).

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

describe('proposta v4: empate de retângulo com reordenação (#549)', () => {
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

  it('com move_marking no mesmo lote, o aplicado tem os pais do plano', () => {
    const start = base();
    const after = reorderMarking(wrap(start), 'M1', 1);
    expect(parents(after)).toMatchObject({ W: null, M2: 'W' });
    const applied = patchProject(start, computeChanges(start, after));
    expect(applied.problems).toEqual([]);
    expect(parents(applied.project)).toEqual(parents(after));
  });

  it('duas envolventes do mesmo item e um move_marking de outra para 0', () => {
    const start = base();
    let after = wrap(start);
    after = wrapItems(
      after,
      { id: 'W2', items: [{ kind: 'marking', id: 'M2' }] },
      { settle: true },
    );
    after = reorderMarking(after, 'M4', 0);
    // Três retângulos iguais (W, W2 e M2), de fora para dentro.
    expect(parents(after)).toMatchObject({ W: null, W2: 'W', M2: 'W2' });
    const applied = patchProject(start, computeChanges(start, after));
    expect(applied.problems).toEqual([]);
    expect(parents(applied.project)).toEqual(parents(after));
  });
});
