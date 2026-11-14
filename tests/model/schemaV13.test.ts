import { describe, expect, it } from 'vitest';
import {
  SCHEMA_VERSION,
  createArrow,
  deserialize,
  discardedOnMigrationTo13,
  migrateFrom12To13,
  migrations,
  serialize,
  setArrowRoute,
} from '../../src/model';
import { marking, sampleProject } from './fixtures';

// Schema v13 (stage Spatial markings). ME0: the annotation loses `inherit` ("applies to all
// descendants of the marking"); the v12 → v13 migration erases the field and removes no annotation.
// ME4: the project gains the `arrows` collection; the migration writes `arrows: []` and never creates
// an arrow, and a v13 written before the arrows opens with `[]`.
// ME1: the marking gains `floating` and a null `containerId` (canvas marking, `rect` in canvas
// units, negative `x`/`y`), the container gains `parentId`; the migration writes `floating:
// false` and `parentId: null` without settling, and a v13 written before these fields opens as is.

function load(text: string) {
  const result = deserialize(text, migrations, new Map());
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return result;
}

type Raw = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** The sampleProject as a v12 mapping.json: A1 and A3 inherit, A2 and A4 do not; without the ME1 fields. */
function v12Raw(): Raw {
  const data = JSON.parse(serialize(sampleProject())) as Raw;
  const inherit: Record<string, boolean> = { A1: true, A2: false, A3: true, A4: false };
  data.schemaVersion = 12;
  // A v12 had no arrows collection.
  delete data.arrows;
  data.annotations = data.annotations.map((a: Raw) => ({
    ...a,
    inherit: inherit[a.id] ?? false,
  }));
  data.markings = data.markings.map((m: Raw) => {
    const { floating, ...rest } = m;
    void floating;
    return rest;
  });
  data.containers = data.containers.map((c: Raw) => {
    const { parentId, ...rest } = c;
    void parentId;
    return rest;
  });
  return data;
}

/** The sampleProject as a v13 written before the membership fields (ME0 preview). */
function v13Me0Raw(): Raw {
  const data = v12Raw();
  data.schemaVersion = 13;
  data.annotations = data.annotations.map((a: Raw) => {
    const { inherit, ...rest } = a;
    void inherit;
    return rest;
  });
  return data;
}

