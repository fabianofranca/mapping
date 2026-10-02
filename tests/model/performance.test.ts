import { describe, expect, it } from 'vitest';
import {
  addAnnotation,
  buildListing,
  deserialize,
  getAnnotationIssues,
  getBacklinks,
  layerDotsByMarking,
  markingVisibility,
  moveMarking,
  projectIndex,
  projectIssues,
  refsOf,
  serialize,
  validateProject,
  type Project,
} from '../../src/model';
import { buildLargeProject } from './largeProject';
import { buildLargeTypedProject } from './largeTypedProject';

// Limites folgados (o CI e o celular são mais lentos que o desktop): o objetivo é
// pegar regressões grosseiras (algo virar O(n²) ou pior) com 20 imagens e 500 marcações.
const BUDGET_MS = 500;

function time<T>(fn: () => T): { value: T; ms: number } {
  const start = performance.now();
  const value = fn();
  return { value, ms: performance.now() - start };
}

describe('projeto grande (20 imagens, 500 marcações)', () => {
  const project = buildLargeProject();

  it('o fixture é válido', () => {
    expect(project.images).toHaveLength(20);
    expect(project.markings).toHaveLength(500);
    expect(validateProject(project)).toEqual([]);
  });

  it('valida os invariantes rápido', () => {
    expect(time(() => validateProject(project)).ms).toBeLessThan(BUDGET_MS);
  });

  it('serializa e lê de volta sem perdas, rápido', () => {
    const written = time(() => serialize(project));
    const read = time(() => deserialize(written.value));
    expect(written.ms + read.ms).toBeLessThan(BUDGET_MS);
    expect(read.value.ok && serialize(read.value.project)).toBe(written.value);
  });

  it('monta a lista rápido', () => {
    const { value, ms } = time(() =>
      buildListing(project, project.layers, { showEmpty: true }),
    );
    expect(value.length).toBeGreaterThan(0);
    expect(ms).toBeLessThan(BUDGET_MS);
  });

  it('operações de edição continuam rápidas', () => {
    const parent = project.markings.find((m) => m.parentId === null)!;
    const moved = time(() => moveMarking(project, parent.id, 5, 5));
    expect(moved.ms).toBeLessThan(BUDGET_MS);
    const annotated = time(() =>
      addAnnotation(project, {
        id: 'novo',
        markingId: parent.id,
        layerId: 'L2',
        name: null,
        entries: [],
      }),
    );
    expect(annotated.ms).toBeLessThan(BUDGET_MS);
  });
});

// Orçamentos por quadro (PLAN.md 14.3): o que o canvas, o painel e a lista leem a
// cada mudança de projeto. A mediana de várias rodadas, cada uma numa versão
// nova do projeto (sem o índice nem as pendências já calculados).
const FRAME_BUDGET_MS = 8;
/** Desligados com `--coverage` (vite.config.ts): o código instrumentado é mais lento. */
const budgetIt = it.skipIf(process.env.PERF_BUDGETS === 'off');

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

function medianMs(fn: (p: Project) => unknown, p: Project, runs = 7): number {
  fn({ ...p }); // Aquece o JIT.
  return median(Array.from({ length: runs }, () => time(() => fn({ ...p })).ms));
}

describe('projeto grande com tipadas e referências', () => {
  const project = buildLargeTypedProject();
  const typed = project.annotations.filter((a) => a.type !== null);
  const refs = project.annotations.flatMap((a) => refsOf(project, a));

  it('o fixture tem o tamanho pedido e é válido', () => {
    expect(project.markings).toHaveLength(500);
    expect(project.annotations).toHaveLength(1500);
    expect(typed).toHaveLength(750);
    expect(refs).toHaveLength(500);
    expect(validateProject(project)).toEqual([]);
    const issues = projectIssues(project);
    expect([...issues.values()].flat().map((i) => i.code)).toEqual(
      expect.arrayContaining(['required-empty', 'broken-ref']),
    );
  });

  budgetIt(
    `índice + pendências + indicadores + visibilidade em menos de ${FRAME_BUDGET_MS} ms`,
    () => {
      const ms = medianMs((p) => {
        projectIndex(p);
        projectIssues(p);
        const dots = layerDotsByMarking(p, p.layers);
        const active = layerDotsByMarking(p, p.layers.slice(0, 1));
        markingVisibility(p, active, 'hide', null);
        return dots;
      }, project);
      expect(ms).toBeLessThan(FRAME_BUDGET_MS);
    },
  );

  budgetIt('consultas repetidas na mesma versão reaproveitam o índice', () => {
    projectIssues(project);
    const queryAll = () => {
      for (const a of project.annotations) {
        getAnnotationIssues(project, a.id);
        getBacklinks(project, a.id);
      }
    };
    queryAll(); // Aquece o JIT.
    const runs = Array.from({ length: 5 }, () => time(queryAll).ms);
    expect(median(runs)).toBeLessThan(FRAME_BUDGET_MS * 4);
  });
});
