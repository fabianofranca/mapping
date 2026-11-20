// Schema v22 (corner alignment, stage #2093 CC3): the anchor's `align` gains `corner-start` and
// `corner-end`. The v21 → v22 migration only changes the version; the new version exists so that an
// earlier app opens a file with a corner value read-only instead of failing to read it.
import { describe, expect, it } from 'vitest';
import {
  ANCHOR_ALIGNS,
  SCHEMA_VERSION,
  createMarking,
  deserialize,
  migrateFrom21To22,
  migrations,
  serialize,
  setMarkingAnchor,
  type Project,
} from '../../src/model';
import { emptyProject, sampleProject } from './fixtures';

type Raw = Record<string, unknown>;

/** The sample project with a marking `ZZ-anchored` anchored to the first marking by the given alignment. */
function anchored(align: string): Raw {
  const base = sampleProject();
  const target = base.markings[0]!;
  let p: Project = createMarking(base, {
    id: 'ZZ-anchored',
    containerId: target.containerId,
    rect: { ...target.rect, x: target.rect.x + 1, y: target.rect.y + 1 },
  });
  p = setMarkingAnchor(p, 'ZZ-anchored', {
    to: target.id,
    side: 'top',
    align: align as 'start',
  });
  return JSON.parse(serialize(p)) as Raw;
}

const withVersion = (raw: Raw, schemaVersion: number): Raw => ({ ...raw, schemaVersion });

function open(raw: Raw) {
  return deserialize(JSON.stringify(raw), migrations);
}

describe('schema v22', () => {
  it('the current version is 22 and the registry has the v21 → v22 migration', () => {
    expect(SCHEMA_VERSION).toBe(22);
    expect(migrations.get(21)).toBe(migrateFrom21To22);
  });

  it('the v21 → v22 migration does not change the data', () => {
    const data = { project: { id: 'fixed', name: 'X' }, extra: 1 };
    expect(migrateFrom21To22(data)).toEqual(data);
  });

  it('a v21 mapping.json migrates to v22 changing only the version', () => {
    const raw = withVersion(anchored('end'), 21);
    const result = open(raw);
    if (!result.ok) throw new Error(JSON.stringify(result.error));
    expect(result.migratedFrom).toBe(21);
    expect(result.project.schemaVersion).toBe(SCHEMA_VERSION);
    expect(JSON.parse(serialize(result.project))).toEqual({
      ...raw,
      schemaVersion: SCHEMA_VERSION,
    });
  });

  it.each(['corner-start', 'corner-end'])(
    '%s is valid at the current version',
    (align) => {
      const result = open(anchored(align));
      if (!result.ok) throw new Error(JSON.stringify(result.error));
      const marking = result.project.markings.find((m) => m.id === 'ZZ-anchored')!;
      expect(marking.anchor?.align).toBe(align);
      expect(JSON.parse(serialize(result.project))).toEqual(anchored(align));
    },
  );

  it('a value that is not an alignment is still invalid', () => {
    expect(open(anchored('corner-middle')).ok).toBe(false);
  });

  it('the earlier version knew only start, center and end (it reads a corner value read-only)', () => {
    const v21Aligns = ['start', 'center', 'end'];
    expect(ANCHOR_ALIGNS.slice(0, 3)).toEqual(v21Aligns);
    expect(ANCHOR_ALIGNS.slice(3)).toEqual(['corner-start', 'corner-end']);
    // An earlier app meets a newer version number: it opens the file read-only.
    const newer = open(withVersion(anchored('corner-end'), SCHEMA_VERSION + 1));
    expect(newer.ok && newer.readOnly).toBe(true);
  });

  it('an empty project round-trips at v22', () => {
    const result = open(JSON.parse(serialize(emptyProject())) as Raw);
    expect(result.ok).toBe(true);
  });
});
