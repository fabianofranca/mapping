import { describe, expect, it, vi } from 'vitest';
import {
  addComponentMarking,
  approximateMeasurer,
  createDrawingCache,
  createMarking,
  moveMarking,
  setMarkingAnchor,
  setMarkingRect,
  type NewComponentArgs,
  type Project,
  type TextMeasurer,
} from '../../src/model';
import { SPEC_ID, componentProject, testCatalog } from './componentFixtures';

// Âncora (R3, decisão 15): a entrada do cache guarda o retângulo da âncora da marcação (`anchorRect`)
// e o compara, como a direção e o modo. Só as ancoradas dependem dele.

const catalog = testCatalog();

function add(p: Project, id: string, x: number, extra: Partial<NewComponentArgs> = {}) {
  return addComponentMarking(
    p,
    catalog,
    {
      markingId: id,
      annotationId: `A_${id}`,
      containerId: 'I1',
      parentId: null,
      specId: SPEC_ID,
      typeId: 'text',
      rect: { x, y: 500, width: 60, height: 24 },
      ...extra,
    },
    approximateMeasurer,
  );
}

/** T (sem componente) com 3 ancoradas (B1 a B3) e X solta, todas desenhadas por componente (menos T). */
function scene(): Project {
  let p = componentProject();
  p = createMarking(p, {
    id: 'T',
    containerId: 'I1',
    rect: { x: 100, y: 100, width: 200, height: 100 },
  });
  p = add(p, 'B1', 100, { anchor: { to: 'T', side: 'top', align: 'start' } });
  p = add(p, 'B2', 200, { anchor: { to: 'T', side: 'bottom' } });
  p = add(p, 'B3', 300, { anchor: { to: 'T', side: 'end' } });
  p = add(p, 'X', 700);
  return p;
}

const run = (cache: ReturnType<typeof createDrawingCache>, p: Project) =>
  cache(p, catalog, approximateMeasurer, 0);
const changed = (
  before: ReturnType<typeof run>,
  after: ReturnType<typeof run>,
): string[] => [...after.keys()].filter((id) => after.get(id) !== before.get(id)).sort();

describe('cache com âncora', () => {
  it('redimensionar a âncora reinstancia as 3 ancoradas e mais nada', () => {
    const p = scene();
    const cache = createDrawingCache();
    const before = run(cache, p);
    const after = run(
      cache,
      setMarkingRect(p, 'T', { x: 100, y: 100, width: 260, height: 100 }),
    );
    expect(changed(before, after)).toEqual(['B1', 'B2', 'B3']);
  });

  it('mover a âncora reinstancia as 3 (que andam junto); X fica', () => {
    const p = scene();
    const cache = createDrawingCache();
    const before = run(cache, p);
    const after = run(cache, moveMarking(p, 'T', 10, 10));
    expect(changed(before, after)).toEqual(['B1', 'B2', 'B3']);
    expect(after.get('X')).toBe(before.get('X'));
  });

  it('mover outra marcação reinstancia 0', () => {
    const p = scene();
    const cache = createDrawingCache();
    const before = run(cache, p);
    const after = run(cache, moveMarking(p, 'X', 5, 5));
    expect(changed(before, after)).toEqual(['X']);
    for (const id of ['B1', 'B2', 'B3']) expect(after.get(id)).toBe(before.get(id));
  });

  it('pan e zoom (mesmo projeto) não instanciam nem medem nada', () => {
    const p = scene();
    const measure = vi.fn<TextMeasurer>(approximateMeasurer);
    const cache = createDrawingCache();
    const first = cache(p, catalog, measure, 0);
    const calls = measure.mock.calls.length;
    for (let i = 0; i < 50; i++) expect(cache(p, catalog, measure, 0)).toBe(first);
    expect(measure.mock.calls.length).toBe(calls);
  });

  it('um projeto novo com as mesmas âncoras reaproveita todos os desenhos', () => {
    const p = scene();
    const cache = createDrawingCache();
    const before = run(cache, p);
    expect(changed(before, run(cache, { ...p }))).toEqual([]);
  });

  it('tirar a âncora reinstancia a ancorada (o retângulo dela deixa de entrar)', () => {
    const p = scene();
    const cache = createDrawingCache();
    const before = run(cache, p);
    const after = run(cache, setMarkingAnchor(p, 'B2', null));
    expect(changed(before, after)).toEqual(['B2']);
  });

  it('o desenho leva o lado e o retângulo da âncora (a R3 parte 2 os entrega ao motor)', () => {
    const drawings = run(createDrawingCache(), scene());
    expect(drawings.get('B1')?.anchor).toEqual({
      side: 'top',
      rect: { x: 100, y: 100, width: 200, height: 100 },
    });
    expect(drawings.get('X')?.anchor).toBeUndefined();
  });
});
