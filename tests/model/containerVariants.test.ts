// Variants of a screen (stage #2034 VR1, decisions 4 to 8): the link between containers
// (`containers[].variantGroup`), its operations, `variantsOf` and the missing-types check.
import { describe, expect, it } from 'vitest';
import {
  ModelError,
  addBackgroundContainer,
  addContainer,
  addTypedAnnotation,
  applySpecialization,
  createMarking,
  createPage,
  deletePage,
  linkVariant,
  missingVariantTypes,
  moveRootsToPage,
  parseSpec,
  projectIndex,
  pruneLoneVariantGroups,
  removeContainer,
  removeItems,
  unlinkVariant,
  variantsOf,
  type Project,
} from '../../src/model';
import { emptyProject } from './fixtures';
import { idGen, layerOf } from './specFixtures';
import { v11Json, type Json } from './specV11Fixtures';

function codeOf(fn: () => unknown): string {
  try {
    fn();
  } catch (e) {
    if (e instanceof ModelError) return e.code;
    throw e;
  }
  return 'no-error';
}

/** Four background containers A, B, C, D on one page. */
function four(): Project {
  let p = emptyProject();
  for (const id of ['A', 'B', 'C', 'D']) {
    p = addBackgroundContainer(p, { id, width: 400, height: 300, background: '#FFFFFF' });
  }
  return p;
}

const groupOf = (p: Project, id: string) =>
  p.containers.find((c) => c.id === id)?.variantGroup;
const idsOf = (list: readonly { id: string }[]) => list.map((c) => c.id);

describe('linkVariant', () => {
  it('two containers without a group get a new one, the same for both', () => {
    const p = linkVariant(four(), 'A', 'B');
    expect(groupOf(p, 'A')).toBeTruthy();
    expect(groupOf(p, 'A')).toBe(groupOf(p, 'B'));
    expect(groupOf(p, 'C')).toBeUndefined();
    expect((groupOf(p, 'A') as string).length).toBeLessThanOrEqual(64);
  });

  it('a third container joins the existing group, linked from either side', () => {
    const ab = linkVariant(four(), 'A', 'B');
    const fromNew = linkVariant(ab, 'C', 'A');
    expect(groupOf(fromNew, 'C')).toBe(groupOf(ab, 'A'));
    const fromMember = linkVariant(ab, 'B', 'D');
    expect(groupOf(fromMember, 'D')).toBe(groupOf(ab, 'A'));
  });

  it('two groups merge into the target’s group', () => {
    let p = linkVariant(four(), 'A', 'B');
    p = linkVariant(p, 'C', 'D');
    const target = groupOf(p, 'D');
    const merged = linkVariant(p, 'A', 'D');
    for (const id of ['A', 'B', 'C', 'D']) expect(groupOf(merged, id)).toBe(target);
  });

  it('refuses a container linked to itself', () => {
    expect(codeOf(() => linkVariant(four(), 'A', 'A'))).toBe('variant-self');
  });

  it('refuses a container already in the same group', () => {
    const p = linkVariant(four(), 'A', 'B');
    expect(codeOf(() => linkVariant(p, 'A', 'B'))).toBe('variant-already-linked');
    expect(codeOf(() => linkVariant(p, 'B', 'A'))).toBe('variant-already-linked');
  });

  it('refuses an unknown container', () => {
    expect(codeOf(() => linkVariant(four(), 'A', 'X'))).toBe('not-found');
    expect(codeOf(() => linkVariant(four(), 'X', 'A'))).toBe('not-found');
  });

  it('a locked container links and unlinks', () => {
    const base = four();
    const locked = {
      ...base,
      containers: base.containers.map((c) => (c.id === 'A' ? { ...c, locked: true } : c)),
    };
    const linked = linkVariant(locked, 'A', 'B');
    expect(groupOf(linked, 'A')).toBeTruthy();
    expect(groupOf(unlinkVariant(linked, 'A'), 'A')).toBeUndefined();
  });
});

