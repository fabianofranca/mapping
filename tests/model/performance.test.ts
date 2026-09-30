import { describe, expect, it } from 'vitest';
import {
  addAnnotation,
  buildListing,
  deserialize,
  moveMarking,
  serialize,
  validateProject,
} from '../../src/model';
import { buildLargeProject } from './largeProject';

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
