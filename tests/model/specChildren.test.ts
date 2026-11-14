// Single resolver of a type's children (stage #559, PD1, decision 10): clauses by layer and
// group, memoized per specialization, and the three reads that it replaces.
// pt-BR kept: shared fixture data (specV11Fixtures: layers `componentes`/`eventos`, groups `navegacao`/`dados`), asserted by tests/mcp
import { describe, expect, it } from 'vitest';
import {
  addContainer,
  addTypedAnnotation,
  applySpecialization,
  createMarking,
  childTypeIds,
  childTypesOf,
  isAllowedOwner,
  isChildTypeAllowed,
  ownerTypeIds,
  ownerTypesOf,
  type Project,
} from '../../src/model';
import { emptyProject } from './fixtures';
import { idGen, layerOf } from './specFixtures';
import { parsedV11, type Json } from './specV11Fixtures';

const owner = (s: Json) => s.layers[0].annotationTypes[0] as Json;

describe('childTypeIds: the set of children of a type', () => {
  it('clause without groups: the whole layer, in the layer's order', () => {
    const spec = parsedV11();
    expect(childTypeIds(spec, 'button')).toEqual([
      'onClick',
      'onHold',
      'navigate',
      'track',
      'both',
    ]);
  });

  it('clause with groups: only the layer's types that are in some group, in the layer's order', () => {
    const spec = parsedV11((s) => {
      owner(s).allowedChildren = [{ layer: 'eventos', groups: ['dados', 'navegacao'] }];
    });
    expect(childTypeIds(spec, 'button')).toEqual([
      'onClick',
      'navigate',
      'track',
      'both',
    ]);
  });

  it('mixed list: union of the items in their order, without repeating (the 1st position wins)', () => {
    const spec = parsedV11((s) => {
      owner(s).allowedChildren = [
        'track',
        { layer: 'eventos', groups: ['navegacao'] },
        'onClick',
        { layer: 'eventos' },
      ];
    });
    expect(childTypeIds(spec, 'button')).toEqual([
      'track',
      'onClick',
      'navigate',
      'both',
      'onHold',
    ]);
  });

  it('a type in several groups enters only once', () => {
    const spec = parsedV11((s) => {
      owner(s).allowedChildren = [{ layer: 'eventos', groups: ['navegacao', 'dados'] }];
    });
    const ids = childTypeIds(spec, 'button');
    expect(ids.filter((id) => id === 'both')).toHaveLength(1);
  });

  it('type without allowedChildren, of another owner or nonexistent: empty', () => {
    const spec = parsedV11();
    expect(childTypeIds(spec, 'image')).toEqual([]);
    expect(childTypeIds(spec, 'nothing')).toEqual([]);
  });

  it('text ids are still valid', () => {
    const spec = parsedV11((s) => (owner(s).allowedChildren = ['onHold', 'onClick']));
    expect(childTypeIds(spec, 'button')).toEqual(['onHold', 'onClick']);
  });

  it('is memoized per specialization', () => {
    const spec = parsedV11();
    expect(childTypeIds(spec, 'button')).toBe(childTypeIds(spec, 'button'));
    expect(ownerTypeIds(spec, 'onClick')).toBe(ownerTypeIds(spec, 'onClick'));
    const other = parsedV11();
    expect(childTypeIds(other, 'button')).not.toBe(childTypeIds(spec, 'button'));
    expect(childTypeIds(other, 'button')).toEqual(childTypeIds(spec, 'button'));
  });
});

describe('isChildTypeAllowed and ownerTypeIds', () => {
  it('check the resolved set', () => {
    const spec = parsedV11((s) => {
      owner(s).allowedChildren = [{ layer: 'eventos', groups: ['dados'] }];
      s.layers[0].annotationTypes[1].allowedChildren = ['onClick'];
    });
    expect(isChildTypeAllowed(spec, 'button', 'track')).toBe(true);
    expect(isChildTypeAllowed(spec, 'button', 'onClick')).toBe(false);
    expect(isChildTypeAllowed(spec, 'image', 'onClick')).toBe(true);
    expect(isChildTypeAllowed(spec, 'text', 'onClick')).toBe(false);
    expect(ownerTypeIds(spec, 'both')).toEqual(['button']);
    expect(ownerTypeIds(spec, 'onClick')).toEqual(['image']);
    expect(ownerTypeIds(spec, 'nothing')).toEqual([]);
  });

  it('the owners come out in the specialization's order', () => {
    const spec = parsedV11((s) => {
      s.layers[0].annotationTypes[2].allowedChildren = [{ layer: 'eventos' }];
      s.layers[0].annotationTypes[1].allowedChildren = [{ layer: 'eventos' }];
    });
    expect(ownerTypeIds(spec, 'onHold')).toEqual(['button', 'image', 'text']);
  });
});

describe('the project reads go through the resolver', () => {
  /** Project with the specialization, a marking `M1` and a `button` (`A1`) on it. */
  function project(edit?: (s: Json) => void): Project {
    let p = applySpecialization(emptyProject(), parsedV11(edit), { newId: idGen('SL') });
    p = addContainer(p, { id: 'I1', file: 'a.png', width: 100, height: 100 });
    p = createMarking(p, {
      id: 'M1',
      containerId: 'I1',
      rect: { x: 0, y: 0, width: 50, height: 50 },
      name: 'M',
    });
    return addTypedAnnotation(p, {
      id: 'A1',
      markingId: 'M1',
      layerId: layerOf(p, 's', 'componentes'),
      type: { specId: 's', typeId: 'button' },
      parentAnnotationId: null,
    });
  }

  it('childTypesOf lists the clause's children, with each one's project layer', () => {
    const p = project((s) => {
      owner(s).allowedChildren = [{ layer: 'eventos', groups: ['dados'] }, 'onHold'];
    });
    const children = childTypesOf(p, 'A1');
    expect(children.map((c) => c.type.typeId)).toEqual(['track', 'both', 'onHold']);
    expect(children.map((c) => c.layer?.id)).toEqual(
      Array(3).fill(layerOf(p, 's', 'eventos')),
    );
  });

  it('isAllowedOwner and ownerTypesOf follow the clause', () => {
    const p = project((s) => {
      owner(s).allowedChildren = [{ layer: 'eventos', groups: ['navegacao'] }];
    });
    const a1 = p.annotations.find((a) => a.id === 'A1');
    if (!a1) throw new Error('A1');
    expect(isAllowedOwner(p, { specId: 's', typeId: 'navigate' }, a1)).toBe(true);
    expect(isAllowedOwner(p, { specId: 's', typeId: 'track' }, a1)).toBe(false);
    expect(isAllowedOwner(p, { specId: 'other', typeId: 'navigate' }, a1)).toBe(false);
    expect(ownerTypesOf(p, { specId: 's', typeId: 'navigate' }).map((t) => t.id)).toEqual(
      ['button'],
    );
    expect(ownerTypesOf(p, { specId: 's', typeId: 'track' })).toEqual([]);
  });
});
