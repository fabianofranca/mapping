// Vínculo entre anotações da mesma camada (formatVersion 13, schema v15): quem pode ser dona,
// ciclos, papéis, pendências e a planta de código.
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
/** Anotações livres `F1` e `F2` numa camada livre (camada de especialização só aceita tipadas). */
const free = (p: Project): Project => {
  let q = addLayer(p, { id: 'LF', name: 'Livre', color: '#757575' });
  for (const id of ['F1', 'F2']) {
    q = addAnnotation(q, { id, markingId: 'M1', layerId: 'LF' });
  }
  return q;
};
const codes = (p: Project, id: string) => getAnnotationIssues(p, id).map((i) => i.code);

/** onClick `C1` → request `R1` → request `R2` (R2 dona R1? não: R1 filha de C1, R2 filha de R1). */
function chain(): Project {
  let p = sameLayerProject();
  p = add(p, 'B1', 'button');
  p = add(p, 'C1', 'onClick');
  p = add(p, 'R1', 'request');
  p = add(p, 'R2', 'request');
  return p;
}

describe('dona da mesma camada: adicionar', () => {
  it('passa quando o tipo da dona aceita o tipo da filha', () => {
    let p = chain();
    p = add(p, 'N1', 'navigate', 'R1', 'onSuccess');
    p = add(p, 'R3', 'request', 'R1', 'onFailure');
    expect(p.annotations.find((a) => a.id === 'N1')?.parentAnnotationId).toBe('R1');
    expect(validateProject(p)).toEqual([]);
  });

  it('dá invalid-annotation-parent quando o tipo da dona não aceita', () => {
    let p = chain();
    p = add(p, 'N1', 'navigate');
    expect(codeOf(() => add(p, 'N2', 'navigate', 'N1'))).toBe(
      'invalid-annotation-parent',
    );
    expect(codeOf(() => add(p, 'C2', 'onClick', 'C1'))).toBe('invalid-annotation-parent');
  });
});

describe('validAnnotationOwners com a mesma camada', () => {
  it('a tipada oferece donas da mesma camada que o tipo aceita', () => {
    const p = add(add(chain(), 'N1', 'navigate'), 'R3', 'request', 'C1');
    // N1 (navigate): aceita-a só request; B1 (outra camada) não aceita navigate.
    expect(ids(validAnnotationOwners(p, 'N1'))).toEqual(['R1', 'R2', 'R3']);
    // R1 não pode ter como dona a si mesma; onClick e as outras requests aceitam request.
    expect(ids(validAnnotationOwners(p, 'R1'))).toEqual(['C1', 'R2', 'R3']);
  });

  it('exclui a própria, as vinculadas a ela (ciclo) e dona que não aceita o tipo', () => {
    let p = chain();
    p = setAnnotationParent(p, 'R2', 'R1');
    // R2 é vinculada a R1: não pode ser dona dela; só C1 sobra.
    expect(ids(validAnnotationOwners(p, 'R1'))).toEqual(['C1']);
    expect(ids(validAnnotationOwners(p, 'R2'))).toEqual(['C1', 'R1']);
  });

  it('a anotação livre nunca recebe dona da mesma camada', () => {
    let p = chain();
    p = free(p);
    // F2 está na mesma camada que F1: fica de fora; as tipadas de outras camadas entram.
    expect(ids(validAnnotationOwners(p, 'F1'))).toEqual(['B1', 'C1', 'R1', 'R2']);
    expect(codeOf(() => setAnnotationParent(p, 'F1', 'F2'))).toBe(
      'invalid-annotation-parent',
    );
  });
});

describe('ciclo na mesma camada', () => {
  it('A→B→A é recusado ao vincular, e A→A também', () => {
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

  it('uma proposta que fecharia o ciclo é bloqueada em validateProject', () => {
    const p = setAnnotationParent(chain(), 'R2', 'R1');
    expect(validateProject(closed(p)).map((i) => i.code)).toContain('annotation-cycle');
  });

  it('o arquivo com ciclo é recusado ao abrir', () => {
    const p = setAnnotationParent(chain(), 'R2', 'R1');
    const result = deserialize(serialize(closed(p)), migrations, specFiles(p));
    expect(result.ok).toBe(false);
    if (result.ok || result.error.code !== 'invariant-violation') {
      throw new Error('esperava violação');
    }
    expect(result.error.issues.map((i) => i.code)).toContain('annotation-cycle');
  });
});

describe('invariante e pendência', () => {
  const force = (p: Project, id: string, owner: string): Project => ({
    ...p,
    annotations: p.annotations.map((a) =>
      a.id === id ? { ...a, parentAnnotationId: owner } : a,
    ),
  });

  it('filha tipada com dona da mesma camada não viola o invariante', () => {
    const p = add(chain(), 'N1', 'navigate', 'R1', 'onSuccess');
    expect(validateProject(p)).toEqual([]);
  });

  it('tipo que a dona não aceita vira a pendência owner-not-allowed, não violação', () => {
    const p = force(add(chain(), 'N1', 'navigate'), 'C1', 'N1');
    expect(validateProject(p).map((i) => i.code)).not.toContain(
      'annotation-parent-same-layer',
    );
    expect(codes(p, 'C1')).toContain('owner-not-allowed');
  });

  it('a livre com dona da mesma camada segue violando o invariante', () => {
    let p = chain();
    p = free(p);
    expect(validateProject(force(p, 'F1', 'F2')).map((i) => i.code)).toContain(
      'annotation-parent-same-layer',
    );
  });
});

describe('papéis com dona da mesma camada', () => {
  it('dois filhos no mesmo papel ficam na ordem do array', () => {
    let p = chain();
    p = add(p, 'N1', 'navigate', 'R1', 'onSuccess');
    p = add(p, 'N2', 'navigate', 'R1', 'onSuccess');
    p = add(p, 'N3', 'navigate', 'R1', 'onFailure');
    const owner = p.annotations.find((a) => a.id === 'R1');
    if (!owner) throw new Error('sem R1');
    const rows = linkedByRole(p, owner)?.rows ?? [];
    expect(rows.map((r) => [r.role.id, r.items.map((a) => a.id)])).toEqual([
      ['onSuccess', ['N1', 'N2']],
      ['onFailure', ['N3']],
    ]);
  });

  it('missing-role e unknown-role funcionam como com dona de outra camada', () => {
    let p = add(chain(), 'N1', 'navigate', 'R1');
    expect(codes(p, 'N1')).toEqual(['missing-role']);
    p = {
      ...p,
      annotations: p.annotations.map((a) =>
        a.id === 'N1' ? { ...a, parentRole: 'sumiu' } : a,
      ),
    };
    expect(codes(p, 'N1')).toEqual(['unknown-role']);
  });
});

describe('planta de código com cadeia na mesma camada', () => {
  it('Clique → requisição → navegação sai aninhado, sem repetir na raiz', () => {
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
    // R2 não tem dona: aparece solta na raiz.
    expect(root.annotations.map((a) => a.annotationId)).toEqual(['B1', 'R2']);
  });
});
