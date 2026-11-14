// @vitest-environment node
// Migration v13 → v14 through the path of the previous ones (stage #559, PD2): the original goes to
// `backups/mapping.v13.…`, the save writes v16 and the strip (`backupSaved`) shows the version.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { deserialize, serialize, specFiles } from '../../src/model';
import { createFolderStorage } from '../../src/storage/folder';
import type { PreparedImage } from '../../src/storage/imageImport';
import { openSession, type ProjectSession } from '../../src/store/session';
import { NOW } from '../model/fixtures';
import { cadastroProject } from '../model/specFixtures';
import { MemoryDirectory } from '../storage/memoryFs';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

async function prepareImage(file: File): Promise<PreparedImage> {
  return { name: file.name, data: file, width: 1, height: 1 };
}

describe('session: v13 project', () => {
  let session: ProjectSession | null = null;
  afterEach(async () => {
    await session?.close();
    session = null;
  });

  it('the original goes to backups/mapping.v13.… and the save writes v16 with the links without role', async () => {
    const root = new MemoryDirectory('p');
    const project = cadastroProject();
    const raw = JSON.parse(serialize(project)) as Record<string, unknown> & {
      annotations: Record<string, unknown>[];
    };
    delete raw.docRepos;
    raw.annotations = raw.annotations.map((a) => {
      const { parentRole, ...rest } = a;
      void parentRole;
      return rest;
    });
    const v13Text = `${JSON.stringify({ ...raw, schemaVersion: 13 }, null, 2)}\n`;
    root.put('mapping.json', v13Text);
    const specs = specFiles(project);
    for (const [path, text] of specs) root.put(path, text);
    const loaded = deserialize(v13Text, undefined, specs);
    if (!loaded.ok || loaded.migratedFrom !== 13) throw new Error('fixture v13');
    session = openSession({
      storage: createFolderStorage(root),
      project: loaded.project,
      migratedFrom: { version: loaded.migratedFrom, text: v13Text },
      prepareImage,
      now: () => NOW,
      newId: () => 'new',
    });
    await vi.advanceTimersByTimeAsync(2000);
    expect(root.dirs.has('backups')).toBe(false);

    session.actions.renameProject('Registry v14');
    await session.flush();

    const d = new Date(NOW);
    const pad = (n: number) => String(n).padStart(2, '0');
    const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
    expect(await root.read(`backups/mapping.v13.${stamp}.json`)).toBe(v13Text);
    const saved = JSON.parse((await root.read('mapping.json')) ?? '') as {
      schemaVersion: number;
      docRepos: unknown;
      annotations: { parentRole: unknown }[];
    };
    expect(saved.schemaVersion).toBe(20);
    expect(saved.docRepos).toEqual({});
    expect(saved.annotations.every((a) => a.parentRole === null)).toBe(true);
    expect(session.backupSaved.value).toBe(13);
  });
});