describe('unlinkVariant', () => {
  const abc = (): Project => linkVariant(linkVariant(four(), 'A', 'B'), 'C', 'A');

  it('unlinking one of three keeps the other two linked', () => {
    const p = unlinkVariant(abc(), 'C');
    expect(groupOf(p, 'C')).toBeUndefined();
    expect(groupOf(p, 'A')).toBeTruthy();
    expect(groupOf(p, 'A')).toBe(groupOf(p, 'B'));
  });

  it('unlinking one of two removes both keys', () => {
    const p = unlinkVariant(linkVariant(four(), 'A', 'B'), 'A');
    expect('variantGroup' in p.containers.find((c) => c.id === 'A')!).toBe(false);
    expect('variantGroup' in p.containers.find((c) => c.id === 'B')!).toBe(false);
  });

  it('a container without a group stays as it was', () => {
    const p = four();
    expect(unlinkVariant(p, 'A')).toBe(p);
  });
});

describe('pruneLoneVariantGroups', () => {
  const lone = (): Project => {
    const base = four();
    return {
      ...base,
      containers: base.containers.map((c) =>
        c.id === 'A' || c.id === 'B'
          ? { ...c, variantGroup: c.id === 'A' ? 'ga' : 'gb' }
          : c,
      ),
    };
  };

  it('drops the key of every group of one', () => {
    const p = pruneLoneVariantGroups(lone());
    expect(p.containers.some((c) => 'variantGroup' in c)).toBe(false);
  });

  it('with a list of groups, only those are looked at', () => {
    const p = pruneLoneVariantGroups(lone(), new Set(['ga']));
    expect(groupOf(p, 'A')).toBeUndefined();
    expect(groupOf(p, 'B')).toBe('gb');
  });

  it('keeps groups of two or more and returns the same project when nothing changes', () => {
    const linked = linkVariant(four(), 'A', 'B');
    expect(pruneLoneVariantGroups(linked)).toBe(linked);
  });
});

describe('removal paths leave no group of one', () => {
  const abc = (): Project => linkVariant(linkVariant(four(), 'A', 'B'), 'C', 'A');

  it('removeContainer with a group of two drops the key of the other', () => {
    const p = removeContainer(linkVariant(four(), 'A', 'B'), 'A');
    expect('variantGroup' in p.containers.find((c) => c.id === 'B')!).toBe(false);
  });

  it('removeContainer with a group of three keeps the other two linked', () => {
    const p = removeContainer(abc(), 'C');
    expect(groupOf(p, 'A')).toBeTruthy();
    expect(groupOf(p, 'A')).toBe(groupOf(p, 'B'));
  });

  it('removeItems with a container prunes the same way', () => {
    const p = removeItems(linkVariant(four(), 'A', 'B'), [{ kind: 'image', id: 'A' }]);
    expect('variantGroup' in p.containers.find((c) => c.id === 'B')!).toBe(false);
  });

  it('a group of one that was already there and is not touched stays', () => {
    const base = four();
    const withLone = {
      ...base,
      containers: base.containers.map((c) =>
        c.id === 'D' ? { ...c, variantGroup: 'alone' } : c,
      ),
    };
    const p = removeContainer(linkVariant(withLone, 'A', 'B'), 'A');
    expect(groupOf(p, 'D')).toBe('alone');
  });

  /** A and B on different pages, linked. */
  function acrossPages(): Project {
    let p = createPage(four(), { id: 'PG2', name: 'Page 2' });
    p = moveRootsToPage(p, ['B'], 'PG2');
    return linkVariant(p, 'A', 'B');
  }

  it('deletePage with discard drops the key of the variant left on the other page', () => {
    const p = deletePage(acrossPages(), 'PG2', { discard: true });
    expect(p.containers.some((c) => c.id === 'B')).toBe(false);
    expect('variantGroup' in p.containers.find((c) => c.id === 'A')!).toBe(false);
  });

  it('deletePage moving the content keeps the link', () => {
    const p = deletePage(acrossPages(), 'PG2', { moveTo: 'PG1' });
    expect(groupOf(p, 'A')).toBeTruthy();
    expect(groupOf(p, 'A')).toBe(groupOf(p, 'B'));
  });

  it('moving a container to another page keeps the link', () => {
    const p = acrossPages();
    const moved = moveRootsToPage(p, ['A'], 'PG2');
    expect(groupOf(moved, 'A')).toBe(groupOf(moved, 'B'));
  });
});