describe('migration v12 → v13 (no inheritance)', () => {
  it('the registry has the v12 → v13 migration', () => {
    expect(SCHEMA_VERSION).toBe(20);
    expect(migrations.get(12)).toBe(migrateFrom12To13);
  });

  it('opens the v12, migrates, loses no annotation and the read object has no `inherit`', () => {
    const raw = v12Raw();
    const result = load(JSON.stringify(raw));
    expect(result.migratedFrom).toBe(12);
    expect(result.readOnly).toBe(false);
    expect(result.project.schemaVersion).toBe(20);
    expect(result.project.annotations.map((a) => a.id)).toEqual(
      raw.annotations.map((a: Raw) => a.id),
    );
    for (const a of result.project.annotations) expect(a).not.toHaveProperty('inherit');
    expect(result.project).toEqual(sampleProject());
  });

  it('serialize does not write `inherit` and re-reading is stable', () => {
    const result = load(JSON.stringify(v12Raw()));
    const saved = serialize(result.project);
    const data = JSON.parse(saved) as Raw;
    expect(data.schemaVersion).toBe(20);
    for (const a of data.annotations) expect(a).not.toHaveProperty('inherit');
    expect(saved).not.toContain('"inherit"');
    const again = load(saved);
    expect(again.migratedFrom).toBeNull();
    expect(serialize(again.project)).toBe(saved);
  });

  it('the migration erases `inherit` and adds `floating` and `parentId`, without touching the rest', () => {
    const raw = v12Raw();
    const out = migrateFrom12To13(raw, { specs: new Map() }) as Raw;
    expect(out.annotations).toEqual(
      raw.annotations.map((a: Raw) => {
        const { inherit, ...rest } = a;
        void inherit;
        return rest;
      }),
    );
    expect(out.markings).toEqual(
      raw.markings.map((m: Raw) => ({ ...m, floating: false })),
    );
    expect(out.containers).toEqual(
      raw.containers.map((c: Raw) => ({ ...c, parentId: null })),
    );
    expect(out.layers).toEqual(raw.layers);
  });

  it('the migration preserves what already exists and ignores an item that is not an object', () => {
    const out = migrateFrom12To13({
      containers: [{ id: 'I1', parentId: 'K' }, 7],
      markings: [{ id: 'M1', floating: true }, null],
      annotations: [],
    });
    expect(out.containers).toEqual([{ id: 'I1', parentId: 'K' }, 7]);
    expect(out.markings).toEqual([{ id: 'M1', floating: true }, null]);
  });

  it('the migration does not settle: the markings\' `parentId` stays as is, the containers\' is null', () => {
    // In v12 the parent was a chosen datum: M3 points to M1 even with M2 (smaller) containing it.
    const raw = v12Raw();
    raw.markings = raw.markings.map((m: Raw) =>
      m.id === 'M3' ? { ...m, parentId: 'M1' } : m,
    );
    const result = load(JSON.stringify(raw));
    expect(result.migratedFrom).toBe(12);
    expect(marking(result.project, 'M3').parentId).toBe('M1');
    expect(result.project.markings.every((m) => !m.floating)).toBe(true);
    expect(result.project.containers.every((c) => c.parentId === null)).toBe(true);
  });

  it('the migrated v12 writes the container `parentId` and the marking `floating`, in the fixed order', () => {
    const saved = serialize(load(JSON.stringify(v12Raw())).project);
    const data = JSON.parse(saved) as Raw;
    expect(Object.keys(data.containers[0]).slice(4, 8)).toEqual([
      'height',
      'placement',
      'parentId',
      'markingColor',
    ]);
    expect(Object.keys(data.markings[0])).toEqual([
      'id',
      'containerId',
      'parentId',
      'name',
      'rect',
      'needsReview',
      'locked',
      'floating',
      'source',
    ]);
    expect(data.containers.every((c: Raw) => c.parentId === null)).toBe(true);
    expect(data.markings.every((m: Raw) => m.floating === false)).toBe(true);
  });
});

