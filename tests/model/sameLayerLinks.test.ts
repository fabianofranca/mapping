// Link between annotations of the same layer (formatVersion 13, schema v15): who can be an owner,
// cycles, roles, issues and the code blueprint.
import { describe, expect, it } from 'vitest';
import {
  ModelError,
  codeBlueprint,
  deserialize,
  getAnnotationIssues,
  linkedByRole,
  migrations,
  serialize,
  setAnnotationParent,
  specFiles,
  validAnnotationOwners,
  validateProject,
  addAnnotation,
  addLayer,
  type BlueprintAnnotation,
  type Project,
} from '../../src/model';
import { add, sameLayerProject } from './sameLayerFixtures';

const ids = (xs: readonly { id: string }[]) => xs.map((a) => a.id).sort();
const codeOf = (fn: () => unknown): string | null => {
  try {
    fn();
    return null;
  } catch (e) {
    if (e instanceof ModelError) return e.code;
    throw e;
  }
};
/** Free annotations `F1` and `F2` in a free layer (a specialization layer only accepts typed ones). */
const free = (p: Project): Project => {
  let q = addLayer(p, { id: 'LF', name: 'Free', color: '#757575' });
  for (const id of ['F1', 'F2']) {
    q = addAnnotation(q, { id, markingId: 'M1', layerId: 'LF' });
  }
  return q;
};
const codes = (p: Project, id: string) => getAnnotationIssues(p, id).map((i) => i.code);

/** onClick `C1` → request `R1` → request `R2` (R2 owns R1? no: R1 is a child of C1, R2 a child of R1). */
function chain(): Project {
  let p = sameLayerProject();
  p = add(p, 'B1', 'button');
  p = add(p, 'C1', 'onClick');
  p = add(p, 'R1', 'request');
  p = add(p, 'R2', 'request');
  return p;
}

describe('same-layer owner: adding', () => {
  it('passes when the owner type accepts the child type', () => {
    let p = chain();
    p = add(p, 'N1', 'navigate', 'R1', 'onSuccess');
    p = add(p, 'R3', 'request', 'R1', 'onFailure');
    expect(p.annotations.find((a) => a.id === 'N1')?.parentAnnotationId).toBe('R1');
    expect(validateProject(p)).toEqual([]);
  });

  it('gives invalid-annotation-parent when the owner type does not accept it', () => {
    let p = chain();
    p = add(p, 'N1', 'navigate');
    expect(codeOf(() => add(p, 'N2', 'navigate', 'N1'))).toBe(
      'invalid-annotation-parent',
    );
    expect(codeOf(() => add(p, 'C2', 'onClick', 'C1'))).toBe('invalid-annotation-parent');
  });
});

describe('validAnnotationOwners with the same layer', () => {
  it('a typed one offers same-layer owners that the type accepts', () => {
    const p = add(add(chain(), 'N1', 'navigate'), 'R3', 'request', 'C1');
    // N1 (navigate): only request accepts it; B1 (another layer) does not accept navigate.
    expect(ids(validAnnotationOwners(p, 'N1'))).toEqual(['R1', 'R2', 'R3']);
    // R1 cannot own itself; onClick and the other requests accept request.
    expect(ids(validAnnotationOwners(p, 'R1'))).toEqual(['C1', 'R2', 'R3']);
  });

  it('excludes itself, the ones linked to it (cycle) and an owner that does not accept the type', () => {
    let p = chain();
    p = setAnnotationParent(p, 'R2', 'R1');
    // R2 is linked to R1: it cannot own it; only C1 is left.
    expect(ids(validAnnotationOwners(p, 'R1'))).toEqual(['C1']);
    expect(ids(validAnnotationOwners(p, 'R2'))).toEqual(['C1', 'R1']);
  });

  it('a free annotation never gets a same-layer owner', () => {
    let p = chain();
    p = free(p);
    // F2 is in the same layer as F1: it is left out; the typed ones from other layers come in.
    expect(ids(validAnnotationOwners(p, 'F1'))).toEqual(['B1', 'C1', 'R1', 'R2']);
    expect(codeOf(() => setAnnotationParent(p, 'F1', 'F2'))).toBe(
      'invalid-annotation-parent',
    );
  });
});

