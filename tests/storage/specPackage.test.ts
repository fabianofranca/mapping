// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { MAX_PACKAGE_BYTES, MAX_PACKAGE_FILES } from '../../src/model';
import { FOLDER_CONCURRENCY } from '../../src/storage/folderConcurrency';
import {
  loadLibraryIssues,
  packageEntriesOf,
  readSpecPackage,
} from '../../src/storage/specPackage';
import type { ProjectStorage } from '../../src/storage/types';

function storageWith(paths: readonly string[]): ProjectStorage {
  return {
    listSpecDir: async () => paths,
    readSpecFile: async () => new Blob(['x']),
  } as unknown as ProjectStorage;
}

const project = {
  specializations: [{ id: 'm3', file: 'specs/m3/m3.spec.json' }],
} as unknown as Parameters<typeof loadLibraryIssues>[1];

describe('loadLibraryIssues', () => {
  it('a package that is too big becomes a problem with a code, without fixed text for the interface', async () => {
    const many = Array.from(
      { length: MAX_PACKAGE_FILES + 1 },
      (_, i) => `specs/m3/${i}.md`,
    );
    const issues = await loadLibraryIssues(storageWith(many), project);
    expect(issues.get('m3')).toEqual([
      expect.objectContaining({ code: 'package-too-big', severity: 'error' }),
    ]);
  });

  it('reads the specialization packages in series, keeping the result order', async () => {
    const order: string[] = [];
    const storage = {
      listSpecDir: vi.fn(async (dir: string) => {
        order.push(`start ${dir}`);
        await new Promise((r) => setTimeout(r, dir === 'specs/a' ? 20 : 1));
        order.push(`end ${dir}`);
        return [];
      }),
      readSpecFile: async () => null,
    } as unknown as ProjectStorage;
    const two = {
      specializations: [
        { id: 'a', file: 'specs/a/a.spec.json' },
        { id: 'b', file: 'specs/b/b.spec.json' },
      ],
    } as unknown as Parameters<typeof loadLibraryIssues>[1];
    const out = await loadLibraryIssues(storage, two);
    expect(order).toEqual([
      'start specs/a',
      'end specs/a',
      'start specs/b',
      'end specs/b',
    ]);
    expect([...out.keys()]).toEqual(['a', 'b']);
  });

  it('the peak of simultaneous reads to the folder, with 3 specializations, stays within the limit', async () => {
    let active = 0;
    let peak = 0;
    const storage = {
      listSpecDir: async (dir: string) =>
        Array.from({ length: 10 }, (_, i) => `${dir}/${i}.md`),
      readSpecFile: async () => {
        active++;
        peak = Math.max(peak, active);
        await new Promise((r) => setTimeout(r, 2));
        active--;
        return new Blob(['x']);
      },
    } as unknown as ProjectStorage;
    const three = {
      specializations: ['a', 'b', 'c'].map((id) => ({
        id,
        file: `specs/${id}/${id}.spec.json`,
      })),
    } as unknown as Parameters<typeof loadLibraryIssues>[1];
    const out = await loadLibraryIssues(storage, three);
    expect([...out.keys()]).toEqual(['a', 'b', 'c']);
    expect(peak).toBeGreaterThan(1);
    expect(peak).toBeLessThanOrEqual(FOLDER_CONCURRENCY);
  });
});