describe('opening a v13 (earlier than the membership fields)', () => {
  it('without `floating` or container `parentId` (ME0 v13): opens with the defaults (migrates only v13 → v16)', () => {
    const result = load(JSON.stringify(v13Me0Raw()));
    expect(result.migratedFrom).toBe(13);
    expect(result.project).toEqual(sampleProject());
    expect(result.project.markings.every((m) => m.floating === false)).toBe(true);
    expect(result.project.containers.every((c) => c.parentId === null)).toBe(true);
    // The next write already carries the fields.
    const saved = JSON.parse(serialize(result.project)) as Raw;
    expect(saved.markings.every((m: Raw) => m.floating === false)).toBe(true);
    expect(saved.containers.every((c: Raw) => c.parentId === null)).toBe(true);
  });

  it('with the fields: canvas marking with negative `x` and `y`, floating one and container with a parent', () => {
    const data = JSON.parse(serialize(sampleProject())) as Raw;
    const base = {
      parentId: null,
      needsReview: false,
      locked: false,
      source: null,
    };
    data.markings.push(
      {
        ...base,
        id: 'K',
        containerId: null,
        name: 'Encloses I1',
        rect: { x: -100, y: -100, width: 1200, height: 1000 },
        floating: false,
      },
      {
        ...base,
        id: 'N',
        containerId: null,
        name: 'Note',
        rect: { x: -800, y: -600, width: 300, height: 200 },
        floating: true,
      },
    );
    data.containers[0].parentId = 'K';
    const text = JSON.stringify(data);
    const result = load(text);
    expect(result.migratedFrom).toBeNull();
    expect(marking(result.project, 'K')).toMatchObject({
      containerId: null,
      rect: { x: -100, y: -100, width: 1200, height: 1000 },
      floating: false,
    });
    expect(marking(result.project, 'N')).toMatchObject({
      containerId: null,
      parentId: null,
      floating: true,
      rect: { x: -800, y: -600, width: 300, height: 200 },
    });
    expect(result.project.containers.map((c) => c.parentId)).toEqual(['K', null]);
    // Stable round-trip.
    const saved = serialize(result.project);
    expect(serialize(load(saved).project)).toBe(saved);
    expect(JSON.parse(saved).markings.at(-1).floating).toBe(true);
  });

  it('a v13 does not settle on reading: a valid parent that is not the smallest opens as is', () => {
    const data = JSON.parse(serialize(sampleProject())) as Raw;
    data.markings = data.markings.map((m: Raw) =>
      m.id === 'M3' ? { ...m, parentId: 'M1' } : m,
    );
    const result = load(JSON.stringify(data));
    expect(marking(result.project, 'M3').parentId).toBe('M1');
  });

  it('a container marking with a negative `x` is no longer a schema error: it is the `rect-out-of-image` invariant, repairable', () => {
    const data = JSON.parse(serialize(sampleProject())) as Raw;
    data.markings = data.markings.map((m: Raw) =>
      m.id === 'M4' ? { ...m, rect: { x: -20, y: 0, width: 100, height: 100 } } : m,
    );
    const result = deserialize(JSON.stringify(data), migrations, new Map());
    expect(result.ok).toBe(false);
    if (result.ok || result.error.code !== 'invariant-violation') {
      throw new Error('expected invariant-violation');
    }
    expect(result.error.issues.map((i) => i.code)).toEqual(['rect-out-of-image']);
    expect(result.repair?.unrepaired).toEqual([]);
    expect(marking(result.repair!.project, 'M4').rect).toEqual({
      x: 0,
      y: 0,
      width: 80,
      height: 100,
    });
  });

  it('`floating` and container `parentId` with the wrong type are a schema error', () => {
    const data = JSON.parse(serialize(sampleProject())) as Raw;
    data.markings[0].floating = 'yes';
    expect(deserialize(JSON.stringify(data), migrations, new Map())).toMatchObject({
      ok: false,
      error: { code: 'invalid-schema' },
    });
    const other = JSON.parse(serialize(sampleProject())) as Raw;
    other.containers[0].parentId = 7;
    expect(deserialize(JSON.stringify(other), migrations, new Map())).toMatchObject({
      ok: false,
      error: { code: 'invalid-schema' },
    });
  });
});

describe('discardedOnMigrationTo13', () => {
  it('lists only the `inherit: true` ones, in array order, with the marking name', () => {
    const raw = v12Raw();
    const nameOf = (id: string) =>
      (raw.markings as Raw[]).find((m) => m.id === id)?.name ?? null;
    const a1 = raw.annotations.find((a: Raw) => a.id === 'A1');
    const a3 = raw.annotations.find((a: Raw) => a.id === 'A3');
    expect(discardedOnMigrationTo13(raw)).toEqual([
      { annotationId: 'A1', markingId: a1.markingId, markingName: nameOf(a1.markingId) },
      { annotationId: 'A3', markingId: a3.markingId, markingName: nameOf(a3.markingId) },
    ]);
    expect(discardedOnMigrationTo13(raw).some((d) => d.markingName !== null)).toBe(true);
  });

  it('markingName is null when the marking has no name or does not exist', () => {
    const raw = {
      markings: [
        { id: 'MA', name: null },
        { id: 'MB', name: '' },
        { id: 'MC', name: 'Door' },
      ],
      annotations: [
        { id: 'A1', markingId: 'MA', inherit: true },
        { id: 'A2', markingId: 'MB', inherit: true },
        { id: 'A3', markingId: 'MC', inherit: true },
        { id: 'A4', markingId: 'MX', inherit: true },
        { id: 'A5', markingId: 'MC', inherit: false },
        { id: 'A6', markingId: 'MC' },
      ],
    };
    expect(discardedOnMigrationTo13(raw)).toEqual([
      { annotationId: 'A1', markingId: 'MA', markingName: null },
      { annotationId: 'A2', markingId: 'MB', markingName: null },
      { annotationId: 'A3', markingId: 'MC', markingName: 'Door' },
      { annotationId: 'A4', markingId: 'MX', markingName: null },
    ]);
  });

  it('without a valid `annotations`, returns an empty list', () => {
    expect(discardedOnMigrationTo13({})).toEqual([]);
    expect(discardedOnMigrationTo13({ annotations: 'x' })).toEqual([]);
    expect(discardedOnMigrationTo13({ annotations: {} })).toEqual([]);
  });

  it('deserialize returns the same in `discardedInherit`; empty for a v13', () => {
    const raw = v12Raw();
    const result = load(JSON.stringify(raw));
    expect(result.discardedInherit).toEqual(discardedOnMigrationTo13(raw));
    expect(result.discardedInherit.map((d) => d.annotationId)).toEqual(['A1', 'A3']);
    expect(load(serialize(sampleProject())).discardedInherit).toEqual([]);
  });
});

