// Sem âncora no projeto, criar marcações não monta o índice (O(n)) de cada versão: o
// assentar só olha o índice quando há relação de âncora (regressão de desempenho da R3).
import { describe, expect, it, vi } from 'vitest';

const built = vi.hoisted(() => ({ count: 0 }));

vi.mock('../../src/model/projectIndex', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../src/model/projectIndex')>();
  const seen = new WeakSet<object>();
  return {
    ...original,
    projectIndex: (p: object) => {
      if (!seen.has(p)) {
        seen.add(p);
        built.count++;
      }
      return (original.projectIndex as (q: object) => unknown)(p);
    },
  };
});

import {
  addContainer,
  createMarking,
  moveMarking,
  setMarkingAnchor,
} from '../../src/model';
import { emptyProject } from './fixtures';

function withContainer() {
  return addContainer(emptyProject(), {
    id: 'I1',
    file: 'a.png',
    width: 2000,
    height: 2000,
  });
}

describe('assentar sem âncoras não monta o índice a cada operação', () => {
  it('50 criações num projeto sem âncora montam poucos índices', () => {
    let p = withContainer();
    built.count = 0;
    for (let i = 0; i < 50; i++) {
      p = createMarking(p, {
        id: `M${i}`,
        containerId: 'I1',
        rect: { x: (i % 10) * 60, y: Math.floor(i / 10) * 60, width: 50, height: 50 },
      });
    }
    // O custo não pode crescer com o número de operações (sem o caminho rápido era um índice por criação).
    expect(built.count).toBeLessThan(10);
  });

  it('com âncora no projeto, o índice volta a ser consultado', () => {
    let p = withContainer();
    for (const [id, x] of [
      ['A', 0],
      ['B', 200],
    ] as const) {
      p = createMarking(p, {
        id,
        containerId: 'I1',
        rect: { x, y: 0, width: 50, height: 50 },
      });
    }
    p = setMarkingAnchor(p, 'B', { to: 'A', side: 'end', align: 'start' });
    built.count = 0;
    p = moveMarking(p, 'A', 5, 5);
    expect(built.count).toBeGreaterThan(0);
    expect(p.markings.find((m) => m.id === 'B')?.anchor?.to).toBe('A');
  });
});
