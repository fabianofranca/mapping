import { describe, expect, it } from 'vitest';
import { deserialize, migrateFrom4To5, serialize } from '../../src/model';
import { sampleProject } from './fixtures';
import { legacyJson } from './legacyShape';

const strip = (item: Record<string, unknown>, key: string) =>
  Object.fromEntries(Object.entries(item).filter(([k]) => k !== key));

/** A v4 mapping.json: without `locked` on the images or the markings (nor `platformRepos`). */
function v4Text(): string {
  const data = legacyJson(sampleProject());
  return JSON.stringify({
    ...strip(data, 'platformRepos'),
    schemaVersion: 4,
    images: (data.images as Record<string, unknown>[]).map((i) => strip(i, 'locked')),
    markings: (data.markings as Record<string, unknown>[]).map((m) => strip(m, 'locked')),
  });
}

describe('migration v4 → v5 (lock)', () => {
  it('images and markings get locked: false and the rest stays the same', () => {
    const result = deserialize(v4Text());
    if (!result.ok) throw new Error(JSON.stringify(result.error));
    expect(result.migratedFrom).toBe(4);
    expect(result.readOnly).toBe(false);
    expect(result.project.schemaVersion).toBe(20);
    expect(result.project.containers.every((i) => i.locked === false)).toBe(true);
    expect(result.project.markings.every((m) => m.locked === false)).toBe(true);
    expect(result.project).toEqual(sampleProject());
  });

  it('the migrated v4 saves as a stable v16 (round-trip)', () => {
    const first = deserialize(v4Text());
    if (!first.ok) throw new Error('failed');
    const saved = serialize(first.project);
    expect(JSON.parse(saved).schemaVersion).toBe(20);
    const again = deserialize(saved);
    if (!again.ok) throw new Error('failed');
    expect(serialize(again.project)).toBe(saved);
  });

  it('preserves an existing locked and does not touch items that are not objects', () => {
    const migrated = migrateFrom4To5({
      images: [{ id: 'I1', locked: true }, 7],
      markings: [{ id: 'M1' }],
    });
    expect(migrated.images).toEqual([{ id: 'I1', locked: true }, 7]);
    expect(migrated.markings).toEqual([{ id: 'M1', locked: false }]);
  });

  it('serializes locked in a fixed order, at the end of each image and marking (before the v8 source)', () => {
    const data = JSON.parse(serialize(sampleProject()));
    expect(Object.keys(data.containers[0]).slice(-3)).toEqual([
      'locked',
      'source',
      'background',
    ]);
    // `floating` (v13) comes between `locked` and `source`.
    expect(Object.keys(data.markings[0]).slice(-3)).toEqual([
      'locked',
      'floating',
      'source',
    ]);
  });

  it('refuses a v5 file without locked', () => {
    const data = JSON.parse(serialize(sampleProject()));
    delete data.markings[0].locked;
    const result = deserialize(JSON.stringify(data));
    expect(result.ok).toBe(false);
  });
});
