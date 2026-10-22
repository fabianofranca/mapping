import { effect } from '@preact/signals';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  addAnnotation,
  addContainer,
  createMarking,
  createProject,
  renameMarking,
  type Project,
} from '../../src/model';
import { propose } from '../model/proposalFixtures';
import { openHarness } from './proposalHarness';

beforeEach(() => localStorage.clear());

const budgetIt = it.skipIf(process.env.PERF_BUDGETS === 'off');
/** Uma repetição separa ruído do runner de regressão (ver tests/model/performance.test.ts). */
const BUDGET_OPTIONS = { retry: 1 };

/** Uma imagem com `n` marcações; a proposta renomeia todas e cria uma anotação em cada. */
function bigScenario(n: number) {
  let base: Project = createProject({
    name: 'Grande',
    now: '2026-09-30T12:00:00.000Z',
    firstLayer: { id: 'L1', name: 'Camada', color: '#D32F2F' },
  });
  base = addContainer(base, {
    id: 'I1',
    file: 'images/a.png',
    width: 20000,
    height: 20000,
  });
  for (let i = 0; i < n; i++) {
    base = createMarking(base, {
      id: `M${i}`,
      containerId: 'I1',
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
    BUDGET_OPTIONS,
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

  // Detalhes na revisão (fase 9.6): o índice "mudanças por entidade e campo", que os marcadores
  // e o cabeçalho leem, depende só das mudanças. Decidir não o recalcula (a mesma referência),
  // e montá-lo para milhares de mudanças custa uma passada.
  budgetIt(
    'o índice por campo de 2000 mudanças é montado uma vez e não muda a cada decisão',
    BUDGET_OPTIONS,
    async () => {
      const { base, proposal } = bigScenario(1000);
      const { review } = await openHarness({ project: base, proposals: [proposal] });
      review.open('P1');
      const d = review.derived;

      const start = performance.now();
      const index = d.fieldIndex.value;
      const build = performance.now() - start;
      // 1000 marcações renomeadas e 1000 anotações criadas.
      expect(index.entities.size).toBe(2000);
      expect(index.annotationsOf.size).toBe(1000);

      let notified = 0;
      const stop = effect(() => {
        void d.fieldIndex.value;
        notified++;
      });
      for (let i = 0; i < 5; i++) {
        await review.decide({ level: 'item', id: `M${i}` }, 'accepted');
        expect(d.fieldIndex.value).toBe(index);
      }
      await review.decide({ level: 'proposal', id: null }, 'accepted');
      expect(d.fieldIndex.value).toBe(index);
      // Só a leitura inicial: nenhuma decisão o notificou de novo.
      expect(notified).toBe(1);
      stop();
      expect(build).toBeLessThan(1000);
    },
  );
});
