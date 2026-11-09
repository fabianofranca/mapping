import { describe, expect, it } from 'vitest';
import {
  addAnnotation,
  addPerspective,
  buildListing,
  buildPerspective,
  createMarking,
  canMoveItems,
  deserialize,
  getAnnotationIssues,
  getBacklinks,
  itemsDeletionImpact,
  layerDotsByMarking,
  markingVisibility,
  moveItems,
  moveMarking,
  nearestFreeSpot,
  projectIndex,
  projectIssues,
  type Rect,
  refsOf,
  removeItems,
  serialize,
  settleHierarchy,
  validateProject,
  type ItemRef,
  type Project,
} from '../../src/model';
import { expectLinearGrowth, GROWTH_OPTIONS } from '../support/growth';
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

// Orçamentos por quadro (docs/ARCHITECTURE.md, "Desempenho"): o que o canvas, o painel e a lista leem a
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

// Crescimento do assentar (#882, fase 1): o espaço denso embaralhado (todos os `parentId` zerados, o
// assentar refaz a hierarquia inteira) não pode ser quadrático. Mede 500 e 2.000 marcações num container só.
describe('assentar um espaço denso: crescimento', () => {
  const denseScrambled = (n: number): Project => {
    const dense = buildLargeProject({
      images: 1,
      markingsPerImage: n,
      imageWidth: 100000,
    });
    return { ...dense, markings: dense.markings.map((m) => ({ ...m, parentId: null })) };
  };

  it('500 → 2.000 marcações num container só: razão < 6×', GROWTH_OPTIONS, () => {
    expectLinearGrowth('assentar espaço denso', {
      build: denseScrambled,
      run: (p) => settleHierarchy(p),
      n: 500,
    });
  });

  it('2.000 marcações num container só assentam abaixo de 50 ms', GROWTH_OPTIONS, () => {
    const scrambled = denseScrambled(2000);
    settleHierarchy({ ...scrambled });
    const times = Array.from(
      { length: 9 },
      () => time(() => settleHierarchy({ ...scrambled })).ms,
    );
    times.sort((a, b) => a - b);
    expect(times[4]).toBeLessThan(50);
  });
});

