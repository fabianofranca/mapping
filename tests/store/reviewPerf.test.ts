import { beforeEach, describe, expect, it } from 'vitest';
import {
  addAnnotation,
  addImage,
  createMarking,
  createProject,
  renameMarking,
  type Project,
} from '../../src/model';
import { propose } from '../model/proposalFixtures';
import { openHarness } from './proposalHarness';

beforeEach(() => localStorage.clear());

const budgetIt = it.skipIf(process.env.PERF_BUDGETS === 'off');

/** Uma imagem com `n` marcações; a proposta renomeia todas e cria uma anotação em cada. */
function bigScenario(n: number) {
  let base: Project = createProject({
    name: 'Grande',
    now: '2026-09-30T12:00:00.000Z',
    firstLayer: { id: 'L1', name: 'Camada', color: '#D32F2F' },
  });
  base = addImage(base, { id: 'I1', file: 'images/a.png', width: 20000, height: 20000 });
  for (let i = 0; i < n; i++) {
    base = createMarking(base, {
      id: `M${i}`,
      imageId: 'I1',
      rect: { x: (i % 100) * 150, y: Math.floor(i / 100) * 150, width: 100, height: 100 },
      name: `m${i}`,
    });
  }
  let after = base;
  for (let i = 0; i < n; i++) {
    after = renameMarking(after, `M${i}`, `novo ${i}`);
    after = addAnnotation(after, { id: `A${i}`, markingId: `M${i}`, layerId: 'L1' });
  }
  return { base, proposal: propose(base, after, { id: 'P1' }) };
}

// Proposta grande (HANDOFF 5.4): milhares de mudanças. Estes limites são largos de propósito:
// pegam um recálculo quadrático (a revisão ficaria inutilizável), não o tempo exato da máquina.
describe('revisão de uma proposta grande', () => {
  budgetIt(
    'abrir, decidir e ler o estado derivado de 2000 mudanças continua rápido',
    async () => {
      const { base, proposal } = bigScenario(1000);
      expect(proposal.changes.length).toBe(2000);
      const { review } = await openHarness({ project: base, proposals: [proposal] });

      let start = performance.now();
      review.open('P1');
      const d = review.derived;
      expect(d.counts.value.total).toBe(2000);
      expect(d.levels.value.get('proposal:')?.total).toBe(2000);
      const open = performance.now() - start;

      start = performance.now();
      for (let i = 0; i < 5; i++) {
        await review.decide({ level: 'item', id: `M${i}` }, 'accepted');
        expect(d.counts.value.accepted).toBeGreaterThan(0);
        expect(d.levels.value.get(`item:M${i}`)?.state).toBe('accepted');
      }
      const decisions = (performance.now() - start) / 5;

      start = performance.now();
      await review.decide({ level: 'proposal', id: null }, 'accepted');
      expect(d.counts.value.accepted).toBe(2000);
      expect(d.canApply.value).toBe(true);
      const batch = performance.now() - start;

      expect(open).toBeLessThan(2000);
      expect(decisions).toBeLessThan(500);
      expect(batch).toBeLessThan(3000);
    },
  );
});
