import { describe, expect, it } from 'vitest';
import { deserialize, migrations, serialize } from '../../src/model';
import { sampleProject } from './fixtures';

// Preparation for R3.8 (v8) and R3.8b (v10) of `docs/TESTING.md`: the guide says to edit a
// `mapping.json` v16 by hand. This test makes the same text swaps and checks that opening
// (the migration) accepts the file, so the preparation does not again produce one that the app rejects.

/**
 * The model's v16, as the app writes it. Marking M4 goes to the canvas (`containerId` null), like the
 * one drawn in the preparation: it is the case that swapping only the version left without `containerId`.
 */
function v15Text(): string {
  const data = JSON.parse(serialize(sampleProject())) as {
    markings: { id: string; containerId: string | null }[];
  };
  for (const m of data.markings) if (m.id === 'M4') m.containerId = null;
  return JSON.stringify(data, null, 2);
}

/** Swap as the preparation says: version, `containers` → `images` and `containerId` → `imageId`. */
function prepared(text: string, version: number, renameKeys: boolean): string {
  let out = text.replace('"schemaVersion": 20', `"schemaVersion": ${version}`);
  if (renameKeys) {
    out = out
      .replaceAll('"containers"', '"images"')
      .replaceAll('"containerId"', '"imageId"');
  }
  return out;
}

describe('guide preparation (R3.8 and R3.8b): the hand-edited file opens', () => {
  it('the saved v16 uses containers/containerId and swapping the version alone is rejected', () => {
    const text = v15Text();
    expect(text).toContain('"schemaVersion": 20');
    expect(text).toContain('"containers"');
    expect(text).toContain('"containerId"');
    const result = deserialize(prepared(text, 8, false), migrations, new Map());
    expect(result.ok).toBe(false);
  });

  it.each([8, 10])(
    'the v%i of the preparation (with images/imageId) migrates to v17',
    (version) => {
      const result = deserialize(
        prepared(v15Text(), version, true),
        migrations,
        new Map(),
      );
      if (!result.ok) throw new Error(JSON.stringify(result.error));
      expect(result.migratedFrom).toBe(version);
      expect(result.project.schemaVersion).toBe(20);
      expect(result.project.containers.length).toBeGreaterThan(0);
      expect(result.project.markings.length).toBeGreaterThan(0);
    },
  );
});
