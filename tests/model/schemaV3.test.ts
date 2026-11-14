import { describe, expect, it } from 'vitest';
import {
  ModelError,
  deserialize,
  serialize,
  setContainerMarkingColor,
  type Project,
} from '../../src/model';
import { sampleProject } from './fixtures';
import { legacyJson } from './legacyShape';

const without = (item: Record<string, unknown>, keys: string[]) =>
  Object.fromEntries(Object.entries(item).filter(([key]) => !keys.includes(key)));

/** A v2 mapping.json (without `markingColor` on the images nor the v4 fields). */
function v2Text(): string {
  const data = legacyJson(sampleProject());
  const images = (data.images as Record<string, unknown>[]).map((i) =>
    without(i, ['markingColor']),
  );
  const layers = (data.layers as Record<string, unknown>[]).map((l) =>
    without(l, ['spec']),
  );
  const annotations = (data.annotations as Record<string, unknown>[]).map((a) => ({
    ...without(a, ['type', 'values']),
    entries: (a.entries as Record<string, unknown>[]).map((e) => without(e, ['id'])),
  }));
  return JSON.stringify({
    ...without(data, ['specializations', 'platformRepos']),
    schemaVersion: 2,
    images,
    layers,
    annotations,
  });
}

/** Project without the tuple ids (generated in the v3 → v4 migration). */
function withoutEntryIds(p: Project) {
  return {
    ...p,
    annotations: p.annotations.map((a) => ({
      ...a,
      entries: a.entries.map((e) => without({ ...e }, ['id'])),
    })),
  };
}

function load(text: string): Project {
  const result = deserialize(text);
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return result.project;
}

describe('migration v2 → v3', () => {
  it('opens a v2 as v16 with null markingColor and without losing anything', () => {
    const result = deserialize(v2Text());
    if (!result.ok) throw new Error('failed');
    expect(result.migratedFrom).toBe(2);
    expect(result.project.schemaVersion).toBe(20);
    expect(result.project.containers.every((i) => i.markingColor === null)).toBe(true);
    expect(withoutEntryIds(result.project)).toEqual(withoutEntryIds(sampleProject()));
  });

  it('saving the migrated v2 yields a stable v16 (round-trip)', () => {
    const saved = serialize(load(v2Text()));
    expect(JSON.parse(saved).schemaVersion).toBe(20);
    expect(serialize(load(saved))).toBe(saved);
  });
});

describe('marking border color', () => {
  it('sets (normalizing to uppercase) and clears the image color', () => {
    let p = setContainerMarkingColor(sampleProject(), 'I1', '#ffeb3b');
    expect(p.containers[0]?.markingColor).toBe('#FFEB3B');
    expect(p.containers[1]?.markingColor).toBeNull();
    p = setContainerMarkingColor(p, 'I1', null);
    expect(p.containers[0]?.markingColor).toBeNull();
  });

  it('rejects an invalid color and a nonexistent image', () => {
    expect(() => setContainerMarkingColor(sampleProject(), 'I1', 'red')).toThrow(
      ModelError,
    );
    expect(() => setContainerMarkingColor(sampleProject(), 'nothing', '#FFFFFF')).toThrow(
      ModelError,
    );
  });

  it('survives the JSON round-trip', () => {
    const p = setContainerMarkingColor(sampleProject(), 'I2', '#00E5FF');
    expect(load(serialize(p)).containers[1]?.markingColor).toBe('#00E5FF');
  });
});
