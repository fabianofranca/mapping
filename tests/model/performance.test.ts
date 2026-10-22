import { describe, expect, it } from 'vitest';
import {
  addAnnotation,
  buildListing,
  canMoveItems,
  deserialize,
  getAnnotationIssues,
  getBacklinks,
  itemsDeletionImpact,
  layerDotsByMarking,
  markingVisibility,
  moveItems,
  moveMarking,
  projectIndex,
  projectIssues,
  refsOf,
  removeItems,
  serialize,
  settleHierarchy,
  validateProject,
  type ItemRef,
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
    expect(project.containers).toHaveLength(20);
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

  it('assentar o projeto grande (pertencimento por geometria) é rápido e estável', () => {
    const settled = time(() => settleHierarchy({ ...project }));
    expect(settled.ms).toBeLessThan(BUDGET_MS);
    // O fixture já está assentado: não há o que mudar e o resultado é o mesmo, marcação a marcação.
    expect(settled.value.markings).toEqual(project.markings);
    expect(settled.value.containers).toEqual(project.containers);
    // Assentar de novo é idempotente (devolve o mesmo objeto).
    expect(settleHierarchy(settled.value)).toBe(settled.value);
  });

  it('assentar 500 marcações num só container (o pior caso, O(n²) por espaço) cabe no orçamento', () => {
    const dense = buildLargeProject({
      images: 1,
      markingsPerImage: 500,
      imageWidth: 100000,
    });
    expect(dense.markings).toHaveLength(500);
    expect(validateProject(dense)).toEqual([]);
    // Zera o pai de todas: o assentar refaz a hierarquia inteira.
    const scrambled = {
      ...dense,
      markings: dense.markings.map((m) => ({ ...m, parentId: null })),
    };
    const settled = time(() => settleHierarchy(scrambled));
    expect(settled.ms).toBeLessThan(BUDGET_MS);
    expect(settled.value.markings.map((m) => m.parentId)).toEqual(
      dense.markings.map((m) => m.parentId),
    );
  });

  it('seleção múltipla: mover 20 containers e 500 marcações, e excluir a seleção, cabe no orçamento', () => {
    const everything: ItemRef[] = [
      ...project.containers.map((c) => ({ kind: 'image' as const, id: c.id })),
      ...project.markings.map((m) => ({ kind: 'marking' as const, id: m.id })),
    ];
    expect(time(() => canMoveItems(project, everything)).ms).toBeLessThan(BUDGET_MS);
    // As marcações vão com o container: só os 20 containers recebem deslocamento.
    const movedAll = time(() => moveItems(project, everything, 7.5, 3.25));
    expect(movedAll.ms).toBeLessThan(BUDGET_MS);
    expect(movedAll.value.containers[0]?.placement.x).toBe(7.5);
    expect(movedAll.value.markings).toEqual(project.markings);

    // Só as 500 marcações (100 mães, as filhas vão com elas): 12 e 8 pixels da imagem.
    const onlyMarkings = everything.filter((i) => i.kind === 'marking');
    const movedMarkings = time(() => moveItems(project, onlyMarkings, 3, 2));
    expect(movedMarkings.ms).toBeLessThan(BUDGET_MS);
    expect(movedMarkings.value.markings[0]?.rect.x).toBe(
      (project.markings[0]?.rect.x ?? 0) + 12,
    );

    const impact = time(() => itemsDeletionImpact(project, everything));
    expect(impact.ms).toBeLessThan(BUDGET_MS);
    expect(impact.value).toMatchObject({ markings: 500, containers: 20 });
    const removed = time(() => removeItems(project, everything));
    expect(removed.ms).toBeLessThan(BUDGET_MS);
    expect(removed.value.markings).toEqual([]);
    expect(removed.value.annotations).toEqual([]);
    expect(removed.value.containers).toEqual([]);
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

// Orçamentos por quadro (docs/history/PLAN-etapa-2-1.md 14.3): o que o canvas, o painel e a lista leem a
// cada mudança de projeto. A mediana de várias rodadas, cada uma numa versão
// nova do projeto (sem o índice nem as pendências já calculados).
const FRAME_BUDGET_MS = 8;
/** Desligados com `--coverage` (vite.config.ts): o código instrumentado é mais lento. */
const budgetIt = it.skipIf(process.env.PERF_BUDGETS === 'off');
/**
 * Um orçamento é uma medida de tempo num runner compartilhado: um vizinho ocupado estoura
 * o limite por 1% sem regressão nenhuma (deploy de 2026-10-11: 8,108 ms contra 8 ms, com o
 * mesmo commit passando 17 min antes). Uma repetição separa ruído de regressão: a regressão
 * real (algo virar O(n²)) estoura o limite por muito, nas duas vezes.
 */
const BUDGET_OPTIONS = { retry: 1 };

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

/**
 * As primeiras rodadas medem o JIT, não o código: caem de ~13 ms para ~3 ms até
 * estabilizar (no app, isso acontece nos primeiros quadros). Aquece até lá antes
 * de medir; senão um runner mais lento estoura o orçamento só no aquecimento.
 */
const WARMUP_RUNS = 12;

function medianMs(fn: (p: Project) => unknown, p: Project, runs = 9): number {
  for (let i = 0; i < WARMUP_RUNS; i++) fn({ ...p });
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
    BUDGET_OPTIONS,
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

  budgetIt(
    'consultas repetidas na mesma versão reaproveitam o índice',
    BUDGET_OPTIONS,
    () => {
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
    },
  );
});
