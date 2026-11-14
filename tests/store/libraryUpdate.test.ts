// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addContainer, createMarking, type Spec } from '../../src/model';
import { createFolderStorage } from '../../src/storage/folder';
import { openSession, type ProjectSession } from '../../src/store/session';
import { emptyProject, NOW } from '../model/fixtures';
import {
  badgeType,
  buttonType,
  chipType,
  libSpec,
} from '../model/libraryMigrationFixtures';
import { MemoryDirectory } from '../storage/memoryFs';

// Update of a library (v4) by the session: migrated data, specs/<id>/ folder rewritten,
// one history entry and the refusal of a break without a migration.

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const DIR = 'specs/lib';
const SPEC_FILE = `${DIR}/lib.spec.json`;

/** v2 renames `label` → `title` in `button`, with the migration declared (or without it). */
function v2(migrated = true): Spec {
  const button = buttonType();
  return libSpec(
    2,
    { c: [{ ...button, fields: renamed(button.fields) }, badgeType()], e: [chipType()] },
    {
      migrations: migrated
        ? [
            {
              from: 1,
              to: 2,
              steps: [{ op: 'rename-field', type: 'button', from: 'label', to: 'title' }],
            },
          ]
        : [],
    },
  );
}

function renamed(fields: ReturnType<typeof buttonType>['fields']) {
  return fields.map((f) => (f.key === 'label' ? { ...f, key: 'title' } : f));
}

const packageOf = (spec: Spec, extra: Record<string, string> = {}) =>
  new Map<string, string | Blob>([
    ['lib.spec.json', JSON.stringify(spec)],
    ...Object.entries(extra),
  ]);

async function settle() {
  await vi.advanceTimersByTimeAsync(0);
  await vi.advanceTimersByTimeAsync(0);
}

describe('update a library through the session', () => {
  let session: ProjectSession | null = null;
  afterEach(async () => {
    await session?.close();
    session = null;
  });

  async function start() {
    const root = new MemoryDirectory('p');
    let project = addContainer(emptyProject(), {
      id: 'I1',
      file: 'images/a.png',
      width: 1000,
      height: 1000,
    });
    project = createMarking(project, {
      id: 'M1',
      containerId: 'I1',
      rect: { x: 0, y: 0, width: 100, height: 100 },
    });
    let n = 0;
    session = openSession({
      storage: createFolderStorage(root),
      project,
      prepareImage: () => Promise.reject(new Error('no images')),
      now: () => NOW,
      newId: () => `id-${++n}`,
    });
    const v1 = libSpec(1);
    expect(
      session.actions.applySpecialization(v1, packageOf(v1, { 'docs/v1.md': '# v1' })).ok,
    ).toBe(true);
    const p = session.store.project.value;
    const layerId = p?.layers.find((l) => l.spec?.layerId === 'c')?.id ?? '';
    const added = session.actions.addTypedAnnotation('M1', layerId, {
      specId: 'lib',
      typeId: 'button',
    });
    if (!added.ok) throw new Error('no annotation');
    const annotationId = session.store.project.value?.annotations[0]?.id ?? '';
    session.actions.setFieldValue(annotationId, 'label', 'OK');
    await settle();
    return { root, annotationId, storage: createFolderStorage(root) };
  }

  const valuesOf = (id: string) =>
    session?.store.project.value?.annotations.find((a) => a.id === id)?.values;
  const versionOf = () => session?.store.project.value?.specializations[0]?.version;

  it('migrates the values, rewrites the folder and undoes/redoes in a single entry', async () => {
    const { root, annotationId, storage } = await start();
    expect(valuesOf(annotationId)).toMatchObject({ label: 'OK' });

    const next = v2();
    const result = session?.actions.updateSpecialization(
      next,
      undefined,
      packageOf(next, { 'docs/v2.md': '# v2' }),
    );
    expect(result?.ok).toBe(true);
    await settle();
    expect(versionOf()).toBe(2);
    expect(valuesOf(annotationId)).toMatchObject({ title: 'OK' });
    expect(valuesOf(annotationId)).not.toHaveProperty('label');
    let files = await storage.listSpecDir(DIR);
    expect(files).toContain(`${DIR}/docs/v2.md`);
    expect(files).not.toContain(`${DIR}/docs/v1.md`);

    // A single entry: one undo brings everything back.
    session?.store.undo();
    await vi.advanceTimersByTimeAsync(300);
    await settle();
    expect(versionOf()).toBe(1);
    expect(valuesOf(annotationId)).toMatchObject({ label: 'OK' });
    files = await storage.listSpecDir(DIR);
    expect(files).toContain(`${DIR}/docs/v1.md`);
    expect(files).not.toContain(`${DIR}/docs/v2.md`);
    expect((JSON.parse((await root.read(SPEC_FILE)) ?? '{}') as Spec).version).toBe(1);

    session?.store.redo();
    await vi.advanceTimersByTimeAsync(300);
    await settle();
    expect(versionOf()).toBe(2);
    expect(valuesOf(annotationId)).toMatchObject({ title: 'OK' });
    files = await storage.listSpecDir(DIR);
    expect(files).toContain(`${DIR}/docs/v2.md`);
  });

  it('a break without a migration is refused and nothing changes', async () => {
    const { annotationId, storage } = await start();
    const before = session?.store.project.value;
    const next = v2(false);
    const result = session?.actions.updateSpecialization(
      next,
      undefined,
      packageOf(next),
    );
    expect(result).toEqual({ ok: false, error: 'spec-missing-migrations' });
    await settle();
    expect(session?.store.project.value).toBe(before);
    expect(versionOf()).toBe(1);
    expect(valuesOf(annotationId)).toMatchObject({ label: 'OK' });
    expect(await storage.listSpecDir(DIR)).toContain(`${DIR}/docs/v1.md`);
  });
});
