import { describe, expect, it } from 'vitest';
import type { Project, SpecAnnotationType } from '../../src/model';
import { offeredTypeChoice } from '../../src/ui/offeredTypes';
import { notesProject } from '../model/notesFixtures';

// What the + of a layer offers the owner and, with no type, the reason (stage #1280, decisions 4 and 5).

/** `notesProject()` with the types of the Notas layer (LN) replaced by `map`. */
function withTypes(
  map: (types: readonly SpecAnnotationType[]) => SpecAnnotationType[],
): Project {
  const base = notesProject();
  return {
    ...base,
    specializations: base.specializations.map((s) =>
      s.spec
        ? {
            ...s,
            spec: {
              ...s.spec,
              layers: s.spec.layers.map((l) => ({
                ...l,
                annotationTypes: map(l.annotationTypes),
              })),
            },
          }
        : s,
    ),
  };
}

const plain = (types: readonly SpecAnnotationType[], appliesTo?: 'arrow' | 'marking') =>
  types.map((type) => {
    const copy: Record<string, unknown> = { ...type };
    delete copy.floating;
    delete copy.appliesTo;
    if (appliesTo) copy.appliesTo = [appliesTo];
    return copy as unknown as SpecAnnotationType;
  });

describe('offeredTypeChoice', () => {
  it('plain marking: the floating types drop out and the reason is "floating"', () => {
    const choice = offeredTypeChoice(notesProject(), 'LN', {
      kind: 'marking',
      floating: false,
    });
    expect(choice.types).toEqual([]);
    expect(choice.empty).toBe('floating');
  });

  it('arrow: the reason is also "floating"', () => {
    const choice = offeredTypeChoice(notesProject(), 'LN', {
      kind: 'arrow',
      floating: false,
    });
    expect(choice.types).toEqual([]);
    expect(choice.empty).toBe('floating');
  });

  it('floating marking: the list stays as today (Nota and Tabela)', () => {
    const choice = offeredTypeChoice(notesProject(), 'LN', {
      kind: 'marking',
      floating: true,
    });
    expect(choice.empty).toBeNull();
    expect(choice.types.map((type) => type.id)).toEqual(['nota', 'tabela']);
  });

  it('layer with a specialization that does not load: "unavailable"', () => {
    const base = notesProject();
    const broken: Project = {
      ...base,
      layers: base.layers.map((l) =>
        l.id === 'LN' && l.spec ? { ...l, spec: { ...l.spec, layerId: 'missing' } } : l,
      ),
    };
    expect(offeredTypeChoice(broken, 'LN', { kind: 'marking', floating: false })).toEqual(
      { types: [], empty: 'unavailable' },
    );
  });

  it('layer without types: "no-types"', () => {
    const project = withTypes(() => []);
    expect(offeredTypeChoice(project, 'LN', { kind: 'marking', floating: true })).toEqual(
      { types: [], empty: 'no-types' },
    );
  });

  it('plain type that applies only to markings: the arrow gets "not-for-arrow"', () => {
    const project = withTypes((types) => plain(types, 'marking'));
    const arrow = offeredTypeChoice(project, 'LN', { kind: 'arrow', floating: false });
    expect(arrow).toEqual({ types: [], empty: 'not-for-arrow' });
    const marking = offeredTypeChoice(project, 'LN', {
      kind: 'marking',
      floating: false,
    });
    expect(marking.empty).toBeNull();
    expect(marking.types).toHaveLength(2);
  });

  it('plain type that applies only to arrows: the marking gets "not-for-marking"', () => {
    const project = withTypes((types) => plain(types, 'arrow'));
    expect(
      offeredTypeChoice(project, 'LN', { kind: 'marking', floating: false }),
    ).toEqual({ types: [], empty: 'not-for-marking' });
  });

  it('floating and plain together: the plain marking keeps only the plain ones', () => {
    const project = withTypes((types) =>
      types.map((type, i) => (i === 0 ? type : (plain([type])[0] ?? type))),
    );
    const choice = offeredTypeChoice(project, 'LN', { kind: 'marking', floating: false });
    expect(choice.empty).toBeNull();
    expect(choice.types.map((type) => type.id)).toEqual(['tabela']);
  });
});
