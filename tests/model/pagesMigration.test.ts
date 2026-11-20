import { describe, expect, it } from 'vitest';
import { SCHEMA_VERSION, deserialize, serialize, type Project } from '../../src/model';
import { migrateFrom20To21 } from '../../src/model/migrations';
import { sampleProject } from './fixtures';

// Pages (v21, stage #883, PG1): the migration from v20 and the file format. The backup of the
// original before the first write belongs to the session
// (`tests/store/session.test.ts`, "backup before writing a migrated project").

/** The v20 text of a project: no `pages`, no `pageId`, `schemaVersion` 20. */
function v20Text(p: Project): string {
  const json = JSON.parse(serialize(p)) as Record<string, unknown>;
  delete json.pages;
  json.schemaVersion = 20;
  for (const key of ['containers', 'markings'] as const) {
    for (const item of json[key] as Record<string, unknown>[]) delete item.pageId;
  }
  return JSON.stringify(json, null, 2);
}

function withCanvasMarking(): Project {
  const p = sampleProject();
  return {
    ...p,
    markings: [
      ...p.markings,
      {
        id: 'K',
        containerId: null,
        parentId: null,
        pageId: 'PG1',
        name: null,
        rect: { x: 5000, y: 5000, width: 100, height: 100 },
        needsReview: false,
        locked: false,
        floating: false,
        source: null,
      },
    ],
  };
}

describe('migration v20 → v21 (pages)', () => {
  it('the schema is v21 or later', () => {
    expect(SCHEMA_VERSION).toBeGreaterThanOrEqual(21);
  });

  it('creates one page with the given name and puts it on every container and canvas marking', () => {
    const result = deserialize(
      v20Text(withCanvasMarking()),
      undefined,
      undefined,
      'Seite 1',
    );
    if (!result.ok) throw new Error(JSON.stringify(result.error));
    const { project } = result;
    expect(result.migratedFrom).toBe(20);
    expect(result.readOnly).toBe(false);
    expect(project.pages).toHaveLength(1);
    const page = project.pages[0];
    expect(page?.name).toBe('Seite 1');
    expect(page?.id).toMatch(/^[0-9a-f-]{36}$/);
    for (const c of project.containers) expect(c.pageId).toBe(page?.id);
    for (const m of project.markings) {
      expect(m.pageId).toBe(m.containerId === null ? page?.id : null);
    }
  });

  it('without a name from the app, the page is called "Page 1"', () => {
    const result = deserialize(v20Text(sampleProject()));
    if (!result.ok) throw new Error('fixture');
    expect(result.project.pages.map((g) => g.name)).toEqual(['Page 1']);
  });

  it('keeps the pages and pageIds a file already has', () => {
    const migrated = migrateFrom20To21({
      pages: [
        { id: 'A', name: 'A' },
        { id: 'B', name: 'B' },
      ],
      containers: [{ id: 'I', pageId: 'B' }, { id: 'J' }],
      markings: [
        { id: 'M', containerId: null, pageId: 'B' },
        { id: 'N', containerId: 'I' },
      ],
    });
    expect(migrated.pages).toEqual([
      { id: 'A', name: 'A' },
      { id: 'B', name: 'B' },
    ]);
    expect(migrated.containers).toEqual([
      { id: 'I', pageId: 'B' },
      { id: 'J', pageId: 'A' },
    ]);
    expect(migrated.markings).toEqual([
      { id: 'M', containerId: null, pageId: 'B' },
      { id: 'N', containerId: 'I', pageId: null },
    ]);
  });

  it('a project with no containers or markings still gets a page', () => {
    const empty = { ...sampleProject(), containers: [], markings: [], annotations: [] };
    const result = deserialize(v20Text(empty));
    if (!result.ok) throw new Error('fixture');
    expect(result.project.pages).toHaveLength(1);
  });

  it('a v21 file with the new field order is read and written back identically', () => {
    const text = serialize(withCanvasMarking());
    const read = deserialize(text);
    if (!read.ok) throw new Error(JSON.stringify(read.error));
    expect(read.migratedFrom).toBeNull();
    expect(serialize(read.project)).toBe(text);
  });

  it('writes `pages` right before `layers` and `pageId` right after `parentId`', () => {
    const json = JSON.parse(serialize(withCanvasMarking())) as Record<string, unknown>;
    const keys = Object.keys(json);
    expect(keys.indexOf('pages')).toBe(keys.indexOf('layers') - 1);
    for (const key of ['containers', 'markings'] as const) {
      const first = (json[key] as Record<string, unknown>[])[0] as Record<
        string,
        unknown
      >;
      const own = Object.keys(first);
      expect(own[own.indexOf('parentId') + 1]).toBe('pageId');
    }
    const canvas = (json.markings as Record<string, unknown>[]).find((m) => m.id === 'K');
    expect(canvas?.pageId).toBe('PG1');
  });

  it('a file of a newer version opens read-only', () => {
    const json = JSON.parse(serialize(sampleProject())) as Record<string, unknown>;
    json.schemaVersion = SCHEMA_VERSION + 1;
    const result = deserialize(JSON.stringify(json));
    expect(result.ok && result.readOnly).toBe(true);
  });
});