describe('inheritance warning only for those who migrate', () => {
  it('a hand-edited v15 with `inherit` does not get the false warning', () => {
    const data = JSON.parse(serialize(sampleProject())) as Raw;
    data.schemaVersion = 15;
    data.annotations = data.annotations.map((a: Raw) => ({ ...a, inherit: true }));
    const result = load(JSON.stringify(data));
    expect(result.migratedFrom).toBe(15);
    expect(result.discardedInherit).toEqual([]);
  });

  it('a v14 with `urlTemplate` in platformRepos does not get the v11 warning', () => {
    const data = JSON.parse(serialize(sampleProject())) as Raw;
    data.schemaVersion = 14;
    data.platformRepos = {
      android: { localPath: '..', urlTemplate: 'https://x/{path}' },
    };
    const result = load(JSON.stringify(data));
    expect(result.migratedFrom).toBe(14);
    expect(result.discardedUrlTemplates).toEqual([]);
  });
});

describe('raw v13 with an extra `inherit`', () => {
  it('is read without failing, ignores the key and does not rewrite', () => {
    const data = JSON.parse(serialize(sampleProject())) as Raw;
    data.annotations = data.annotations.map((a: Raw) => ({ ...a, inherit: true }));
    const result = load(JSON.stringify(data));
    expect(result.migratedFrom).toBeNull();
    expect(result.discardedInherit).toEqual([]);
    for (const a of result.project.annotations) expect(a).not.toHaveProperty('inherit');
    expect(serialize(result.project)).not.toContain('"inherit"');
  });
});

