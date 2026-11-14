import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  ModelError,
  addAnnotation,
  annotationDeletionImpact,
  deserialize,
  getLinkedAnnotations,
  layerDeletionImpact,
  removeAnnotation,
  removeLayer,
  renameContainer,
  serialize,
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

describe('migration v1 → v2', () => {
  it('opens a real v1 as v16 without losing anything', () => {
    const result = deserialize(v1Text);
    if (!result.ok) throw new Error('failed');
    expect(result.migratedFrom).toBe(1);
    expect(result.readOnly).toBe(false);
    const p = result.project;
    expect(p.schemaVersion).toBe(20);
    expect(p.containers.every((i) => i.name === null)).toBe(true);
    expect(p.annotations.every((a) => a.parentAnnotationId === null)).toBe(true);
    // The original data stay identical.
    // v1 uses `images` and `imageId`; today's project uses `containers` and `containerId`.
    const original = JSON.parse(v1Text) as Record<string, unknown>;
    expect(p.layers.map((l) => omit(l, ['spec']))).toEqual(original.layers);
    expect(
      p.markings.map((m) => {
        const { containerId, ...rest } = omit(m, [
          'locked',
          'floating',
          'source',
        ]) as Record<string, unknown>;
        return { ...rest, imageId: containerId };
      }),
    ).toEqual(original.markings);
    // v1 had no project identity (v16): the migration creates a UUID.
    expect(p.project).toEqual({ ...(original.project as object), id: p.project.id });
    expect(p.project.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(
      p.containers.map((i) =>
        omit(i, ['name', 'parentId', 'markingColor', 'locked', 'source', 'background']),
      ),
    ).toEqual(original.images);
    expect(
      p.annotations.map((a) => ({
        ...omit(a, ['parentAnnotationId', 'parentRole', 'type', 'values']),
        entries: a.entries.map((e) => omit(e, ['id'])),
      })),
    ).toEqual(original.annotations);
  });

  it('saving the migrated v1 yields a stable v16 (round-trip)', () => {
    const saved = serialize(load(v1Text));
    expect(JSON.parse(saved).schemaVersion).toBe(20);
    expect(serialize(load(saved))).toBe(saved);
  });

  it('serializes the new fields in a fixed order', () => {
    const text = serialize(sampleProject());
    const data = JSON.parse(text);
    expect(Object.keys(data.containers[0])).toEqual([
      'id',
      'name',
      'file',
      'width',
      'height',
      'placement',
      'parentId',
      'markingColor',
      'locked',
      'source',
      'background',
    ]);
    expect(Object.keys(data.annotations[0])).toEqual([
      'id',
      'markingId',
      'layerId',
      'name',
      'parentAnnotationId',
      'parentRole',
      'type',
      'values',
      'entries',
    ]);
  });
});

describe('image name', () => {
  it('sets, normalizes and clears the name without touching the file', () => {
    let p = renameContainer(sampleProject(), 'I1', '  Home Screen ');
    expect(p.containers[0]?.name).toBe('Home Screen');
    expect(p.containers[0]?.file).toBe('images/lateral.jpg');
    p = renameContainer(p, 'I1', '   ');
    expect(p.containers[0]?.name).toBeNull();
    expect(() => renameContainer(p, 'nothing', 'x')).toThrow(ModelError);
  });
});

/** Door (M1) › Handle (M2) › Lock (M3); Button/Events on M1. */
function linked(): Project {
  let p = sampleProject();
  p = addLayer(p, { id: 'L3', name: 'Events', color: '#43A047' });
  p = addLayer(p, { id: 'L4', name: 'Parameters', color: '#FB8C00' });
  p = addAnnotation(p, { id: 'E1', markingId: 'M1', layerId: 'L3', name: 'onClick' });
  p = addAnnotation(p, { id: 'P1', markingId: 'M1', layerId: 'L4', name: 'target' });
  p = setAnnotationParent(p, 'E1', 'A1'); // Events ← Lataria (sample layer)
  p = setAnnotationParent(p, 'P1', 'E1'); // Parameters ← Events
  return expectValid(p);
}

describe('links', () => {
  it('lists direct and deep linked annotations', () => {
    const p = linked();
    expect(getLinkedAnnotations(p, 'A1').map((a) => a.id)).toEqual(['E1']);
    expect(getLinkedAnnotations(p, 'A1', { deep: true }).map((a) => a.id)).toEqual([
      'E1',
      'P1',
    ]);
    expect(getLinkedAnnotations(p, 'P1')).toEqual([]);
  });

  it('only offers valid owners (same marking, another layer, no cycle)', () => {
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

  it('rejects an owner on another marking, in the same layer, and cycles', () => {
    const p = linked();
    expect(() => setAnnotationParent(p, 'A2', 'A4')).toThrow(ModelError); // another marking
    expect(() => setAnnotationParent(p, 'A2', 'A2')).toThrow(ModelError); // itself
    const sameLayer = addAnnotation(p, { id: 'A7', markingId: 'M1', layerId: 'L1' });
    expect(() => setAnnotationParent(sameLayer, 'A7', 'A1')).toThrow(ModelError);
    expect(() => setAnnotationParent(p, 'A1', 'P1')).toThrow(ModelError); // cycle A1→P1→E1→A1
    expect(() => setAnnotationParent(p, 'A1', 'nothing')).toThrow(ModelError);
  });

  it('removes the owner', () => {
    const p = setAnnotationParent(linked(), 'E1', null);
    expect(p.annotations.find((a) => a.id === 'E1')?.parentAnnotationId).toBeNull();
    expectValid(p);
  });

  it('validateProject flags invalid links coming from a JSON', () => {
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

describe('cascading deletions', () => {
  it('deleting the annotation deletes the linked ones, recursively', () => {
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

  it('deleting the layer deletes the annotations and the linked ones in other layers', () => {
    const p = linked();
    const impact = layerDeletionImpact(p, 'L1');
    // L1: A1 and A3; linked: E1 (L3) and P1 (L4).
    expect(impact.annotations).toBe(4);
    expect(Object.fromEntries(impact.byLayer)).toEqual({ L1: 2, L3: 1, L4: 1 });
    const next = expectValid(removeLayer(p, 'L1'));
    expect(next.annotations.map((a) => a.id)).toEqual(['A2', 'A4']);
  });

  it('deleting the layer of the linked one does not reach the owner', () => {
    const next = expectValid(removeLayer(linked(), 'L3'));
    expect(next.annotations.map((a) => a.id)).toEqual(['A1', 'A2', 'A3', 'A4']);
  });
});
