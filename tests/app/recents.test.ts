// Phase 8.4: the single list of the home screen (pure function behind `recentProjects`).
import { describe, expect, it } from 'vitest';
import { toRecentProjects } from '../../src/app/recents';
import type { LocalProjectMeta, StoredFolder } from '../../src/storage/local';

const folder = (id: string, name: string, folderName: string, usedAt: string) =>
  ({ id, name, folderName, usedAt }) satisfies StoredFolder;
const localMeta = (id: string, name: string, updatedAt: string, openedAt?: string) =>
  ({
    id,
    name,
    updatedAt,
    unexported: false,
    ...(openedAt === undefined ? {} : { openedAt }),
  }) satisfies LocalProjectMeta;

describe('toRecentProjects', () => {
  it('merges local projects and folders, from the most recent use to the oldest', () => {
    const list = toRecentProjects(
      [
        localMeta('l1', 'Old', '2026-01-01T00:00:00.000Z'),
        localMeta(
          'l2',
          'Reopened',
          '2026-01-01T00:00:00.000Z',
          '2026-03-01T00:00:00.000Z',
        ),
      ],
      [folder('f1', 'Folder', 'folder', '2026-02-01T00:00:00.000Z')],
    );
    expect(list.map((p) => [p.kind, p.id, p.usedAt])).toEqual([
      ['local', 'l2', '2026-03-01T00:00:00.000Z'],
      ['folder', 'f1', '2026-02-01T00:00:00.000Z'],
      ['local', 'l1', '2026-01-01T00:00:00.000Z'],
    ]);
  });

  // R7: two folders with the same project name get the folder name underneath, which tells
  // them apart when the folders have different names (`shop` × `shop-2`). Limit (8.7): with the
  // same project name **and** folder name (the same zip unpacked in two places), the two
  // rows stay identical, because the browser does not give the path; the Last used column
  // tells them apart (`docs/ARCHITECTURE.md`, recents).
  it('showFolderName: folder with another name, or another folder with the same project name', () => {
    const list = toRecentProjects(
      [localMeta('l1', 'Shop', '2026-01-01T00:00:00.000Z')],
      [
        folder('a', 'Shop', 'shop', '2026-02-01T00:00:00.000Z'),
        folder('b', 'Shop', 'shop-2', '2026-02-02T00:00:00.000Z'),
        folder('c', 'car', 'car', '2026-02-03T00:00:00.000Z'),
        folder('d', 'Bike', 'bikes', '2026-02-04T00:00:00.000Z'),
      ],
    );
    const shown = Object.fromEntries(
      list.flatMap((p) => (p.kind === 'folder' ? [[p.id, p.showFolderName]] : [])),
    );
    // The local project with the same name does not count: the origin badge already tells them apart.
    expect(shown).toEqual({ a: true, b: true, c: false, d: true });
  });
});
