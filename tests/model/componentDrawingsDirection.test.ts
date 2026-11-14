import { describe, expect, it, vi } from 'vitest';
import {
  addComponentMarking,
  addContainer,
  approximateMeasurer,
  createDrawingCache,
  setContainerDirection,
  setProjectDirection,
  type NewComponentArgs,
  type Project,
  type TextMeasurer,
} from '../../src/model';
import { SPEC_ID, componentProject, testCatalog } from './componentFixtures';

// Direção (schema v20, decisão 8): o cache compara a direção efetiva por entrada, como o modo e a
// densidade. Mudar a de um container reinstancia só as marcações dele; mudar a do projeto,
// as que a seguem; pan e zoom (mesmo projeto) não reinstanciam nada.

const catalog = testCatalog();

function add(
  p: Project,
  id: string,
  containerId: string | null,
  extra: Partial<NewComponentArgs> = {},
): Project {
  return addComponentMarking(
    p,
    catalog,
    {
      markingId: id,
      annotationId: `A_${id}`,
      containerId,
      parentId: null,
      specId: SPEC_ID,
      typeId: 'text',
      rect: { x: 10, y: 10, width: 60, height: 24 },
      ...extra,
    },
    approximateMeasurer,
  );
}

/** Dois containers (I1 e I2), uma marcação em cada e uma no canvas. */
function twoContainers(): Project {
  let p = componentProject();
  p = addContainer(p, { id: 'I2', file: 'images/outra.png', width: 500, height: 400 });
  p = add(p, 'A', 'I1');
  p = add(p, 'B', 'I2');
  // Longe das imagens: fica no canvas (containerId nulo).
  p = add(p, 'C', null, { rect: { x: 4000, y: 4000, width: 60, height: 24 } });
  return p;
}

const run = (cache: ReturnType<typeof createDrawingCache>, p: Project) =>
  cache(p, catalog, approximateMeasurer, 0);

describe('cache com direção', () => {
  it('mudar a direção de um container reinstancia só as marcações dele', () => {
    const p = twoContainers();
    const cache = createDrawingCache();
    const before = run(cache, p);
    const after = run(cache, setContainerDirection(p, 'I1', 'rtl'));
    expect(after.get('A')).not.toBe(before.get('A'));
    expect(after.get('B')).toBe(before.get('B'));
    expect(after.get('C')).toBe(before.get('C'));
  });

  it('mudar a direção do projeto reinstancia as dos espaços que a seguem', () => {
    const p = setContainerDirection(twoContainers(), 'I2', 'ltr');
    const cache = createDrawingCache();
    const before = run(cache, p);
    const after = run(cache, setProjectDirection(p, 'rtl'));
    expect(after.get('A')).not.toBe(before.get('A'));
    // O canvas (containerId nulo) segue o projeto; o I2 fixa ltr e fica.
    expect(after.get('C')).not.toBe(before.get('C'));
    expect(after.get('B')).toBe(before.get('B'));
  });

  it('fixar no container a direção que ele já seguia não reinstancia nada', () => {
    const p = setProjectDirection(twoContainers(), 'rtl');
    const cache = createDrawingCache();
    const before = run(cache, p);
    const after = run(cache, setContainerDirection(p, 'I1', 'rtl'));
    expect(after.get('A')).toBe(before.get('A'));
    expect(after).toBe(before);
  });

  it('pan e zoom (mesmo projeto em rtl) não instanciam nem medem nada', () => {
    const p = setProjectDirection(twoContainers(), 'rtl');
    const measure = vi.fn<TextMeasurer>(approximateMeasurer);
    const cache = createDrawingCache();
    const first = cache(p, catalog, measure, 0);
    const calls = measure.mock.calls.length;
    for (let i = 0; i < 50; i++) expect(cache(p, catalog, measure, 0)).toBe(first);
    expect(measure.mock.calls.length).toBe(calls);
  });

  it('um projeto novo com a mesma direção reaproveita todos os desenhos', () => {
    const p = setProjectDirection(twoContainers(), 'rtl');
    const cache = createDrawingCache();
    const before = run(cache, p);
    const after = run(cache, { ...p });
    for (const id of ['A', 'B', 'C']) expect(after.get(id)).toBe(before.get(id));
  });
});
