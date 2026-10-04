import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  ModelError,
  addAnnotation,
  annotationDeletionImpact,
  deserialize,
  getInheritedAnnotations,
  getLinkedAnnotations,
  layerDeletionImpact,
  removeAnnotation,
  removeLayer,
  renameImage,
  serialize,
  setAnnotationInherit,
  setAnnotationParent,
  validAnnotationOwners,
  validateProject,
  addLayer,
  type Project,
} from '../../src/model';
import { expectValid, sampleProject } from './fixtures';

const v1Text = readFileSync(
  new URL('../fixtures/mapping-v1.json', import.meta.url),
  'utf8',
);

function omit(item: object, keys: string[]): object {
  return Object.fromEntries(Object.entries(item).filter(([k]) => !keys.includes(k)));
}

function load(text: string): Project {
  const result = deserialize(text);
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return result.project;
}

describe('migração v1 → v2', () => {
  it('abre um v1 real como v5 sem perder nada', () => {
    const result = deserialize(v1Text);
    if (!result.ok) throw new Error('falhou');
    expect(result.migratedFrom).toBe(1);
    expect(result.readOnly).toBe(false);
    const p = result.project;
    expect(p.schemaVersion).toBe(5);
    expect(p.images.every((i) => i.name === null)).toBe(true);
    expect(p.annotations.every((a) => !a.inherit && a.parentAnnotationId === null)).toBe(
      true,
    );
    // Os dados originais continuam idênticos.
    const original = JSON.parse(v1Text) as Project;
    expect(p.layers.map((l) => omit(l, ['spec']))).toEqual(original.layers);
    expect(p.markings.map((m) => omit(m, ['locked']))).toEqual(original.markings);
    expect(p.project).toEqual(original.project);
    expect(p.images.map((i) => omit(i, ['name', 'markingColor', 'locked']))).toEqual(
      original.images,
    );
    expect(
      p.annotations.map((a) => ({
        ...omit(a, ['inherit', 'parentAnnotationId', 'type', 'values']),
        entries: a.entries.map((e) => omit(e, ['id'])),
      })),
    ).toEqual(original.annotations);
  });

  it('salvar o v1 migrado gera v5 estável (round-trip)', () => {
    const saved = serialize(load(v1Text));
    expect(JSON.parse(saved).schemaVersion).toBe(5);
    expect(serialize(load(saved))).toBe(saved);
  });

  it('serializa os campos novos na ordem fixa', () => {
    const text = serialize(sampleProject());
    const data = JSON.parse(text);
    expect(Object.keys(data.images[0])).toEqual([
      'id',
      'name',
      'file',
      'width',
      'height',
      'placement',
      'markingColor',
      'locked',
    ]);
    expect(Object.keys(data.annotations[0])).toEqual([
      'id',
      'markingId',
      'layerId',
      'name',
      'inherit',
      'parentAnnotationId',
      'type',
      'values',
      'entries',
    ]);
  });
});

describe('nome da imagem', () => {
  it('define, normaliza e limpa o nome sem mexer no arquivo', () => {
    let p = renameImage(sampleProject(), 'I1', '  Tela Home ');
    expect(p.images[0]?.name).toBe('Tela Home');
    expect(p.images[0]?.file).toBe('images/lateral.jpg');
    p = renameImage(p, 'I1', '   ');
    expect(p.images[0]?.name).toBeNull();
    expect(() => renameImage(p, 'nada', 'x')).toThrow(ModelError);
  });
});

/** Porta (M1) › Maçaneta (M2) › Fechadura (M3); Button/Eventos em M1. */
function linked(): Project {
  let p = sampleProject();
  p = addLayer(p, { id: 'L3', name: 'Eventos', color: '#43A047' });
  p = addLayer(p, { id: 'L4', name: 'Parâmetros', color: '#FB8C00' });
  p = addAnnotation(p, { id: 'E1', markingId: 'M1', layerId: 'L3', name: 'onClick' });
  p = addAnnotation(p, { id: 'P1', markingId: 'M1', layerId: 'L4', name: 'destino' });
  p = setAnnotationParent(p, 'E1', 'A1'); // Eventos ← Lataria
  p = setAnnotationParent(p, 'P1', 'E1'); // Parâmetros ← Eventos
  return expectValid(p);
}

describe('herança', () => {
  it('desce em cascata: Porta › Maçaneta › Fechadura', () => {
    let p = sampleProject();
    expect(getInheritedAnnotations(p, 'M3')).toEqual([]);
    p = setAnnotationInherit(p, 'A1', true); // da Porta
    p = addAnnotation(p, { id: 'A9', markingId: 'M2', layerId: 'L2' });
    p = setAnnotationInherit(p, 'A9', true); // da Maçaneta
    expect(getInheritedAnnotations(p, 'M1')).toEqual([]);
    expect(getInheritedAnnotations(p, 'M2').map((a) => a.id)).toEqual(['A1']);
    expect(getInheritedAnnotations(p, 'M3').map((a) => a.id)).toEqual(['A1', 'A9']);
    // A2 (Porta) não tem inherit; outra imagem não herda nada.
    expect(getInheritedAnnotations(p, 'M4')).toEqual([]);
    expect(() => getInheritedAnnotations(p, 'nada')).toThrow(ModelError);
  });

  it('desligar remove a herança e não é materializada no JSON', () => {
    let p = setAnnotationInherit(sampleProject(), 'A1', true);
    expect(JSON.parse(serialize(p)).annotations).toHaveLength(4);
    p = setAnnotationInherit(p, 'A1', false);
    expect(getInheritedAnnotations(p, 'M2')).toEqual([]);
  });

  it('mudar o pai da marcação muda o que ela herda', () => {
    let p = setAnnotationInherit(sampleProject(), 'A1', true);
    expect(getInheritedAnnotations(p, 'M3').map((a) => a.id)).toEqual(['A1']);
    p = {
      ...p,
      markings: p.markings.map((m) => (m.id === 'M3' ? { ...m, parentId: null } : m)),
    };
    expect(getInheritedAnnotations(p, 'M3')).toEqual([]);
  });
});