describe('addContainer and addBackgroundContainer', () => {
  it('accept a variantGroup', () => {
    const base = linkVariant(four(), 'A', 'B');
    const group = groupOf(base, 'A') as string;
    const withFile = addContainer(base, {
      id: 'E',
      file: 'images/e.png',
      width: 100,
      height: 100,
      variantGroup: group,
    });
    expect(groupOf(withFile, 'E')).toBe(group);
    const withBackground = addBackgroundContainer(base, {
      id: 'F',
      width: 100,
      height: 100,
      background: '#000000',
      variantGroup: group,
    });
    expect(groupOf(withBackground, 'F')).toBe(group);
  });

  it('write no key without a group', () => {
    const p = addBackgroundContainer(four(), {
      id: 'F',
      width: 100,
      height: 100,
      background: '#000000',
    });
    expect('variantGroup' in p.containers.find((c) => c.id === 'F')!).toBe(false);
  });
});

describe('variantsOf', () => {
  it('the index lists the other members in project order', () => {
    let p = linkVariant(four(), 'C', 'A');
    p = linkVariant(p, 'D', 'A');
    expect(idsOf(variantsOf(p, 'A'))).toEqual(['C', 'D']);
    expect(idsOf(variantsOf(p, 'D'))).toEqual(['A', 'C']);
    expect(variantsOf(p, 'B')).toEqual([]);
    expect(projectIndex(p).variantsOf.get('A')).toBe(variantsOf(p, 'A'));
  });

  it('a group of one and an unknown container give nothing', () => {
    const base = four();
    const p = {
      ...base,
      containers: base.containers.map((c) =>
        c.id === 'A' ? { ...c, variantGroup: 'alone' } : c,
      ),
    };
    expect(variantsOf(p, 'A')).toEqual([]);
    expect(variantsOf(p, 'nope')).toEqual([]);
    expect(projectIndex(p).variantsOf.has('A')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Missing types (decision 6)

const SETS = [
  {
    id: 'window',
    name: 'Window',
    by: 'width',
    classes: [
      { id: 'compact', name: 'Compact', below: 600 },
      { id: 'expanded', name: 'Expanded' },
    ],
  },
  {
    id: 'platform',
    name: 'Platform',
    classes: [
      { id: 'android', name: 'Android' },
      { id: 'ios', name: 'iOS' },
    ],
  },
];

function spec(edit?: (types: Json[]) => void) {
  const json = v11Json((s) => {
    s.containerClasses = SETS;
    const types = s.layers[0].annotationTypes as Json[];
    types.find((t) => t.id === 'image')!.appliesIn = { window: ['expanded'] };
    types.find((t) => t.id === 'text')!.appliesIn = { platform: ['android'] };
    edit?.(types);
  }, 21);
  const result = parseSpec(json);
  if (!result.ok) throw new Error(JSON.stringify(result.issues));
  return result.spec;
}

/**
 * `COMPACT` (400 px wide) and `EXPANDED` (900 px) linked as variants, in a project with the spec
 * applied. Each marking is typed with the type it is named after.
 */
function typed(
  inCompact: readonly string[],
  inExpanded: readonly string[],
  edit?: (types: Json[]) => void,
): Project {
  let p = applySpecialization(emptyProject(), spec(edit), { newId: idGen('SL') });
  p = addBackgroundContainer(p, {
    id: 'COMPACT',
    width: 400,
    height: 800,
    background: '#FFFFFF',
  });
  p = addBackgroundContainer(p, {
    id: 'EXPANDED',
    width: 900,
    height: 800,
    background: '#FFFFFF',
  });
  const layerId = layerOf(p, 's', 'componentes');
  let n = 0;
  const mark = (container: string, typeId: string) => {
    n += 1;
    p = createMarking(p, {
      id: `M${n}`,
      containerId: container,
      rect: { x: 10, y: 20 * n, width: 20, height: 20 },
    });
    p = addTypedAnnotation(p, {
      id: `A${n}`,
      markingId: `M${n}`,
      layerId,
      type: { specId: 's', typeId },
    });
  };
  for (const t of inCompact) mark('COMPACT', t);
  for (const t of inExpanded) mark('EXPANDED', t);
  return linkVariant(p, 'COMPACT', 'EXPANDED');
}

const summary = (p: Project, id: string) =>
  missingVariantTypes(p, id).map((m) => `${m.type.typeId}<-${m.variants.join(',')}`);

describe('missingVariantTypes', () => {
  it('lists a type the other variant maps and this one lacks, with that variant', () => {
    const p = typed(['button'], ['button', 'text']);
    // `text` applies in the `android` platform only: neither container has a platform class, so it counts.
    expect(summary(p, 'COMPACT')).toEqual(['text<-EXPANDED']);
    expect(summary(p, 'EXPANDED')).toEqual([]);
  });

  it('a type present in this container is not missing even if it is only on one marking', () => {
    const p = typed(['button', 'button'], ['button']);
    expect(summary(p, 'COMPACT')).toEqual([]);
    expect(summary(p, 'EXPANDED')).toEqual([]);
  });

  it('a type that `appliesIn` excludes from this container’s class is skipped', () => {
    // `image` applies in `expanded` only: COMPACT (400 px, class compact) lacks it on purpose.
    const p = typed(['button'], ['button', 'image']);
    expect(summary(p, 'COMPACT')).toEqual([]);
    // `image` is on COMPACT (a mistake, but a fact) and EXPANDED lacks it: it applies in expanded, so it is listed.
    const q = typed(['button', 'image'], ['button']);
    expect(summary(q, 'EXPANDED')).toEqual(['image<-COMPACT']);
  });

  it('a type whose set gives this container no class is not skipped', () => {
    // `text` lists the chosen `platform` set; nothing chose a platform, so there is no class to exclude.
    const p = typed(['button'], ['text']);
    expect(summary(p, 'COMPACT')).toEqual(['text<-EXPANDED']);
    // Once the container has an excluded platform class, the type is skipped.
    const chosen = {
      ...p,
      containers: p.containers.map((c) =>
        c.id === 'COMPACT' ? { ...c, classes: { platform: 'ios' } } : c,
      ),
    };
    expect(summary(chosen, 'COMPACT')).toEqual([]);
  });

  it('lists several variants for the same type', () => {
    let p = typed(['button'], ['button', 'text']);
    p = addBackgroundContainer(p, {
      id: 'THIRD',
      width: 700,
      height: 800,
      background: '#FFFFFF',
    });
    p = createMarking(p, {
      id: 'M99',
      containerId: 'THIRD',
      rect: { x: 5, y: 5, width: 20, height: 20 },
    });
    p = addTypedAnnotation(p, {
      id: 'A99',
      markingId: 'M99',
      layerId: layerOf(p, 's', 'componentes'),
      type: { specId: 's', typeId: 'text' },
    });
    p = linkVariant(p, 'THIRD', 'COMPACT');
    expect(summary(p, 'COMPACT')).toEqual(['text<-EXPANDED,THIRD']);
  });

  it('free annotations, arrows and canvas markings do not count', () => {
    let p = typed(['button'], ['button']);
    // A canvas marking typed `text` and a free-form annotation on an EXPANDED marking.
    p = createMarking(p, {
      id: 'K',
      containerId: null,
      rect: { x: 5000, y: 5000, width: 50, height: 50 },
    });
    p = addTypedAnnotation(p, {
      id: 'AK',
      markingId: 'K',
      layerId: layerOf(p, 's', 'componentes'),
      type: { specId: 's', typeId: 'text' },
    });
    expect(summary(p, 'COMPACT')).toEqual([]);
  });

  it('a container without variants, and an unknown one, have nothing missing', () => {
    const p = typed(['button'], ['text']);
    const unlinked = unlinkVariant(p, 'COMPACT');
    expect(missingVariantTypes(unlinked, 'COMPACT')).toEqual([]);
    expect(missingVariantTypes(p, 'nope')).toEqual([]);
  });
});