describe('cycle in the same layer', () => {
  it('A→B→A is refused when linking, and so is A→A', () => {
    let p = chain();
    p = setAnnotationParent(p, 'R2', 'R1');
    expect(codeOf(() => setAnnotationParent(p, 'R1', 'R2'))).toBe(
      'invalid-annotation-parent',
    );
    expect(codeOf(() => setAnnotationParent(p, 'R1', 'R1'))).toBe(
      'invalid-annotation-parent',
    );
  });

  const closed = (p: Project): Project => ({
    ...p,
    annotations: p.annotations.map((a) =>
      a.id === 'R1' ? { ...a, parentAnnotationId: 'R2' } : a,
    ),
  });

  it('a proposal that would close the cycle is blocked in validateProject', () => {
    const p = setAnnotationParent(chain(), 'R2', 'R1');
    expect(validateProject(closed(p)).map((i) => i.code)).toContain('annotation-cycle');
  });

  it('the file with a cycle is refused when opening', () => {
    const p = setAnnotationParent(chain(), 'R2', 'R1');
    const result = deserialize(serialize(closed(p)), migrations, specFiles(p));
    expect(result.ok).toBe(false);
    if (result.ok || result.error.code !== 'invariant-violation') {
      throw new Error('expected a violation');
    }
    expect(result.error.issues.map((i) => i.code)).toContain('annotation-cycle');
  });
});

describe('invariant and issue', () => {
  const force = (p: Project, id: string, owner: string): Project => ({
    ...p,
    annotations: p.annotations.map((a) =>
      a.id === id ? { ...a, parentAnnotationId: owner } : a,
    ),
  });

  it('a typed child with a same-layer owner does not violate the invariant', () => {
    const p = add(chain(), 'N1', 'navigate', 'R1', 'onSuccess');
    expect(validateProject(p)).toEqual([]);
  });

  it('a type the owner does not accept becomes the owner-not-allowed issue, not a violation', () => {
    const p = force(add(chain(), 'N1', 'navigate'), 'C1', 'N1');
    expect(validateProject(p).map((i) => i.code)).not.toContain(
      'annotation-parent-same-layer',
    );
    expect(codes(p, 'C1')).toContain('owner-not-allowed');
  });

  it('a free one with a same-layer owner still violates the invariant', () => {
    let p = chain();
    p = free(p);
    expect(validateProject(force(p, 'F1', 'F2')).map((i) => i.code)).toContain(
      'annotation-parent-same-layer',
    );
  });
});

describe('roles with a same-layer owner', () => {
  it('two children in the same role stay in array order', () => {
    let p = chain();
    p = add(p, 'N1', 'navigate', 'R1', 'onSuccess');
    p = add(p, 'N2', 'navigate', 'R1', 'onSuccess');
    p = add(p, 'N3', 'navigate', 'R1', 'onFailure');
    const owner = p.annotations.find((a) => a.id === 'R1');
    if (!owner) throw new Error('no R1');
    const rows = linkedByRole(p, owner)?.rows ?? [];
    expect(rows.map((r) => [r.role.id, r.items.map((a) => a.id)])).toEqual([
      ['onSuccess', ['N1', 'N2']],
      ['onFailure', ['N3']],
    ]);
  });

  it('missing-role and unknown-role work as with an owner from another layer', () => {
    let p = add(chain(), 'N1', 'navigate', 'R1');
    expect(codes(p, 'N1')).toEqual(['missing-role']);
    p = {
      ...p,
      annotations: p.annotations.map((a) =>
        a.id === 'N1' ? { ...a, parentRole: 'vanished' } : a,
      ),
    };
    expect(codes(p, 'N1')).toEqual(['unknown-role']);
  });
});

describe('code blueprint with a chain in the same layer', () => {
  it('Click → request → navigation comes out nested, without repeating at the root', () => {
    let p = chain();
    p = setAnnotationParent(add(p, 'N1', 'navigate', 'R1', 'onSuccess'), 'C1', 'B1');
    p = setAnnotationParent(p, 'R1', 'C1');
    const root = codeBlueprint(p, 'M1', 'web').root;
    const shape = (a: BlueprintAnnotation): unknown => ({
      [a.typeId]: a.linked.map(shape),
    });
    expect(root.annotations.filter((a) => a.annotationId !== 'R2').map(shape)).toEqual([
      { button: [{ onClick: [{ request: [{ navigate: [] }] }] }] },
    ]);
    // R2 has no owner: it appears loose at the root.
    expect(root.annotations.map((a) => a.annotationId)).toEqual(['B1', 'R2']);
  });
});
