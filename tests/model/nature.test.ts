// The nature of a marking (stage #3087 MS1, decision 1): `materialized` when an own annotation's type declares
// `component` in the applied specialization, `observation` otherwise. Read from the specialization alone.
import { describe, expect, it } from 'vitest';
import {
  addAnnotation,
  materializedIds,
  natureOf,
  removeAnnotation,
  type Project,
} from '../../src/model';
import {
  materialize,
  plainTyped,
  r,
  raw,
  structureProject,
} from '../support/structureFixtures';

const base = (): Project =>
  structureProject([
    raw('A', r(0, 0, 500, 400)),
    raw('B', r(10, 10, 100, 50)),
    raw('N', r(300, 300, 50, 50), { floating: true, container: null }),
  ]);

describe('natureOf', () => {
  it('a marking with no annotation is an observation marking', () => {
    expect(natureOf(base(), 'A')).toBe('observation');
  });

  it('a marking with an annotation of a type that declares `component` is materialized', () => {
    expect(natureOf(materialize(base(), 'A'), 'A')).toBe('materialized');
  });

  it('only free or structural annotations keep it an observation marking', () => {
    let p = addAnnotation(base(), {
      id: 'F1',
      markingId: 'A',
      layerId: 'L1',
      entries: [{ id: 'E1', key: 'k', value: 'v' }],
    });
    p = plainTyped(p, 'A');
    expect(natureOf(p, 'A')).toBe('observation');
  });

  it('removing the annotation turns it back to an observation marking', () => {
    const p = materialize(base(), 'A');
    expect(natureOf(removeAnnotation(p, 'A_A_text'), 'A')).toBe('observation');
  });

  it('floating and decorative are flags on top of the nature', () => {
    const p = materialize(base(), 'N');
    expect(natureOf(p, 'N')).toBe('materialized');
    expect(p.markings.find((m) => m.id === 'N')?.floating).toBe(true);
  });

  it('an unknown id is an observation marking', () => {
    expect(natureOf(base(), 'nope')).toBe('observation');
  });

  it('`materializedIds` lists the materialized markings and is memoized per project', () => {
    const p = materialize(materialize(base(), 'A'), 'B');
    expect([...materializedIds(p)].sort()).toEqual(['A', 'B']);
    expect(materializedIds(p)).toBe(materializedIds(p));
    expect(materializedIds(base()).size).toBe(0);
  });

  it('a project that shares the annotations and specializations shares the answer', () => {
    const p = materialize(base(), 'A');
    const moved = { ...p, markings: [...p.markings].reverse() };
    expect(materializedIds(moved)).toBe(materializedIds(p));
  });
});