describe('readSpecPackage', () => {
  /** Fake Blob: declared size and a counter of `text()`. */
  function fakeBlob(size: number, counter: { texts: number; buffers?: number }): Blob {
    return {
      size,
      text: async () => {
        counter.texts++;
        return 'x';
      },
      arrayBuffer: async () => {
        counter.buffers = (counter.buffers ?? 0) + 1;
        return new Uint8Array([1, 2, 3]).buffer;
      },
    } as unknown as Blob;
  }

  it('went over the byte limit: returns null without reading the content of the rest', async () => {
    const counter = { texts: 0 };
    let opened = 0;
    const size = MAX_PACKAGE_BYTES / 8;
    const paths = Array.from({ length: 60 }, (_, i) => `specs/m3/${i}.md`);
    const storage = {
      listSpecDir: async () => paths,
      readSpecFile: async () => {
        opened++;
        await new Promise((r) => setTimeout(r, 1));
        return fakeBlob(size, counter);
      },
    } as unknown as ProjectStorage;
    expect(await readSpecPackage(storage, 'specs/m3')).toBeNull();
    // Overflows at the 9th file; plus the tasks already in progress.
    expect(counter.texts).toBeLessThanOrEqual(8 + FOLDER_CONCURRENCY);
    expect(opened).toBeLessThanOrEqual(9 + FOLDER_CONCURRENCY);
  });

  it('reads the .js plugin as text and a binary example only as present', async () => {
    const counter = { texts: 0 };
    const paths = [
      'specs/dm/dm.spec.json',
      'specs/dm/plugins/csv.js',
      'specs/dm/examples/a.csv',
    ];
    const storage = {
      listSpecDir: async () => paths,
      readSpecFile: async () => fakeBlob(5, counter),
    } as unknown as ProjectStorage;
    expect(await readSpecPackage(storage, 'specs/dm')).toEqual({
      entries: [
        { path: 'specs/dm/dm.spec.json', text: 'x' },
        { path: 'specs/dm/plugins/csv.js', text: 'x' },
        { path: 'specs/dm/examples/a.csv' },
      ],
      bytes: 15,
    });
  });

  it('within the limit: entries in listing order, bytes summed, missing one skipped', async () => {
    const counter = { texts: 0 };
    const paths = [
      'specs/m3/a.json',
      'specs/m3/b.png',
      'specs/m3/gone.md',
      'specs/m3/c.md',
    ];
    const storage = {
      listSpecDir: async () => paths,
      readSpecFile: async (p: string) =>
        p.endsWith('gone.md') ? null : fakeBlob(5, counter),
    } as unknown as ProjectStorage;
    expect(await readSpecPackage(storage, 'specs/m3')).toEqual({
      entries: [
        { path: 'specs/m3/a.json', text: 'x' },
        { path: 'specs/m3/b.png', bytes: new Uint8Array([1, 2, 3]) },
        { path: 'specs/m3/c.md', text: 'x' },
      ],
      bytes: 15,
    });
  });

  it('reads the bytes of an image file within 1 MB (the validator checks format and dimensions) and only the size of a heavier one', async () => {
    const counter = { texts: 0, buffers: 0 };
    const paths = [
      'specs/lib/images/a.PNG',
      'specs/lib/images/b.webp',
      'specs/lib/images/heavy.jpg',
      'specs/lib/fonts/f.ttf',
    ];
    const storage = {
      listSpecDir: async () => paths,
      readSpecFile: async (p: string) =>
        fakeBlob(p.endsWith('heavy.jpg') ? 1024 * 1024 + 1 : 5, counter),
    } as unknown as ProjectStorage;
    const read = await readSpecPackage(storage, 'specs/lib');
    expect(read?.entries).toEqual([
      { path: 'specs/lib/images/a.PNG', bytes: new Uint8Array([1, 2, 3]) },
      { path: 'specs/lib/images/b.webp', bytes: new Uint8Array([1, 2, 3]) },
      { path: 'specs/lib/images/heavy.jpg', size: 1024 * 1024 + 1 },
      { path: 'specs/lib/fonts/f.ttf' },
    ]);
    // Only the two light images were read.
    expect(counter.buffers).toBe(2);
  });
});

describe('packageEntriesOf', () => {
  it('an in-memory binary carries its size (an image is checked against 1 MB without reading it)', () => {
    const entries = packageEntriesOf(
      'specs/lib',
      new Map<string, string | Blob>([
        ['lib.spec.json', '{}'],
        ['images/a.png', new Blob([new Uint8Array(7)])],
      ]),
    );
    expect(entries.entries).toEqual([
      { path: 'specs/lib/lib.spec.json', text: '{}' },
      { path: 'specs/lib/images/a.png', size: 7 },
    ]);
    expect(entries.bytes).toBe(9);
  });
});
