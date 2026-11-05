// Resolvedor único dos filhos de um tipo (etapa #559, PD1, decisão 10): cláusulas por camada e
// grupo, memoizado por especialização, e as três leituras que ele substitui.
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

describe('childTypeIds: o conjunto de filhos de um tipo', () => {
  it('cláusula sem groups: a camada inteira, na ordem da camada', () => {
    const spec = parsedV11();
    expect(childTypeIds(spec, 'button')).toEqual([
      'onClick',
      'onHold',
      'navigate',
      'track',
      'both',
    ]);
  });

  it('cláusula com groups: só os tipos da camada que estão em algum grupo, na ordem da camada', () => {
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

  it('lista mista: união dos itens na ordem deles, sem repetir (a 1ª posição vale)', () => {
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

  it('um tipo em vários grupos entra uma vez só', () => {
    const spec = parsedV11((s) => {
      owner(s).allowedChildren = [{ layer: 'eventos', groups: ['navegacao', 'dados'] }];
    });
    const ids = childTypeIds(spec, 'button');
    expect(ids.filter((id) => id === 'both')).toHaveLength(1);
  });

  it('tipo sem allowedChildren, de outro dono ou inexistente: vazio', () => {
    const spec = parsedV11();
    expect(childTypeIds(spec, 'image')).toEqual([]);
    expect(childTypeIds(spec, 'nada')).toEqual([]);
  });

  it('ids em texto continuam valendo', () => {
    const spec = parsedV11((s) => (owner(s).allowedChildren = ['onHold', 'onClick']));
    expect(childTypeIds(spec, 'button')).toEqual(['onHold', 'onClick']);
  });

  it('é memoizado pela especialização', () => {
    const spec = parsedV11();
    expect(childTypeIds(spec, 'button')).toBe(childTypeIds(spec, 'button'));
    expect(ownerTypeIds(spec, 'onClick')).toBe(ownerTypeIds(spec, 'onClick'));
    const other = parsedV11();
    expect(childTypeIds(other, 'button')).not.toBe(childTypeIds(spec, 'button'));
    expect(childTypeIds(other, 'button')).toEqual(childTypeIds(spec, 'button'));
  });
});

describe('isChildTypeAllowed e ownerTypeIds', () => {
  it('conferem o conjunto resolvido', () => {
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
    expect(ownerTypeIds(spec, 'nada')).toEqual([]);
  });

  it('os donos saem na ordem da especialização', () => {
    const spec = parsedV11((s) => {
      s.layers[0].annotationTypes[2].allowedChildren = [{ layer: 'eventos' }];
      s.layers[0].annotationTypes[1].allowedChildren = [{ layer: 'eventos' }];
    });
    expect(ownerTypeIds(spec, 'onHold')).toEqual(['button', 'image', 'text']);
  });
});

describe('as leituras do projeto passam pelo resolvedor', () => {
  /** Projeto com a especialização, uma marcação `M1` e um `button` (`A1`) nela. */
  function project(edit?: (s: Json) => void): Project {
    let p = applySpecialization(emptyProject(), parsedV11(edit), { newId: idGen('L') });
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

  it('childTypesOf lista os filhos da cláusula, com a camada do projeto de cada um', () => {
    const p = project((s) => {
      owner(s).allowedChildren = [{ layer: 'eventos', groups: ['dados'] }, 'onHold'];
    });
    const children = childTypesOf(p, 'A1');
    expect(children.map((c) => c.type.typeId)).toEqual(['track', 'both', 'onHold']);
    expect(children.map((c) => c.layer?.id)).toEqual(
      Array(3).fill(layerOf(p, 's', 'eventos')),
    );
  });

  it('isAllowedOwner e ownerTypesOf acompanham a cláusula', () => {
    const p = project((s) => {
      owner(s).allowedChildren = [{ layer: 'eventos', groups: ['navegacao'] }];
    });
    const a1 = p.annotations.find((a) => a.id === 'A1');
    if (!a1) throw new Error('A1');
    expect(isAllowedOwner(p, { specId: 's', typeId: 'navigate' }, a1)).toBe(true);
    expect(isAllowedOwner(p, { specId: 's', typeId: 'track' }, a1)).toBe(false);
    expect(isAllowedOwner(p, { specId: 'outra', typeId: 'navigate' }, a1)).toBe(false);
    expect(
      ownerTypesOf(p, { specId: 's', typeId: 'navigate' }).map((t) => t.id),
    ).toEqual(['button']);
    expect(ownerTypesOf(p, { specId: 's', typeId: 'track' })).toEqual([]);
  });
});
