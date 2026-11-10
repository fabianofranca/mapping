import { describe, expect, it } from 'vitest';
import type { Project, SpecAnnotationType } from '../../src/model';
import { offeredTypeChoice } from '../../src/ui/offeredTypes';
import { notesProject } from '../model/notesFixtures';

// O que o + de uma camada oferece à dona e, sem tipo, o motivo (etapa #1280, decisões 4 e 5).

/** `notesProject()` com os tipos da camada Notas (LN) trocados por `map`. */
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
  it('marcação comum: os tipos flutuantes saem e o motivo é "floating"', () => {
    const choice = offeredTypeChoice(notesProject(), 'LN', {
      kind: 'marking',
      floating: false,
    });
    expect(choice.types).toEqual([]);
    expect(choice.empty).toBe('floating');
  });

  it('seta: o motivo também é "floating"', () => {
    const choice = offeredTypeChoice(notesProject(), 'LN', {
      kind: 'arrow',
      floating: false,
    });
    expect(choice.types).toEqual([]);
    expect(choice.empty).toBe('floating');
  });

  it('marcação flutuante: a lista fica como hoje (Nota e Tabela)', () => {
    const choice = offeredTypeChoice(notesProject(), 'LN', {
      kind: 'marking',
      floating: true,
    });
    expect(choice.empty).toBeNull();
    expect(choice.types.map((type) => type.id)).toEqual(['nota', 'tabela']);
  });

  it('camada com especialização que não carrega: "unavailable"', () => {
    const base = notesProject();
    const broken: Project = {
      ...base,
      layers: base.layers.map((l) =>
        l.id === 'LN' && l.spec ? { ...l, spec: { ...l.spec, layerId: 'nenhuma' } } : l,
      ),
    };
    expect(offeredTypeChoice(broken, 'LN', { kind: 'marking', floating: false })).toEqual(
      { types: [], empty: 'unavailable' },
    );
  });

  it('camada sem tipos: "no-types"', () => {
    const project = withTypes(() => []);
    expect(offeredTypeChoice(project, 'LN', { kind: 'marking', floating: true })).toEqual(
      { types: [], empty: 'no-types' },
    );
  });

  it('tipo comum que vale só para marcação: a seta recebe "not-for-arrow"', () => {
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

  it('tipo comum que vale só para seta: a marcação recebe "not-for-marking"', () => {
    const project = withTypes((types) => plain(types, 'arrow'));
    expect(
      offeredTypeChoice(project, 'LN', { kind: 'marking', floating: false }),
    ).toEqual({ types: [], empty: 'not-for-marking' });
  });

  it('flutuantes e comuns juntos: a marcação comum fica só com os comuns', () => {
    const project = withTypes((types) =>
      types.map((type, i) => (i === 0 ? type : (plain([type])[0] ?? type))),
    );
    const choice = offeredTypeChoice(project, 'LN', { kind: 'marking', floating: false });
    expect(choice.empty).toBeNull();
    expect(choice.types.map((type) => type.id)).toEqual(['tabela']);
  });
});