// Edição em projeto grande (#882, fase 2): uma edição custa o espaço que ela mexe, não o projeto inteiro.
describe('edição: crescimento e orçamento', () => {
  /** A i-ésima marcação nova de `I0`: fora dos grupos do fixture, numa grade de 100 colunas. */
  const newRect = (i: number) => ({
    x: (i % 190) * 21 + 5,
    y: 2750 + Math.floor(i / 190) * 22,
    width: 20,
    height: 20,
  });
  /** Cria `count` marcações uma a uma em cada um dos containers `I0..I(containers-1)`. */
  const createMany = (p: Project, count: number, containers = 1): Project => {
    let next = p;
    for (let c = 0; c < containers; c++) {
      for (let i = 0; i < count; i++) {
        next = createMarking(next, {
          id: `N${c}-${i}`,
          containerId: `I${c}`,
          rect: newRect(i),
        });
      }
    }
    return next;
  };
  /** Um projeto do `buildLargeProject` com `n` marcações (25 por imagem). */
  const largeOf = (n: number): Project => buildLargeProject({ images: n / 25 });

  it(
    'criar marcações uma a uma num container: 250 → 1.000 criações, razão < 6×',
    { ...GROWTH_OPTIONS, timeout: 60_000 },
    () => {
      // Num projeto de 20.000 marcações: cada criação sempre copia o array e confere o id (custo da
      // operação, linear no projeto), e esse custo quase não cresce quando o container recebe mais mil.
      // O que a razão mede é o assentar do container que vai enchendo, que não pode custar mais a cada
      // vez (o assentar do container inteiro a cada criação daria mais de 10×).
      const project = buildLargeProject({ images: 800 });
      expectLinearGrowth('criar uma a uma', {
        build: (n) => ({ project, count: n }),
        run: ({ project: p, count }) => createMany(p, count),
        prepare: ({ project: p }) => projectIndex(p),
        n: 250,
        warmup: 4,
        runs: 7,
      });
    },
  );

  it(
    'uma edição (criar, mover): 2.500 → 10.000 marcações, razão < 6×',
    GROWTH_OPTIONS,
    () => {
      for (const [label, edit] of [
        [
          'criar uma marcação',
          (p: Project) =>
            createMarking(p, { id: 'N', containerId: 'I0', rect: newRect(0) }),
        ],
        ['mover uma marcação', (p: Project) => moveMarking(p, 'M0-0', 5, 5)],
      ] as const) {
        expectLinearGrowth(`edição: ${label}`, {
          build: largeOf,
          run: edit,
          prepare: (p) => projectIndex(p),
          n: 2500,
        });
      }
    },
  );

  budgetIt('1.000 criações num container abaixo de 2 s', BUDGET_OPTIONS, () => {
    const project = buildLargeProject();
    const created = time(() => createMany(project, 1000));
    expect(created.value.markings).toHaveLength(1500);
    expect(created.ms).toBeLessThan(2000);
  });

  /** Mediana de uma edição sobre versões novas do projeto, cujo índice já está montado (o app o lê a cada quadro). */
  const medianEditMs = (project: Project, edit: (p: Project) => unknown): number => {
    const run = () => {
      const version = { ...project };
      projectIndex(version);
      return time(() => edit(version)).ms;
    };
    for (let i = 0; i < WARMUP_RUNS; i++) run();
    return median(Array.from({ length: 9 }, run));
  };
  const create = (p: Project) =>
    createMarking(p, { id: 'N', containerId: 'I0', rect: newRect(0) });
  const move = (p: Project) => moveMarking(p, 'M0-0', 5, 5);

  budgetIt('uma edição com 10.000 marcações abaixo de 16 ms', BUDGET_OPTIONS, () => {
    const project = largeOf(10000);
    expect(project.markings).toHaveLength(10000);
    expect(medianEditMs(project, create)).toBeLessThan(16);
    expect(medianEditMs(project, move)).toBeLessThan(16);
  });

  // Com perspectivas a reconciliação roda a cada edição: ela olha só o que a edição mexeu (decisão 6),
  // não monta o índice do projeto inteiro (que sozinho levava ~17 ms com 10.000 marcações).
  budgetIt(
    'uma edição com 10.000 marcações e duas perspectivas abaixo de 16 ms',
    BUDGET_OPTIONS,
    () => {
      let project = largeOf(10000);
      project = addPerspective(
        project,
        buildPerspective(project, { id: 'P1', name: 'Todas', startFrom: null }),
      );
      project = addPerspective(
        project,
        buildPerspective(project, { id: 'P2', name: 'Vazia', startFrom: 'empty' }),
      );
      expect(project.perspectives[0]?.items.length).toBeGreaterThan(100);
      expect(medianEditMs(project, create)).toBeLessThan(16);
      expect(medianEditMs(project, move)).toBeLessThan(16);
    },
  );
});

describe('nearestFreeSpot', () => {
  budgetIt('600 obstáculos em grade cerrada abaixo de 200 ms', BUDGET_OPTIONS, () => {
    // Grade 25 × 24 de retângulos 100×100 com vão de 10: o ponto pedido cai no meio dela e o
    // lugar livre mais próximo é na borda (o pior caso para quem testa candidato por obstáculo).
    const obstacles: Rect[] = [];
    for (let i = 0; i < 25; i++) {
      for (let j = 0; j < 24; j++) {
        obstacles.push({ x: i * 110, y: j * 110, width: 100, height: 100 });
      }
    }
    const { value, ms } = time(() =>
      nearestFreeSpot(obstacles, 100, 100, { x: 1300, y: 1300 }),
    );
    expect(
      obstacles.some(
        (o) =>
          o.x < value.x + 100 &&
          value.x < o.x + 100 &&
          o.y < value.y + 100 &&
          value.y < o.y + 100,
      ),
    ).toBe(false);
    expect(ms).toBeLessThan(200);
  });
});