describe('arrows (ME4)', () => {
  type Mutable = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

  /** The sampleProject with two arrows, one of them with a route. */
  function withArrows() {
    let p = createArrow(sampleProject(), {
      id: 'R1',
      from: 'M1',
      to: 'M4',
      style: 'elbow',
      name: 'opens',
      fromSide: 'bottom',
    });
    p = createArrow(p, { id: 'R2', from: 'M2', to: 'M3' });
    return setArrowRoute(p, 'R2', [{ x: 1250, y: 1500.5 }]);
  }

  it('the v12 → v13 migration writes `arrows: []` and never creates an arrow', () => {
    const raw = v12Raw();
    expect(raw).not.toHaveProperty('arrows');
    const out = migrateFrom12To13(raw, { specs: new Map() }) as Raw;
    expect(out.arrows).toEqual([]);
    const result = load(JSON.stringify(raw));
    expect(result.migratedFrom).toBe(12);
    expect(result.project.arrows).toEqual([]);
    expect(JSON.parse(serialize(result.project)).arrows).toEqual([]);
  });

  it('the migration preserves the arrows that already exist (a reopened v13)', () => {
    const arrows = [{ id: 'R1', from: 'M1', to: 'M2' }];
    expect(migrateFrom12To13({ arrows }).arrows).toBe(arrows);
  });

  it('a v13 without `arrows` (earlier than the arrows) opens with [], without migrating', () => {
    const data = JSON.parse(serialize(sampleProject())) as Raw;
    delete data.arrows;
    const result = load(JSON.stringify(data));
    expect(result.migratedFrom).toBeNull();
    expect(result.project.arrows).toEqual([]);
    expect(result.project).toEqual(sampleProject());
    // The next write already carries the collection.
    expect(JSON.parse(serialize(result.project)).arrows).toEqual([]);
  });

  it('serializes the arrows in a fixed order, between the markings and the annotations, and re-reading is stable', () => {
    const p = withArrows();
    const text = serialize(p);
    const data = JSON.parse(text) as Raw;
    const keys = Object.keys(data);
    expect(keys.indexOf('arrows')).toBe(keys.indexOf('markings') + 1);
    expect(keys.indexOf('annotations')).toBe(keys.indexOf('arrows') + 3);
    expect(Object.keys(data.arrows[0])).toEqual([
      'id',
      'from',
      'to',
      'fromSide',
      'toSide',
      'points',
      'style',
      'name',
      'locked',
    ]);
    expect(data.arrows[0]).toMatchObject({
      id: 'R1',
      fromSide: 'bottom',
      toSide: null,
      style: 'elbow',
      name: 'opens',
      locked: false,
      points: [],
    });
    expect(data.arrows[1].points).toEqual([{ x: 1250, y: 1500.5 }]);
    const again = load(text);
    expect(again.migratedFrom).toBeNull();
    expect(again.project).toEqual(p);
    expect(serialize(again.project)).toBe(text);
  });

  it('the missing optional arrow fields get the default', () => {
    const data = JSON.parse(serialize(sampleProject())) as Raw;
    data.arrows = [{ id: 'R1', from: 'M1', to: 'M4' }];
    const result = load(JSON.stringify(data));
    expect(result.project.arrows).toEqual([
      {
        id: 'R1',
        from: 'M1',
        to: 'M4',
        fromSide: null,
        toSide: null,
        points: [],
        style: 'curve',
        name: null,
        locked: false,
      },
    ]);
  });

  it('a style, side or point outside the format is a schema error', () => {
    const base = { id: 'R1', from: 'M1', to: 'M4' };
    const bad: Mutable[] = [
      { ...base, style: 'zigzag' },
      { ...base, fromSide: 'middle' },
      { ...base, toSide: 7 },
      { ...base, points: [{ x: 1 }] },
      { ...base, points: [{ x: 'a', y: 2 }] },
      { ...base, locked: 'yes' },
      { id: 'R1', from: 'M1' },
    ];
    for (const arrow of bad) {
      const data = JSON.parse(serialize(sampleProject())) as Raw;
      data.arrows = [arrow];
      expect(deserialize(JSON.stringify(data), migrations, new Map())).toMatchObject({
        ok: false,
        error: { code: 'invalid-schema' },
      });
    }
  });

  it('an arrow without an endpoint is an invariant violation, repairable: the arrow and the annotations go away', () => {
    const data = JSON.parse(serialize(sampleProject())) as Raw;
    data.arrows = [{ id: 'R1', from: 'M1', to: 'M9' }];
    data.annotations.push({
      id: 'AR',
      markingId: 'R1',
      layerId: 'L1',
      name: null,
      parentAnnotationId: null,
      parentRole: null,
      type: null,
      values: null,
      entries: [],
    });
    const result = deserialize(JSON.stringify(data), migrations, new Map());
    expect(result.ok).toBe(false);
    if (result.ok || result.error.code !== 'invariant-violation') {
      throw new Error('expected invariant-violation');
    }
    expect(result.error.issues.map((i) => i.code)).toEqual(['arrow-endpoint-missing']);
    expect(result.repair?.unrepaired).toEqual([]);
    expect(result.repair?.project.arrows).toEqual([]);
    expect(result.repair?.project.annotations.map((a) => a.id)).not.toContain('AR');
  });
});
