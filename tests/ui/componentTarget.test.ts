import { afterEach, describe, expect, it } from 'vitest';
import type { Project } from '../../src/model';
import { locale } from '../../src/store/settings';
import { addLabel, slotTargetName } from '../../src/ui/componentTarget';
import { marking, sampleProject } from '../model/fixtures';
import { withNoteInstance } from '../model/notesFixtures';

// Label of Add with a target in a component with a slot (ME2 test round, R12.12):
// reuses the label of the marking (name; with no name, the one of the type it draws).
function project(): Project {
  return withNoteInstance(sampleProject());
}

describe('Add label inside a component with a slot', () => {
  afterEach(() => {
    locale.value = 'en-US';
  });

  it('uses the marking name when it has one', () => {
    const p = project();
    expect(slotTargetName(p, { id: 'N1', name: 'Product list' })).toBe(
      'Product list',
    );
  });

  it('with no name, uses the name of the type the instance draws', () => {
    locale.value = 'en-US';
    const p = project();
    const name = slotTargetName(p, marking(p, 'N1'));
    // pt-BR kept: shared fixture data asserted by tests/model, tests/components (type name of notesFixtures)
    expect(name).toBe('Nota');
    expect(
      addLabel({ containerId: 'A', parentId: 'M', destination: { kind: 'slot', name } }),
    ).toBe('Add inside Nota');
    locale.value = 'pt-BR';
    // pt-BR kept: the locale switch is the object of this assertion
    expect(
      addLabel({ containerId: 'A', parentId: 'M', destination: { kind: 'slot', name } }),
    ).toBe('Adicionar dentro de Nota');
  });

  it('with no name and no component type, keeps the default name', () => {
    locale.value = 'en-US';
    const p = project();
    expect(slotTargetName(p, marking(p, 'M4'))).toBe('Unnamed marking');
  });
});