describe('vínculos', () => {
  it('lista vinculadas diretas e em profundidade', () => {
    const p = linked();
    expect(getLinkedAnnotations(p, 'A1').map((a) => a.id)).toEqual(['E1']);
    expect(getLinkedAnnotations(p, 'A1', { deep: true }).map((a) => a.id)).toEqual([
      'E1',
      'P1',
    ]);
    expect(getLinkedAnnotations(p, 'P1')).toEqual([]);
  });

  it('herança e vínculo são independentes', () => {
    let p = linked();
    p = setAnnotationInherit(p, 'A1', true);
    expect(getInheritedAnnotations(p, 'M2').map((a) => a.id)).toEqual(['A1']);
  });

  it('só oferece donas válidas (mesma marcação, outra camada, sem ciclo)', () => {
    const p = linked();
    expect(validAnnotationOwners(p, 'A1').map((a) => a.id)).toEqual(
      ['A2', 'A2'].slice(0, 1),
    );
    expect(
      validAnnotationOwners(p, 'E1')
        .map((a) => a.id)
        .sort(),
    ).toEqual(['A1', 'A2']);
  });

  it('rejeita dona em outra marcação, na mesma camada e ciclos', () => {
    const p = linked();
    expect(() => setAnnotationParent(p, 'A2', 'A4')).toThrow(ModelError); // outra marcação
    expect(() => setAnnotationParent(p, 'A2', 'A2')).toThrow(ModelError); // ela mesma
    const sameLayer = addAnnotation(p, { id: 'A7', markingId: 'M1', layerId: 'L1' });
    expect(() => setAnnotationParent(sameLayer, 'A7', 'A1')).toThrow(ModelError);
    expect(() => setAnnotationParent(p, 'A1', 'P1')).toThrow(ModelError); // ciclo A1→P1→E1→A1
    expect(() => setAnnotationParent(p, 'A1', 'nada')).toThrow(ModelError);
  });

  it('remove a dona', () => {
    const p = setAnnotationParent(linked(), 'E1', null);
    expect(p.annotations.find((a) => a.id === 'E1')?.parentAnnotationId).toBeNull();
    expectValid(p);
  });

  it('validateProject acusa vínculos inválidos vindos de um JSON', () => {
    const p = linked();
    const bad = (id: string, owner: string | null): Project => ({
      ...p,
      annotations: p.annotations.map((a) =>
        a.id === id ? { ...a, parentAnnotationId: owner } : a,
      ),
    });
    const codes = (x: Project) => validateProject(x).map((i) => i.code);
    expect(codes(bad('E1', 'zzz'))).toContain('missing-parent-annotation');
    expect(codes(bad('E1', 'A4'))).toContain('annotation-parent-other-marking');
    expect(codes(bad('E1', 'E1'))).toContain('annotation-parent-same-layer');
    expect(codes(bad('A1', 'P1'))).toContain('annotation-cycle');
    const result = deserialize(serialize(bad('A1', 'P1')));
    expect(result.ok).toBe(false);
  });
});

describe('exclusões em cascata', () => {
  it('excluir a anotação exclui as vinculadas, recursivamente', () => {
    const p = linked();
    expect(annotationDeletionImpact(p, 'A1')).toEqual({ annotations: 3, brokenRefs: 0 });
    expect(removeAnnotation(p, 'A1').annotations.map((a) => a.id)).toEqual([
      'A2',
      'A3',
      'A4',
    ]);
    expectValid(removeAnnotation(p, 'E1'));
    expect(removeAnnotation(p, 'E1').annotations.map((a) => a.id)).toEqual([
      'A1',
      'A2',
      'A3',
      'A4',
    ]);
  });

  it('excluir a camada exclui as anotações e as vinculadas em outras camadas', () => {
    const p = linked();
    const impact = layerDeletionImpact(p, 'L1');
    // L1: A1 e A3; vinculadas: E1 (L3) e P1 (L4).
    expect(impact.annotations).toBe(4);
    expect(Object.fromEntries(impact.byLayer)).toEqual({ L1: 2, L3: 1, L4: 1 });
    const next = expectValid(removeLayer(p, 'L1'));
    expect(next.annotations.map((a) => a.id)).toEqual(['A2', 'A4']);
  });

  it('excluir a camada da vinculada não atinge a dona', () => {
    const next = expectValid(removeLayer(linked(), 'L3'));
    expect(next.annotations.map((a) => a.id)).toEqual(['A1', 'A2', 'A3', 'A4']);
  });
});
